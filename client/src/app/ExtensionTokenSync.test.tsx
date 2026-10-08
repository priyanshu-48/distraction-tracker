// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ExtensionTokenSync } from "./ExtensionTokenSync";

const auth = vi.hoisted(() => ({ useSession: vi.fn(), syncExtension: vi.fn() }));
vi.mock("./auth", () => auth);

const signedIn = { status: "signedIn", user: { id: 1, email: "a@b.co" } };
const focus = () => window.dispatchEvent(new Event("focus"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  auth.syncExtension.mockReset().mockResolvedValue(true);
  auth.useSession.mockReset().mockReturnValue(signedIn);
});
afterEach(() => vi.useRealTimers());

describe("ExtensionTokenSync", () => {
  it("gives the extension its token when a signed-in page loads", () => {
    render(<ExtensionTokenSync />);
    expect(auth.syncExtension).toHaveBeenCalledTimes(1);
  });

  it("does nothing while signed out or while the answer is pending", () => {
    for (const state of [{ status: "signedOut" }, { status: "pending" }, { status: "error", retry: vi.fn() }]) {
      auth.useSession.mockReturnValue(state);
      render(<ExtensionTokenSync />).unmount();
    }
    focus();
    expect(auth.syncExtension).not.toHaveBeenCalled();
  });

  it("repeats on tab focus, but not more than once every 10 seconds", () => {
    render(<ExtensionTokenSync />);
    vi.setSystemTime(Date.now() + 5_000);
    focus();
    expect(auth.syncExtension).toHaveBeenCalledTimes(1); // too soon

    vi.setSystemTime(Date.now() + 6_000); // 11 s since the first sync
    focus();
    expect(auth.syncExtension).toHaveBeenCalledTimes(2);
  });

  it("stops listening when the page goes away", () => {
    render(<ExtensionTokenSync />).unmount();
    vi.setSystemTime(Date.now() + 60_000);
    focus();
    expect(auth.syncExtension).toHaveBeenCalledTimes(1); // only the first, on mount
  });

  it("starts listening when the user signs in later", () => {
    auth.useSession.mockReturnValue({ status: "signedOut" });
    const view = render(<ExtensionTokenSync />);
    expect(auth.syncExtension).not.toHaveBeenCalled();

    auth.useSession.mockReturnValue(signedIn);
    view.rerender(<ExtensionTokenSync />);
    expect(auth.syncExtension).toHaveBeenCalledTimes(1);
  });
});
