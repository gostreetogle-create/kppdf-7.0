import { defineConfig } from 'vitest/config';

// Vitest setup for the Angular frontend.
// Mirrors backend/vitest.config.ts. Uses jsdom for DOM env, jsdom is in
// frontend devDeps. We exclude app.spec.ts because it uses Angular TestBed
// (Karma+Jasmine target via `ng test`). Vitest here is for non-Angular
// utility specs to keep them fast and Karma-free.
// `passWithNoTests: true` lets CI succeed when only Angular specs exist
// (none of which run via vitest). When utility specs land, they'll
// execute naturally.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    root: './',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'src/app/app.spec.ts'],
    setupFiles: [],
    testTimeout: 15_000,
    passWithNoTests: true,
  },
});
