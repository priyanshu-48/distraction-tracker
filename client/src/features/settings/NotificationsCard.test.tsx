// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsCard } from "./NotificationsCard";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsCard />
    </QueryClientProvider>
  );
}

const toggle = () => screen.getByRole("switch", { name: "Alert me about my budget" });
const settings = (over: Partial<{ enabled: boolean; timeZone: string; available: boolean }> = {}) => ({
  data: { enabled: false, timeZone: "UTC", available: true, ...over },
});

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.get.mockResolvedValue(settings());
  api.put.mockImplementation(async (_url: string, body: { enabled: boolean }) => ({ data: { ...settings().data, enabled: body.enabled } }));
});

describe("NotificationsCard", () => {
  it("shows nothing when the server is not connected to a notification service", async () => {
    api.get.mockResolvedValue(settings({ available: false }));
    const { container } = renderCard();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/notifications/settings"));
    expect(container.innerHTML).toBe("");
  });

  it("shows nothing while the setting is still loading, and when loading fails", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    const { container } = renderCard();
    expect(container.innerHTML).toBe("");
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("starts off, because alerts are opt-in", async () => {
    renderCard();
    expect((await screen.findByRole("switch")).getAttribute("aria-checked")).toBe("false");
  });

  it("shows the saved choice", async () => {
    api.get.mockResolvedValue(settings({ enabled: true }));
    renderCard();
    await waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("true"));
  });

  it("turning it on saves the choice with the browser's time zone", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByRole("switch");
    await user.click(toggle());
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/notifications/settings", { enabled: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    );
    await waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("true"));
  });

  it("turning it off saves that too", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue(settings({ enabled: true }));
    renderCard();
    await waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("true"));
    await user.click(toggle());
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/notifications/settings", expect.objectContaining({ enabled: false })));
    await waitFor(() => expect(toggle().getAttribute("aria-checked")).toBe("false"));
  });

  it("goes back and says so when saving fails", async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValue(new Error("offline"));
    renderCard();
    await screen.findByRole("switch");
    await user.click(toggle());
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save. Please try again.");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("says plainly what is sent, and what is not", async () => {
    renderCard();
    const text = (await screen.findByText(/sends your account id/i)).textContent ?? "";
    expect(text).toMatch(/email address/);
    expect(text).toMatch(/Web addresses\s+and page titles are never sent/);
  });
});
