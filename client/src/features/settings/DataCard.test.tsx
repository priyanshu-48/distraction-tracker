// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { DataCard } from "./DataCard";

const api = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));
const extension = vi.hoisted(() => ({ notify: vi.fn(), forget: vi.fn() }));
vi.mock("@/lib/extension", () => ({ notifyTrackingChanged: extension.notify, forgetAccount: extension.forget, syncToken: vi.fn() }));

const LocationProbe = () => <p data-testid="where">{useLocation().pathname}</p>;

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <DataCard />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidate };
}

const wrongPassword = { response: { status: 403, data: { message: "That password is not correct" } } };
const field = () => screen.getByLabelText("Your password") as HTMLInputElement;

let clicked: HTMLAnchorElement[];
beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: new Blob(["{}"]) });
  api.delete.mockReset().mockResolvedValue({ data: { success: true, visits: 12, sessions: 3 } });
  extension.notify.mockReset().mockResolvedValue(undefined);
  extension.forget.mockReset().mockResolvedValue(undefined);
  localStorage.setItem("token", "t");
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("downloading your data", () => {
  it("fetches the JSON export with the login token and saves it as a file named for today", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Everything (JSON)" }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith("/account/export", { params: { format: "json" }, responseType: "blob" });
    expect(clicked[0].download).toMatch(/^distraction-tracker-\d{4}-\d{2}-\d{2}\.json$/);
    expect(clicked[0].href).toBe("blob:fake");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake"); // the temporary address is released
  });

  it("does the same for the CSV of visits", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Visits (CSV)" }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(api.get).toHaveBeenCalledWith("/account/export", { params: { format: "csv" }, responseType: "blob" });
    expect(clicked[0].download).toMatch(/\.csv$/);
  });

  it("says so, and lets you try again, when the download fails", async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Everything (JSON)" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't prepare the download. Please try again.");
    expect(clicked).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Everything (JSON)" }));
    await waitFor(() => expect(clicked).toHaveLength(1));
  });

  it("shows that it is working and does not start a second download meanwhile", async () => {
    const user = userEvent.setup();
    api.get.mockReturnValue(new Promise(() => undefined));
    renderCard();
    await user.click(screen.getByRole("button", { name: "Visits (CSV)" }));
    expect(await screen.findByRole("button", { name: "Preparing…" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Everything (JSON)" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("deleting the history", () => {
  async function openHistory() {
    const user = userEvent.setup();
    const rendered = renderCard();
    await user.click(screen.getByRole("button", { name: "Delete my history…" }));
    return { user, ...rendered };
  }

  it("explains what goes and what stays before asking for the password", async () => {
    await openHistory();
    expect(screen.getByText(/permanently deletes every recorded visit and tracking session/)).toBeTruthy();
    expect(screen.getByText(/account, daily budget and list of distraction sites stay/)).toBeTruthy();
    expect(field().type).toBe("password");
  });

  it("asks for the password first: an empty one is refused without calling the server", async () => {
    const { user } = await openHistory();
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter your password to confirm.");
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("deletes with the password, says how much went, refreshes every screen and tells the extension", async () => {
    const { user, invalidate } = await openHistory();
    await user.type(field(), "my-password");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    expect((await screen.findByRole("status")).textContent).toBe("Deleted 12 visits and 3 sessions.");
    expect(api.delete).toHaveBeenCalledWith("/account/data", { data: { password: "my-password" } });
    expect(invalidate).toHaveBeenCalledWith(); // everything, not one key
    expect(extension.notify).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Your password")).toBeNull(); // the form closed, the password is gone
  });

  it("uses the singular for one visit and one session", async () => {
    api.delete.mockResolvedValue({ data: { success: true, visits: 1, sessions: 1 } });
    const { user } = await openHistory();
    await user.type(field(), "pw");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    expect((await screen.findByRole("status")).textContent).toBe("Deleted 1 visit and 1 session.");
  });

  it("keeps the form open with a clear message for a wrong password, and does not claim anything was deleted", async () => {
    api.delete.mockRejectedValue(wrongPassword);
    const { user, invalidate } = await openHistory();
    await user.type(field(), "wrong");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That password is not correct");
    expect(field().value).toBe("wrong");
    expect(screen.queryByRole("status")).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
    expect(extension.notify).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Delete history" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("explains an unreachable server in plain words", async () => {
    api.delete.mockRejectedValue(new Error("Network Error"));
    const { user } = await openHistory();
    await user.type(field(), "pw");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Can't reach the server/);
  });

  it("disables both buttons while deleting", async () => {
    api.delete.mockReturnValue(new Promise(() => undefined));
    const { user } = await openHistory();
    await user.type(field(), "pw");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    const deleting = (await screen.findByRole("button", { name: "Deleting…" })) as HTMLButtonElement;
    expect(deleting.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cancelling closes the form, forgets the password and returns focus to the button that opened it", async () => {
    const { user } = await openHistory();
    await user.type(field(), "typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Your password")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete my history…" }));
    await user.click(screen.getByRole("button", { name: "Delete my history…" }));
    expect(field().value).toBe(""); // not remembered
  });

  it("opening the other deletion replaces the form instead of stacking two, and clears the last result", async () => {
    const { user } = await openHistory();
    await user.type(field(), "pw");
    await user.click(screen.getByRole("button", { name: "Delete history" }));
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: "Delete my account…" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByLabelText("Your password")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete my history…" }));
    expect(screen.getAllByLabelText("Your password")).toHaveLength(1);
    expect(screen.queryByText(/deletes your account/)).toBeNull();
  });
});

describe("deleting the account", () => {
  async function openAccount() {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Delete my account…" }));
    return user;
  }

  it("says that it is permanent and signs you out", async () => {
    await openAccount();
    expect(screen.getByText(/permanently deletes your account and everything in it/)).toBeTruthy();
    expect(screen.getByText(/signed out/)).toBeTruthy();
  });

  it("deletes with the password, then signs out, tells the extension and goes to the sign-in page", async () => {
    const user = await openAccount();
    await user.type(field(), "my-password");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login"));
    expect(api.delete).toHaveBeenCalledWith("/account", { data: { password: "my-password" } });
    expect(extension.forget).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("stays signed in, on the page, when the password is wrong", async () => {
    api.delete.mockRejectedValue(wrongPassword);
    const user = await openAccount();
    await user.type(field(), "wrong");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That password is not correct");
    expect(screen.getByTestId("where").textContent).toBe("/");
    expect(localStorage.getItem("token")).toBe("t");
    expect(extension.forget).not.toHaveBeenCalled();
  });

  it("asks for the password before calling the server", async () => {
    const user = await openAccount();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter your password to confirm.");
    expect(api.delete).not.toHaveBeenCalled();
  });
});
