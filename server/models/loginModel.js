import db from '../db.js';
import bcrypt from "bcrypt";

export async function loginUser(email,password){
    console.log("Email received:", email);
    const result = await db.query(`SELECT * FROM users WHERE email = $1`,[email]);
    const user = result.rows[0];
    // console.log(result);
    if(!user) throw new Error("User not found!");

    const isMatch = await bcrypt.compare(password,user.password_hash);
    if(!isMatch) throw new Error("Wrong Password!");
    return user;
}