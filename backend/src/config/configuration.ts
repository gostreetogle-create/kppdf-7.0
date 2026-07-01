import { registerAs } from '@nestjs/config';

/**
 * Typesafe env loader. Reachable via `ConfigService.get('app')`.
 *
 * Throws on missing REQUIRED vars at module-init time (early failure mode).
 * Per .env.example — fail-fast prevents "works locally but crashes in prod"
 * misconfiguration traps.
 */
export const configuration = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),

  mongo: {
    uri: required('MONGO_URI'),
    dbName: process.env.MONGO_DB_NAME ?? 'kppdf-7',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    db: Number(process.env.REDIS_DB ?? 0),
  },

  uploadsDir: process.env.UPLOADS_DIR ?? './uploads',
  thumbnails: {
    width: Number(process.env.THUMBNAIL_WIDTH ?? 320),
    mediumWidth: Number(process.env.THUMBNAIL_MEDIUM_WIDTH ?? 1024),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: required('ADMIN_PASSWORD'),
    email: process.env.ADMIN_EMAIL ?? 'admin@kppdf-7.local',
  },

  features: {
    queue: (process.env.ENABLE_QUEUE ?? 'true').toLowerCase() === 'true',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
}));

/** Throw if env var missing/empty. Used for REQUIRED secrets. */
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `[config] Missing required env: ${name}. Copy .env.example to .env and fill in.`,
    );
  }
  return v;
}
