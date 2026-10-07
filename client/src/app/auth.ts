import type { QueryClient } from "@tanstack/react-query";
import api from "@/api";
import { forgetAccount, syncToken } from "@/lib/extension";

/** Where a signed-in user lands: the one dashboard page. */
export const HOME_PATH = "/";
/** Where a new account lands: the same page, which shows the setup banner until setup is done. */
export const SETUP_PATH = "/";

export const getToken = (): string | null => localStorage.getItem("token");

export interface SignedInUser {
  id: number;
  email: string;
}

/** Signs in, stores the token and hands it to the extension. Throws the API error on failure. */
export async function login(email: string, password: string): Promise<SignedInUser> {
  const { data } = await api.post<{ token: string; user: SignedInUser }>("/auth/login", { email, password });
  localStorage.setItem("token", data.token);
  void syncToken(data.token);
  return data.user;
}

/** Creates an account. The caller signs in afterwards (the API does not return a token). */
export async function register(email: string, password: string): Promise<void> {
  await api.post("/auth/register", { email, password });
}

/**
 * Signs out. The extension is told first so it uploads the visit in progress and stops recording as this
 * account; a slow or missing extension never blocks logging out.
 */
export async function logout(queryClient: QueryClient): Promise<void> {
  await Promise.race([forgetAccount(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  queryClient.clear();
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
