import { registerUser } from "../models/registerModel.js";

export async function register(req, res) {
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
        }
        throw err;
    }
};
