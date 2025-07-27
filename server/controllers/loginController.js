import { loginUser } from "../models/loginModel.js";

export async function loginController(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Email and password are required"
    });
  }
  try {
    const { user, token } = await loginUser(email, password);
    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
      token   
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(401).json({ 
      error: "Authentication failed",
      message: err.message 
    });
  }
};