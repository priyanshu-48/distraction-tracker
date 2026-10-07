/**
 * Talks to the browser extension over the channel its manifest allows for this page
 * (`externally_connectable`). Everything here resolves instead of throwing, because
 * "the extension is not there" is a normal state to show, not an error.
 */

/** What the extension reports about itself (answer to PING). */
export interface ExtensionReport {
  status: "ok";
  version: string;
  hasToken: boolean;
  authState: "none" | "ok" | "logged_out";
  tracking: boolean;
  /** Finished visits waiting to be uploaded. */
  queued: number;
  lastUploadAt: string | null;
}

export type ExtensionState =
  /** `VITE_EXTENSION_ID` is not set, so there is nothing to talk to. */
  | { kind: "unconfigured" }
  /** This browser cannot message extensions (not Chromium-based). */
  | { kind: "unsupported" }
  /** No answer: not installed, disabled, a different ID, or installed in another browser. */
  | { kind: "not-found" }
  /** The extension is there and listening but too old to report its status: it needs a reload. */
  | { kind: "outdated" }
  | { kind: "connected"; report: ExtensionReport };

interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response: unknown) => void): void;
  lastError?: unknown;
}

const extensionId = (): string | undefined => import.meta.env.VITE_EXTENSION_ID || undefined;
const runtime = (): ChromeRuntime | undefined => (window as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;

interface Reply {
  /** What the extension answered, or null if it did not. */
  response: unknown;
  /** Why there was no answer, as Chrome words it (null when there was one, or nothing was sent). */
  error: string | null;
}

/** Sends one message and resolves with the reply; never throws. */
function send(message: { type: string; [key: string]: unknown }): Promise<Reply> {
  return new Promise((resolve) => {
    const id = extensionId();
    const rt = runtime();
    if (!id || !rt?.sendMessage) return resolve({ response: null, error: null });
    try {
      rt.sendMessage(id, message, (response) => {
        // Reading lastError marks it handled, which stops "Unchecked runtime.lastError" console noise.
        const lastError = rt.lastError as { message?: string } | undefined;
        if (lastError) return resolve({ response: null, error: lastError.message ?? "unknown error" });
        resolve({ response: response === undefined ? null : response, error: null });
      });
    } catch (error) {
      resolve({ response: null, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** Gives the extension the login token. True if it accepted it. */
export async function syncToken(token: string): Promise<boolean> {
  const { response } = await send({ type: "SET_TOKEN", token });
  return (response as { status?: string } | null)?.status === "ok";
}

/** Tells the extension to upload what it has and forget the account (dashboard logout). */
export async function forgetAccount(): Promise<void> {
  await send({ type: "LOGOUT" });
}

/**
 * Tells the extension that a session was just started or stopped, so it re-reads the state now instead of at its
 * next 30 second check (decisions.md, D-23). Quiet when there is no extension: the server cuts any overrun anyway.
 */
export async function notifyTrackingChanged(): Promise<void> {
  await send({ type: "TRACKING_CHANGED" });
}

/** Is the extension installed, reachable and connected? */
export async function checkExtension(): Promise<ExtensionState> {
  if (!extensionId()) return { kind: "unconfigured" };
  if (!runtime()?.sendMessage) return { kind: "unsupported" };
  const { response, error } = await send({ type: "PING" });
  if ((response as ExtensionReport | null)?.status === "ok") return { kind: "connected", report: response as ExtensionReport };
  // An extension that listens but does not know PING closes the channel without a reply, which Chrome words
  // differently from "nobody is there". That means an older version is running: it needs a reload.
  if (error && /message port closed/i.test(error)) return { kind: "outdated" };
  return { kind: "not-found" };
}
