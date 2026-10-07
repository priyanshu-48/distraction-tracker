// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useToggleSession } from "./queries";

const world = vi.hoisted(() => ({ post: vi.fn(), notify: vi.fn() }));
vi.mock("@/api", () => ({ default: { post: world.post, get: vi.fn(async () => ({ data: { isTracking: false } })) } }));
vi.mock("@/lib/extension", () => ({ notifyTrackingChanged: world.notify }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useToggleSession(), { wrapper });
}

beforeEach(() => {
  world.post.mockReset().mockResolvedValue({ data: { success: true } });
  world.notify.mockReset().mockResolvedValue(undefined);
});

describe("useToggleSession", () => {
  it("starts the session, then tells the extension", async () => {
    const { result } = setup();
    await act(async () => result.current.mutate(true));
    await waitFor(() => expect(world.notify).toHaveBeenCalledTimes(1));
    expect(world.post).toHaveBeenCalledWith("/start-tracking", {});
  });

  it("stops the session, then tells the extension", async () => {
    const { result } = setup();
    await act(async () => result.current.mutate(false));
    await waitFor(() => expect(world.notify).toHaveBeenCalledTimes(1));
    expect(world.post).toHaveBeenCalledWith("/stop-tracking", {});
  });

  it("tells the extension only after the server has accepted the change", async () => {
    const order: string[] = [];
    world.post.mockImplementation(async () => {
      order.push("server");
      return { data: {} };
    });
    world.notify.mockImplementation(async () => void order.push("extension"));
    const { result } = setup();
    await act(async () => result.current.mutate(false));
    await waitFor(() => expect(order).toEqual(["server", "extension"]));
  });

  it("does not tell the extension when the server refused", async () => {
    world.post.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await act(async () => result.current.mutate(true));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(world.notify).not.toHaveBeenCalled();
  });

  it("is not held up by a slow extension: the mutation finishes without waiting for it", async () => {
    world.notify.mockReturnValue(new Promise(() => undefined)); // never answers
    const { result } = setup();
    await act(async () => result.current.mutate(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
