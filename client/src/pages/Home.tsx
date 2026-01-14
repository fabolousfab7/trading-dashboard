import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, LogOut, TrendingUp, TrendingDown, Trash2, Download, Upload, Cpu, Zap, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TradingDashboard() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchTrades();
  }, [user]);

  const onPaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          uploadFile(file);
        }
      }
    }
  }, [user, selectedPhotos]);

  useEffect(() => {
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPaste]);

  async function fetchTrades() {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("date", { ascending: false });
    if (!error) setTrades(data || []);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "SYSTEM ERROR", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: { data: { email_confirmed: true } }
    });
    if (error) {
      toast({ title: "INIT FAILED", description: error.message, variant: "destructive" });
    } else if (data.user && !data.session) {
      toast({ title: "USER CREATED", description: "Verification required." });
    } else {
      toast({ title: "ACCESS GRANTED", description: "Welcome to the terminal." });
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function uploadFile(file: File) {
    if (selectedPhotos.length >= 2) {
      toast({ title: "DATA LIMIT", description: "Max 2 data units allowed", variant: "destructive" });
      return;
    }

    setUploading(true);
    const fileExt = file.name ? file.name.split('.').pop() : 'png';
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('trade-photos')
      .upload(filePath, file);

    if (uploadError) {
      toast({ title: "UPLINK FAILED", description: uploadError.message, variant: "destructive" });
    } else {
      const { data: { publicUrl } } = supabase.storage
        .from('trade-photos')
        .getPublicUrl(filePath);
      setSelectedPhotos(prev => [...prev, publicUrl]);
    }
    setUploading(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
  }

  async function addTrade(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newTrade = {
      actif: formData.get("actif"),
      type: formData.get("type"),
      profit: parseFloat(formData.get("profit") as string),
      compte: formData.get("compte"),
      strategie: formData.get("strategie"),
      date: formData.get("date") || new Date().toISOString(),
      photos: selectedPhotos,
      user_id: user.id
    };

    const { data, error } = await supabase.from("trades").insert([newTrade]).select();
    if (error) {
      toast({ title: "LOG ENTRY FAILED", description: error.message, variant: "destructive" });
    } else {
      setTrades([data[0], ...trades]);
      setSelectedPhotos([]);
      (e.target as HTMLFormElement).reset();
      toast({ title: "LOG SECURED", description: "Trade data committed to ledger." });
    }
  }

  async function deleteTrade(id: number) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (!error) {
      setTrades(trades.filter(t => t.id !== id));
      toast({ title: "DATA PURGED", description: "Trade record deleted." });
    }
  }

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trades));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "terminal_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          const tradesToImport = json.map(t => ({
            ...t,
            id: undefined,
            user_id: user.id,
            created_at: undefined
          }));
          const { data, error } = await supabase.from("trades").insert(tradesToImport).select();
          if (error) throw error;
          setTrades([...(data || []), ...trades]);
          toast({ title: "DATA SYNCED", description: `${data?.length} records integrated.` });
        }
      } catch (err: any) {
        toast({ title: "SYNC FAILED", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="h-12 w-12 text-primary" />
      </motion.div>
    </div>
  );

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background font-cyber overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-1 bg-gradient-to-br from-primary via-accent to-secondary rounded-xl"
        >
          <Card className="cyber-card border-none bg-[#0a0b10]">
            <CardHeader className="text-center">
              <CardTitle className="font-arcade text-lg text-primary glow-primary">NEURAL LOGIN</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[10px]">ID_EMAIL</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="bg-background/50 border-white/10 focus:border-secondary transition-colors"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[10px]">AUTH_KEY</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="bg-background/50 border-white/10 focus:border-primary transition-colors"
                    required 
                  />
                </div>
                <div className="flex gap-4">
                  <Button type="submit" className="flex-1 bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px] h-10">CONNECT</Button>
                  <Button type="button" variant="outline" onClick={handleSignUp} className="flex-1 border-secondary text-secondary hover:bg-secondary/10 font-arcade text-[10px] h-10">INITIALIZE</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const statsByStrategy = trades.reduce((acc: any, t) => {
    const s = t.strategie || "Unknown";
    if (!acc[s]) acc[s] = { profit: 0, count: 0 };
    acc[s].profit += Number(t.profit);
    acc[s].count += 1;
    return acc;
  }, {});

  const statsByAccount = trades.reduce((acc: any, t) => {
    const a = t.compte || "Unknown";
    if (!acc[a]) acc[a] = { profit: 0, count: 0 };
    acc[a].profit += Number(t.profit);
    acc[a].count += 1;
    return acc;
  }, {});

  const totalProfit = trades.reduce((acc, t) => acc + Number(t.profit), 0);
  const winRate = trades.length ? (trades.filter(t => Number(t.profit) > 0).length / trades.length * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen font-cyber pb-20">
      <div className="mx-auto max-w-6xl p-4 lg:p-8 space-y-8">
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-lg glow-primary">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-arcade text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary glow-primary leading-tight">TERMINAL.EXE</h1>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" size="sm" onClick={exportJSON} className="border-secondary/30 text-secondary hover:bg-secondary/10"><Download className="mr-2 h-4 w-4" /> EXPORT</Button>
            <Button variant="outline" size="sm" asChild className="border-accent/30 text-accent hover:bg-accent/10">
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" /> IMPORT
                <input type="file" className="hidden" accept=".json" onChange={importJSON} />
              </label>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/50 hover:text-white"><LogOut className="mr-2 h-4 w-4" /> TERMINATE</Button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <AnimatePresence>
            {[
              { label: "NET_PROFIT", value: `$${totalProfit.toLocaleString()}`, color: totalProfit >= 0 ? "text-secondary" : "text-primary", icon: totalProfit >= 0 ? TrendingUp : TrendingDown },
              { label: "WIN_PROBABILITY", value: `${winRate}%`, color: "text-accent", icon: Zap },
              { label: "DATA_POINTS", value: trades.length, color: "text-white", icon: Cpu }
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="font-arcade text-[10px] text-white/50">{stat.label}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${stat.color} tracking-tight`}>{stat.value}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="cyber-card bg-[#0d0e14]/40">
            <CardHeader><CardTitle className="font-arcade text-xs text-secondary">STRATEGY_ANALYSIS</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statsByStrategy).map(([strategy, data]: [string, any]) => (
                  <div key={strategy} className="flex justify-between items-center group">
                    <span className="text-white/60 group-hover:text-white transition-colors">{strategy} <span className="text-[10px] text-white/20">[{data.count}]</span></span>
                    <span className={`font-mono ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                      {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card bg-[#0d0e14]/40">
            <CardHeader><CardTitle className="font-arcade text-xs text-accent">ACCOUNT_ANALYSIS</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statsByAccount).map(([account, data]: [string, any]) => (
                  <div key={account} className="flex justify-between items-center group">
                    <span className="text-white/60 group-hover:text-white transition-colors">{account} <span className="text-[10px] text-white/20">[{data.count}]</span></span>
                    <span className={`font-mono ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                      {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="cyber-card border-primary/20 bg-[#0d0e14]/80">
            <CardHeader>
              <CardTitle className="font-arcade text-xs text-primary">INIT_LOG_ENTRY</CardTitle>
              <p className="text-[10px] text-white/30">PASTE IMAGE DATA [CTRL+V] TO SYNC INTEL</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={addTrade} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">TIMESTAMP</Label>
                  <Input name="date" type="date" className="bg-white/5 border-white/10 text-white" defaultValue={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">ACTIF_ID</Label>
                  <Input name="actif" className="bg-white/5 border-white/10 text-white" placeholder="e.g. BTC/USD" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">VECTOR_TYPE</Label>
                  <Select name="type" defaultValue="long">
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d0e14] border-white/10">
                      <SelectItem value="long">LONG_VECTOR</SelectItem>
                      <SelectItem value="short">SHORT_VECTOR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">YIELD_AMOUNT</Label>
                  <Input name="profit" type="number" step="0.01" className="bg-white/5 border-white/10 text-white" placeholder="0.00" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">SOURCE_ACCOUNT</Label>
                  <Input name="compte" className="bg-white/5 border-white/10 text-white" placeholder="MAIN_CELL" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">PROTO_STRAT</Label>
                  <Input name="strategie" className="bg-white/5 border-white/10 text-white" placeholder="ALPHA_CORE" required />
                </div>
                <div className="space-y-4 md:col-span-2 lg:col-span-3">
                  <Label className="font-arcade text-[9px] text-white/50">VISUAL_INTEL [MAX_2]</Label>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {selectedPhotos.map((url, i) => (
                      <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative w-24 h-24 border border-white/10 rounded-lg overflow-hidden glow-secondary">
                        <img src={url} className="w-full h-full object-cover" alt="Intel" />
                        <button type="button" onClick={() => setSelectedPhotos(selectedPhotos.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 p-1 bg-primary text-white"><X size={12} /></button>
                      </motion.div>
                    ))}
                    {selectedPhotos.length < 2 && (
                      <Label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-secondary hover:bg-secondary/5 transition-all group">
                        {uploading ? <Loader2 className="animate-spin h-6 w-6 text-secondary" /> : <Plus className="h-6 w-6 text-white/20 group-hover:text-secondary" />}
                        <span className="text-[8px] mt-1 text-white/20 group-hover:text-secondary font-arcade">UPLOAD</span>
                        <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                      </Label>
                    )}
                  </div>
                </div>
                <div className="flex items-end lg:col-start-3">
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px]" disabled={uploading}>COMMIT_DATA</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
          <CardHeader><CardTitle className="font-arcade text-xs text-secondary">TRANSACTION_HISTORY</CardTitle></CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 uppercase font-arcade text-[8px]">
                    <th className="py-4 px-4">TIMESTAMP</th>
                    <th className="py-4 px-4">IDENTIFIER</th>
                    <th className="py-4 px-4">VECTOR</th>
                    <th className="py-4 px-4">YIELD</th>
                    <th className="py-4 px-4">STRAT</th>
                    <th className="py-4 px-4">INTEL</th>
                    <th className="py-4 px-4">CMD</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {trades.map((trade, i) => (
                      <motion.tr 
                        key={trade.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                      >
                        <td className="py-4 px-4 text-white/40">{new Date(trade.date).toLocaleDateString()}</td>
                        <td className="py-4 px-4 text-white font-bold">{trade.actif}</td>
                        <td className="py-4 px-4"><span className={`px-2 py-0.5 rounded text-[9px] border ${trade.type === 'long' ? 'border-secondary/50 text-secondary bg-secondary/10' : 'border-primary/50 text-primary bg-primary/10'}`}>{trade.type.toUpperCase()}</span></td>
                        <td className={`py-4 px-4 font-bold ${Number(trade.profit) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                          {Number(trade.profit) >= 0 ? "+" : ""}${Number(trade.profit).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-white/60">{trade.strategie}</td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2">
                            {trade.photos?.map((url: string, i: number) => (
                              <img key={i} src={url} className="w-8 h-8 object-cover rounded border border-white/10 hover:border-secondary transition-colors cursor-zoom-in" alt="Intel" onClick={() => window.open(url, '_blank')} />
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Button variant="ghost" size="icon" onClick={() => deleteTrade(trade.id)} className="text-white/20 hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
