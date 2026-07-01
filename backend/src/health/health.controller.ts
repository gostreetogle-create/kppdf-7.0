import { Controller, Get, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection as MongooseConnection } from 'mongoose';
import Redis from 'ioredis';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  mongo: 'connected' | 'disconnected' | 'connecting';
  redis: 'connected' | 'disconnected';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Health check controller — GET /api/health.
 *
 * MongoDB: Mongoose readyState (0=disconnected, 1=connected, 2=connecting, 3=disconnecting).
 * Redis: direct ioredis client with `.ping()`. 1s timeout via Promise.race so the
 *        health endpoint never hangs when Redis is down.
 *
 * Uses ConfigService (typed via src/config/configuration.ts registerAs) instead of
 * raw process.env access — keeps env validation centralized and removes duplicate
 * fallback literals ('localhost' / 6379).
 *
 * Implementation notes:
 * - Lazy Redis client (created on first check) — no upfront connection at module init.
 * - On ping failure: disconnect + null client so next check reconnects from scratch.
 * - `OnApplicationShutdown` for graceful Redis cleanup at app exit.
 *
 * Earlier iteration notes (for posterity — DO NOT REPEAT):
 *   - `@InjectConnection('default')` from @nestjs/mongoose only resolves Mongoose
 *     connections, not BullMQ — avoid using it for Redis.
 *   - Wave 2 may refactor to a dedicated RedisHealthIndicator (Terminus style).
 */
@Controller('health')
export class HealthController implements OnApplicationShutdown {
  private readonly log = new Logger(HealthController.name);
  private redis: Redis | null = null;

  constructor(
    @InjectConnection() private readonly mongoConn: MongooseConnection,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    // Mongoose readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const mongoStates: Array<HealthResponse['mongo']> = [
      'disconnected',
      'connected',
      'connecting',
      'disconnected',
    ];
    const mongo: HealthResponse['mongo'] =
      mongoStates[this.mongoConn.readyState] ?? 'disconnected';

    const redis: HealthResponse['redis'] = await this.pingRedis();

    const bothOk = mongo === 'connected' && redis === 'connected';
    return {
      status: bothOk ? 'ok' : 'degraded',
      mongo,
      redis,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async pingRedis(): Promise<HealthResponse['redis']> {
    try {
      if (!this.redis) {
        const redisCfg = this.config.get('app.redis') as {
          host: string;
          port: number;
          db: number;
        };
        this.redis = new Redis({
          host: redisCfg.host,
          port: redisCfg.port,
          db: redisCfg.db,
          lazyConnect: false,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        this.redis.on('error', (err) => {
          this.log.warn(`redis client error: ${err.message} — health will report degraded`);
        });
      }
      const result = await Promise.race<string>([
        this.redis.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('redis ping timeout')), 1000),
        ),
      ]);
      return result === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      if (this.redis) {
        this.redis.disconnect();
        this.redis = null;
      }
      return 'disconnected';
    }
  }

  onApplicationShutdown(): void {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
  }
}
