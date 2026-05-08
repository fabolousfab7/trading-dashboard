import express from "express";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", env: !!process.env.SUPABASE_URL, ts: Date.now() });
});

let initialized = false;
let initError: string | null = null;

async function init() {
  if (initialized) return;
  if (initError) return;
  try {
    const { createServer } = await import("http");
    const { registerRoutes } = await import("../server/routes.js");
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    initialized = true;
  } catch (e: any) {
    initError = e.stack || e.message || String(e);
    console.error("[api/index] INIT CRASH:", initError);
  }
}

app.use(async (req, res, next) => {
  await init();
  if (initError) {
    return res.status(500).json({ error: "Server initialization failed", detail: initError });
  }
  next();
});

export default app;
