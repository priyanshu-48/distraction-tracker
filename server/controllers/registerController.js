import { registerUser } from "../models/registerModel.js";

export async function register(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: "Validation failed",
            message: "Email and password are required"
        });
    }
    try {
        await registerUser(req.body);
        res.status(201).json({
            success: true,
            message: "Registration successful"
        });
    } catch (err) {
        if (err.code === '23505') { //db violation if already registered 
            return res.status(409).json({
                error: "Registration failed",
                message: "Email already registered"
            });
        } else {
            console.error('Registration error:', err);
            res.status(500).json({
                error: "Registration failed",
                message: "Internal server error"
            });
        }
    }
};