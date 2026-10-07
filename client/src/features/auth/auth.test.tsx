// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import { SESSION_KEY, forgetExtensionToken, logout, syncExtension } from "@/app/auth";
import { PasswordField } from "@/components/ui/field";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";

const apiPost = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const ext = vi.hoisted(() => ({ syncToken: vi.fn(), forgetAccount: vi.fn() }));
vi.mock("@/api", () => ({ default: { post: apiPost, get: apiGet } }));
vi.mock("@/lib/extension", () => ext);

const apiError = (status: number, message = "server message") => ({ response: { status, data: { message } } });

const signedOut = { response: { status: 401, data: {} } };
let queryClient: QueryClient;

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><p>home</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  forgetExtensionToken();
  apiPost.mockReset();
  apiGet.mockReset().mockRejectedValue(signedOut); // GET /auth/me: nobody is signed in
  ext.syncToken.mockReset().mockResolvedValue(true);
  ext.forgetAccount.mockReset().mockResolvedValue(undefined);
});

describe("PasswordField show/hide", () => {
  const field = () => <PasswordField id="pw" label="Password" autoComplete="current-password" onChange={() => undefined} value="" />;

  it("starts hidden and the toggle says what it will do", () => {
    render(field());
    expect(screen.getByLabelText("Password", { selector: "input" })).toHaveProperty("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("reveals and hides the password, updating its accessible name and state", async () => {
    const user = userEvent.setup();
    render(field());
    const input = screen.getByLabelText("Password", { selector: "input" });

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveProperty("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");

    await user.click(hide);
    expect(input).toHaveProperty("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("works from the keyboard and never submits the form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(<form onSubmit={onSubmit}>{field()}</form>);
    await user.tab(); // input
    await user.tab(); // toggle
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show password" }));
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Password", { selector: "input" })).toHaveProperty("type", "text");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the autocomplete hint for password managers", () => {
    render(field());
    expect(screen.getByLabelText("Password", { selector: "input" }).getAttribute("autocomplete")).toBe("current-password");
  });
});

describe("LoginPage", () => {
  it("has a show/hide button on the password field", async () => {
    renderAt("/login");
    expect(await screen.findAllByRole("button", { name: /show password/i })).toHaveLength(1);
  });

  it("signs in and goes home without keeping any token in the page's storage", async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({ data: { token: "tok", user: { id: 1, email: "a@b.co" } } });
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), " a@b.co ");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("home")).toBeTruthy();
    expect(apiPost).toHaveBeenCalledWith("/auth/login", { email: "a@b.co", password: "password123" });
    expect(localStorage.length).toBe(0); // the login is an httpOnly cookie that scripts cannot read
    expect(queryClient.getQueryData(SESSION_KEY)).toEqual({ id: 1, email: "a@b.co" });
  });

  it("shows the server's message for a wrong password and lets the user retry", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(apiError(401, "Invalid email or password"));
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid email or password");
    expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", false);
  });

  it.each([
    [429, "Too many attempts. Wait a few minutes and try again."],
    [500, "Sign-in failed. Please try again."],
  ])("explains a %s response in plain words", async (status, message) => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(apiError(status, "internal detail"));
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("says so when the server cannot be reached", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(new Error("Network Error"));
    renderAt("/login");
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.type(screen.getByLabelText("Password", { selector: "input" }), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/can't reach the server/i);
  });

  it("will not submit an empty form", async () => {
    renderAt("/login");
    expect(await screen.findByRole("button", { name: "Sign in" })).toHaveProperty("disabled", true);
  });

  it("skips the form when the server says you are already signed in", async () => {
    apiGet.mockResolvedValue({ data: { user: { id: 1, email: "a@b.co" } } });
    renderAt("/login");
    expect(await screen.findByText("home")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/auth/me");
  });
});

describe("RegisterPage", () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string, confirm: string) {
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password", { selector: "input" }), password);
    await user.type(screen.getByLabelText("Confirm password", { selector: "input" }), confirm);
  }

  it("has a show/hide button on both password fields, which work independently", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    const toggles = await screen.findAllByRole("button", { name: /show password/i });
    expect(toggles).toHaveLength(2);

    await user.click(toggles[0]);
    expect(screen.getByLabelText("Password", { selector: "input" })).toHaveProperty("type", "text");
    expect(screen.getByLabelText("Confirm password", { selector: "input" })).toHaveProperty("type", "password");
  });

  it("explains each problem next to its field and does not call the API", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    await screen.findByLabelText("Email");
    await fill(user, "not-an-email", "short", "different");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Use at least 8 characters.")).toBeTruthy();
    expect(screen.getByText("Passwords do not match.")).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("creates the account, signs in and goes home (where the setup banner shows)", async () => {
    const user = userEvent.setup();
    apiPost.mockImplementation(async (url: string) =>
      url === "/auth/login" ? { data: { token: "tok", user: { id: 2, email: "new@b.co" } } } : { data: {} }
    );
    renderAt("/register");
    await fill(user, "new@b.co", "password123", "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("home")).toBeTruthy();
    expect(apiPost.mock.calls.map((call) => call[0])).toEqual(["/auth/register", "/auth/login"]);
    expect(localStorage.length).toBe(0);
  });

  it("shows the server's message when the email is taken", async () => {
    const user = userEvent.setup();
    apiPost.mockRejectedValue(apiError(409, "Email already registered"));
    renderAt("/register");
    await fill(user, "taken@b.co", "password123", "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Email already registered");
  });

  it("tells the user when the account was created but sign-in failed", async () => {
    const user = userEvent.setup();
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/auth/login") throw apiError(500);
      return { data: {} };
    });
    renderAt("/register");
    await fill(user, "new@b.co", "password123", "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/account was created/i));
  });
});

describe("ProtectedRoute", () => {
  it("shows a loading state, not the page, until the server has answered", async () => {
    apiGet.mockReturnValue(new Promise(() => undefined)); // never answers
    renderAt("/");
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("home")).toBeNull();
  });

  it("sends a signed-out visitor to the sign-in page", async () => {
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("does not treat an unreachable server as being signed out", async () => {
    apiGet.mockRejectedValue(new Error("Network Error"));
    renderAt("/");
    expect(await screen.findByText(/can't reach the server/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});

describe("syncExtension and logout", () => {
  it("fetches a limited extension token once and reuses it", async () => {
    apiPost.mockResolvedValue({ data: { token: "ext-tok" } });
    expect(await syncExtension()).toBe(true);
    expect(await syncExtension()).toBe(true);
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith("/auth/extension-token");
    expect(ext.syncToken).toHaveBeenCalledWith("ext-tok");
  });

  it("reports false instead of throwing when the server refuses", async () => {
    apiPost.mockRejectedValue(signedOut);
    expect(await syncExtension()).toBe(false);
    expect(ext.syncToken).not.toHaveBeenCalled();
  });

  it("logs out: extension first, then the server, then the local state", async () => {
    const order: string[] = [];
    ext.forgetAccount.mockImplementation(async () => void order.push("extension"));
    apiPost.mockImplementation(async (url: string) => void order.push(url));
    queryClient.setQueryData(SESSION_KEY, { id: 1, email: "a@b.co" });
    await logout(queryClient);
    expect(order).toEqual(["extension", "/auth/logout"]);
    expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
  });

  it("still signs out here when the server cannot be reached", async () => {
    apiPost.mockRejectedValue(new Error("Network Error"));
    queryClient.setQueryData(SESSION_KEY, { id: 1, email: "a@b.co" });
    await logout(queryClient);
    expect(queryClient.getQueryData(SESSION_KEY)).toBeNull();
  });

  it("does not call the server when the account is already gone", async () => {
    await logout(queryClient, { serverSide: false });
    expect(apiPost).not.toHaveBeenCalled();
  });
});
