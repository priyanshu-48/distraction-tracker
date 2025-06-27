import { loginUser } from "../models/loginModel.js";

export async function loginController(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send("Email and password are required");
  }
  try {
    const { user,token } = await loginUser(email,password);
    return res.status(200).json({
      message: "Login successful",
      user,
      token   
    });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
};