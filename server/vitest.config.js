import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.js"],
    setupFiles: ["./test/setup.js"],
    // All files share one scratch database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      // Everything the API runs, including files no test touches. Only tests, the benchmark/seed scripts,
      // the vendored third-party client and tooling config are left out.
      include: ["**/*.js"],
      exclude: ["test/**", "scripts/**", "vendor/**", "node_modules/**", "coverage/**", "*.config.js"],
      reporter: ["text", "json-summary"],
    },
    env: {
      DB_NAME: process.env.TEST_DB_NAME || "dt_test",
      JWT_SECRET: "test-secret",
      AUTH_RATE_LIMIT: "1000",
      LOG_LEVEL: "silent",
    },
  },
});
