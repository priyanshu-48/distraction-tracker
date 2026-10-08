import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import logger from "./logger.js";
import { notFound, errorHandler } from "./middleware/error.js";
import healthRoute from "./routes/healthRoute.js";
import tabRoute from "./routes/tabRoute.js";
import trackingRoute from "./routes/trackingRoute.js";
import authRoutes from "./routes/authRoute.js";
import siteRoute from './routes/siteRoute.js';
import settingsRoute from './routes/settingsRoute.js';
import summaryRoute from './routes/summaryRoute.js';
import rangeRoute from './routes/rangeRoute.js';
import accountRoute from './routes/accountRoute.js';
import notificationRoute from './routes/notificationRoute.js';

const app = express();
const origins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",");

// Every request gets an id (taken from X-Request-Id when it looks sane) that appears in
// the logs, the response header and 500 bodies, so a user's report can be traced.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const given = req.headers["x-request-id"];
      const id = typeof given === "string" && /^[\w-]{1,64}$/.test(given) ? given : randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    // Keep log lines short: no headers (they carry tokens) and no connection details.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    autoLogging: { ignore: (req) => req.url === "/healthz" },
  })
);
app.use(helmet());
app.use(cors({ origin: origins, credentials: true })); // credentials: the dashboard's cookie
app.use(express.json({ limit: "256kb" }));

app.use(healthRoute);
app.use("/api",tabRoute);
app.use("/api",trackingRoute);
app.use("/api/auth",authRoutes);
app.use("/api",siteRoute);
app.use("/api",settingsRoute);
app.use("/api",summaryRoute);
app.use("/api",rangeRoute);
app.use("/api",accountRoute);
app.use("/api",notificationRoute);

app.use(notFound);
app.use(errorHandler);

export default app;
