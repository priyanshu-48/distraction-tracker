import { loginUser } from "../models/loginModel.js";

export async function loginController(req, res) {
  const { email, password } = req.body;
  const result = await loginUser(email, password);
  if (!result) {
    return res.status(401).json({
      error: "Authentication failed",
      message: "Invalid email or password"
    });
  }
  return res.status(200).json({
    success: true,
    message: "Login successful",
    user: result.user,
    token: result.token
  });
};
