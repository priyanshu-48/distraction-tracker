import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import tabRoute from "./routes/tabRoute.js";
import trackingRoute from "./routes/trackingRoute.js";
import authRoutes from "./routes/authRoute.js";
import siteAddRoute from './routes/siteAddRoute.js';
import analyticsRoute from './routes/analyticsRoute.js';
import statBlockRoute from './routes/statBlockRoute.js';

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set; refusing to start.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",");

app.use(helmet());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "256kb" }));

app.use("/api",tabRoute);
app.use("/api",trackingRoute);
app.use("/api/auth",authRoutes);
app.use("/api",siteAddRoute);
app.use("/api/analytics",analyticsRoute);
app.use("/api/analytics",statBlockRoute);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
