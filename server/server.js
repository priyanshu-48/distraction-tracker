import "dotenv/config";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set; refusing to start.");
  process.exit(1);
}

const { default: app } = await import("./app.js");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
