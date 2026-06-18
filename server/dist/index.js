import "dotenv/config";
import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { apiRouter } from "./routes/api.js";
import { aiRouter } from "./routes/ai.js";
const app = express();
const port = Number(process.env.PORT ?? 4000);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "15mb" }));
app.use("/api", apiRouter);
app.use("/api/ai", aiRouter);
app.listen(port, async () => {
    try {
        await pool.query("SELECT 1");
        console.log(`Vauto API http://localhost:${port} (PostgreSQL OK)`);
    }
    catch {
        console.warn(`Vauto API http://localhost:${port} — PostgreSQL nepasiekiamas. Paleiskite: docker compose up -d`);
    }
});
