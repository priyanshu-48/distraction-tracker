import { registerUser } from "../models/registerModel.js";

export async function register(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send("Email and password are required");
    }
    try {
        await registerUser(req.body);
        res.status(201).send("Registration Successful");
    } catch (err) {
        if (err.code === '23505') { // PostgreSQL unique_violation
            return res.status(409).send("Email already registered");
        }else{
            res.status(500).send("Registration Failed");
            console.log(err);
        }
    }
};