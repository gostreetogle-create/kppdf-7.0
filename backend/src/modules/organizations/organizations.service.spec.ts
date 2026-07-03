import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { Organization } from './schemas/organization.schema';

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

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let mockOrgModel: ReturnType<typeof mockModel>;

  const mockOrg = {
    _id: 'org-1', name: 'Test Org', legalType: 'OOO', inn: '7712345678',
    partyTypes: ['SUPPLIER', 'BUYER'], contacts: [], deletedAt: null,
  };

  beforeEach(async () => {
    mockOrgModel = mockModel(mockOrg);
    mockOrgModel.findOne  = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockOrg) });
    mockOrgModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockOrg) });
    mockOrgModel.find     = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockOrg]) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getModelToken(Organization.name), useValue: mockOrgModel },
      ],
    }).compile();
    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('findAll', () => {
    it('should return all non-deleted orgs', async () => {
      expect(await service.findAll()).toHaveLength(1);
      expect(mockOrgModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe('findById', () => {
    it('should return org if found', async () => {
      mockOrgModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockOrg) });
      expect(await service.findById('org-1')).toEqual(mockOrg);
    });
    it('should throw 404 if not found', async () => {
      mockOrgModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new organization', async () => {
      mockOrgModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      const dto = { name: 'New Org', legalType: 'IP', partyTypes: ['SUPPLIER'], inn: '123456789012' };
      const saved = { _id: 'new-org', ...dto, contacts: [], deletedAt: null };
      mockOrgModel.mockImplementation(function () { return { ...saved, save: vi.fn().mockResolvedValue(saved) }; });
      expect(await service.create(dto as any)).toHaveProperty('_id', 'new-org');
    });
    it('should reject duplicate name with 409', async () => {
      mockOrgModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockOrg) });
      await expect(service.create({ name: 'Test Org', legalType: 'OOO' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update org fields', async () => {
      const org = { ...mockOrg, name: 'Current Name', save: vi.fn().mockImplementation(async function () { return this; }) };
      // First findOne (by id) returns the org; second findOne (duplicate name check) returns null
      mockOrgModel.findOne = vi.fn((filter: any) => ({
        exec: vi.fn().mockResolvedValue(
          filter.name === 'Updated Org' ? null : org
        ),
      }));
      expect(await service.update('org-1', { name: 'Updated Org' } as any)).toHaveProperty('name', 'Updated Org');
    });
    it('should throw 404 if not found', async () => {
      mockOrgModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.update('nonexistent', { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
    it('should check duplicate name on rename', async () => {
      const org = { ...mockOrg, name: 'Current Name', save: vi.fn().mockImplementation(async function () { return this; }) };
      mockOrgModel.findOne = vi.fn((filter: any) => ({
        exec: vi.fn().mockResolvedValue(filter._id?.$ne ? { name: 'Existing', _id: 'other' } : org),
      }));
      await expect(service.update('org-1', { name: 'Existing' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft-delete org', async () => {
      const org = { ...mockOrg, save: vi.fn().mockResolvedValue(true) };
      mockOrgModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(org) });
      await service.remove('org-1');
      expect(org.deletedAt).toBeInstanceOf(Date);
      expect(org.save).toHaveBeenCalled();
    });
    it('should throw 404 if already deleted', async () => {
      mockOrgModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockOrg, deletedAt: new Date() }) });
      await expect(service.remove('org-1')).rejects.toThrow(NotFoundException);
    });
  });
});
