// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BudgetForm } from "./BudgetForm";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/api", () => ({ default: api }));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <BudgetForm />
    </QueryClientProvider>
  );
  return { invalidate };
}

const field = () => screen.getByLabelText("Minutes per day") as HTMLInputElement;

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.get.mockResolvedValue({ data: { dailyBudgetSeconds: 5400 } });
  api.put.mockImplementation(async (_url: string, body: { dailyBudgetSeconds: number }) => ({ data: body }));
});

describe("BudgetForm", () => {
  it("shows the saved budget in minutes", async () => {
    renderForm();
    await waitFor(() => expect(field().value).toBe("90"));
  });

  it("saves a new budget in seconds, tells the user, and reloads the days shown", async () => {
    const user = userEvent.setup();
    const { invalidate } = renderForm();
    await waitFor(() => expect(field().value).toBe("90"));

    await user.clear(field());
    await user.type(field(), "45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/settings", { dailyBudgetSeconds: 2700 }));
    expect((await screen.findByRole("status")).textContent).toBe("Saved.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["summary"] });
  });

  it.each([["4"], ["1441"], ["30.5"], ["abc"], ["0"], ["-10"]])("rejects %j without calling the server", async (value) => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(field().value).toBe("90"));

    await user.clear(field());
    if (value !== "abc") await user.type(field(), value);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Enter a whole number of minutes from 5 to 1440.");
    expect(api.put).not.toHaveBeenCalled();
  });

  it("accepts the smallest and largest allowed values", async () => {
    const user = userEvent.setup();
    renderForm();
    await waitFor(() => expect(field().value).toBe("90"));
    for (const [minutes, seconds] of [["5", 300], ["1440", 86400]] as const) {
      await user.clear(field());
      await user.type(field(), minutes);
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(api.put).toHaveBeenCalledWith("/settings", { dailyBudgetSeconds: seconds }));
    }
  });

  it("says so when saving fails", async () => {
    const user = userEvent.setup();
    api.put.mockRejectedValue(new Error("offline"));
    renderForm();
    await waitFor(() => expect(field().value).toBe("90"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save. Please try again.");
  });
});
