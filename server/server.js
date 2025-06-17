import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import tabRoutes from "./routes/tabRoutes.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use("/api", tabRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
