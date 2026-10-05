import db from "../db.js";
import bcrypt from 'bcrypt';

export async function registerUser({ email, password }) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  await db.query(
    "INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, NOW())",
    [email, hash]
  );
}
