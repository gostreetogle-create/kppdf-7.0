import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: [],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.service.ts', 'src/modules/**/*.controller.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts', 'node_modules'],
    },
  },
});
