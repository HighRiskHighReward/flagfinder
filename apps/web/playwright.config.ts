import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a production build with the TEST-ONLY map renderer (no provider keys in CI),
 * seeded SYNTHETIC data, and APP_ENV=test.
 */
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "../../artifacts/e2e-results.json" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 240_000,
    env: { NEXT_PUBLIC_MAP_PROVIDER: "test-dom", APP_ENV: "test" },
  },
});
