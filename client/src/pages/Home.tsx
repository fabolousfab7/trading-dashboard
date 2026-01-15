import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogClose 
} from "@/components/ui/dialog";
import { 
  Loader2, 
  Plus, 
  LogOut, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  Download, 
  Upload, 
  Cpu, 
  Zap, 
  Activity, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Maximize2,
  Calendar,
  Layers,
  Wallet,
  Target,
  Clock,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TradingDashboard() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string, index: number, photos: string[] } | null>(null);
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
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
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
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else if (data.user && !data.session) {
      toast({ title: "Account created", description: "Verification required." });
    } else {
      toast({ title: "Success", description: "Account created and logged in!" });
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function uploadFile(file: File) {
    if (selectedPhotos.length >= 3) {
      toast({ title: "Limit reached", description: "Maximum 3 photos allowed", variant: "destructive" });
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
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
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
      risk: parseFloat(formData.get("risk") as string),
      timeframe: formData.get("timeframe"),
      compte: formData.get("compte"),
      strategie: formData.get("strategie"),
      observations: formData.get("observations"),
      date: formData.get("date") || new Date().toISOString(),
      photos: selectedPhotos,
      user_id: user.id
    };

    const { data, error } = await supabase.from("trades").insert([newTrade]).select();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTrades([data[0], ...trades]);
      setSelectedPhotos([]);
      (e.target as HTMLFormElement).reset();
      toast({ title: "Success", description: "Trade added successfully" });
    }
  }

  async function deleteTrade(id: number, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (!error) {
      setTrades(trades.filter(t => t.id !== id));
      if (selectedTrade?.id === id) setSelectedTrade(null);
      toast({ title: "Deleted", description: "Trade removed" });
    }
  }

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(trades));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "trades_export.json");
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
          toast({ title: "Imported", description: `${data?.length} trades imported successfully` });
        }
      } catch (err: any) {
        toast({ title: "Import failed", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!previewPhoto) return;
    const nextIdx = (previewPhoto.index + 1) % previewPhoto.photos.length;
    setPreviewPhoto({
      ...previewPhoto,
      index: nextIdx,
      url: previewPhoto.photos[nextIdx]
    });
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!previewPhoto) return;
    const prevIdx = (previewPhoto.index - 1 + previewPhoto.photos.length) % previewPhoto.photos.length;
    setPreviewPhoto({
      ...previewPhoto,
      index: prevIdx,
      url: previewPhoto.photos[prevIdx]
    });
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
              <CardTitle className="font-arcade text-lg text-primary glow-primary">Login</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[10px]">Email</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="bg-background/50 border-white/10 focus:border-secondary transition-colors"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[10px]">Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="bg-background/50 border-white/10 focus:border-primary transition-colors"
                    required 
                  />
                </div>
                <div className="flex gap-4">
                  <Button type="submit" className="flex-1 bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px] h-10">Login</Button>
                  <Button type="button" variant="outline" onClick={handleSignUp} className="flex-1 border-secondary text-secondary hover:bg-secondary/10 font-arcade text-[10px] h-10">Sign Up</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const getR = (profit: number, risk: number) => {
    if (!risk || risk === 0) return 0;
    return profit / risk;
  };

  const statsByStrategy = trades.reduce((acc: any, t) => {
    const s = t.strategie || "Unknown";
    if (!acc[s]) acc[s] = { profit: 0, count: 0, rTotal: 0 };
    acc[s].profit += Number(t.profit);
    acc[s].count += 1;
    acc[s].rTotal += getR(Number(t.profit), Number(t.risk));
    return acc;
  }, {});

  const statsByAccount = trades.reduce((acc: any, t) => {
    const a = t.compte || "Unknown";
    if (!acc[a]) acc[a] = { profit: 0, count: 0, rTotal: 0 };
    acc[a].profit += Number(t.profit);
    acc[a].count += 1;
    acc[a].rTotal += getR(Number(t.profit), Number(t.risk));
    return acc;
  }, {});

  const totalProfit = trades.reduce((acc, t) => acc + Number(t.profit), 0);
  const winRate = trades.length ? (trades.filter(t => Number(t.profit) > 0).length / trades.length * 100).toFixed(1) : 0;
  
  const rValues = trades.map(t => getR(Number(t.profit), Number(t.risk)));
  const avgR = rValues.length ? (rValues.reduce((a, b) => a + b, 0) / rValues.length).toFixed(2) : "0.00";
  const bestR = rValues.length ? Math.max(...rValues).toFixed(2) : "0.00";
  const worstR = rValues.length ? Math.min(...rValues).toFixed(2) : "0.00";

  const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

  return (
    <div className="min-h-screen font-cyber pb-20">
      <div className="mx-auto max-w-6xl p-4 lg:p-8 space-y-8">
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-lg glow-primary">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-arcade text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary glow-primary leading-tight">Trading Dashboard</h1>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" size="sm" onClick={exportJSON} className="border-secondary/30 text-secondary hover:bg-secondary/10"><Download className="mr-2 h-4 w-4" /> Export</Button>
            <Button variant="outline" size="sm" asChild className="border-accent/30 text-accent hover:bg-accent/10">
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" /> Import
                <input type="file" className="hidden" accept=".json" onChange={importJSON} />
              </label>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/50 hover:text-white"><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          <AnimatePresence>
            {[
              { label: "Total P/L", value: `$${totalProfit.toLocaleString()}`, color: totalProfit >= 0 ? "text-secondary" : "text-primary", icon: totalProfit >= 0 ? TrendingUp : TrendingDown },
              { label: "Win Rate", value: `${winRate}%`, color: "text-accent", icon: Zap },
              { label: "Total Trades", value: trades.length, color: "text-white", icon: Cpu }
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

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-arcade text-[10px] text-white/50">Average R</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${Number(avgR) >= 0 ? 'text-secondary' : 'text-primary'}`}>{avgR}R</div>
            </CardContent>
          </Card>
          <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-arcade text-[10px] text-white/50">Best R</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-secondary">{bestR}R</div>
            </CardContent>
          </Card>
          <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-arcade text-[10px] text-white/50">Worst R</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{worstR}R</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="cyber-card bg-[#0d0e14]/40">
            <CardHeader><CardTitle className="font-arcade text-xs text-secondary">Profit by Strategy</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statsByStrategy).map(([strategy, data]: [string, any]) => (
                  <div key={strategy} className="flex justify-between items-center group">
                    <span className="text-white/60 group-hover:text-white transition-colors">{strategy} <span className="text-[10px] text-white/20">[{data.count}]</span></span>
                    <div className="text-right">
                      <div className={`font-mono ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                        {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-white/40">Avg: {(data.rTotal / data.count).toFixed(2)}R</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card bg-[#0d0e14]/40">
            <CardHeader><CardTitle className="font-arcade text-xs text-accent">Profit by Account</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(statsByAccount).map(([account, data]: [string, any]) => (
                  <div key={account} className="flex justify-between items-center group">
                    <span className="text-white/60 group-hover:text-white transition-colors">{account} <span className="text-[10px] text-white/20">[{data.count}]</span></span>
                    <div className="text-right">
                      <div className={`font-mono ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                        {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-white/40">Avg: {(data.rTotal / data.count).toFixed(2)}R</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="cyber-card border-primary/20 bg-[#0d0e14]/80">
            <CardHeader>
              <CardTitle className="font-arcade text-xs text-primary">Add New Trade</CardTitle>
              <p className="text-[10px] text-white/30">Tip: You can paste images from clipboard (Ctrl+V)</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={addTrade} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Date</Label>
                  <Input name="date" type="date" className="bg-white/5 border-white/10 text-white" defaultValue={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Asset (Actif)</Label>
                  <Input name="actif" className="bg-white/5 border-white/10 text-white" placeholder="e.g. BTC/USD" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Timeframe</Label>
                  <Select name="timeframe" defaultValue="1H">
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d0e14] border-white/10">
                      {timeframes.map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Type</Label>
                  <Select name="type" defaultValue="long">
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d0e14] border-white/10">
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Result ($) (Profit)</Label>
                  <Input name="profit" type="number" step="0.01" className="bg-white/5 border-white/10 text-white" placeholder="0.00" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Max Loss ($) (Risk)</Label>
                  <Input name="risk" type="number" step="0.01" className="bg-white/5 border-white/10 text-white" placeholder="100.00" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Account (Compte)</Label>
                  <Input name="compte" className="bg-white/5 border-white/10 text-white" placeholder="e.g. Main" required />
                </div>
                <div className="space-y-2">
                  <Label className="font-arcade text-[9px] text-white/50">Strategy (Strategie)</Label>
                  <Input name="strategie" className="bg-white/5 border-white/10 text-white" placeholder="e.g. Trend Follow" required />
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-1">
                  {/* Empty div to balance grid if needed */}
                </div>
                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label className="font-arcade text-[9px] text-white/50">Observations</Label>
                  <Textarea name="observations" className="bg-white/5 border-white/10 text-white min-h-[100px]" placeholder="Market conditions, feelings, lessons..." />
                </div>
                <div className="space-y-4 md:col-span-2 lg:col-span-3">
                  <Label className="font-arcade text-[9px] text-white/50">Photos (Max 3)</Label>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {selectedPhotos.map((url, i) => (
                      <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative w-24 h-24 border border-white/10 rounded-lg overflow-hidden glow-secondary">
                        <img src={url} className="w-full h-full object-cover" alt="Intel" />
                        <button type="button" onClick={() => setSelectedPhotos(selectedPhotos.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 p-1 bg-primary text-white"><X size={12} /></button>
                      </motion.div>
                    ))}
                    {selectedPhotos.length < 3 && (
                      <Label className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-secondary hover:bg-secondary/5 transition-all group">
                        {uploading ? <Loader2 className="animate-spin h-6 w-6 text-secondary" /> : <Plus className="h-6 w-6 text-white/20 group-hover:text-secondary" />}
                        <span className="text-[8px] mt-1 text-white/20 group-hover:text-secondary font-arcade">Upload</span>
                        <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                      </Label>
                    )}
                  </div>
                </div>
                <div className="flex items-end lg:col-start-3">
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px]" disabled={uploading}>Add Trade</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <Card className="cyber-card bg-[#0d0e14]/60 border-white/5">
          <CardHeader><CardTitle className="font-arcade text-xs text-secondary">Recent Trades</CardTitle></CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 uppercase font-arcade text-[8px]">
                    <th className="py-4 px-4">Date</th>
                    <th className="py-4 px-4">Asset</th>
                    <th className="py-4 px-4">Result</th>
                    <th className="py-4 px-4">Ratio</th>
                    <th className="py-4 px-4">Photos</th>
                    <th className="py-4 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {trades.map((trade, i) => {
                      const r = getR(Number(trade.profit), Number(trade.risk));
                      return (
                        <motion.tr 
                          key={trade.id} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                          onClick={() => setSelectedTrade(trade)}
                        >
                          <td className="py-4 px-4 text-white/40">{new Date(trade.date).toLocaleDateString()}</td>
                          <td className="py-4 px-4">
                            <div className="text-white font-bold">{trade.actif}</div>
                            <div className="text-[9px] text-white/30">{trade.timeframe}</div>
                          </td>
                          <td className={`py-4 px-4 font-bold ${Number(trade.profit) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                            {Number(trade.profit) >= 0 ? "+" : ""}${Number(trade.profit).toLocaleString()}
                          </td>
                          <td className={`py-4 px-4 font-bold ${r >= 0 ? 'text-secondary' : 'text-primary'}`}>
                            {r >= 0 ? "+" : ""}{r.toFixed(2)}R
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex gap-2">
                              {trade.photos?.map((url: string, i: number) => (
                                <div key={i} className="relative group/img">
                                  <img 
                                    src={url} 
                                    className="w-8 h-8 object-cover rounded border border-white/10 hover:border-secondary transition-colors cursor-zoom-in" 
                                    alt="Intel" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewPhoto({ url, index: i, photos: trade.photos });
                                    }} 
                                  />
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <Button variant="ghost" size="icon" onClick={(e) => deleteTrade(trade.id, e)} className="text-white/20 hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PHOTO PREVIEW MODAL */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/90 border-white/10 overflow-hidden flex flex-col cyber-card">
          <div className="relative flex-1 flex items-center justify-center p-4 min-h-[500px]">
            <AnimatePresence mode="wait">
              <motion.img
                key={previewPhoto?.url}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                src={previewPhoto?.url}
                className="max-w-full max-h-[80vh] object-contain shadow-2xl"
              />
            </AnimatePresence>

            {previewPhoto && previewPhoto.photos.length > 1 && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full"
                  onClick={prevPhoto}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full"
                  onClick={nextPhoto}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            <DialogClose className="absolute top-4 right-4 p-2 bg-black/50 text-white hover:bg-black/70 rounded-full">
              <X className="h-6 w-6" />
            </DialogClose>
          </div>
          {previewPhoto && previewPhoto.photos.length > 1 && (
            <div className="p-4 flex justify-center gap-2 bg-black/50 border-t border-white/10">
              {previewPhoto.photos.map((url, i) => (
                <div 
                  key={i} 
                  className={`w-16 h-16 border-2 rounded overflow-hidden cursor-pointer transition-all ${i === previewPhoto.index ? 'border-primary' : 'border-transparent opacity-50'}`}
                  onClick={() => setPreviewPhoto({ ...previewPhoto, url, index: i })}
                >
                  <img src={url} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TRADE DETAILS MODAL */}
      <Dialog open={!!selectedTrade} onOpenChange={() => setSelectedTrade(null)}>
        <DialogContent className="max-w-2xl bg-[#0d0e14] border-primary/30 text-white cyber-card">
          <DialogHeader>
            <DialogTitle className="font-arcade text-primary text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> TRADE_INTEL_REPORT
            </DialogTitle>
          </DialogHeader>
          {selectedTrade && (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> TIMESTAMP
                  </Label>
                  <p className="font-mono text-sm">{new Date(selectedTrade.date).toLocaleDateString()} {new Date(selectedTrade.date).toLocaleTimeString()}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <Target className="h-3 w-3" /> IDENTIFIER
                  </Label>
                  <p className="font-mono text-sm font-bold text-secondary">{selectedTrade.actif}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> TIMEFRAME
                  </Label>
                  <p className="font-mono text-sm">{selectedTrade.timeframe}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <Layers className="h-3 w-3" /> PROTO_STRAT
                  </Label>
                  <p className="font-mono text-sm">{selectedTrade.strategie}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> SOURCE_ACCOUNT
                  </Label>
                  <p className="font-mono text-sm">{selectedTrade.compte}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> RISK_VAL
                  </Label>
                  <p className="font-mono text-sm">${Number(selectedTrade.risk).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40">VECTOR</Label>
                  <div>
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${selectedTrade.type === 'long' ? 'border-secondary/50 text-secondary bg-secondary/10' : 'border-primary/50 text-primary bg-primary/10'}`}>
                      {selectedTrade.type.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-arcade text-white/40">YIELD_RESULT</Label>
                  <div className="flex flex-col">
                    <span className={`font-mono text-xl font-bold ${Number(selectedTrade.profit) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                      {Number(selectedTrade.profit) >= 0 ? "+" : ""}${Number(selectedTrade.profit).toLocaleString()}
                    </span>
                    <span className={`text-xs font-bold ${getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                      ({getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? "+" : ""}{getR(Number(selectedTrade.profit), Number(selectedTrade.risk)).toFixed(2)}R)
                    </span>
                  </div>
                </div>
              </div>

              {selectedTrade.observations && (
                <div className="space-y-2 p-4 bg-white/5 rounded-lg border border-white/10">
                  <Label className="text-[10px] font-arcade text-white/40">OBSERVATIONS_LOG</Label>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{selectedTrade.observations}</p>
                </div>
              )}

              {selectedTrade.photos?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-arcade text-white/40">VISUAL_INTEL_GALLERY</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedTrade.photos.map((url: string, i: number) => (
                      <div 
                        key={i} 
                        className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10 hover:border-secondary transition-all aspect-video"
                        onClick={() => setPreviewPhoto({ url, index: i, photos: selectedTrade.photos })}
                      >
                        <img src={url} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10 font-arcade text-[10px]"
                  onClick={() => deleteTrade(selectedTrade.id)}
                >
                  PURGE_RECORD
                </Button>
                <Button 
                  className="bg-primary hover:bg-primary/80 font-arcade text-[10px]"
                  onClick={() => setSelectedTrade(null)}
                >
                  CLOSE_TERMINAL
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
