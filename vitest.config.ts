import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/worker/test/**/*.test.ts", "apps/web/test/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    globalSetup: ["./packages/db/test/global-setup.ts"],
    env: { NODE_ENV: "test" },
  },
});
