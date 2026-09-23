import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

config();

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist', 'src/generated'],
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
