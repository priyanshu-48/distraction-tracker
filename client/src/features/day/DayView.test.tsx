// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DayView } from "./DayView";
import type { DaySummary } from "./types";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));

// Monday 5 October 2026.
const summary = (overrides: Partial<DaySummary> = {}): DaySummary => ({
  date: "2026-10-05",
  timeZone: "UTC",
  budgetSeconds: 7200,
  totals: { distractedSeconds: 4320, otherSeconds: 5400, trackedSeconds: 9720, visits: 12, avgVisitSeconds: 360, type: null },
  topSites: [
    { domain: "youtube.com", seconds: 2400, visits: 3, avgSeconds: 800, type: null, marked: true, usualSeconds: 600 },
    { domain: "twitter.com", seconds: 1500, visits: 9, avgSeconds: 167, type: "checking", marked: true, usualSeconds: 2520 },
    { domain: "reddit.com", seconds: 420, visits: 1, avgSeconds: 420, type: null, marked: true, usualSeconds: null },
  ],
  toClassify: [{ domain: "news.site", seconds: 900, visits: 4 }],
  recent: Array.from({ length: 10 }, (_, i) => ({
    domain: i === 0 ? "youtube.com" : `site${i}.com`,
    startedAt: new Date(Date.UTC(2026, 9, 5, 14, 30 - i)).toISOString(),
    seconds: 60 * (i + 1),
    marked: i === 0,
  })),
  focus: { longestStretchSeconds: 2820, firstDistractionAfterSeconds: 660 },
  timeline: {
    sessions: [{ start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T11:30:00.000Z", distractedSeconds: 1500 }],
    spans: [
      { kind: "other", domain: null, start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T09:30:00.000Z", visits: 2, seconds: 1800 },
      { kind: "distraction", domain: "youtube.com", start: "2026-10-05T09:30:00.000Z", end: "2026-10-05T09:45:00.000Z", visits: 2, seconds: 900 },
      { kind: "distraction", domain: "twitter.com", start: "2026-10-05T10:00:00.000Z", end: "2026-10-05T10:10:00.000Z", visits: 4, seconds: 600 },
    ],
  },
  recentDays: [
    { date: "2026-09-29", distractedSeconds: 3000, trackedSeconds: 5000 },
    { date: "2026-09-30", distractedSeconds: 0, trackedSeconds: 0 },
    { date: "2026-10-01", distractedSeconds: 9000, trackedSeconds: 9500 },
    { date: "2026-10-02", distractedSeconds: 1800, trackedSeconds: 2000 },
    { date: "2026-10-03", distractedSeconds: 0, trackedSeconds: 0 },
    { date: "2026-10-04", distractedSeconds: 6000, trackedSeconds: 7000 },
    { date: "2026-10-05", distractedSeconds: 4320, trackedSeconds: 9720 },
  ],
  triggers: [
    { from: "github.com", to: "reddit.com", count: 5 },
    { from: "mail.com", to: "twitter.com", count: 2 },
  ],
  usual: { days: 4, distractedSeconds: 5400, paceSeconds: 3600 },
  ...overrides,
});

function renderDay(date = "2026-10-05", isToday = false) {
  const onOpenSites = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DayView date={date} isToday={isToday} onOpenSites={onOpenSites} />
    </QueryClientProvider>
  );
  return { onOpenSites };
}

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.get.mockResolvedValue({ data: summary() });
  api.put.mockResolvedValue({ data: {} });
});

describe("a day with activity", () => {
  it("asks for the right day with a single request", async () => {
    renderDay();
    await screen.findByText("Distraction budget");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/summary", { params: { date: "2026-10-05" } });
  });

  it("shows what is left on a meter that screen readers can read", async () => {
    renderDay();
    const meter = await screen.findByRole("meter", { name: "Distraction budget used" });
    expect(meter.getAttribute("aria-valuetext")).toBe("1h 12m of 2h, 48m left");
    expect(screen.getByText("48m left")).toBeTruthy();
    expect(screen.getByText(/1h 12m of 2h · 2h 42m browsing/)).toBeTruthy();
  });

  it("says how far over budget the day went", async () => {
    api.get.mockResolvedValue({ data: summary({ totals: { ...summary().totals, distractedSeconds: 8100 }, topSites: [] }) });
    renderDay();
    expect(await screen.findByText("15m over")).toBeTruthy();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("7200"); // capped at the budget
  });

  it("shows the two habit numbers and nothing else", async () => {
    renderDay();
    await screen.findByText("Distraction visits");
    const tile = (label: string) => screen.getByRole("heading", { name: label }).parentElement as HTMLElement;
    expect(within(tile("Distraction visits")).getByText("12")).toBeTruthy();
    expect(within(tile("Longest clean stretch")).getByText("47m")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Other time" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "First distraction" })).toBeNull();
  });

  it("shows a dash and 'none yet' where a number does not exist yet", async () => {
    api.get.mockResolvedValue({
      data: summary({ focus: { longestStretchSeconds: 0, firstDistractionAfterSeconds: null }, totals: { ...summary().totals, visits: 0, avgVisitSeconds: 0 } }),
    });
    renderDay();
    const tile = async (label: string) => (await screen.findByRole("heading", { name: label })).parentElement as HTMLElement;
    expect(within(await tile("Longest clean stretch")).getByText("–")).toBeTruthy();
    expect(within(await tile("Distraction visits")).getByText("none yet")).toBeTruthy();
  });

  it("gives the last 7 days a table for screen readers, with untracked days called that", async () => {
    renderDay();
    await screen.findByText("Last 7 days");
    expect(screen.getAllByRole("row").length).toBe(8); // header plus seven days
    expect(within(screen.getByRole("row", { name: /Wed, 30 Sep/ })).getByText("not tracked")).toBeTruthy();
    expect(within(screen.getByRole("row", { name: /Thu, 1 Oct/ })).getByText("2h 30m")).toBeTruthy();
  });

  it("lists the top distractions with their pattern", async () => {
    renderDay();
    const card = (await screen.findByText("Top distractions")).closest("div") as HTMLElement;
    expect(within(card).getByText("YouTube")).toBeTruthy();
    expect(within(card).getByText("checking habit")).toBeTruthy();
    expect(within(card).getByText(/40m · 3 visits · avg 13m 20s/)).toBeTruthy();
    expect(within(card).getByLabelText("30m more than usual").textContent).toBe("▲ 30m vs usual"); // youtube
    expect(within(card).getByLabelText("17m less than usual").textContent).toBe("▼ 17m vs usual"); // twitter
    expect(within(card).queryAllByText(/vs usual/)).toHaveLength(2); // reddit has no history, so no delta
  });

  it("lists what set the distractions off", async () => {
    renderDay();
    const card = (await screen.findByText("What set it off")).closest("div") as HTMLElement;
    expect(within(card).getByText("GitHub")).toBeTruthy();
    expect(within(card).getByText("5×")).toBeTruthy();
  });

  it("compares with what the weekday usually looks like, calmly", async () => {
    renderDay();
    expect(await screen.findByText("18m less than your usual Monday.")).toBeTruthy();
  });

  it("compares a day in progress differently, so it does not look better than it is", async () => {
    renderDay("2026-10-05", true);
    expect(await screen.findByText("12m more than usual by now.")).toBeTruthy(); // 1h 12m against a usual 1h by now
  });

  it("marks where you usually are by now on the bar, for today only", async () => {
    renderDay("2026-10-05", true);
    const meter = await screen.findByRole("meter");
    expect(meter.getAttribute("aria-valuetext")).toBe("1h 12m of 2h, 48m left, usually 1h by now");
    expect(screen.getAllByTitle("Usually 1h by now")).toHaveLength(1);
  });

  it("shows no pace on a finished day, and falls back to the full usual day while history is thin", async () => {
    renderDay("2026-10-05", false);
    await screen.findByRole("meter");
    expect(screen.queryByTitle(/Usually/)).toBeNull();
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).not.toContain("usually");
  });

  it("hides the 7-day table by wrapping it, because sr-only on a table itself is not clipped and widens a phone page", async () => {
    renderDay();
    const table = (await screen.findByRole("table")) as HTMLElement;
    expect(table.className).not.toContain("sr-only");
    expect(table.parentElement?.className).toContain("sr-only");
  });

  it("falls back to the full usual day when too few earlier days exist for a pace", async () => {
    api.get.mockResolvedValue({ data: summary({ usual: { days: 1, distractedSeconds: 5400, paceSeconds: 3600 } }) });
    renderDay("2026-10-05", true);
    expect(await screen.findByText("1h 12m so far. Your usual Monday is 1h 30m.")).toBeTruthy();
    expect(screen.queryByTitle(/Usually/)).toBeNull();
  });

  it("says nothing about usual when there is no history", async () => {
    api.get.mockResolvedValue({ data: summary({ usual: { days: 0, distractedSeconds: null, paceSeconds: null } }) });
    renderDay();
    await screen.findByText("48m left");
    expect(screen.queryByText(/usual Monday/)).toBeNull();
  });

  it("shows recent visits in the user's clock and reveals the rest on request", async () => {
    const user = userEvent.setup();
    renderDay();
    const card = (await screen.findByText("Recent visits")).closest("div") as HTMLElement;
    expect(within(card).getByText("14:30")).toBeTruthy();
    expect(within(card).queryByText("Site9")).toBeNull(); // only the first eight at first
    await user.click(within(card).getByRole("button", { name: "Show all 10" }));
    expect(within(card).getByText("Site9")).toBeTruthy();
  });
});

describe("the timeline", () => {
  it("describes each session in words", async () => {
    renderDay();
    expect(await screen.findByText("09:00 to 11:30 · 2h 30m · 25m on distractions (17%)")).toBeTruthy();
  });

  it("describes a burst when you point at it", async () => {
    renderDay();
    expect((await screen.findByTitle(/YouTube · 2 visits · 15m · 09:30 to 09:45/)).className).toContain("bg-coral");
  });

  it("lights up a site's bursts when you hover it in the list, and fades the others", async () => {
    const user = userEvent.setup();
    renderDay();
    const youtube = await screen.findByTitle(/YouTube · 2 visits/);
    const twitter = screen.getByTitle(/X \(Twitter\) · 4 visits/);
    expect(twitter.className).not.toContain("opacity-25");

    await user.hover(screen.getByRole("button", { name: "YouTube (youtube.com)" }));
    expect(youtube.className).not.toContain("opacity-25");
    expect(twitter.className).toContain("opacity-25");

    await user.unhover(screen.getByRole("button", { name: "YouTube (youtube.com)" }));
    expect(twitter.className).not.toContain("opacity-25");
  });

  it("keeps a site lit once picked in the list, and clears it on a second tap", async () => {
    const user = userEvent.setup();
    renderDay();
    const twitter = await screen.findByTitle(/X \(Twitter\) · 4 visits/);
    const youtube = screen.getByTitle(/YouTube · 2 visits/);
    const pick = screen.getByRole("button", { name: "X (Twitter) (twitter.com)" });

    await user.click(pick);
    await user.unhover(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("true");
    expect(youtube.className).toContain("opacity-25");
    expect(twitter.className).not.toContain("opacity-25");

    await user.click(pick);
    await user.unhover(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    expect(youtube.className).not.toContain("opacity-25");
  });

  it("works the other way round: tapping a burst picks its site in the list", async () => {
    const user = userEvent.setup();
    renderDay();
    await user.click(await screen.findByTitle(/X \(Twitter\) · 4 visits/));
    expect(screen.getByRole("button", { name: "X (Twitter) (twitter.com)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("switches between the active hours and the full day", async () => {
    const user = userEvent.setup();
    renderDay();
    const toggle = await screen.findByRole("button", { name: "Full day" });
    expect(screen.queryByText("24:00")).toBeNull();
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Active hours" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("24:00")).toBeTruthy();
  });

  it("says when no session was recorded", async () => {
    api.get.mockResolvedValue({ data: summary({ timeline: { sessions: [], spans: summary().timeline.spans } }) });
    renderDay();
    expect(await screen.findByText(/No tracking session was recorded/)).toBeTruthy();
  });
});

describe("marking sites from the Day view", () => {
  it("unmarks a top distraction and then reloads the day", async () => {
    const user = userEvent.setup();
    renderDay();
    const toggle = await screen.findByRole("switch", { name: "Count reddit.com as a distraction" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    await user.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/sites/reddit.com", { marked: false }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); // the summary is fetched again
  });

  it("marks an unclassified site as a distraction", async () => {
    const user = userEvent.setup();
    renderDay();
    const toggle = await screen.findByRole("switch", { name: "Count news.site as a distraction" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/sites/news.site", { marked: true }));
  });

  it("opens the sites panel from the empty distractions list", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: summary({ topSites: [] }) });
    const { onOpenSites } = renderDay();
    await user.click(await screen.findByRole("button", { name: "Manage sites" }));
    expect(onOpenSites).toHaveBeenCalledOnce();
  });

  it("says that classifying also changes past days", async () => {
    renderDay();
    expect(await screen.findByText(/This also changes past days\./)).toBeTruthy();
  });

  it("offers an undo after marking, even once the site has left the list", async () => {
    const user = userEvent.setup();
    renderDay();
    await user.click(await screen.findByRole("switch", { name: "Count news.site as a distraction" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/sites/news.site", { marked: true }));

    // the day reloads without it in the list: the card stays so the undo is still there
    api.get.mockResolvedValue({ data: summary({ toClassify: [] }) });
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Counting News as a distraction.");

    api.put.mockClear();
    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(api.put).toHaveBeenCalledWith("/sites/news.site", { marked: false });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("does not offer an undo when switching a site off", async () => {
    const user = userEvent.setup();
    renderDay();
    await user.click(await screen.findByRole("switch", { name: "Count reddit.com as a distraction" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the classify card when there is nothing to classify", async () => {
    api.get.mockResolvedValue({ data: summary({ toClassify: [] }) });
    renderDay();
    await screen.findByText("Distraction budget");
    expect(screen.queryByText("To classify")).toBeNull();
  });
});

describe("other states", () => {
  it("shows a loading state while the day loads", () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    renderDay();
    expect(screen.getByLabelText("Loading the day").getAttribute("aria-busy")).toBe("true");
  });

  it("explains an empty day, differently for today and for the past", async () => {
    const empty = summary({ totals: { distractedSeconds: 0, otherSeconds: 0, trackedSeconds: 0, visits: 0, avgVisitSeconds: 0, type: null } });
    api.get.mockResolvedValue({ data: empty });
    renderDay("2026-10-05", true);
    expect(await screen.findByText("Nothing tracked on Mon, 5 Oct")).toBeTruthy();
    expect(screen.getByText(/Press Start session/)).toBeTruthy();
  });

  it("explains an empty day in the past without telling the user to start a session", async () => {
    const empty = summary({ totals: { distractedSeconds: 0, otherSeconds: 0, trackedSeconds: 0, visits: 0, avgVisitSeconds: 0, type: null } });
    api.get.mockResolvedValue({ data: empty });
    renderDay("2026-10-05", false);
    expect(await screen.findByText("No browsing was recorded on this day.")).toBeTruthy();
  });

  it("shows an error with a retry that loads the day", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error("offline"));
    renderDay();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load this day/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Distraction budget")).toBeTruthy();
  });
});
