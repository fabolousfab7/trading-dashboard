import type { Express } from "express";
import { createServer, type Server } from "http";
import { supabase, userScopedClient } from "./supabase.js";
import { api } from "../shared/routes.js";
import { registerPortfolioRoutes } from "./routes-portfolio.js";
import { registerComptaRoutes } from "./routes-compta.js";
import { registerKrakenRoutes } from "./routes-kraken.js";
import { registerKrakenFuturesRoutes } from "./routes-kraken-futures.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.trades.list.path, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return res.status(401).json({ message: "Unauthorized" });

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  app.post(api.trades.create.path, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return res.status(401).json({ message: "Unauthorized" });

    const tradeData = { 
      ...req.body, 
      user_id: user.id 
    };

    const { data, error } = await supabase
      .from('trades')
      .insert([tradeData])
      .select()
      .single();

    if (error) return res.status(400).json({ message: error.message });
    res.status(201).json(data);
  });

  app.delete(api.trades.delete.path, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return res.status(401).json({ message: "Unauthorized" });

    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ message: error.message });
    res.status(204).send();
  });

  app.get(api.trades.stats.path, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.replace('Bearer ', '');
    const userClient = userScopedClient(token);

    let query = userClient
      .from('trades')
      .select('profit, risk');

    const exclude = (req.query.exclude as string || "").split(",").map(s => s.trim()).filter(Boolean);
    for (const ex of exclude) {
      query = query.neq('compte', ex);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ message: error.message });

    const results = data.map(t => Number(t.profit));
    const totalProfit = results.reduce((a, b) => a + b, 0);
    const winRate = results.length ? (results.filter(r => r > 0).length / results.length) * 100 : 0;
    const bestTrade = results.length ? Math.max(...results) : 0;
    const worstTrade = results.length ? Math.min(...results) : 0;

    res.json({
      totalProfit,
      winRate,
      bestTrade,
      worstTrade,
      tradesCount: results.length
    });
  });

  // ── FX rates (EUR→USD) with 1h memory cache ──
  let fxCache: { rates: Record<string, number>; fetchedAt: number } | null = null
  app.get("/api/fx-rates", async (_req, res) => {
    const ONE_HOUR = 3600_000
    if (fxCache && Date.now() - fxCache.fetchedAt < ONE_HOUR) {
      return res.json({ base: "EUR", rates: fxCache.rates, fetched_at: new Date(fxCache.fetchedAt).toISOString() })
    }
    try {
      const resp = await fetch("https://api.exchangerate.host/latest?base=EUR&symbols=USD")
      if (resp.ok) {
        const data = await resp.json()
        if (data?.rates?.USD) {
          fxCache = { rates: { USD: data.rates.USD }, fetchedAt: Date.now() }
          return res.json({ base: "EUR", rates: fxCache.rates, fetched_at: new Date(fxCache.fetchedAt).toISOString() })
        }
      }
      const fallbackResp = await fetch("https://open.er-api.com/v6/latest/EUR")
      if (fallbackResp.ok) {
        const data = await fallbackResp.json()
        if (data?.rates?.USD) {
          fxCache = { rates: { USD: data.rates.USD }, fetchedAt: Date.now() }
          return res.json({ base: "EUR", rates: fxCache.rates, fetched_at: new Date(fxCache.fetchedAt).toISOString() })
        }
      }
      return res.json({ base: "EUR", rates: { USD: 1.085 }, fetched_at: null })
    } catch {
      return res.json({ base: "EUR", rates: { USD: 1.085 }, fetched_at: null })
    }
  })

  registerPortfolioRoutes(app, supabase);
  registerComptaRoutes(app, supabase);
  registerKrakenRoutes(app, supabase);
  registerKrakenFuturesRoutes(app, supabase);

  return httpServer;
}
