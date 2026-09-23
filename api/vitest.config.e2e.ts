import { config } from 'dotenv';
import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

config();

/**
 * E2E suites each bootstrap a Nest app against one shared Postgres.
 * Unbounded file parallelism caused 20s timeouts (Nest boot + DB contention),
 * not assertion failures — those suites pass alone. Cap workers for release
 * determinism while keeping parallel speed.
 */
const workers = Math.max(1, Math.min(4, Math.floor(cpus().length / 2) || 2));

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist', 'src/generated'],
    testTimeout: 45_000,
    hookTimeout: 60_000,
    maxWorkers: workers,
    fileParallelism: true,
    env: {
      NODE_ENV: 'test',
    },
  },
});
