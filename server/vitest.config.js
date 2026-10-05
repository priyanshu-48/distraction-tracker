import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.js"],
    setupFiles: ["./test/setup.js"],
    // All files share one scratch database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DB_NAME: process.env.TEST_DB_NAME || "dt_test",
      JWT_SECRET: "test-secret",
      AUTH_RATE_LIMIT: "1000",
    },
  },
});
