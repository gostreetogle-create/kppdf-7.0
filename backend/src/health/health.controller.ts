import { Controller, Get, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection as MongooseConnection } from 'mongoose';
import Redis from 'ioredis';
import type { RedisConfig } from '../config/configuration';

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
 * Redis:   direct ioredis client with `.ping()`. 1s timeout via Promise.race so the
 *          health endpoint never hangs when Redis is down.
 *
 * Uses ConfigService (typed via src/config/configuration.ts → RedisConfig) instead of
 * raw process.env access — keeps env validation centralized.
 *
 * Implementation notes:
 * - Single long-lived Redis client (created on first check). ioredis handles
 *   reconnect internally — we don't disconnect+null on transient errors.
 * - Lazy initialization: client created on first check, not at module init.
 * - `OnApplicationShutdown` for graceful Redis cleanup at app exit.
 *
 * Earlier iteration (DO NOT REPEAT):
 *   - `@InjectConnection('default')` from @nestjs/mongoose only resolves Mongoose
 *     connections, not BullMQ.
 *   - Strict ioredis options (`maxRetriesPerRequest: 1` + `enableOfflineQueue: false`
 *     + `lazyConnect: false`) caused the first `.ping()` to fire before the TCP
 *     handshake completed — every check returned disconnected because the offline
 *     queue refused the command and we then nullified the client. Removed those
 *     options; ioredis defaults handle reconnection sanely.
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
        const redisCfg = this.config.get<RedisConfig>('app.redis');
        if (!redisCfg) {
          this.log.error('app.redis config missing — check src/config/configuration.ts');
          return 'disconnected';
        }
        this.redis = new Redis({
          host: redisCfg.host,
          port: redisCfg.port,
          db: redisCfg.db,
          // Default ioredis options:
          //   - lazyConnect: false   → connect on construction
          //   - maxRetriesPerRequest: 20 (default) → ping waits for reconnect
          //   - enableOfflineQueue: true (default) → ping queued if briefly disconnected
          // These defaults let the first .ping() succeed as soon as the TCP
          // handshake completes, even if the host is starting up concurrently.
        });
        this.redis.on('error', (err) => {
          this.log.warn(`redis client error: ${err.message} — health will report degraded`);
        });
        this.redis.on('ready', () => {
          this.log.log('redis client ready');
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
      // Do NOT disconnect+null the client on a single failed ping — ioredis
      // already retries internally. Nullifying forces a new TCP handshake
      // on the next request, which re-introduces the timing race we just fixed.
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
