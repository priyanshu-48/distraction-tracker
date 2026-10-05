import db from '../db.js';
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1d' }
    );
}

// Compared when the email is unknown so both failure paths cost one bcrypt round.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Returns null for any credential failure so callers can't reveal which part was wrong.
export async function loginUser(email, password) {
    const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !isMatch) return null;

    const token = generateToken(user);
    delete user.password_hash;
    return { user, token };
}
