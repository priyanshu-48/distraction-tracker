import db from "../db.js";
import bcrypt from 'bcrypt';

export async function registerUser(data) {
  const { email, password } = data;
  const saltRounds = 10;  
  const hash = await bcrypt.hash(password, saltRounds);

  await db.query(
    "INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2)",
    [email,hash]
  );
}