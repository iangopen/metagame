/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Two Vitest projects, as in StrategyLab. "unit": fast tests, default timeout. "stats": Monte
  // Carlo-heavy tests (*.stats.test.ts) that run after unit on a few workers under one project-wide
  // timeout. A new heavy test goes in a *.stats.test.ts file, never behind a per-test timeout.
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'], exclude: ['src/**/*.stats.test.ts'], sequence: { groupOrder: 0 } },
      },
      {
        extends: true,
        test: { name: 'stats', environment: 'node', include: ['src/**/*.stats.test.ts'], maxWorkers: 2, testTimeout: 120_000, sequence: { groupOrder: 1 } },
      },
    ],
  },
})
