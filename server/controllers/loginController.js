import { loginUser } from "../models/loginModel.js";

export async function loginController(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send("Email and password are required");
  }
  try {
    await loginUser(email,password);
    res.status(201).send("Login Successful");
  } catch (err) {
    res.status(500).send("Login Failed");
    // console.log(err);
  }
};