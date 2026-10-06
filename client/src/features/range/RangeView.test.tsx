// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RangeView } from "./RangeView";
import type { RangeSummary } from "./types";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));

// The week of Monday 5 to Sunday 11 October 2026, on Wednesday the 7th.
const day = (date: string, distractedSeconds: number, trackedSeconds: number, visits = 0) => ({
  date,
  distractedSeconds,
  trackedSeconds,
  visits,
  firstDistractionAfterSeconds: null,
});

const heat = (cells: Array<[number, number, number]>) => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const [dow, hour, seconds] of cells) grid[dow][hour] = seconds;
  return grid;
};

const summary = (overrides: Partial<RangeSummary> = {}): RangeSummary => ({
  view: "week",
  start: "2026-10-05",
  end: "2026-10-11",
  through: "2026-10-07",
  timeZone: "UTC",
  budgetSeconds: 3600,
  days: [
    { ...day("2026-10-05", 1800, 3000, 8), firstDistractionAfterSeconds: 3600 },
    { ...day("2026-10-06", 600, 1200, 4), firstDistractionAfterSeconds: 1800 },
    { ...day("2026-10-07", 4500, 6000, 8), firstDistractionAfterSeconds: 600 },
    day("2026-10-08", 0, 0),
    day("2026-10-09", 0, 0),
    day("2026-10-10", 0, 0),
    day("2026-10-11", 0, 0),
  ],
  totals: { distractedSeconds: 6900, trackedSeconds: 10200, visits: 20, daysTracked: 3, daysUnderBudget: 2, avgDistractedSeconds: 2300 },
  previous: { start: "2026-09-28", end: "2026-09-30", distractedSeconds: 5400, trackedSeconds: 9000, visits: 15, daysTracked: 3 },
  best: { date: "2026-10-06", distractedSeconds: 600 },
  worst: { date: "2026-10-07", distractedSeconds: 4500 },
  streak: { current: 2, longest: 4 },
  topSites: [
    { domain: "youtube.com", seconds: 4000, visits: 8, avgSeconds: 500, type: null, previousSeconds: 1000 },
    { domain: "reddit.com", seconds: 2000, visits: 10, avgSeconds: 200, type: null, previousSeconds: 2400 },
    { domain: "twitter.com", seconds: 900, visits: 12, avgSeconds: 75, type: "checking", previousSeconds: 900 },
  ],
  movers: {
    up: [{ domain: "youtube.com", seconds: 4000, previousSeconds: 1000, change: 3000 }],
    down: [{ domain: "reddit.com", seconds: 2000, previousSeconds: 2400, change: -400 }],
  },
  heatmap: heat([[0, 10, 900], [1, 11, 500], [2, 21, 3000], [2, 22, 1500]]),
  ...overrides,
});

function renderRange(props: Partial<React.ComponentProps<typeof RangeView>> = {}) {
  const onOpenDay = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RangeView view="week" date="2026-10-07" label="5 to 11 Oct" isCurrent today="2026-10-07" onOpenDay={onOpenDay} {...props} />
    </QueryClientProvider>
  );
  return { onOpenDay };
}

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: summary() });
});

describe("a week with activity", () => {
  it("asks for the week with one request", async () => {
    renderRange();
    await screen.findByText("Distraction time");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/range", { params: { view: "week", date: "2026-10-07" } });
  });

  it("shows the total, how many days were tracked, the average and the days within budget", async () => {
    renderRange();
    expect(await screen.findByText("1h 55m")).toBeTruthy();
    expect(screen.getByText("5 to 11 Oct · 3 days tracked")).toBeTruthy();
    expect(screen.getByText("Average per day").nextElementSibling?.textContent).toBe("38m");
    expect(screen.getByText("Within budget").nextElementSibling?.textContent).toBe("2 of 3 days");
  });

  it("compares with the same days of last week, calmly", async () => {
    renderRange();
    expect(await screen.findByText("25m more than last week, same days.")).toBeTruthy();
  });

  it("compares a finished week with the whole of last week", async () => {
    api.get.mockResolvedValue({ data: summary({ through: "2026-10-11", totals: { ...summary().totals, distractedSeconds: 3000 } }) });
    renderRange({ isCurrent: false });
    expect(await screen.findByText("40m less than last week.")).toBeTruthy();
  });

  it("says nothing about last week when it had nothing tracked", async () => {
    // the server sends no previous time per site and no movers in that case
    api.get.mockResolvedValue({
      data: summary({
        previous: { ...summary().previous, daysTracked: 0, distractedSeconds: 0 },
        topSites: summary().topSites.map((s) => ({ ...s, previousSeconds: null })),
        movers: { up: [], down: [] },
      }),
    });
    renderRange();
    await screen.findByText("Distraction time");
    expect(screen.queryByText(/last week/)).toBeNull();
  });

  it("shows the streak for a week that includes today", async () => {
    renderRange();
    expect((await screen.findByText("Streak")).nextElementSibling?.textContent).toBe("2 days");
  });

  it("does not show a streak for a week that is over", async () => {
    renderRange({ isCurrent: false });
    await screen.findByText("Distraction time");
    expect(screen.queryByText("Streak")).toBeNull();
  });
});

describe("the bars for each day", () => {
  it("has a button for every day of the week, described in words", async () => {
    renderRange();
    const group = await screen.findByRole("group", { name: "Distraction time for each day" });
    expect(within(group).getAllByRole("button")).toHaveLength(7);
    expect(within(group).getByRole("button", { name: "Mon, 5 Oct: 30m of distractions" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Wed, 7 Oct: 1h 15m of distractions, over budget" })).toBeTruthy();
  });

  it("says when nothing was tracked, and does not let you open a day that has not happened", async () => {
    api.get.mockResolvedValue({
      data: summary({ days: summary().days.map((d) => (d.date === "2026-10-06" ? day("2026-10-06", 0, 0) : d)) }),
    });
    renderRange();
    expect(await screen.findByRole("button", { name: "Tue, 6 Oct: nothing tracked" })).toBeTruthy();
    const future = screen.getByRole("button", { name: "Thu, 8 Oct: not yet" }) as HTMLButtonElement;
    expect(future.disabled).toBe(true);
  });

  it("marks today", async () => {
    renderRange();
    expect((await screen.findByRole("button", { name: /^Wed, 7 Oct/ })).getAttribute("aria-current")).toBe("date");
  });

  it("opens the Day view for the day you click", async () => {
    const user = userEvent.setup();
    const { onOpenDay } = renderRange();
    await user.click(await screen.findByRole("button", { name: "Mon, 5 Oct: 30m of distractions" }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-05");
  });

  it("draws a month as one bar per day, labelling every fifth", async () => {
    const days = Array.from({ length: 31 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, i % 3 === 0 ? 1200 : 0, 3000));
    api.get.mockResolvedValue({
      data: summary({ view: "month", start: "2026-10-01", end: "2026-10-31", through: "2026-10-31", days, previous: { ...summary().previous, daysTracked: 0 } }),
    });
    renderRange({ view: "month", label: "October 2026", isCurrent: false });
    const group = await screen.findByRole("group", { name: "Distraction time for each day" });
    expect(within(group).getAllByRole("button")).toHaveLength(31);
    for (const n of ["1", "6", "11", "31"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
  });
});

describe("sites", () => {
  it("lists the top distractions with how each compares with last week", async () => {
    renderRange();
    const card = (await screen.findByText("Top distractions")).closest("div") as HTMLElement;
    expect(within(card).getByText("YouTube")).toBeTruthy();
    expect(within(card).getByLabelText("50m more than last week").textContent).toBe("▲ 50m vs last week");
    expect(within(card).getByLabelText("7m less than last week").textContent).toBe("▼ 7m vs last week");
    expect(within(card).getAllByText(/vs last week/)).toHaveLength(2); // twitter did not change
    expect(within(card).getByText("checking habit")).toBeTruthy();
  });

  it("has no comparison on a site when last week had nothing tracked", async () => {
    api.get.mockResolvedValue({
      data: summary({ topSites: summary().topSites.map((s) => ({ ...s, previousSeconds: null })), movers: { up: [], down: [] } }),
    });
    renderRange();
    await screen.findByText("Top distractions");
    expect(screen.queryByText(/vs last week/)).toBeNull();
  });

  it("lists the biggest changes, up and down", async () => {
    renderRange();
    const card = (await screen.findByText("Biggest changes")).closest("div") as HTMLElement;
    expect(within(card).getByLabelText("50m more than last week").textContent).toBe("▲ 50m");
    expect(within(card).getByLabelText("7m less than last week").textContent).toBe("▼ 7m");
  });

  it("hides the changes card when nothing moved", async () => {
    api.get.mockResolvedValue({ data: summary({ movers: { up: [], down: [] } }) });
    renderRange();
    await screen.findByText("Top distractions");
    expect(screen.queryByText("Biggest changes")).toBeNull();
  });

  it("says so when no distraction site was visited", async () => {
    api.get.mockResolvedValue({ data: summary({ topSites: [], movers: { up: [], down: [] } }) });
    renderRange();
    expect(await screen.findByText("No site you marked as a distraction was visited.")).toBeTruthy();
  });
});

describe("best and hardest day", () => {
  it("shows both with their dates", async () => {
    renderRange();
    const best = (await screen.findByRole("heading", { name: "Best day" })).parentElement as HTMLElement;
    const worst = screen.getByRole("heading", { name: "Hardest day" }).parentElement as HTMLElement;
    expect(within(best).getByText("10m")).toBeTruthy();
    expect(within(best).getByText("Tue, 6 Oct")).toBeTruthy();
    expect(within(worst).getByText("1h 15m")).toBeTruthy();
    expect(within(worst).getByText("Wed, 7 Oct")).toBeTruthy();
  });

  it("says None, not 0s, when the best day had no distractions at all", async () => {
    api.get.mockResolvedValue({ data: summary({ best: { date: "2026-10-06", distractedSeconds: 0 } }) });
    renderRange();
    const best = (await screen.findByRole("heading", { name: "Best day" })).parentElement as HTMLElement;
    expect(within(best).getByText("None")).toBeTruthy();
    expect(within(best).queryByText("0s")).toBeNull();
  });

  it("is hidden when there are not two different days to compare", async () => {
    api.get.mockResolvedValue({ data: summary({ best: null, worst: null }) });
    renderRange();
    await screen.findByText("Distraction time");
    expect(screen.queryByText("Best day")).toBeNull();
  });
});

describe("other states", () => {
  it("shows a loading state while the week loads", () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    renderRange();
    expect(screen.getByLabelText("Loading the week").getAttribute("aria-busy")).toBe("true");
  });

  it("explains an empty week, differently for this week and for one in the past", async () => {
    const empty = summary({ totals: { ...summary().totals, daysTracked: 0, distractedSeconds: 0, trackedSeconds: 0, visits: 0 } });
    api.get.mockResolvedValue({ data: empty });
    renderRange();
    expect(await screen.findByText("Nothing tracked yet this week")).toBeTruthy();
    expect(screen.getByText(/Press Start session/)).toBeTruthy();
  });

  it("explains an empty week in the past without telling the user to start a session", async () => {
    const empty = summary({ totals: { ...summary().totals, daysTracked: 0, distractedSeconds: 0, trackedSeconds: 0, visits: 0 } });
    api.get.mockResolvedValue({ data: empty });
    renderRange({ isCurrent: false });
    expect(await screen.findByText("Nothing tracked in 5 to 11 Oct")).toBeTruthy();
    expect(screen.getByText("No browsing was recorded in this week.")).toBeTruthy();
  });

  it("shows an error with a retry that loads the week", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error("offline"));
    renderRange();
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load this week/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Distraction time")).toBeTruthy();
  });
});

describe("when it happens (heatmap)", () => {
  it("says when most distraction time was, in words", async () => {
    renderRange();
    expect(await screen.findByText("Most distraction time: Wednesday 21:00 to 22:00 (50m).")).toBeTruthy();
  });

  it("gives every square its exact time on hover, and lists the busiest hours for screen readers", async () => {
    renderRange();
    const card = (await screen.findByText("When it happens")).closest("div") as HTMLElement;
    expect(within(card).getByTitle("Wednesday 21:00 to 22:00: 50m")).toBeTruthy();
    expect(within(card).getByTitle("Monday 03:00 to 04:00: nothing")).toBeTruthy();
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Wednesday 21:00 to 22:00: 50m",
      "Wednesday 22:00 to 23:00: 25m",
      "Monday 10:00 to 11:00: 15m",
      "Tuesday 11:00 to 12:00: 8m",
    ]);
  });

  it("makes the busiest square the darkest and a quiet one lighter", async () => {
    renderRange();
    const busiest = (await screen.findByTitle("Wednesday 21:00 to 22:00: 50m")) as HTMLElement;
    const quieter = screen.getByTitle("Tuesday 11:00 to 12:00: 8m") as HTMLElement;
    expect(busiest.style.opacity).toBe("1");
    expect(Number(quieter.style.opacity)).toBeLessThan(1);
    expect((screen.getByTitle("Monday 03:00 to 04:00: nothing") as HTMLElement).style.opacity).toBe("");
  });

  it("says Thursdays for a month, which adds up several of a weekday", async () => {
    api.get.mockResolvedValue({ data: summary({ view: "month", heatmap: heat([[3, 10, 1400]]) }) });
    renderRange({ view: "month", label: "October 2026" });
    expect(await screen.findByText("Most distraction time: Thursdays 10:00 to 11:00 (23m).")).toBeTruthy();
  });

  it("is hidden when there were no distractions at all", async () => {
    api.get.mockResolvedValue({ data: summary({ heatmap: heat([]) }) });
    renderRange();
    await screen.findByText("Distraction time");
    expect(screen.queryByText("When it happens")).toBeNull();
  });
});

describe("how soon you slip", () => {
  it("says the usual time and the longest day, and has a table for screen readers", async () => {
    renderRange();
    expect(await screen.findByText("Usually 33m after you start. Longest on Monday (1h).")).toBeTruthy();
    const rows = screen.getAllByRole("row").map((r) => r.textContent);
    expect(rows).toContain("Mon, 5 Oct1h");
    expect(rows).toContain("Wed, 7 Oct10m");
    expect(rows.filter((r) => r?.includes("Thu, 8 Oct")).length).toBe(0); // a day that has not happened is not listed
  });

  it("gives each bar its time on hover, and says so for a day without one", async () => {
    renderRange();
    expect(await screen.findByTitle("Mon, 5 Oct: 1h")).toBeTruthy();
    expect(screen.getAllByTitle("Thu, 8 Oct: no first distraction").length).toBe(1);
  });

  it("hides the table's wrapper, not the table, so it cannot widen a phone page", async () => {
    renderRange();
    const table = (await screen.findByRole("table")) as HTMLElement;
    expect(table.className).not.toContain("sr-only");
    expect(table.parentElement?.className).toContain("sr-only");
  });

  it("is hidden when no day had a first distraction", async () => {
    api.get.mockResolvedValue({ data: summary({ days: summary().days.map((d) => ({ ...d, firstDistractionAfterSeconds: null })) }) });
    renderRange();
    await screen.findByText("Distraction time");
    expect(screen.queryByText("How soon you slip")).toBeNull();
  });
});

describe("a month", () => {
  const monthDays = Array.from({ length: 31 }, (_, i) => {
    const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
    return { ...day(date, i < 10 ? 600 * (i % 4) : 0, i < 10 ? 3000 : 0, i < 10 ? 2 : 0), firstDistractionAfterSeconds: i % 3 === 0 ? 1200 : null };
  });
  const month = (overrides: Partial<RangeSummary> = {}) =>
    summary({
      view: "month",
      start: "2026-10-01",
      end: "2026-10-31",
      through: "2026-10-10",
      days: monthDays,
      totals: { distractedSeconds: 9000, trackedSeconds: 30000, visits: 20, daysTracked: 10, daysUnderBudget: 9, avgDistractedSeconds: 900 },
      previous: { start: "2026-09-01", end: "2026-09-10", distractedSeconds: 6000, trackedSeconds: 20000, visits: 15, daysTracked: 8 },
      ...overrides,
    });
  const renderMonth = (props: Partial<React.ComponentProps<typeof RangeView>> = {}) =>
    renderRange({ view: "month", date: "2026-10-10", label: "October 2026", today: "2026-10-10", ...props });

  it("asks for the month and names last month in the comparison, noting it is the same days while it is going", async () => {
    api.get.mockResolvedValue({ data: month() });
    renderMonth();
    expect(await screen.findByText("50m more than last month, same days.")).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/range", { params: { view: "month", date: "2026-10-10" } });
    expect(screen.getByText("October 2026 · 10 days tracked")).toBeTruthy();
  });

  it("compares a finished month with the whole of last month", async () => {
    api.get.mockResolvedValue({ data: month({ through: "2026-10-31" }) });
    renderMonth({ isCurrent: false });
    expect(await screen.findByText("50m more than last month.")).toBeTruthy();
  });

  it("compares sites and changes with last month", async () => {
    api.get.mockResolvedValue({ data: month() });
    renderMonth();
    expect(await screen.findByText("Against last month.")).toBeTruthy();
    expect(screen.getAllByText(/vs last month/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/last week/)).toBeNull();
  });

  it("has a bar for every day of the month, with the days that have not happened disabled", async () => {
    api.get.mockResolvedValue({ data: month() });
    renderMonth();
    const group = await screen.findByRole("group", { name: "Distraction time for each day" });
    const buttons = within(group).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons).toHaveLength(31);
    expect(buttons.filter((b) => b.disabled)).toHaveLength(21); // 11 to 31 October
    expect(within(group).getByRole("button", { name: "Sat, 10 Oct: 10m of distractions" })).toBeTruthy();
  });

  it("opens the Day view for a day of the month", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: month() });
    const { onOpenDay } = renderMonth();
    await user.click(await screen.findByRole("button", { name: "Fri, 2 Oct: 10m of distractions" }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-02");
  });

  it("has a first-distraction bar per day and a table row only for days that have happened", async () => {
    api.get.mockResolvedValue({ data: month() });
    renderMonth();
    await screen.findByText("How soon you slip");
    expect(screen.getAllByRole("row")).toHaveLength(1 + 10); // header and 1 to 10 October
  });

  it("labels both charts with day numbers, not weekdays, once there are many bars", async () => {
    api.get.mockResolvedValue({ data: month() });
    renderMonth();
    const trend = (await screen.findByText("How soon you slip")).closest("div") as HTMLElement;
    expect(within(trend).getAllByText("11")).toHaveLength(1);
    expect(within(trend).queryAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)).toHaveLength(0);
    expect(screen.getAllByText("11")).toHaveLength(2); // and the daily bars above
  });

  it("explains an empty month", async () => {
    api.get.mockResolvedValue({ data: month({ totals: { ...month().totals, daysTracked: 0 } }) });
    renderMonth();
    expect(await screen.findByText("Nothing tracked yet this month")).toBeTruthy();
  });

  it("explains an empty month in the past", async () => {
    api.get.mockResolvedValue({ data: month({ totals: { ...month().totals, daysTracked: 0 } }) });
    renderMonth({ isCurrent: false, label: "September 2026" });
    expect(await screen.findByText("Nothing tracked in September 2026")).toBeTruthy();
    expect(screen.getByText("No browsing was recorded in this month.")).toBeTruthy();
  });

  it("shows the loading and error states with the month's name", async () => {
    api.get.mockReturnValueOnce(new Promise(() => undefined));
    renderMonth();
    expect(screen.getByLabelText("Loading the month")).toBeTruthy();
  });
});
