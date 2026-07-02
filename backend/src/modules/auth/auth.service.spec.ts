import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

// Mock bcrypt entirely (compare is read-only, can't use vi.spyOn)
vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
  genSalt: vi.fn(),
}));

/**
 * Unit tests for AuthService.
 *
 * Uses direct instantiation (new AuthService(...)) instead of NestJS TestingModule
 * to avoid Mongoose DI resolution issues with vitest/ESBuild.
 */
describe('AuthService', () => {
  let service: AuthService;
  let mockUserModel: any;
  let mockRoleModel: any;
  let mockJwtService: any;
  let mockConfig: any;

  const mockUser = {
    _id: { toString: () => 'user-1' },
    username: 'testuser',
    passwordHash: '$2b$12$hashedpassword',
    roleId: { toString: () => 'role-1' },
    deletedAt: null,
    lastLoginAt: null,
    save: vi.fn().mockImplementation(async function () { return this; }),
  };

  const mockRole = {
    _id: { toString: () => 'role-1' },
    name: 'manager',
    status: 'ACTIVE',
    permissions: ['PRODUCTS_READ', 'PRODUCTS_WRITE'],
  };

  beforeEach(() => {
    mockUserModel = {
      findOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
      findById: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    };

    mockRoleModel = {
      findById: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
      verify: vi.fn().mockReturnValue({ sub: 'user-1' }),
    };

    mockConfig = {
      get: vi.fn((key: string) => ({
        'app.jwt.secret': 'test-secret',
        'app.jwt.refreshSecret': 'test-refresh-secret',
        'app.jwt.expiresIn': '15m',
        'app.jwt.refreshExpiresIn': '7d',
      }[key])),
    };

    service = new AuthService(mockJwtService as any, mockConfig as any, mockUserModel, mockRoleModel);
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockUser) });
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockRole) });
      (bcrypt.compare as any).mockImplementation(async () => true);
      const result = await service.login('testuser', 'password123');
      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw for wrong password', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockUser) });
      (bcrypt.compare as any).mockImplementation(async () => false);
      await expect(service.login('testuser', 'wrongpass')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for nonexistent user', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.login('unknown', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for deleted user', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockUser, deletedAt: new Date() }) });
      await expect(service.login('deleteduser', 'password123')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for inactive role', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockUser) });
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockRole, status: 'ARCHIVED' }) });
      (bcrypt.compare as any).mockImplementation(async () => true);
      await expect(service.login('testuser', 'password123')).rejects.toThrow('User role is not active');
    });

    it('should use admin auto-resolve (R3)', async () => {
      mockUserModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockUser) });
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ ...mockRole, name: 'admin' }) });
      (bcrypt.compare as any).mockImplementation(async () => true);
      await service.login('admin', 'adminpass');
      expect(mockJwtService.sign.mock.calls[0][0].roleName).toBe('admin');
      expect(mockJwtService.sign.mock.calls[0][0].permissions.length).toBeGreaterThan(10);
    });
  });

  describe('refreshToken', () => {
    it('should return new token pair on valid refresh token', async () => {
      mockUserModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockUser) });
      mockRoleModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(mockRole) });
      const result = await service.refreshToken('valid-refresh-token');
      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
    });

    it('should throw for invalid/expired token', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('expired'); });
      await expect(service.refreshToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for user not found after token verification', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'nonexistent' });
      mockUserModel.findById = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.refreshToken('valid-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
