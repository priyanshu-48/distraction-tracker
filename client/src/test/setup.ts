import { afterEach } from "vitest";

// Unmount rendered components between tests (only relevant in jsdom test files).
afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
