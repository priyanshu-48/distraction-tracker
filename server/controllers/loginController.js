import { loginUser } from "../models/loginModel.js";
import { COOKIE_NAME, cookieOptions } from "../domain/session.js";

export async function loginController(req, res) {
  const { email, password } = req.body;
  const result = await loginUser(email, password);
  if (!result) {
    return res.status(401).json({
      error: "Authentication failed",
      message: "Invalid email or password"
    });
  }
  // The dashboard relies on this cookie (page scripts cannot read it). The token is also in the body for the
  // extension, scripts and tests; the dashboard never stores it.
  res.cookie(COOKIE_NAME, result.token, cookieOptions());
  return res.status(200).json({
    success: true,
    message: "Login successful",
    user: result.user,
    token: result.token
  });
};
