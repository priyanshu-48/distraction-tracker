import jwt from "jsonwebtoken";
import db from "../db.js";
import { COOKIE_NAME, EXTENSION_TOKEN_SECONDS, SCOPES, clearCookieOptions, tokenClaims } from "../domain/session.js";

/** Who is signed in: the dashboard asks this on load, because it cannot read its own (httpOnly) cookie. */
export async function me(req, res) {
  res.json({ user: { id: req.user.id, email: req.user.email } });
}

/** Ends every login of this user (the dashboard's and the extension's) and clears the cookie. */
export async function logout(req, res) {
  await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  res.clearCookie(COOKIE_NAME, clearCookieOptions());
  req.log.info({ userId: req.user.id }, "signed out");
  res.status(204).end();
}

/**
 * A token for the extension. It can upload visits and read whether tracking is on, nothing else, so if it leaks it
 * cannot export or delete anything. It lasts 30 days because the extension has no way to refresh it; the dashboard
 * hands over a new one every time it loads.
 */
export async function extensionToken(req, res) {
  const { rows } = await db.query("SELECT id, email, token_version FROM users WHERE id = $1", [req.user.id]);
  const token = jwt.sign(tokenClaims(rows[0], SCOPES.ingest), process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: EXTENSION_TOKEN_SECONDS,
  });
  res.json({ token, expiresInSeconds: EXTENSION_TOKEN_SECONDS });
}
