import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // O banco de dev é remoto: cada requisição leva ~1-2 s, e o fluxo do POS
    // passa de 1 min. Com todos os arquivos em paralelo, as transações
    // esperavam conexão livre e estouravam o tempo; 4 por vez é estável.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    maxWorkers: 4,
    env: { NODE_ENV: 'test' },
  },
});
