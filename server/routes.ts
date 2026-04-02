import type { Express } from "express";
import { createServer, type Server } from "http";
import { supabase } from "./supabase";
import { api } from "../shared/routes";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) return res.status(401).json({ message: "Unauthorized" });

    const { data, error } = await supabase
      .from('trades')
      .select('profit, risk')
      .eq('user_id', user.id);

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

  return httpServer;
}
