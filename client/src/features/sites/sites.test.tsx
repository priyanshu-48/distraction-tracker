// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatDuration } from "@/lib/format";
import { AddSiteForm } from "./AddSiteForm";
import { SiteRow } from "./SiteRow";
import SitesManager from "./SitesManager";
import type { Site, SitesParams, SitesResponse } from "./types";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));

const site = (over: Partial<Site> = {}): Site => ({
  domain: "youtube.com",
  marked: false,
  seconds: 3720,
  visits: 13,
  avgSeconds: 286,
  lastSeen: null,
  type: null,
  ...over,
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** The params of every GET /sites so far, newest last. */
const requested = (): SitesParams[] => api.get.mock.calls.map((call) => call[1].params);
const lastRequest = () => requested().at(-1)!;

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.put.mockImplementation(async (_url: string, body: { marked: boolean }) => ({ data: { domain: "x", marked: body.marked } }));
});

describe("SiteRow", () => {
  const renderRow = (over: Partial<Site> = {}, onToggle = vi.fn()) => {
    render(
      <ul>
        <SiteRow site={site(over)} onToggle={onToggle} />
      </ul>
    );
    return onToggle;
  };

  it("shows the friendly name, with the real domain for screen readers", () => {
    renderRow();
    expect(screen.getByText("YouTube")).toBeTruthy();
    expect(screen.getByText("(youtube.com)")).toBeTruthy();
  });

  it("shows time, visit count and average visit", () => {
    renderRow({ seconds: 3720, visits: 13, avgSeconds: 286 });
    expect(screen.getByText(formatDuration(3720))).toBeTruthy();
    expect(screen.getByText("13 visits")).toBeTruthy();
    expect(screen.getByText(`avg ${formatDuration(286)}`)).toBeTruthy();
  });

  it("says '1 visit' in the singular and 'no visits' when there are none", () => {
    renderRow({ visits: 1 });
    expect(screen.getByText("1 visit")).toBeTruthy();
  });

  it("does not invent an average for a site that was only added by hand", () => {
    renderRow({ visits: 0, seconds: 0, avgSeconds: 0 });
    expect(screen.getByText("0 visits")).toBeTruthy();
    expect(screen.getByText("no visits")).toBeTruthy();
    expect(screen.queryByText(/^avg /)).toBeNull();
  });

  it.each([
    ["checking", "checking habit"],
    ["binge", "binge"],
  ] as const)("labels a %s site", (type, label) => {
    renderRow({ type });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("has no pattern label for an ordinary site", () => {
    renderRow({ type: null });
    expect(screen.queryByText("checking habit")).toBeNull();
    expect(screen.queryByText("binge")).toBeNull();
  });

  it("has a switch named for its site, which shows whether it is marked", () => {
    renderRow({ marked: true });
    const toggle = screen.getByRole("switch", { name: "Count youtube.com as a distraction" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("reports the new choice for that site when the switch is used", async () => {
    const onToggle = renderRow({ marked: false });
    await userEvent.setup().click(screen.getByRole("switch", { name: "Count youtube.com as a distraction" }));
    expect(onToggle).toHaveBeenCalledWith("youtube.com", true);
  });

  it("turns a marked site off", async () => {
    const onToggle = renderRow({ marked: true });
    await userEvent.setup().click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith("youtube.com", false);
  });
});

describe("AddSiteForm", () => {
  const field = () => screen.getByLabelText("Add a distraction") as HTMLInputElement;
  const submit = () => screen.getByRole("button", { name: "Mark as distraction" });

  it("marks the typed site, trimmed, then clears the field", async () => {
    const user = userEvent.setup();
    renderWithClient(<AddSiteForm />);
    await user.type(field(), "  reddit.com ");
    await user.click(submit());
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/sites/reddit.com", { marked: true }));
    await waitFor(() => expect(field().value).toBe(""));
  });

  it("does nothing for an empty or blank field", async () => {
    const user = userEvent.setup();
    renderWithClient(<AddSiteForm />);
    await user.click(submit());
    await user.type(field(), "   ");
    await user.click(submit());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("encodes the name in the address, so odd input cannot change the request path", async () => {
    const user = userEvent.setup();
    renderWithClient(<AddSiteForm />);
    await user.type(field(), "a/b c.com");
    await user.click(submit());
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/sites/a%2Fb%20c.com", { marked: true }));
  });

  it("explains what to type when the server refuses, and keeps what was typed", async () => {
    api.put.mockRejectedValue({ response: { status: 400 } });
    const user = userEvent.setup();
    renderWithClient(<AddSiteForm />);
    await user.type(field(), "not a site");
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a site name like reddit.com");
    expect(field().value).toBe("not a site");
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  it("disables the button while saving, so one click is one request", async () => {
    api.put.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderWithClient(<AddSiteForm />);
    await user.type(field(), "reddit.com");
    await user.click(submit());
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(true));
    expect(api.put).toHaveBeenCalledTimes(1);
  });
});

describe("SitesManager", () => {
  const response = (sites: Site[], total = sites.length): { data: SitesResponse } => ({ data: { days: 7, total, sites } });
  const rows = () => within(screen.getByRole("list", { name: /^Sites, last/ })).getAllByRole("listitem").filter((li) => li.querySelector("dl"));

  beforeEach(() => {
    api.get.mockResolvedValue(response([site(), site({ domain: "reddit.com", seconds: 1200, visits: 6 })]));
  });

  it("shows a loading state, then one row per site", async () => {
    renderWithClient(<SitesManager />);
    expect(screen.getByLabelText("Loading sites")).toBeTruthy();
    await screen.findByText("YouTube");
    expect(rows()).toHaveLength(2);
    expect(screen.getByText("Reddit")).toBeTruthy();
    expect(screen.getByText("Showing 1 to 2 of 2")).toBeTruthy();
  });

  it("starts with the last 7 days, everything, most time first", async () => {
    renderWithClient(<SitesManager />);
    await screen.findByText("YouTube");
    expect(requested()[0]).toEqual({ days: 7, filter: "all", q: "", sort: "time", limit: 25, offset: 0 });
  });

  it("asks for another filter, range or sort when they change", async () => {
    const user = userEvent.setup();
    renderWithClient(<SitesManager />);
    await screen.findByText("YouTube");

    await user.click(screen.getByRole("radio", { name: "Distractions" }));
    await waitFor(() => expect(lastRequest().filter).toBe("distractions"));
    await user.click(screen.getByRole("radio", { name: "30d" }));
    await waitFor(() => expect(lastRequest().days).toBe(30));
    await user.selectOptions(screen.getByLabelText("Sort"), "visits");
    await waitFor(() => expect(lastRequest().sort).toBe("visits"));
    expect(lastRequest()).toMatchObject({ days: 30, filter: "distractions", sort: "visits", offset: 0 });
  });

  it("searches after typing stops, not on every keystroke", async () => {
    const user = userEvent.setup();
    renderWithClient(<SitesManager />);
    await screen.findByText("YouTube");
    const before = api.get.mock.calls.length;
    await user.type(screen.getByRole("searchbox", { name: "Search sites" }), "red");
    await waitFor(() => expect(lastRequest().q).toBe("red"), { timeout: 2000 });
    expect(requested().filter((p) => p.q !== "" && p.q !== "red")).toEqual([]); // never "r" or "re"
    expect(api.get.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  describe("pages", () => {
    beforeEach(() => {
      api.get.mockImplementation(async (_url: string, { params }: { params: SitesParams }) => {
        const page = params.offset / 25;
        const count = page === 2 ? 10 : 25;
        return response(Array.from({ length: count }, (_, i) => site({ domain: `site${page * 25 + i}.com` })), 60);
      });
    });

    it("moves through the pages and says where you are", async () => {
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("Showing 1 to 25 of 60");
      expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByText("Showing 26 to 50 of 60");
      expect(lastRequest().offset).toBe(25);

      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByText("Showing 51 to 60 of 60");
      expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "Previous" }));
      await screen.findByText("Showing 26 to 50 of 60");
    });

    it("goes back to the first page when the filter changes", async () => {
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("Showing 1 to 25 of 60");
      await user.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByText("Showing 26 to 50 of 60");

      await user.click(screen.getByRole("radio", { name: "Unmarked" }));
      await waitFor(() => expect(lastRequest()).toMatchObject({ filter: "unmarked", offset: 0 }));
    });
  });

  describe("when there is nothing to show", () => {
    it("invites you to start a session when you have no sites at all", async () => {
      api.get.mockResolvedValue(response([]));
      renderWithClient(<SitesManager />);
      expect(await screen.findByText("No sites yet")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    });

    it("says nothing matches a filter, and clears it with one click", async () => {
      api.get.mockImplementation(async (_url: string, { params }: { params: SitesParams }) =>
        response(params.filter === "all" ? [site()] : [])
      );
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("YouTube");

      await user.click(screen.getByRole("radio", { name: "Distractions" }));
      expect(await screen.findByText("No matching sites")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(await screen.findByText("YouTube")).toBeTruthy();
      expect(lastRequest()).toMatchObject({ filter: "all", q: "" });
    });
  });

  it("offers to try again when the list cannot be loaded", async () => {
    api.get.mockRejectedValueOnce(new Error("Network Error"));
    const user = userEvent.setup();
    renderWithClient(<SitesManager />);
    expect(await screen.findByText("Couldn't load your sites")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("YouTube")).toBeTruthy();
  });

  describe("marking a site", () => {
    const toggle = (name: string) => screen.getByRole("switch", { name: `Count ${name} as a distraction` });

    it("flips the switch at once and saves in the background", async () => {
      let finish!: () => void;
      api.put.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ data: { domain: "youtube.com", marked: true } }))));
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("YouTube");

      await user.click(toggle("youtube.com"));
      expect(toggle("youtube.com").getAttribute("aria-checked")).toBe("true"); // before the server has answered
      expect(api.put).toHaveBeenCalledWith("/sites/youtube.com", { marked: true });
      finish();
    });

    it("puts the switch back when saving fails, even before the list has been refreshed", async () => {
      // The refetch after a failure would also hide a missing rollback, so here it never answers: the switch can only
      // go back if the rollback itself works.
      const loaded = api.get.getMockImplementation()!;
      api.get.mockReset();
      api.get.mockImplementationOnce(loaded).mockReturnValue(new Promise(() => undefined));
      api.put.mockRejectedValue({ response: { status: 500 } });
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("YouTube");

      await user.click(toggle("youtube.com"));
      await waitFor(() => expect(api.put).toHaveBeenCalled()); // by now the switch has been flipped optimistically
      await waitFor(() => expect(toggle("youtube.com").getAttribute("aria-checked")).toBe("false"));
    });

    it("says the change was undone when saving fails", async () => {
      api.put.mockRejectedValue({ response: { status: 500 } });
      const user = userEvent.setup();
      renderWithClient(<SitesManager />);
      await screen.findByText("YouTube");

      await user.click(toggle("youtube.com"));
      expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save that change, so it was undone/);
      await waitFor(() => expect(toggle("youtube.com").getAttribute("aria-checked")).toBe("false"));
    });
  });
});
