import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { BomModule } from './schemas/module.schema';
import { Material } from '../materials/schemas/material.schema';
import { WorkType } from '../work-types/schemas/work-type.schema';

/** Create a mock Mongoose model: callable constructor + static Query-like methods. */
function mockModel(defaultData?: Record<string, any>) {
  const model: any = vi.fn().mockImplementation(function (data?: Record<string, any>) {
    return {
      ...(defaultData ?? {}),
      ...(data ?? {}),
      save: vi.fn().mockResolvedValue({ ...(defaultData ?? {}), ...(data ?? {}) }),
    };
  });
  model.find    = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
  model.findOne  = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  model.countDocuments = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(0) });
  return model;
}

const validObjectId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const validObjectId2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const baseModule: any = {
  _id: validObjectId,
  name: 'Test Module',
  sku: 'TEST-MOD',
  moduleMaterials: [],
  moduleWorks: [],
  childModuleIds: [],
  photoIds: [],
  deletedAt: null,
};

describe('ModulesService', () => {
  let service: ModulesService;
  let mockModuleModel: ReturnType<typeof mockModel>;
  let mockMaterialModel: ReturnType<typeof mockModel>;
  let mockWorkTypeModel: ReturnType<typeof mockModel>;

  beforeEach(async () => {
    mockModuleModel = mockModel();
    mockMaterialModel = mockModel();
    mockWorkTypeModel = mockModel();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ModulesService,
        { provide: getModelToken(BomModule.name), useValue: mockModuleModel },
        { provide: getModelToken(Material.name), useValue: mockMaterialModel },
        { provide: getModelToken(WorkType.name), useValue: mockWorkTypeModel },
      ],
    }).compile();
    service = moduleRef.get<ModulesService>(ModulesService);
  });

  describe('computeCost', () => {
    /**
     * BR-MOD-8 coverage — PSL-012 ship-blocker identified by code-reviewer:
     * the recursive computeCost() pipeline is non-trivial (cycle defense,
     * diamond-graph memoization, 3D vs 1D ratio) and was previously
     * untested. This block verifies each significant branch.
     */

    it('totalCost=0 for an empty standalone module', async () => {
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...baseModule }),
      });
      const out = await service.computeCost(validObjectId);
      expect(out.materialsCost).toBe(0);
      expect(out.worksCost).toBe(0);
      expect(out.childModulesCost).toBe(0);
      expect(out.totalCost).toBe(0);
      expect(out.breakdown).toEqual([]);
    });

    it('sums 1 material qty=1, price=100, no dimensions (ratio=1)', async () => {
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...baseModule,
          moduleMaterials: [
            { materialId: validObjectId, qty: 1, usedDimensions: {}, order: 0 },
          ],
        }),
      });
      mockMaterialModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: validObjectId,
            name: 'Material A',
            pricePerUnit: 100,
            dimensions: undefined,
            deletedAt: null,
          },
        ]),
      });
      const out = await service.computeCost(validObjectId);
      expect(out.materialsCost).toBe(100);
      expect(out.totalCost).toBe(100);
    });

    it('1D tube: uses length ratio (used 3m of 6m source @ 500₽/m → 250₽)', async () => {
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...baseModule,
          moduleMaterials: [
            {
              materialId: validObjectId,
              qty: 1,
              usedDimensions: { length: 3 },
              order: 0,
            },
          ],
        }),
      });
      mockMaterialModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: validObjectId,
            name: 'Square Tube 40×40×6',
            pricePerUnit: 500,
            dimensions: { length: 6, width: 40, height: 40, thickness: 6 },
            deletedAt: null,
          },
        ]),
      });
      const out = await service.computeCost(validObjectId);
      // ratio = 3/6 = 0.5; unitCost = 500*0.5 = 250; qty=1 → 250
      expect(out.materialsCost).toBe(250);
      expect(out.totalCost).toBe(250);
    });

    it('sums 1 work: 2h × hourlyRate=500 → worksCost=1000', async () => {
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...baseModule,
          moduleWorks: [
            { workTypeId: validObjectId, hours: 2, order: 0 },
          ],
        }),
      });
      mockWorkTypeModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: validObjectId,
            name: 'Welding',
            hourlyRate: 500,
            deletedAt: null,
          },
        ]),
      });
      const out = await service.computeCost(validObjectId);
      expect(out.worksCost).toBe(1000);
      expect(out.totalCost).toBe(1000);
    });

    it('aggregates child module cost via recursion', async () => {
      // Root: childModuleIds=[validObjectId2]
      // Child: empty materials, 1 work at 200₽/h × 1h = 200
      mockModuleModel.findOne = vi
        .fn()
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue({
            ...baseModule,
            childModuleIds: [validObjectId2],
          }),
        })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue({
            ...baseModule,
            _id: validObjectId2,
            name: 'Sub Module',
            childModuleIds: [],
            moduleMaterials: [],
            moduleWorks: [
              {
                workTypeId: { toString: () => 'work-x' },
                hours: 1,
                order: 0,
              },
            ],
          }),
        });
      mockWorkTypeModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'work-x',
            name: 'Cheap Work',
            hourlyRate: 200,
            deletedAt: null,
          },
        ]),
      });
      const out = await service.computeCost(validObjectId);
      expect(out.childModulesCost).toBe(200);
      expect(out.totalCost).toBe(200);
    });

    /**
     * BR-MOD-6: self-cycle in childModuleIds[] must NOT cause infinite
     * recursion. The visited Set in computeCostRecursive() should short-
     * circuit. Cost for the offending child becomes 0.
     */
    it('cycle defense: child referencing self does not infinite-loop', async () => {
      // findOne returns the same module for every lookup (self-cycle).
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...baseModule,
          childModuleIds: [validObjectId],
        }),
      });
      const out = await service.computeCost(validObjectId);
      expect(out.childModulesCost).toBe(0);
      expect(out.totalCost).toBe(0);
    });

    it('throws NotFoundException when module does not exist', async () => {
      mockModuleModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      await expect(service.computeCost('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
