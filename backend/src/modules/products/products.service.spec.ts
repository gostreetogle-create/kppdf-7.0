import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './schemas/product.schema';
import { BomModule } from '../modules/schemas/module.schema';
import { ModulesService } from '../modules/modules.service';

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
  return model;
}

describe('ProductsService', () => {
  let service: ProductsService;
  let mockProductModel: ReturnType<typeof mockModel>;
  let mockModulesService: { computeCost: ReturnType<typeof vi.fn> };

  const validObjectId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const validObjectId2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  const mockProduct = {
    _id: 'prod-1', name: 'Test Product', sku: 'TEST-001', price: 100, cost: 80,
    description: 'A test product', category: 'Test', unit: 'pcs',
    photoIds: [validObjectId], copiedFromProductId: null, deletedAt: null,
  };

  beforeEach(async () => {
    mockProductModel = mockModel(mockProduct);
    mockProductModel.findOne  = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockProduct) });
    mockProductModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockProduct) });
    mockProductModel.find     = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockProduct]) });

    // Real class token ModulesService stub — every test gets a fresh one via beforeEach.
    // computeCost is no-op-by-default; the 2 computeProductCost tests override resolved values.
    mockModulesService = { computeCost: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getModelToken(Product.name), useValue: mockProductModel },
        // BOM-domain: ProductsService injects BomModuleModel + ModulesService for computeProductCost.
        { provide: getModelToken(BomModule.name), useValue: mockModel() },
        { provide: ModulesService, useValue: mockModulesService },
      ],
    }).compile();
    service = module.get<ProductsService>(ProductsService);
  });

  describe('findAll', () => {
    it('should return all non-deleted products', async () => {
      expect(await service.findAll()).toHaveLength(1);
      expect(mockProductModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe('findById', () => {
    it('should return product if found', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockProduct) });
      expect(await service.findById('prod-1')).toEqual(mockProduct);
    });
    it('should throw 404 if not found', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new product', async () => {
      const dto = { name: 'New Product', sku: 'NEW-001', price: 50, cost: 30, photoIds: [validObjectId] };
      const saved = { _id: 'new-prod', ...dto, photoIds: [validObjectId], deletedAt: null };
      mockProductModel.mockImplementation(function () { return { ...saved, save: vi.fn().mockResolvedValue(saved) }; });
      expect(await service.create(dto as any)).toHaveProperty('_id', 'new-prod');
    });
    it('should throw 409 on duplicate (name, sku) — BR-PRD-1', async () => {
      const mongoError: any = new Error('Duplicate key');
      mongoError.code = 11000;
      mockProductModel.mockImplementation(function () { return { save: vi.fn().mockRejectedValue(mongoError) }; });
      await expect(
        service.create({ name: 'Existing', sku: 'EXIST-001', price: 10, cost: 5, photoIds: [validObjectId] } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update product fields', async () => {
      const product = { ...mockProduct, save: vi.fn().mockImplementation(async function () { return this; }) };
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(product) });
      expect(await service.update('prod-1', { price: 150, name: 'Updated' } as any)).toMatchObject({ price: 150, name: 'Updated' });
    });
    it('should throw 404 if not found', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.update('nonexistent', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
    it('should throw 409 on duplicate key', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockProduct, save: vi.fn().mockRejectedValue({ code: 11000 }) }) });
      await expect(service.update('prod-1', { sku: 'DUPLICATE' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('copy', () => {
    it('should create a copy with auto-generated sku (BR-PRD-6)', async () => {
      const expectedSku = 'TEST-001-COPY-XXXX';
      const saved = { name: 'Test Product (копия)', sku: expectedSku };
      mockProductModel.mockImplementation(function () { return { ...saved, save: vi.fn().mockResolvedValue(saved) }; });
      const result = await service.copy('prod-1');
      expect(result.sku).toContain('TEST-001-COPY-');
      expect(result.name).toBe('Test Product (копия)');
    });
    it('should reuse photoIds without duplicating files (BR-PRD-7)', async () => {
      const photoIds = [validObjectId, validObjectId2];
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockProduct, photoIds }) });
      const saved = { name: 'Test Product (копия)', sku: 'COPY-SKU', photoIds, copiedFromProductId: 'prod-1' };
      mockProductModel.mockImplementation(function () { return { ...saved, save: vi.fn().mockResolvedValue(saved) }; });
      expect((await service.copy('prod-1')).photoIds).toEqual(photoIds);
    });
    it('should throw 404 if original not found', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.copy('nonexistent')).rejects.toThrow(NotFoundException);
    });
    it('should accept optional dto with custom name/sku', async () => {
      const saved = { name: 'Custom Name', sku: 'CUSTOM-SKU' };
      mockProductModel.mockImplementation(function () { return { ...saved, save: vi.fn().mockResolvedValue(saved) }; });
      expect(await service.copy('prod-1', { name: 'Custom Name', sku: 'CUSTOM-SKU' })).toMatchObject(saved);
    });
  });

  describe('remove', () => {
    it('should soft-delete product (BR-PRD-8)', async () => {
      const product = { ...mockProduct, save: vi.fn().mockResolvedValue(true) };
      mockProductModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(product) });
      await service.remove('prod-1');
      expect(product.deletedAt).toBeInstanceOf(Date);
      expect(product.save).toHaveBeenCalled();
    });
    it('should throw 404 if already deleted', async () => {
      mockProductModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockProduct, deletedAt: new Date() }) });
      await expect(service.remove('prod-1')).rejects.toThrow(NotFoundException);
    });
  });

  /**
   * BR-PRD-10 + PSL-012: ProductsService.computeProductCost() walks the linked
   * productModuleIds[] and sums each active module's totalCost by delegating
   * to ModulesService.computeCost(). The deep recursion coverage lives in the
   * modules.service.spec.ts (separate file) — these tests verify
   * orchestration + Σ aggregation.
   */
  describe('computeProductCost', () => {
    it('should return totalCost=0 when productModuleIds is empty', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockProduct, productModuleIds: [] }),
      });
      const result = await service.computeProductCost('prod-1');
      expect(result.totalCost).toBe(0);
      expect(result.modules).toEqual([]);
    });

    it('should sum active modules totalCost and list each module name', async () => {
      mockProductModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockProduct,
          productModuleIds: [validObjectId, validObjectId2],
        }),
      });
      const moduleModelStub = mockModel();
      moduleModelStub.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          { _id: validObjectId, name: 'Модуль A', deletedAt: null },
          { _id: validObjectId2, name: 'Модуль B', deletedAt: null },
        ]),
      });
      // Swap the BomModuleModel stub mid-test (beforeEach's stub is still in module).
      // Use Test.createTestingModule rebuilding pattern is NOT needed —
      // we just override the global token for this test:
      const moduleOverride: TestingModule = await Test.createTestingModule({
        providers: [
          ProductsService,
          { provide: getModelToken(Product.name), useValue: {
            ...mockProductModel,
            findOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({
              ...mockProduct, productModuleIds: [validObjectId, validObjectId2],
            }) }),
          } },
          { provide: getModelToken(BomModule.name), useValue: moduleModelStub },
          { provide: ModulesService, useValue: {
            computeCost: vi.fn()
              .mockResolvedValueOnce({ materialsCost: 100, worksCost: 200, childModulesCost: 0, totalCost: 300, breakdown: [] })
              .mockResolvedValueOnce({ materialsCost: 50, worksCost: 80, childModulesCost: 0, totalCost: 130, breakdown: [] }),
          } },
        ],
      }).compile();
      const svc = moduleOverride.get<ProductsService>(ProductsService);
      const result = await svc.computeProductCost('prod-1');
      expect(result.totalCost).toBe(430);
      expect(result.modules).toEqual([
        { moduleId: validObjectId, name: 'Модуль A', cost: 300 },
        { moduleId: validObjectId2, name: 'Модуль B', cost: 130 },
      ]);
    });
  });
});
