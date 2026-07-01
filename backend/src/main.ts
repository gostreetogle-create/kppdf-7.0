import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstrap entry. Per ARCHITECTURE.md §4:
 *   1. NestFactory creates AppModule
 *   2. Global ValidationPipe enforces class-validator DTOs
 *   3. /api prefix for all routes
 *   4. Listen on PORT (default 3000)
 *   5. (Waves 2-3 will add auth, RBAC, etc.)
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  logger.log(`🚀 kppdf-7.0 backend running on http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('💥 Bootstrap crashed:', err);
  process.exit(1);
});
