// How a login is carried between the dashboard and the API. Pure, so the rules can be tested without a server.

/** The httpOnly cookie that carries the dashboard's login: page scripts cannot read it. */
export const COOKIE_NAME = "dt_session";
export const SESSION_SECONDS = 24 * 60 * 60;
/** The extension's token lasts longer (it cannot refresh it) but can only upload visits and read the tracking state. */
export const EXTENSION_TOKEN_SECONDS = 30 * 24 * 60 * 60;

/** Cookie-authenticated requests that change something must carry this header (see authenticate). */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "dt";
export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A token that can do everything the user can, or one that may only upload visits and read the tracking state. */
export const SCOPES = { user: "user", ingest: "ingest" };

/**
 * Options for the session cookie. Strict: the browser never sends it with a request started by another site.
 * Path /api keeps it off every other request on the same host (cookies are not separated by port on localhost).
 * Secure in production; COOKIE_SECURE=true|false overrides that either way (plain http on a local Docker setup).
 */
export function cookieOptions(env = process.env) {
  const secure = env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "strict", secure, path: "/api", maxAge: SESSION_SECONDS * 1000 };
}

/** The options a cookie must be cleared with: the same attributes, without an expiry. */
export function clearCookieOptions(env = process.env) {
  const { maxAge, ...rest } = cookieOptions(env);
  return rest;
}

/** `Cookie` header -> { name: value }. Bad percent-encoding is kept as it was written instead of throwing. */
export function parseCookies(header) {
  const cookies = {};
  for (const part of (header || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    const raw = part.slice(at + 1).trim();
    if (name in cookies) continue; // the first one wins
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

/** What goes inside a token. `v` is the user's token_version when it was issued. */
export const tokenClaims = (user, scope = SCOPES.user) => ({ id: user.id, email: user.email, v: user.token_version ?? 0, scope });
