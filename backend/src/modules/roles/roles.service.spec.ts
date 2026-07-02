import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role } from './schemas/role.schema';

/** Create a mock Mongoose model: callable constructor + static Query-like methods. */
function mockModel(defaultData?: Record<string, any>) {
  const model: any = vi.fn().mockImplementation((data?: Record<string, any>) => ({
    ...(defaultData ?? {}),
    ...(data ?? {}),
    save: vi.fn().mockResolvedValue({ ...(defaultData ?? {}), ...(data ?? {}) }),
  }));
  model.find    = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) });
  model.findOne  = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  model.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  return model;
}

describe('RolesService', () => {
  let service: RolesService;
  let mockRoleModel: ReturnType<typeof mockModel>;

  const mockRole = {
    _id: 'role-1', name: 'manager', isSystemRole: false, status: 'ACTIVE',
    permissions: ['PRODUCTS_READ'], description: 'Test role', deletedAt: null,
  };

  beforeEach(async () => {
    mockRoleModel = mockModel(mockRole);
    mockRoleModel.findOne  = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockRole) });
    mockRoleModel.find     = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockRole]) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getModelToken(Role.name), useValue: mockRoleModel },
      ],
    }).compile();
    service = module.get<RolesService>(RolesService);
  });

  describe('findAll', () => {
    it('should return all non-deleted roles', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(mockRoleModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });
  });

  describe('findById', () => {
    it('should return role if found', async () => {
      mockRoleModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockRole) });
      expect(await service.findById('role-1')).toEqual(mockRole);
    });
    it('should throw NotFoundException if not found', async () => {
      mockRoleModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.findById('nonexistent')).rejects.toThrowError('Role not found');
    });
  });

  describe('create — R1 Ownership Rule', () => {
    it('should allow admin to create with any permissions', async () => {
      const saved = { _id: 'new-id', name: 'custom-role', permissions: ['USERS_READ', 'USERS_WRITE'], isSystemRole: false };
      mockRoleModel.mockImplementation(() => ({ ...saved, save: vi.fn().mockResolvedValue(saved) }));
      const result = await service.create(
        { name: 'custom-role', permissions: ['USERS_READ', 'USERS_WRITE'] },
        ['USERS_READ', 'USERS_WRITE', 'USERS_DELETE', 'PRODUCTS_READ'] as any,
      );
      expect(result).toEqual(saved);
    });
    it('should block creating role with permissions outside own set (R1)', async () => {
      await expect(
        service.create({ name: 'hacker-role', permissions: ['PRODUCTS_READ', 'USERS_WRITE'] }, ['PRODUCTS_READ'] as any),
      ).rejects.toThrow(ForbiddenException);
    });
    it('should allow empty permissions for any user', async () => {
      const saved = { _id: 'new-id', name: 'empty-role', permissions: [], isSystemRole: false };
      mockRoleModel.mockImplementation(() => ({ ...saved, save: vi.fn().mockResolvedValue(saved) }));
      expect(await service.create({ name: 'empty-role' }, [] as any)).toEqual(saved);
    });
    it('should skip R1 check when effectivePermissions not provided (legacy/seed call)', async () => {
      const saved = { _id: 'new-id', name: 'seed-role', permissions: ['USERS_READ'], isSystemRole: false };
      mockRoleModel.mockImplementation(() => ({ ...saved, save: vi.fn().mockResolvedValue(saved) }));
      expect(await service.create({ name: 'seed-role', permissions: ['USERS_READ'] })).toEqual(saved);
    });
  });

  describe('create — BR-USR-7 WRITE implies READ', () => {
    it('should reject when WRITE has no READ', async () => {
      await expect(
        service.create({ name: 'bad-role', permissions: ['PRODUCTS_WRITE'] }, ['PRODUCTS_READ', 'PRODUCTS_WRITE'] as any),
      ).rejects.toThrow(BadRequestException);
    });
    it('should accept when WRITE has matching READ', async () => {
      const saved = { _id: 'new-id', name: 'good-role', permissions: ['PRODUCTS_READ', 'PRODUCTS_WRITE'], isSystemRole: false };
      mockRoleModel.mockImplementation(() => ({ ...saved, save: vi.fn().mockResolvedValue(saved) }));
      const result = await service.create(
        { name: 'good-role', permissions: ['PRODUCTS_READ', 'PRODUCTS_WRITE'] },
        ['PRODUCTS_READ', 'PRODUCTS_WRITE', 'PRODUCTS_DELETE'] as any,
      );
      expect(result).toEqual(saved);
    });
  });

  describe('create — duplicate name', () => {
    it('should reject when name exists', async () => {
      mockRoleModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ name: 'existing' }) });
      await expect(service.create({ name: 'existing' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update — R2 system lock', () => {
    it('should reject renaming system role (R2)', async () => {
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockRole, isSystemRole: true, name: 'admin' }) });
      await expect(service.update('sys-id', { name: 'hacker-admin' })).rejects.toThrow(ForbiddenException);
    });
    it('should reject changing permissions of system role (R2)', async () => {
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockRole, isSystemRole: true }) });
      await expect(service.update('sys-id', { permissions: ['USERS_READ'] })).rejects.toThrow(ForbiddenException);
    });
    it('should allow updating description of system role', async () => {
      const sysRole = { ...mockRole, isSystemRole: true, name: 'admin', save: vi.fn().mockImplementation(async function () { return this; }) };
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(sysRole) });
      const result = await service.update('sys-id', { description: 'New desc' });
      expect(result.description).toBe('New desc');
    });
  });

  describe('update — R1 Ownership Rule', () => {
    it('should block adding permissions user lacks (R1)', async () => {
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockRole) });
      await expect(
        service.update('role-1', { permissions: ['PRODUCTS_READ', 'USERS_WRITE'] }, ['PRODUCTS_READ'] as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove — R2 system lock', () => {
    it('should reject deleting system role (R2)', async () => {
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockRole, isSystemRole: true }) });
      await expect(service.remove('sys-id')).rejects.toThrow(ForbiddenException);
    });
    it('should soft-delete non-system role', async () => {
      const role = { ...mockRole, isSystemRole: false, save: vi.fn().mockResolvedValue(true) };
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(role) });
      await service.remove('role-1');
      expect(role.deletedAt).toBeInstanceOf(Date);
      expect(role.save).toHaveBeenCalled();
    });
  });
});
