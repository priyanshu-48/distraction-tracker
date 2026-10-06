// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ExtensionState } from "@/lib/extension";
import DashboardPage from "./DashboardPage";

// Monday 5 October 2026, noon UTC: the same calendar day in every time zone the test might run in.
const NOW = new Date("2026-10-05T12:00:00Z");

const world = vi.hoisted(() => ({
  extension: { kind: "not-found" } as unknown,
  totalVisits: 0,
  tracking: false,
}));

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url === "/is-tracking") return { data: { isTracking: world.tracking } };
      if (url === "/sites") return { data: { days: 90, total: world.totalVisits, sites: [] } };
      if (url === "/settings") return { data: { dailyBudgetSeconds: 7200 } };
      // An untracked day: the page shows its empty state, which is all these tests need from the Day view.
      if (url === "/summary") {
        return {
          data: {
            date: "2026-10-05", timeZone: "UTC", budgetSeconds: 7200,
            totals: { distractedSeconds: 0, otherSeconds: 0, trackedSeconds: 0, visits: 0, avgVisitSeconds: 0, type: null },
            topSites: [], toClassify: [], recent: [], triggers: [],
            focus: { longestStretchSeconds: 0, firstDistractionAfterSeconds: null },
            hourly: [], comparison: { date: "2026-09-28", distractedSeconds: 0 },
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    }),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/lib/extension", () => ({
  checkExtension: vi.fn(async () => world.extension),
  syncToken: vi.fn(async () => true),
  forgetAccount: vi.fn(async () => undefined),
}));

const connected = (overrides: Record<string, unknown> = {}): ExtensionState =>
  ({
    kind: "connected",
    report: { status: "ok", version: "0.1.0", hasToken: true, authState: "ok", tracking: false, queued: 0, lastUploadAt: null, ...overrides },
  }) as ExtensionState;

function LocationProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderAt(url = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("token", "tok");
  world.extension = connected();
  world.totalVisits = 5;
  world.tracking = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("period navigation", () => {
  it("starts on today, with no way to step into the future", () => {
    renderAt();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mon, 5 Oct");
    expect(screen.getByRole("button", { name: "Next day" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Previous day" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });

  it("steps back a day, shows a Today button, and Today brings you back", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sun, 4 Oct");
    expect(screen.getByTestId("search").textContent).toBe("?date=2026-10-04");

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mon, 5 Oct");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("switches to the week and month views and steps by that unit", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("5 to 11 Oct");
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("28 Sep to 4 Oct");

    await user.click(screen.getByRole("radio", { name: "Month" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("September 2026");
  });

  it("opens straight onto a period given in the URL", () => {
    renderAt("/?view=week&date=2026-09-20");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("14 to 20 Sep");
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
  });
});

describe("panels", () => {
  it("opens the Sites panel as a dialog and closes it with Escape, returning focus to the button", async () => {
    const user = userEvent.setup();
    renderAt();
    const button = screen.getByRole("button", { name: "Sites" });
    await user.click(button);

    const dialog = await screen.findByRole("dialog", { name: "Sites" });
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId("search").textContent).toBe("?panel=sites");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("search").textContent).toBe("");
    // Radix puts focus back on the next tick, after the dialog has unmounted.
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("opens the Settings panel from the gear, with the extension status and log out", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    // The panel's contents are loaded on demand, so they arrive just after the dialog itself.
    expect(await within(dialog).findByText("Extension")).toBeTruthy();
    expect(await within(dialog).findByRole("button", { name: "Log out" })).toBeTruthy();
  });

  it("opens the right panel straight from the URL, and keeps the period", async () => {
    renderAt("/?view=week&date=2026-09-20&panel=sites");
    expect(await screen.findByRole("dialog", { name: "Sites" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("14 to 20 Sep");
  });

  it("closes with its own close button", async () => {
    const user = userEvent.setup();
    renderAt("/?panel=settings");
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("search").textContent).toBe("");
  });
});

describe("setup banner and connection indicator", () => {
  it("welcomes a new user with the first step when nothing is set up", async () => {
    world.extension = { kind: "not-found" };
    world.totalVisits = 0;
    renderAt();
    const banner = await screen.findByRole("region", { name: "Get started" });
    expect(within(banner).getByText("0 of 4 done")).toBeTruthy();
    expect(within(banner).getByText(/Install the extension/).closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("is hidden once everything is done", async () => {
    world.tracking = true;
    renderAt();
    await screen.findByText("Extension connected");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("comes back as a reconnect prompt when a user with data loses the extension", async () => {
    world.extension = { kind: "not-found" };
    world.totalVisits = 12;
    renderAt();
    expect(await screen.findByRole("region", { name: "The extension isn't connected" })).toBeTruthy();
  });

  it("labels the header indicator for each situation", async () => {
    world.extension = connected();
    const { unmount } = renderAt();
    expect(await screen.findByText("Extension connected")).toBeTruthy();
    unmount();

    world.extension = connected({ hasToken: false, authState: "logged_out" });
    const second = renderAt();
    expect(await screen.findByText("Extension needs reconnecting")).toBeTruthy();
    second.unmount();

    world.extension = { kind: "not-found" };
    renderAt();
    expect(await screen.findByText("Extension not detected")).toBeTruthy();
  });

  it("says an older extension needs a reload, in the indicator and in the banner", async () => {
    world.extension = { kind: "outdated" };
    world.totalVisits = 12;
    renderAt();
    expect(await screen.findByText("Extension needs a reload")).toBeTruthy();
    const banner = await screen.findByRole("region", { name: "The extension isn't connected" });
    expect(within(banner).getByText(/older version/)).toBeTruthy();
    expect(within(banner).getByText(/press the reload button/)).toBeTruthy();
  });

  it("opens Settings when the indicator is clicked", async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: /Extension connected/ }));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
  });
});
