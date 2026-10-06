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
  | { kind: "connected"; report: ExtensionReport };

interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response: unknown) => void): void;
  lastError?: unknown;
}

const extensionId = (): string | undefined => import.meta.env.VITE_EXTENSION_ID || undefined;
const runtime = (): ChromeRuntime | undefined => (window as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;

/** Sends one message and resolves with the reply, or null if nobody answered. */
function send(message: { type: string; [key: string]: unknown }): Promise<unknown> {
  return new Promise((resolve) => {
    const id = extensionId();
    const rt = runtime();
    if (!id || !rt?.sendMessage) return resolve(null);
    try {
      rt.sendMessage(id, message, (response) => {
        // Reading lastError marks it handled, which stops "Unchecked runtime.lastError" console noise.
        resolve(rt.lastError || response === undefined ? null : response);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Gives the extension the login token. True if it accepted it. */
export async function syncToken(token: string): Promise<boolean> {
  const reply = (await send({ type: "SET_TOKEN", token })) as { status?: string } | null;
  return reply?.status === "ok";
}

/** Tells the extension to upload what it has and forget the account (dashboard logout). */
export async function forgetAccount(): Promise<void> {
  await send({ type: "LOGOUT" });
}

/** Is the extension installed, reachable and connected? */
export async function checkExtension(): Promise<ExtensionState> {
  if (!extensionId()) return { kind: "unconfigured" };
  if (!runtime()?.sendMessage) return { kind: "unsupported" };
  const reply = (await send({ type: "PING" })) as ExtensionReport | null;
  return reply?.status === "ok" ? { kind: "connected", report: reply } : { kind: "not-found" };
}
