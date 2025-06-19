import db from '../db.js';
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email }, // payload
        process.env.JWT_SECRET,             // secret
        { expiresIn: '1d' }                 // optional: token expiry
    );
}

export async function loginUser(email, password) {
    const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];

    if (!user) throw new Error("User not found!");

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) throw new Error("Wrong Password!");

    const token =  generateToken(user);
    delete user.password_hash;
    return {user, token};
}