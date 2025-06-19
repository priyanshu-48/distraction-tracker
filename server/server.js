import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import tabRoute from "./routes/tabRoute.js";
import trackingRoute from "./routes/trackingRoute.js";
import authRoutes from "./routes/authRoute.js";


const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use("/api",tabRoute);
app.use("/api",trackingRoute);
app.use("/api/auth",authRoutes);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
