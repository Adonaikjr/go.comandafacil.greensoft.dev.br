import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // O banco de dev é remoto: cada requisição leva ~1-2 s
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { NODE_ENV: 'test' },
  },
});
