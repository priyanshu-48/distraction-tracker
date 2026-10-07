import { useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/api";
import { forgetAccount, syncToken } from "@/lib/extension";

/** Where a signed-in user lands: the one dashboard page. */
export const HOME_PATH = "/";
/** Where a new account lands: the same page, which shows the setup banner until setup is done. */
export const SETUP_PATH = "/";

export interface SignedInUser {
  id: number;
  email: string;
}

/**
 * Who is signed in. The login is an httpOnly cookie that scripts cannot read, so the app asks the server
 * (GET /auth/me) instead of looking for a token in the browser's storage.
 */
export const SESSION_KEY = ["me"] as const;

const statusOf = (error: unknown) => (error as { response?: { status?: number } }).response?.status;

async function fetchSession(): Promise<SignedInUser | null> {
  try {
    return (await api.get<{ user: SignedInUser }>("/auth/me")).data.user;
  } catch (error) {
    if (statusOf(error) === 401) return null; // signed out: a normal answer, not a failure
    throw error;
  }
}

export type SessionState =
  | { status: "pending" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: SignedInUser }
  /** The server could not be reached, which is different from being signed out. */
  | { status: "error"; retry: () => void };

export function useSession(): SessionState {
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, retry: false, staleTime: Infinity, refetchOnWindowFocus: false });
  if (query.isPending) return { status: "pending" };
  if (query.isError) return { status: "error", retry: () => void query.refetch() };
  return query.data ? { status: "signedIn", user: query.data } : { status: "signedOut" };
}

// ---- the extension's own, limited token (it can upload visits and read the tracking state, nothing else)

const EXTENSION_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let extensionToken: { value: string; at: number } | null = null;

/** Forget the cached extension token (a new sign-in or a sign-out needs a fresh one). */
export const forgetExtensionToken = () => {
  extensionToken = null;
};

/**
 * Gives the extension a token of its own. Not the dashboard's login: that lives in a cookie the page cannot read, and
 * an extension token that leaks cannot read or delete any data. Fetched once and reused while the page stays open.
 */
export async function syncExtension(): Promise<boolean> {
  try {
    if (!extensionToken || Date.now() - extensionToken.at > EXTENSION_TOKEN_MAX_AGE_MS) {
      const { data } = await api.post<{ token: string }>("/auth/extension-token");
      extensionToken = { value: data.token, at: Date.now() };
    }
    return await syncToken(extensionToken.value);
  } catch {
    return false; // signed out, or the server is down: the extension will be given a token next time
  }
}

// ---- signing in and out

/** Signs in. The server sets the cookie; the token it also returns (for scripts) is deliberately ignored here. */
export async function login(email: string, password: string, queryClient: QueryClient): Promise<SignedInUser> {
  const { data } = await api.post<{ user: SignedInUser }>("/auth/login", { email, password });
  const user = { id: data.user.id, email: data.user.email };
  forgetExtensionToken();
  queryClient.setQueryData(SESSION_KEY, user);
  return user;
}

/** Creates an account. The caller signs in afterwards (registering does not sign you in). */
export async function register(email: string, password: string): Promise<void> {
  await api.post("/auth/register", { email, password });
}

/**
 * Signs out. The extension is told first so it uploads the visit in progress while its token still works (ending the
 * session on the server revokes it); a slow or missing extension never blocks logging out, and neither does an
 * unreachable server. Pass `serverSide: false` when the account is gone and there is no session left to end.
 */
export async function logout(queryClient: QueryClient, { serverSide = true }: { serverSide?: boolean } = {}): Promise<void> {
  await Promise.race([forgetAccount(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (serverSide) {
    try {
      await api.post("/auth/logout");
    } catch {
      // already signed out or the server is down: sign out here regardless
    }
  }
  forgetExtensionToken();
  queryClient.clear();
  queryClient.setQueryData(SESSION_KEY, null);
}

/** A sentence for the user from a failed API call (never raw server text for validation errors). */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
  if (!response) return "Can't reach the server. Check that it is running and try again.";
  switch (response.status) {
    case 400:
      return "Please check the details you entered.";
    case 401:
    case 403:
    case 409:
      return response.data?.message ?? fallback;
    case 429:
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return fallback;
  }
}
