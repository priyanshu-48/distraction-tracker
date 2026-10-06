import { describe, expect, it } from "vitest";
import type { ExtensionReport, ExtensionState } from "@/lib/extension";
import { computeSteps, isSetupComplete, type SetupInputs } from "./steps";

const report = (overrides: Partial<ExtensionReport> = {}): ExtensionState => ({
  kind: "connected",
  report: {
    status: "ok",
    version: "0.1.0",
    hasToken: true,
    authState: "ok",
    tracking: false,
    queued: 0,
    lastUploadAt: null,
    ...overrides,
  },
});

const statuses = (input: SetupInputs) => computeSteps(input).map((step) => `${step.id}:${step.status}`);

describe("computeSteps", () => {
  it("starts at installing the extension while everything is still loading", () => {
    expect(statuses({ extension: undefined, tracking: undefined, hasVisits: undefined })).toEqual([
      "install:current",
      "connect:todo",
      "session:todo",
      "browse:todo",
    ]);
  });

  it.each([{ kind: "not-found" }, { kind: "unconfigured" }, { kind: "unsupported" }] as ExtensionState[])(
    "keeps the user on install when the extension is %o",
    (extension) => {
      expect(statuses({ extension, tracking: false, hasVisits: false })[0]).toBe("install:current");
    }
  );

  it("moves to connecting when the extension answers but has no token", () => {
    expect(statuses({ extension: report({ hasToken: false, authState: "none" }), tracking: false, hasVisits: false })).toEqual([
      "install:done",
      "connect:current",
      "session:todo",
      "browse:todo",
    ]);
  });

  it("treats an expired login as not connected", () => {
    const steps = statuses({ extension: report({ hasToken: false, authState: "logged_out" }), tracking: false, hasVisits: false });
    expect(steps[1]).toBe("connect:current");
  });

  it("asks to start a session once connected", () => {
    expect(statuses({ extension: report(), tracking: false, hasVisits: false })).toEqual([
      "install:done",
      "connect:done",
      "session:current",
      "browse:todo",
    ]);
  });

  it("asks to browse while a session runs but nothing is recorded yet", () => {
    expect(statuses({ extension: report(), tracking: true, hasVisits: false })).toEqual([
      "install:done",
      "connect:done",
      "session:done",
      "browse:current",
    ]);
  });

  it("is complete once visits are recorded", () => {
    const steps = computeSteps({ extension: report(), tracking: false, hasVisits: true });
    expect(isSetupComplete(steps)).toBe(true);
    expect(steps.some((step) => step.status === "current")).toBe(false);
  });

  it("counts recorded visits as proof a session was started, even if tracking is off now", () => {
    expect(statuses({ extension: report(), tracking: false, hasVisits: true })[2]).toBe("session:done");
  });

  it("is not complete when visits exist but the extension is unreachable right now", () => {
    const steps = computeSteps({ extension: { kind: "not-found" }, tracking: false, hasVisits: true });
    expect(isSetupComplete(steps)).toBe(false);
    expect(steps[0].status).toBe("current");
  });
});
