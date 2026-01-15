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
  DialogClose,
  DialogFooter
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
  ShieldAlert,
  Edit2,
  Save,
  BarChart3,
  History,
  Zap,
  Terminal
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
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
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
    if (isEditing || !user) return;
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
  }, [user, selectedPhotos, isEditing]);

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
    if ((isEditing ? editData.photos.length : selectedPhotos.length) >= 3) {
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
      
      if (isEditing) {
        setEditData({ ...editData, photos: [...editData.photos, publicUrl] });
      } else {
        setSelectedPhotos(prev => [...prev, publicUrl]);
      }
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

  async function handleUpdateTrade() {
    if (!editData) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("trades")
      .update(editData)
      .eq("id", editData.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setTrades(trades.map(t => t.id === data.id ? data : t));
      setSelectedTrade(data);
      setIsEditing(false);
      setEditData(null);
      toast({ title: "Success", description: "Trade updated successfully" });
    }
    setLoading(false);
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

  if (loading && !trades.length) return (
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-0.5 bg-gradient-to-br from-primary via-accent to-secondary rounded-2xl shadow-2xl shadow-primary/20"
        >
          <Card className="cyber-card border-none bg-[#0a0b10] rounded-2xl">
            <CardHeader className="text-center pt-8">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20 glow-primary">
                <Terminal className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="font-arcade text-xl text-primary tracking-widest">TRADING TERMINAL</CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[9px] uppercase tracking-wider">Email</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="bg-white/5 border-white/10 focus:border-secondary transition-all rounded-xl h-12"
                    placeholder="Enter your email"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[9px] uppercase tracking-wider">Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="bg-white/5 border-white/10 focus:border-primary transition-all rounded-xl h-12"
                    placeholder="••••••••"
                    required 
                  />
                </div>
                <div className="flex flex-col gap-3 pt-4">
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px] h-12 rounded-xl transition-all active:scale-[0.98]">CONNECT</Button>
                  <Button type="button" variant="ghost" onClick={handleSignUp} className="w-full text-white/50 hover:text-white font-arcade text-[10px] h-10 transition-all">SIGN UP</Button>
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
    // Calculation: Profit / Risk
    // Math Proof: profit=$23, risk=$25 -> 23 / 25 = 0.92
    // If profit is negative: -25 / 25 = -1.00
    // Force risk to absolute to ensure profit sign dictates R sign
    return profit / Math.abs(risk);
  };

  const formatR = (r: number) => {
    const sign = r > 0 ? "+" : "";
    return `${sign}${r.toFixed(2)}R`;
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
  const totalR = rValues.reduce((a, b) => a + b, 0);

  const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

  return (
    <div className="min-h-screen font-cyber pb-20 selection:bg-primary/30">
      <div className="mx-auto max-w-7xl p-4 lg:p-8 space-y-10">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-white/10 pb-10">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 glow-primary shadow-lg shadow-primary/10">
              <Terminal className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-arcade text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary glow-primary leading-tight tracking-wider uppercase">Trading Terminal</h1>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <Button variant="ghost" size="sm" onClick={exportJSON} className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg px-4"><Download className="mr-2 h-4 w-4" /> EXPORT</Button>
              <div className="w-px h-4 bg-white/10 my-auto mx-1" />
              <Button variant="ghost" size="sm" asChild className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg px-4">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> IMPORT
                  <input type="file" className="hidden" accept=".json" onChange={importJSON} />
                </label>
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="border-primary/20 text-primary/70 hover:text-primary hover:bg-primary/10 hover:border-primary/40 rounded-xl px-4 transition-all">
              <LogOut className="mr-2 h-4 w-4" /> DISCONNECT
            </Button>
          </div>
        </header>

        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2 px-2">
            <BarChart3 className="h-5 w-5 text-secondary" />
            <h2 className="font-arcade text-xs text-white/50 tracking-widest uppercase">Performance Metrics</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Profit/Loss", value: `$${totalProfit.toLocaleString()}`, color: totalProfit >= 0 ? "text-secondary" : "text-primary", icon: totalProfit >= 0 ? TrendingUp : TrendingDown, glow: totalProfit >= 0 ? "shadow-secondary/20" : "shadow-primary/20" },
              { label: "Win Rate", value: `${winRate}%`, color: "text-accent", icon: Zap, glow: "shadow-accent/20" },
              { label: "Total Trades", value: trades.length, color: "text-white", icon: History, glow: "shadow-white/5" },
              { label: "Total R-Ratio", value: formatR(totalR), color: totalR >= 0 ? "text-secondary" : "text-primary", icon: Activity, glow: totalR >= 0 ? "shadow-secondary/20" : "shadow-primary/20" }
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl shadow-xl ${stat.glow}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <CardTitle className="font-arcade text-[9px] text-white/40 tracking-widest uppercase">{stat.label}</CardTitle>
                    <div className={`p-2 rounded-lg bg-white/5 border border-white/5`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-3xl font-bold ${stat.color} tracking-tight font-cyber`}>{stat.value}</div>
                    <div className="h-1 w-full bg-white/5 rounded-full mt-6 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: "100%" }} 
                        className={`h-full bg-gradient-to-r from-transparent via-${stat.color.split('-')[1]}/30 to-${stat.color.split('-')[1]}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="cyber-card bg-[#0d0e14]/40 border-secondary/10 rounded-2xl">
            <CardHeader className="border-b border-white/5"><CardTitle className="font-arcade text-[10px] text-secondary tracking-widest uppercase">Performance by Strategy</CardTitle></CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-5">
                {Object.entries(statsByStrategy).length === 0 ? (
                  <p className="text-center py-10 text-white/20 font-arcade text-[10px]">No strategy data detected</p>
                ) : Object.entries(statsByStrategy).map(([strategy, data]: [string, any]) => (
                  <div key={strategy} className="flex justify-between items-center group p-3 rounded-xl hover:bg-white/5 transition-all">
                    <div className="space-y-1">
                      <span className="text-white/80 group-hover:text-white transition-colors font-medium">{strategy}</span>
                      <div className="text-[9px] text-white/30 font-arcade uppercase">Trades: {data.count}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold font-cyber ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                        {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-white/40 font-mono tracking-tighter uppercase">Total Ratio: {formatR(data.rTotal)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="cyber-card bg-[#0d0e14]/40 border-accent/10 rounded-2xl">
            <CardHeader className="border-b border-white/5"><CardTitle className="font-arcade text-[10px] text-accent tracking-widest uppercase">Performance by Account</CardTitle></CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-5">
                {Object.entries(statsByAccount).length === 0 ? (
                  <p className="text-center py-10 text-white/20 font-arcade text-[10px]">No account data detected</p>
                ) : Object.entries(statsByAccount).map(([account, data]: [string, any]) => (
                  <div key={account} className="flex justify-between items-center group p-3 rounded-xl hover:bg-white/5 transition-all">
                    <div className="space-y-1">
                      <span className="text-white/80 group-hover:text-white transition-colors font-medium">{account}</span>
                      <div className="text-[9px] text-white/30 font-arcade uppercase">Trades: {data.count}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold font-cyber ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}>
                        {data.profit >= 0 ? "+" : ""}${data.profit.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-white/40 font-mono tracking-tighter uppercase">Total Ratio: {formatR(data.rTotal)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3 mb-2 px-2">
            <Plus className="h-5 w-5 text-primary" />
            <h2 className="font-arcade text-xs text-white/50 tracking-widest uppercase">Log New Trade</h2>
          </div>
          <Card className="cyber-card border-primary/20 bg-[#0d0e14]/80 rounded-2xl shadow-2xl shadow-primary/5">
            <CardContent className="p-8">
              <form onSubmit={addTrade} className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Calendar className="h-3 w-3" /> Date</Label>
                  <Input name="date" type="date" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11" defaultValue={new Date().toISOString().split('T')[0]} required />
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Target className="h-3 w-3" /> Asset</Label>
                  <Input name="actif" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11" placeholder="e.g. BTC/USD" required />
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Clock className="h-3 w-3" /> Timeframe</Label>
                  <Select name="timeframe" defaultValue="1H">
                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                      {timeframes.map(tf => <SelectItem key={tf} value={tf} className="hover:bg-primary/20 focus:bg-primary/20">{tf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Activity className="h-3 w-3" /> Type</Label>
                  <Select name="type" defaultValue="long">
                    <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                      <SelectItem value="long" className="text-secondary">Long</SelectItem>
                      <SelectItem value="short" className="text-primary">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><TrendingUp className="h-3 w-3" /> Profit / Loss ($)</Label>
                  <Input name="profit" type="number" step="0.01" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-secondary/20 h-11" placeholder="0.00" required />
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><ShieldAlert className="h-3 w-3" /> Max Risk ($)</Label>
                  <Input name="risk" type="number" step="0.01" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11" placeholder="100.00" required />
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Wallet className="h-3 w-3" /> Account</Label>
                  <Input name="compte" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11" placeholder="e.g. Main" required />
                </div>
                <div className="space-y-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest flex items-center gap-2 uppercase"><Layers className="h-3 w-3" /> Strategy</Label>
                  <Input name="strategie" className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11" placeholder="e.g. Trend Follow" required />
                </div>
                <div className="space-y-3 md:col-span-2 lg:col-span-4">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest uppercase">Observations</Label>
                  <Textarea name="observations" className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-2xl p-4 focus:ring-primary/20" placeholder="Analyze market behavior, emotional state, and core learnings..." />
                  <p className="text-[8px] text-white/20 font-arcade tracking-wider mt-2 uppercase">CTRL+V TO PASTE SCREENSHOTS</p>
                </div>
                <div className="space-y-4 md:col-span-2 lg:col-span-3">
                  <Label className="font-arcade text-[9px] text-white/40 tracking-widest uppercase">Photos (Max 3)</Label>
                  <div className="flex flex-wrap gap-5 mt-2">
                    {selectedPhotos.map((url, i) => (
                      <motion.div key={i} initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} className="relative w-28 h-28 border border-white/10 rounded-2xl overflow-hidden group shadow-lg shadow-black/50">
                        <img src={url} className="w-full h-full object-cover" alt="Intel" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <button type="button" onClick={() => setSelectedPhotos(selectedPhotos.filter((_, idx) => idx !== i))} className="p-2 bg-primary/80 text-white rounded-xl hover:bg-primary transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </motion.div>
                    ))}
                    {selectedPhotos.length < 3 && (
                      <Label className="flex flex-col items-center justify-center w-28 h-28 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-secondary/50 hover:bg-secondary/5 transition-all group shadow-inner">
                        {uploading ? <Loader2 className="animate-spin h-6 w-6 text-secondary" /> : <Plus className="h-7 w-7 text-white/20 group-hover:text-secondary group-hover:scale-110 transition-transform" />}
                        <span className="text-[8px] mt-2 text-white/20 group-hover:text-secondary font-arcade uppercase tracking-tighter">Upload</span>
                        <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                      </Label>
                    )}
                  </div>
                </div>
                <div className="flex items-end lg:col-start-4">
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[11px] h-14 rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]" disabled={uploading}>Save Trade</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2 px-2">
            <History className="h-5 w-5 text-accent" />
            <h2 className="font-arcade text-xs text-white/50 tracking-widest uppercase">Recent Trades</h2>
          </div>
          <Card className="cyber-card bg-[#0d0e14]/60 border-white/5 rounded-2xl shadow-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="relative overflow-x-auto">
                <table className="w-full text-left text-[12px] font-cyber">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-white/30 uppercase font-arcade text-[8px] tracking-[0.2em]">
                      <th className="py-6 px-6">Date</th>
                      <th className="py-6 px-6">Asset</th>
                      <th className="py-6 px-6">Result (R-Ratio)</th>
                      <th className="py-6 px-6">Visuals</th>
                      <th className="py-6 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {trades.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-20 text-center text-white/20 font-arcade text-[10px] tracking-widest uppercase">No trades found</td>
                        </tr>
                      ) : trades.map((trade, i) => {
                        const r = getR(Number(trade.profit), Number(trade.risk));
                        return (
                          <motion.tr 
                            key={trade.id} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="border-b border-white/5 hover:bg-white/[0.03] transition-all group cursor-pointer relative"
                            onClick={() => setSelectedTrade(trade)}
                          >
                            <td className="py-6 px-6 text-white/40 font-mono tracking-tighter">{new Date(trade.date).toLocaleDateString()}</td>
                            <td className="py-6 px-6">
                              <div className="text-white font-bold text-sm tracking-tight">{trade.actif}</div>
                              <div className="text-[9px] text-secondary/50 font-arcade uppercase mt-1 tracking-widest">{trade.timeframe} // {trade.type}</div>
                            </td>
                            <td className={`py-6 px-6 font-bold`}>
                              <div className={`text-base ${Number(trade.profit) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                                {Number(trade.profit) >= 0 ? "+" : ""}${Number(trade.profit).toLocaleString()} ({formatR(r)})
                              </div>
                            </td>
                            <td className="py-6 px-6">
                              <div className="flex -space-x-2 group-hover:space-x-1 transition-all duration-300">
                                {trade.photos?.map((url: string, i: number) => (
                                  <img 
                                    key={i} 
                                    src={url} 
                                    className="w-8 h-8 object-cover rounded-lg border border-white/20 shadow-lg transition-transform hover:scale-110 hover:z-10" 
                                    alt="Trade Snapshot" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewPhoto({ url, index: i, photos: trade.photos });
                                    }} 
                                  />
                                ))}
                              </div>
                            </td>
                            <td className="py-6 px-6 text-right">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="text-white/30 hover:text-white hover:bg-white/10 rounded-lg" onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTrade(trade);
                                  setIsEditing(true);
                                  setEditData({...trade});
                                }}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={(e) => deleteTrade(trade.id, e)} className="text-white/20 hover:text-primary hover:bg-primary/10 rounded-lg">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
        </section>
      </div>

      {/* PHOTO PREVIEW MODAL */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none shadow-none flex flex-col justify-center items-center">
          <motion.div 
            className="relative w-full h-full flex items-center justify-center p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={previewPhoto?.url}
                initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
                src={previewPhoto?.url}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-[0_0_100px_rgba(0,0,0,0.8)]"
              />
            </AnimatePresence>

            {previewPhoto && previewPhoto.photos.length > 1 && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute left-10 top-1/2 -translate-y-1/2 w-16 h-16 bg-white/5 text-white hover:bg-white/20 rounded-2xl border border-white/10"
                  onClick={prevPhoto}
                >
                  <ChevronLeft className="h-10 w-10" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-10 top-1/2 -translate-y-1/2 w-16 h-16 bg-white/5 text-white hover:bg-white/20 rounded-2xl border border-white/10"
                  onClick={nextPhoto}
                >
                  <ChevronRight className="h-10 w-10" />
                </Button>
              </>
            )}

            <DialogClose className="absolute top-10 right-10 p-4 bg-white/5 text-white hover:bg-primary/80 hover:text-white rounded-2xl border border-white/10 transition-all active:scale-90">
              <X className="h-8 w-8" />
            </DialogClose>
          </motion.div>
          {previewPhoto && previewPhoto.photos.length > 1 && (
            <div className="p-8 flex justify-center gap-4 bg-black/40 backdrop-blur-xl border-t border-white/5 w-full">
              {previewPhoto.photos.map((url, i) => (
                <motion.div 
                  key={i} 
                  whileHover={{ scale: 1.1 }}
                  className={`w-20 h-20 border-2 rounded-xl overflow-hidden cursor-pointer transition-all shadow-lg ${i === previewPhoto.index ? 'border-primary shadow-primary/20 scale-110' : 'border-transparent opacity-40'}`}
                  onClick={() => setPreviewPhoto({ ...previewPhoto, url, index: i })}
                >
                  <img src={url} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TRADE DETAILS / EDIT MODAL */}
      <Dialog open={!!selectedTrade} onOpenChange={() => { setSelectedTrade(null); setIsEditing(false); setEditData(null); }}>
        <DialogContent className="max-w-2xl bg-[#0d0e14] border-white/10 text-white rounded-3xl p-0 overflow-hidden cyber-card shadow-2xl">
          <div className={`h-2 w-full bg-gradient-to-r ${isEditing ? 'from-accent to-primary' : 'from-primary via-accent to-secondary'} animate-gradient-x`} />
          
          <DialogHeader className="px-8 pt-8">
            <DialogTitle className="font-arcade text-white flex items-center gap-3">
              <div className={`p-2 rounded-xl bg-white/5 border border-white/10 ${isEditing ? 'text-accent' : 'text-primary'}`}>
                {isEditing ? <Edit2 className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] tracking-[0.3em] uppercase">{isEditing ? 'Edit Trade' : 'Trade Details'}</span>
                <span className="text-[10px] text-white/30 font-mono uppercase">ID: {selectedTrade?.id}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedTrade && (
            <div className="px-8 pb-10 pt-4 space-y-8">
              {isEditing ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Date</Label>
                    <Input 
                      type="date" 
                      value={editData?.date?.split('T')[0]} 
                      onChange={e => setEditData({...editData, date: e.target.value})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Asset</Label>
                    <Input 
                      value={editData?.actif} 
                      onChange={e => setEditData({...editData, actif: e.target.value})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Timeframe</Label>
                    <Select value={editData?.timeframe} onValueChange={v => setEditData({...editData, timeframe: v})}>
                      <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        {timeframes.map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Type</Label>
                    <Select value={editData?.type} onValueChange={v => setEditData({...editData, type: v})}>
                      <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Profit / Loss ($)</Label>
                    <Input 
                      type="number"
                      value={editData?.profit} 
                      onChange={e => setEditData({...editData, profit: parseFloat(e.target.value)})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Max Risk ($)</Label>
                    <Input 
                      type="number"
                      value={editData?.risk} 
                      onChange={e => setEditData({...editData, risk: parseFloat(e.target.value)})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Account</Label>
                    <Input 
                      value={editData?.compte} 
                      onChange={e => setEditData({...editData, compte: e.target.value})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Strategy</Label>
                    <Input 
                      value={editData?.strategie} 
                      onChange={e => setEditData({...editData, strategie: e.target.value})}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Observations</Label>
                    <Textarea 
                      value={editData?.observations} 
                      onChange={e => setEditData({...editData, observations: e.target.value})}
                      className="bg-white/5 border-white/10 rounded-xl min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">Photos (Max 3)</Label>
                    <div className="flex flex-wrap gap-4 mt-2">
                      {editData.photos?.map((url: string, i: number) => (
                        <div key={i} className="relative w-20 h-20 border border-white/10 rounded-xl overflow-hidden group">
                          <img src={url} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setEditData({...editData, photos: editData.photos.filter((_:any, idx:number) => idx !== i)})} 
                            className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {editData.photos?.length < 3 && (
                        <Label className="flex items-center justify-center w-20 h-20 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-secondary transition-all">
                          {uploading ? <Loader2 className="animate-spin h-5 w-5" /> : <Plus className="h-5 w-5 text-white/20" />}
                          <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                        </Label>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Calendar className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Date</span>
                      </div>
                      <p className="font-cyber text-sm font-medium">{new Date(selectedTrade.date).toLocaleDateString()}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Target className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Asset</span>
                      </div>
                      <p className="font-cyber text-sm font-bold text-secondary tracking-wide">{selectedTrade.actif}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Clock className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Timeframe</span>
                      </div>
                      <p className="font-cyber text-sm font-medium">{selectedTrade.timeframe}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Layers className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Strategy</span>
                      </div>
                      <p className="font-cyber text-sm font-medium">{selectedTrade.strategie}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Wallet className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Account</span>
                      </div>
                      <p className="font-cyber text-sm font-medium">{selectedTrade.compte}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <ShieldAlert className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">Profit / R</span>
                      </div>
                      <div className="flex flex-col">
                        <span className={`font-cyber text-lg font-bold ${Number(selectedTrade.profit) >= 0 ? 'text-secondary' : 'text-primary'}`}>
                          {Number(selectedTrade.profit) >= 0 ? "+" : ""}${Number(selectedTrade.profit).toLocaleString()}
                        </span>
                        <span className={`text-[10px] font-bold ${getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? 'text-secondary/50' : 'text-primary/50'}`}>
                          ({formatR(getR(Number(selectedTrade.profit), Number(selectedTrade.risk)))})
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedTrade.observations && (
                    <div className="space-y-3 p-6 bg-white/[0.03] rounded-2xl border border-white/5 shadow-inner">
                      <div className="font-arcade text-[8px] text-white/20 tracking-[0.2em] uppercase">Observations</div>
                      <p className="text-sm text-white/70 leading-relaxed font-cyber whitespace-pre-wrap">{selectedTrade.observations}</p>
                    </div>
                  )}

                  {selectedTrade.photos?.length > 0 && (
                    <div className="space-y-4">
                      <div className="font-arcade text-[8px] text-white/20 tracking-[0.2em] uppercase">Photos</div>
                      <div className="grid grid-cols-3 gap-4">
                        {selectedTrade.photos.map((url: string, i: number) => (
                          <motion.div 
                            key={i} 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative aspect-video rounded-xl overflow-hidden border border-white/10 cursor-zoom-in group shadow-lg"
                            onClick={() => setPreviewPhoto({ url, index: i, photos: selectedTrade.photos })}
                          >
                            <img src={url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                              <Maximize2 className="text-white h-5 w-5" />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/5">
                {isEditing ? (
                  <>
                    <Button 
                      variant="ghost" 
                      className="flex-1 font-arcade text-[10px] h-12 rounded-xl text-white/40 hover:text-white"
                      onClick={() => { setIsEditing(false); setEditData(null); }}
                    >
                      CANCEL
                    </Button>
                    <Button 
                      className="flex-1 bg-accent hover:bg-accent/80 font-arcade text-[10px] h-12 rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-[0.98]"
                      onClick={handleUpdateTrade}
                    >
                      <Save className="mr-2 h-4 w-4" /> SAVE CHANGES
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      className="flex-1 border-primary/20 text-primary/70 hover:bg-primary/10 font-arcade text-[10px] h-12 rounded-xl"
                      onClick={() => deleteTrade(selectedTrade.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> DELETE
                    </Button>
                    <Button 
                      className="flex-1 bg-accent hover:bg-accent/80 font-arcade text-[10px] h-12 rounded-xl shadow-lg shadow-accent/20"
                      onClick={() => { setIsEditing(true); setEditData({...selectedTrade}); }}
                    >
                      <Edit2 className="mr-2 h-4 w-4" /> EDIT
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
