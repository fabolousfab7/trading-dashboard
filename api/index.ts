import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

let initialized = false;

async function init() {
  if (initialized) return;
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  initialized = true;
}

// Middleware qui initialise les routes au premier appel
app.use(async (req, res, next) => {
  try {
    await init();
    next();
  } catch (e: any) {
    console.error("[api/index] Init error:", e);
    res.status(500).json({ error: "Server initialization failed", detail: e.message });
  }
});

export default app;
