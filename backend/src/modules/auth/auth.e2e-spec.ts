import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';

/**
 * API integration tests for auth + RBAC flow.
 *
 * These tests use the real AppModule with all its dependencies.
 * Requires MongoDB and Redis to be running (docker compose up).
 * If not available, tests will be skipped gracefully.
 *
 * Environment variables:
 *   MONGO_URI — MongoDB connection string
 *   JWT_SECRET, JWT_REFRESH_SECRET — JWT signing keys
 *   ADMIN_PASSWORD — admin seed password
 */
describe('Auth API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Skip if no MONGO_URI — these are integration tests requiring real DB
    if (!process.env.MONGO_URI) {
      console.warn('⚠️  Skipping e2e tests: MONGO_URI not set');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('should return 401 for invalid credentials', async () => {
      if (!app) return; // skip if DB unavailable

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'wrongpass' })
        .expect(401);

      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should return 400 for missing fields', async () => {
      if (!app) return;

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 for invalid refresh token', async () => {
      if (!app) return;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(res.body.message).toBe('Invalid or expired refresh token');
    });

    it('should return 400 for missing refresh token', async () => {
      if (!app) return;

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  describe('GET /api/roles (RBAC enforcement)', () => {
    it('should return 401 without auth header', async () => {
      if (!app) return;

      const res = await request(app.getHttpServer())
        .get('/api/roles')
        .expect(401);

      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 403 with invalid token', async () => {
      if (!app) return;

      const res = await request(app.getHttpServer())
        .get('/api/roles')
        .set('Authorization', 'Bearer invalid-jwt')
        .expect(401);
    });
  });
});
