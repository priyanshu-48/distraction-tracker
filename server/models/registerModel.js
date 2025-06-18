import db from "../db.js";
import bcrypt from 'bcrypt';

export async function registerUser(data) {
  const { email, password, created_at } = data;
  const saltRounds = 10;  
  const hash = await bcrypt.hash(password, saltRounds);

  await db.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
    [email,hash]
  );
}