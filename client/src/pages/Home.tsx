import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
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
  Hexagon,
  Filter,
  RefreshCw,
  LineChart as LineChartIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Cell,
} from "recharts";

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
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    index: number;
    photos: string[];
  } | null>(null);
  const [profitGoal, setProfitGoal] = useState<number>(10000);
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Filters
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");

  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchTrades();
      const savedGoal = localStorage.getItem(`profitGoal_${user.id}`);
      if (savedGoal) setProfitGoal(parseFloat(savedGoal));
    }
  }, [user]);

  const onPaste = useCallback(
    async (e: ClipboardEvent) => {
      if (!user) return;
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
    },
    [user, selectedPhotos, isEditing],
  );

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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { email_confirmed: true } },
    });
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } else if (data.user && !data.session) {
      toast({
        title: "Account created",
        description: "Verification required.",
      });
    } else {
      toast({
        title: "Success",
        description: "Account created and logged in!",
      });
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function uploadFile(file: File) {
    if ((isEditing ? editData.photos.length : selectedPhotos.length) >= 3) {
      toast({
        title: "Limit reached",
        description: "Maximum 3 photos allowed",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const fileExt = file.name ? file.name.split(".").pop() : "png";
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("trade-photos")
      .upload(filePath, file);

    if (uploadError) {
      toast({
        title: "Upload failed",
        description: uploadError.message,
        variant: "destructive",
      });
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from("trade-photos").getPublicUrl(filePath);

      if (isEditing) {
        setEditData({ ...editData, photos: [...editData.photos, publicUrl] });
      } else {
        setSelectedPhotos((prev) => [...prev, publicUrl]);
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
      user_id: user.id,
    };

    const { data, error } = await supabase
      .from("trades")
      .insert([newTrade])
      .select();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
    
    // Convert back to numbers before saving
    const dataToSave = {
      ...editData,
      profit: parseFloat(editData.profit) || 0,
      risk: parseFloat(editData.risk) || 0,
    };

    const { data, error } = await supabase
      .from("trades")
      .update(dataToSave)
      .eq("id", editData.id)
      .select()
      .single();

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setTrades(trades.map((t) => (t.id === data.id ? data : t)));
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
      setTrades(trades.filter((t) => t.id !== id));
      if (selectedTrade?.id === id) setSelectedTrade(null);
      toast({ title: "Deleted", description: "Trade removed" });
    }
  }

  const exportJSON = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(trades));
    const downloadAnchorNode = document.createElement("a");
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
          const tradesToImport = json.map((t) => ({
            ...t,
            id: undefined,
            user_id: user.id,
            created_at: undefined,
          }));
          const { data, error } = await supabase
            .from("trades")
            .insert(tradesToImport)
            .select();
          if (error) throw error;
          setTrades([...(data || []), ...trades]);
          toast({
            title: "Imported",
            description: `${data?.length} trades imported successfully`,
          });
        }
      } catch (err: any) {
        toast({
          title: "Import failed",
          description: err.message,
          variant: "destructive",
        });
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
      url: previewPhoto.photos[nextIdx],
    });
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!previewPhoto) return;
    const prevIdx =
      (previewPhoto.index - 1 + previewPhoto.photos.length) %
      previewPhoto.photos.length;
    setPreviewPhoto({
      ...previewPhoto,
      index: prevIdx,
      url: previewPhoto.photos[prevIdx],
    });
  };

  const saveGoal = () => {
    if (user) {
      localStorage.setItem(`profitGoal_${user.id}`, profitGoal.toString());
      setShowGoalInput(false);
      toast({
        title: "Goal saved",
        description: `Target set to $${profitGoal.toLocaleString()}`,
      });
    }
  };

  const resetFilters = () => {
    setFilterStrategy("all");
    setFilterAccount("all");
    setFilterType("all");
    setFilterDateStart("");
    setFilterDateEnd("");
  };

  if (loading && !trades.length)
    return (
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
                <Hexagon className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <CardTitle className="font-arcade text-xl text-primary tracking-widest drop-shadow-[0_0_8px_rgba(255,0,128,0.5)]">
                TRADING TERMINAL
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[9px] uppercase tracking-wider">
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/5 border-white/10 focus:border-secondary transition-all rounded-xl h-12"
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary font-arcade text-[9px] uppercase tracking-wider">
                    Password
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/5 border-white/10 focus:border-primary transition-all rounded-xl h-12"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[10px] h-12 rounded-xl transition-all active:scale-[0.98]"
                  >
                    CONNECT
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSignUp}
                    className="w-full text-white/50 hover:text-white font-arcade text-[10px] h-10 transition-all"
                  >
                    SIGN UP
                  </Button>
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
    return profit / Math.abs(risk);
  };

  const formatR = (r: number) => {
    const sign = r > 0 ? "+" : "";
    return `${sign}${r.toFixed(2)}R`;
  };

  // Apply filters
  const filteredTrades = trades.filter((t) => {
    if (filterStrategy !== "all" && t.strategie !== filterStrategy)
      return false;
    if (filterAccount !== "all" && t.compte !== filterAccount) return false;
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterDateStart && new Date(t.date) < new Date(filterDateStart))
      return false;
    if (filterDateEnd && new Date(t.date) > new Date(filterDateEnd))
      return false;
    return true;
  });

  const statsByStrategy = filteredTrades.reduce((acc: any, t) => {
    const s = t.strategie || "Unknown";
    if (!acc[s]) acc[s] = { profit: 0, count: 0, rTotal: 0 };
    acc[s].profit += Number(t.profit);
    acc[s].count += 1;
    acc[s].rTotal += getR(Number(t.profit), Number(t.risk));
    return acc;
  }, {});

  const statsByAccount = filteredTrades.reduce((acc: any, t) => {
    const a = t.compte || "Unknown";
    if (!acc[a]) acc[a] = { profit: 0, count: 0, rTotal: 0 };
    acc[a].profit += Number(t.profit);
    acc[a].count += 1;
    acc[a].rTotal += getR(Number(t.profit), Number(t.risk));
    return acc;
  }, {});

  const totalProfit = filteredTrades.reduce(
    (acc, t) => acc + Number(t.profit),
    0,
  );
  const winRate = filteredTrades.length
    ? (
        (filteredTrades.filter((t) => Number(t.profit) > 0).length /
          filteredTrades.length) *
        100
      ).toFixed(1)
    : 0;

  const rValues = filteredTrades.map((t) =>
    getR(Number(t.profit), Number(t.risk)),
  );
  const totalR = rValues.reduce((a, b) => a + b, 0);

  // Global metrics for dashboard (unfiltered)
  const globalProfit = trades.reduce((acc, t) => acc + Number(t.profit), 0);
  const globalWinRate = trades.length
    ? ((trades.filter((t) => Number(t.profit) > 0).length / trades.length) * 100).toFixed(1)
    : 0;
  const globalTotalR = trades.reduce((acc, t) => acc + getR(Number(t.profit), Number(t.risk)), 0);
  const globalCount = trades.length;

  // Calculate equity curve
  const sortedTrades = [...filteredTrades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let runningBalance = 0;
  const equityCurve = sortedTrades.map((t, i) => {
    runningBalance += Number(t.profit);
    return {
      date: new Date(t.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      balance: runningBalance,
      index: i,
    };
  });

  // Calculate monthly performance
  const monthlyPerf = filteredTrades.reduce((acc: any, t) => {
    const month = new Date(t.date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
    if (!acc[month]) acc[month] = 0;
    acc[month] += Number(t.profit);
    return acc;
  }, {});

  const monthlyData = Object.entries(monthlyPerf)
    .map(([month, profit]) => ({
      month,
      profit: profit as number,
    }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  // Advanced stats
  const winningTrades = filteredTrades.filter((t) => Number(t.profit) > 0);
  const losingTrades = filteredTrades.filter((t) => Number(t.profit) < 0);
  const bestTrade = filteredTrades.length
    ? filteredTrades.reduce(
        (best, t) => (Number(t.profit) > Number(best.profit) ? t : best),
        filteredTrades[0],
      )
    : null;
  const worstTrade = filteredTrades.length
    ? filteredTrades.reduce(
        (worst, t) => (Number(t.profit) < Number(worst.profit) ? t : worst),
        filteredTrades[0],
      )
    : null;

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  runningBalance = 0;
  sortedTrades.forEach((t) => {
    runningBalance += Number(t.profit);
    if (runningBalance > peak) peak = runningBalance;
    const drawdown = peak - runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  // Calculate streaks
  let currentStreak = 0;
  let bestStreak = 0;
  let worstStreak = 0;
  let tempStreak = 0;

  sortedTrades.forEach((t, i) => {
    const profit = Number(t.profit);
    if (i === 0) {
      tempStreak = profit > 0 ? 1 : profit < 0 ? -1 : 0;
    } else {
      const prevProfit = Number(sortedTrades[i - 1].profit);
      if ((profit > 0 && prevProfit > 0) || (profit < 0 && prevProfit < 0)) {
        tempStreak = profit > 0 ? tempStreak + 1 : tempStreak - 1;
      } else {
        tempStreak = profit > 0 ? 1 : profit < 0 ? -1 : 0;
      }
    }

    if (tempStreak > bestStreak) bestStreak = tempStreak;
    if (tempStreak < worstStreak) worstStreak = tempStreak;
    if (i === sortedTrades.length - 1) currentStreak = tempStreak;
  });

  // Calculate Sharpe Ratio
  const returns = filteredTrades.map(t => Number(t.profit));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev !== 0 ? avgReturn / stdDev : 0;

  // Get unique values for filters
  const strategies = Array.from(
    new Set(trades.map((t) => t.strategie).filter(Boolean)),
  );
  const accounts = Array.from(
    new Set(trades.map((t) => t.compte).filter(Boolean)),
  );

  // Calendar data - last 60 days
  const calendarData: any[] = [];
  const today = new Date();
  for (let i = 59; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const dayTrades = filteredTrades.filter((t) => t.date.startsWith(dateStr));
    const dayProfit = dayTrades.reduce((sum, t) => sum + Number(t.profit), 0);
    calendarData.push({
      date: dateStr,
      profit: dayProfit,
      count: dayTrades.length,
    });
  }

  const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

  const sectionTitleStyle =
    "font-arcade text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary drop-shadow-[0_0_8px_rgba(255,0,128,0.3)] tracking-[0.2em] uppercase";

  const goalProgress = (totalProfit / profitGoal) * 100;

  return (
    <div className="min-h-screen font-cyber pb-20 selection:bg-primary/30">
      <div className="mx-auto max-w-7xl p-4 lg:p-8 space-y-10">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-white/10 pb-10">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 glow-primary shadow-lg shadow-primary/10">
              <Hexagon className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-arcade text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary drop-shadow-[0_0_10px_rgba(255,0,128,0.3)] leading-tight tracking-wider uppercase">
                Trading Terminal
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={exportJSON}
                className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg px-4"
              >
                <Download className="mr-2 h-4 w-4" /> EXPORT
              </Button>
              <div className="w-px h-4 bg-white/10 my-auto mx-1" />
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg px-4"
              >
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> IMPORT
                  <input
                    type="file"
                    className="hidden"
                    accept=".json"
                    onChange={importJSON}
                  />
                </label>
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-primary/20 text-primary/70 hover:text-primary hover:bg-primary/10 hover:border-primary/40 rounded-xl px-4 transition-all"
            >
              <LogOut className="mr-2 h-4 w-4" /> DISCONNECT
            </Button>
          </div>
        </header>

        {/* TABS */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-white/5 border border-white/10 p-1 rounded-2xl h-14">
            <TabsTrigger
              value="dashboard"
              className="rounded-xl font-arcade text-[10px] data-[state=active]:bg-primary data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <Activity className="mr-2 h-4 w-4" />
              DASHBOARD
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="rounded-xl font-arcade text-[10px] data-[state=active]:bg-accent data-[state=active]:text-black data-[state=active]:shadow-lg transition-all"
            >
              <LineChartIcon className="mr-2 h-4 w-4" />
              ANALYTICS
            </TabsTrigger>
          </TabsList>

        <TabsContent value="dashboard" className="space-y-12 mt-10">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="cyber-card bg-[#0d0e14]/60 border-primary/10 rounded-2xl shadow-xl hover:shadow-primary/5 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                  Terminal Profit
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold font-cyber ${globalProfit >= 0 ? "text-secondary" : "text-primary"} drop-shadow-[0_0_10px_rgba(0,255,136,0.2)]`}
                >
                  {globalProfit >= 0 ? "+" : "-"}$
                  {Math.abs(globalProfit).toLocaleString()}
                </div>
                <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                  Overall net performance
                </p>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[#0d0e14]/60 border-secondary/10 rounded-2xl shadow-xl hover:shadow-secondary/5 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                  Strike Rate
                </CardTitle>
                <Target className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-secondary font-cyber drop-shadow-[0_0_10px_rgba(0,255,136,0.2)]">
                  {globalWinRate}%
                </div>
                <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                  {globalCount} trades executed
                </p>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[#0d0e14]/60 border-accent/10 rounded-2xl shadow-xl hover:shadow-accent/5 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                  Profit Goal
                </CardTitle>
                <Zap className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end justify-between">
                  <div
                    className="text-3xl font-bold text-accent font-cyber cursor-pointer group flex items-center gap-2"
                    onClick={() => setShowGoalInput(true)}
                  >
                    {goalProgress.toFixed(1)}%
                    <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-white/40 font-mono">
                    / ${profitGoal.toLocaleString()}
                  </div>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary via-accent to-secondary"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[#0d0e14]/60 border-white/10 rounded-2xl shadow-xl transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                  Yield Ratio
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-secondary" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold font-cyber ${globalTotalR >= 0 ? "text-secondary" : "text-primary"}`}
                >
                  {formatR(globalTotalR)}
                </div>
                <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                  Total R-multiple generated
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-2 px-2">
              <BarChart3 className="h-5 w-5 text-secondary" />
              <h2 className={sectionTitleStyle}>Performance Metrics</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Total Profit/Loss",
                  value: `$${globalProfit.toLocaleString()}`,
                  color: "text-secondary",
                  icon: globalProfit >= 0 ? TrendingUp : TrendingDown,
                  glow:
                    globalProfit >= 0
                      ? "shadow-secondary/20"
                      : "shadow-primary/20",
                },
                {
                  label: "Win Rate",
                  value: `${globalWinRate}%`,
                  color: "text-accent",
                  icon: Zap,
                  glow: "shadow-accent/20",
                },
                {
                  label: "Total Trades",
                  value: globalCount,
                  color: "text-white",
                  icon: History,
                  glow: "shadow-white/5",
                },
                {
                  label: "Total R-Ratio",
                  value: formatR(globalTotalR),
                  color: globalTotalR >= 0 ? "text-secondary" : "text-primary",
                  icon: Activity,
                  glow:
                    globalTotalR >= 0
                      ? "shadow-secondary/20"
                      : "shadow-primary/20",
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card
                    className={`cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl shadow-xl ${stat.glow}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                      <CardTitle className="font-arcade text-[9px] text-white/40 tracking-widest uppercase">
                        {stat.label}
                      </CardTitle>
                      <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-3xl font-bold ${stat.color} tracking-tight font-cyber`}
                      >
                        {stat.value}
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full mt-6 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          className={`h-full bg-gradient-to-r from-transparent via-${stat.color.split("-")[1] || "primary"}/30 to-${stat.color.split("-")[1] || "primary"}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2 px-2">
                <Plus className="h-5 w-5 text-primary" />
                <h2 className={sectionTitleStyle}>Add New Trade</h2>
              </div>
              <Card className="cyber-card border-primary/20 bg-[#0d0e14]/80 rounded-2xl shadow-2xl shadow-primary/5">
                <CardContent className="p-8">
                  <form
                    onSubmit={addTrade}
                    className="grid gap-8 md:grid-cols-2 lg:grid-cols-4"
                  >
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Calendar className="h-4 w-4 text-secondary" /> Date
                      </Label>
                      <Input
                        name="date"
                        type="date"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11"
                        defaultValue={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Target className="h-4 w-4 text-primary" /> Asset
                        (Actif)
                      </Label>
                      <Input
                        name="actif"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11"
                        placeholder="e.g. BTC/USD"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Clock className="h-4 w-4 text-secondary" /> Timeframe
                      </Label>
                      <Select name="timeframe" defaultValue="1H">
                        <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                          {timeframes.map((tf) => (
                            <SelectItem
                              key={tf}
                              value={tf}
                              className="hover:bg-primary/20 focus:bg-primary/20"
                            >
                              {tf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Activity className="h-4 w-4 text-primary" /> Type
                      </Label>
                      <Select name="type" defaultValue="long">
                        <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                          <SelectItem value="long" className="text-secondary">
                            Long
                          </SelectItem>
                          <SelectItem
                            value="short"
                            className="text-primary"
                          >
                            Short
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <TrendingUp className="h-4 w-4 text-secondary" /> Result
                        ($)
                      </Label>
                      <Input
                        name="profit"
                        type="number"
                        step="0.01"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-secondary/20 h-11"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <ShieldAlert className="h-4 w-4 text-primary" /> Max
                        Loss ($)
                      </Label>
                      <Input
                        name="risk"
                        type="number"
                        step="0.01"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11"
                        placeholder="100.00"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Wallet className="h-4 w-4 text-secondary" /> Account
                      </Label>
                      <Input
                        name="compte"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11"
                        placeholder="e.g. Main"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Layers className="h-4 w-4 text-primary" /> Strategy
                      </Label>
                      <Input
                        name="strategie"
                        className="bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/20 h-11"
                        placeholder="e.g. Trend Follow"
                        required
                      />
                    </div>
                    <div className="space-y-4 md:col-span-2 lg:col-span-4">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] uppercase font-semibold">
                        Observations
                      </Label>
                      <Textarea
                        name="observations"
                        className="bg-white/5 border-white/10 text-white min-h-[120px] rounded-2xl p-4 focus:ring-primary/20"
                        placeholder="Analyze market behavior, emotional state, and core learnings..."
                      />
                      <p className="text-[8px] text-white/20 font-arcade tracking-wider mt-2 uppercase">
                        CTRL+V TO PASTE SCREENSHOTS
                      </p>
                    </div>
                    <div className="space-y-4 md:col-span-2 lg:col-span-3">
                      <Label className="font-arcade text-[10px] text-white tracking-[0.1em] uppercase font-semibold">
                        Photos (Max 3)
                      </Label>
                      <div className="flex flex-wrap gap-5 mt-2">
                        {selectedPhotos.map((url, i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="relative w-28 h-28 border border-white/10 rounded-2xl overflow-hidden group shadow-lg shadow-black/50"
                          >
                            <img
                              src={url}
                              className="w-full h-full object-cover"
                              alt="Intel"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPhotos(
                                    selectedPhotos.filter(
                                      (_, idx) => idx !== i,
                                    ),
                                  )
                                }
                                className="p-2 bg-primary/80 text-white rounded-xl hover:bg-primary transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                        {selectedPhotos.length < 3 && (
                          <Label className="flex flex-col items-center justify-center w-28 h-28 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-secondary/50 hover:bg-secondary/5 transition-all group shadow-inner">
                            {uploading ? (
                              <Loader2 className="animate-spin h-6 w-6 text-secondary" />
                            ) : (
                              <Plus className="h-7 w-7 text-white/20 group-hover:text-secondary group-hover:scale-110 transition-transform" />
                            )}
                            <span className="text-[8px] mt-2 text-white/20 group-hover:text-secondary font-arcade uppercase tracking-tighter">
                              Upload
                            </span>
                            <Input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={handlePhotoUpload}
                              disabled={uploading}
                            />
                          </Label>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end lg:col-start-4">
                      <Button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary/80 glow-primary font-arcade text-[11px] h-14 rounded-2xl shadow-xl shadow-primary/10 transition-all active:scale-[0.98]"
                        disabled={uploading}
                      >
                        Save Trade
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 mb-2 px-2">
                <History className="h-5 w-5 text-accent" />
                <h2 className={sectionTitleStyle}>Recent Trades</h2>
              </div>
              <Card className="cyber-card bg-[#0d0e14]/60 border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-left text-[12px] font-cyber">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.04] text-secondary font-bold font-arcade text-[9px] tracking-[0.2em] shadow-[0_4px_10px_-4px_rgba(0,255,255,0.1)]">
                          <th className="py-6 px-6">Date</th>
                          <th className="py-6 px-6">Asset</th>
                          <th className="py-6 px-6">Timeframe</th>
                          <th className="py-6 px-6">Type</th>
                          <th className="py-6 px-6">Result</th>
                          <th className="py-6 px-6">R-Ratio</th>
                          <th className="py-6 px-6">Visuals</th>
                          <th className="py-6 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence>
                          {filteredTrades.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-20 text-center text-white/20 font-arcade text-[10px] tracking-widest uppercase"
                              >
                                No trades found
                              </td>
                            </tr>
                          ) : (
                            filteredTrades.map((trade, i) => {
                              const r = getR(
                                Number(trade.profit),
                                Number(trade.risk),
                              );
                              return (
                                <motion.tr
                                  key={trade.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  className="border-b border-white/5 hover:bg-white/[0.03] transition-all group cursor-pointer relative"
                                  onClick={() => setSelectedTrade(trade)}
                                >
                                  <td className="py-6 px-6 text-white font-mono tracking-tighter">
                                    {new Date(trade.date).toLocaleDateString()}
                                  </td>
                                  <td className="py-6 px-6 text-white font-bold">
                                    {trade.actif}
                                  </td>
                                  <td className="py-6 px-6 text-white/70">
                                    {trade.timeframe}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold uppercase text-[10px] ${trade.type === "long" ? "text-secondary" : "text-primary"}`}
                                  >
                                    {trade.type === "long" ? "Long" : "Short"}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold ${Number(trade.profit) >= 0 ? "text-secondary" : "text-primary"}`}
                                  >
                                    {Number(trade.profit) >= 0 ? "+" : "-"}$
                                    {Math.abs(
                                      Number(trade.profit),
                                    ).toLocaleString()}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold ${getR(Number(trade.profit), Number(trade.risk)) >= 0 ? "text-secondary" : "text-primary"}`}
                                  >
                                    {formatR(
                                      getR(
                                        Number(trade.profit),
                                        Number(trade.risk),
                                      ),
                                    )}
                                  </td>
                                  <td className="py-6 px-6">
                                    <div className="flex -space-x-2 group-hover:space-x-1 transition-all duration-300">
                                      {trade.photos?.map(
                                        (url: string, i: number) => (
                                          <img
                                            key={i}
                                            src={url}
                                            className="w-8 h-8 object-cover rounded-lg border border-white/20 shadow-lg transition-transform hover:scale-110 hover:z-10"
                                            alt="Trade Snapshot"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewPhoto({
                                                url,
                                                index: i,
                                                photos: trade.photos,
                                              });
                                            }}
                                          />
                                        ),
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-6 px-6 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white/30 hover:text-white hover:bg-white/10 rounded-lg"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTrade(trade);
                                          setIsEditing(true);
                                          setEditData({ ...trade });
                                        }}
                                      >
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) =>
                                          deleteTrade(trade.id, e)
                                        }
                                        className="text-white/20 hover:text-primary hover:bg-primary/10 rounded-lg"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })
                          )}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-10 mt-10">
            {/* Strategy and Account breakdowns */}
            <div className="grid gap-8 lg:grid-cols-2">
              <Card className="cyber-card bg-[#0d0e14]/40 border-secondary/10 rounded-2xl">
                <CardHeader className="border-b border-white/5">
                  <CardTitle className={sectionTitleStyle}>
                    Strategy Vector Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-5">
                    {Object.entries(statsByStrategy).length === 0 ? (
                      <p className="text-center py-10 text-white/20 font-arcade text-[10px]">
                        No strategy data detected
                      </p>
                    ) : (
                      Object.entries(statsByStrategy).map(
                        ([strategy, data]: [string, any]) => (
                          <div
                            key={strategy}
                            className="flex justify-between items-center group p-3 rounded-xl hover:bg-white/5 transition-all"
                          >
                            <div className="space-y-1">
                              <span className="text-white/80 group-hover:text-white transition-colors font-medium">
                                {strategy}
                              </span>
                              <div className="text-[9px] text-white/30 font-arcade uppercase">
                                Trades: {data.count}
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-lg font-bold font-cyber ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}
                              >
                                {data.profit >= 0 ? "+" : ""}$
                                {data.profit.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-white/40 font-mono tracking-tighter uppercase">
                                Total Ratio: {formatR(data.rTotal)}
                              </div>
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="cyber-card bg-[#0d0e14]/40 border-accent/10 rounded-2xl">
                <CardHeader className="border-b border-white/5">
                  <CardTitle className={sectionTitleStyle}>
                    Account Cluster Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-5">
                    {Object.entries(statsByAccount).length === 0 ? (
                      <p className="text-center py-10 text-white/20 font-arcade text-[10px]">
                        No account data detected
                      </p>
                    ) : (
                      Object.entries(statsByAccount).map(
                        ([account, data]: [string, any]) => (
                          <div
                            key={account}
                            className="flex justify-between items-center group p-3 rounded-xl hover:bg-white/5 transition-all"
                          >
                            <div className="space-y-1">
                              <span className="text-white/80 group-hover:text-white transition-colors font-medium">
                                {account}
                              </span>
                              <div className="text-[9px] text-white/30 font-arcade uppercase">
                                Trades: {data.count}
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-lg font-bold font-cyber ${data.profit >= 0 ? "text-secondary" : "text-primary"}`}
                              >
                                {data.profit >= 0 ? "+" : ""}$
                                {data.profit.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-white/40 font-mono tracking-tighter uppercase">
                                Total Ratio: {formatR(data.rTotal)}
                              </div>
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card className="cyber-card bg-[#0d0e14]/40 border-white/5 rounded-2xl">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Filter className="h-4 w-4 text-accent" />
                  <h3 className="font-arcade text-[9px] text-white/60 uppercase tracking-wider">
                    Filters
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="ml-auto text-white/40 hover:text-white h-7 px-3 font-arcade text-[8px]"
                  >
                    <RefreshCw className="h-3 w-3 mr-2" /> RESET
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-white/40 uppercase">
                      Strategy
                    </Label>
                    <Select
                      value={filterStrategy}
                      onValueChange={setFilterStrategy}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        <SelectItem value="all">All Strategies</SelectItem>
                        {strategies.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-white/40 uppercase">
                      Account
                    </Label>
                    <Select
                      value={filterAccount}
                      onValueChange={setFilterAccount}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        <SelectItem value="all">All Accounts</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-white/40 uppercase">
                      Type
                    </Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-white/40 uppercase">
                      From
                    </Label>
                    <Input
                      type="date"
                      value={filterDateStart}
                      onChange={(e) => setFilterDateStart(e.target.value)}
                      className="bg-white/5 border-white/10 h-9 rounded-xl text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-white/40 uppercase">
                      To
                    </Label>
                    <Input
                      type="date"
                      value={filterDateEnd}
                      onChange={(e) => setFilterDateEnd(e.target.value)}
                      className="bg-white/5 border-white/10 h-9 rounded-xl text-sm"
                    />
                  </div>
                </div>
                {(filterStrategy !== "all" ||
                  filterAccount !== "all" ||
                  filterType !== "all" ||
                  filterDateStart ||
                  filterDateEnd) && (
                  <div className="mt-4 text-[9px] text-accent font-arcade uppercase">
                    Showing {filteredTrades.length} of {trades.length} trades
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Metrics (Duplicated from dashboard, filtered) */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="cyber-card bg-[#0d0e14]/60 border-primary/10 rounded-2xl shadow-xl hover:shadow-primary/5 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                    Filtered Profit
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold font-cyber ${totalProfit >= 0 ? "text-secondary" : "text-primary"} drop-shadow-[0_0_10px_rgba(0,255,136,0.2)]`}
                  >
                    {totalProfit >= 0 ? "+" : "-"}$
                    {Math.abs(totalProfit).toLocaleString()}
                  </div>
                  <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                    Filtered net performance
                  </p>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[#0d0e14]/60 border-secondary/10 rounded-2xl shadow-xl hover:shadow-secondary/5 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                    Filtered WinRate
                  </CardTitle>
                  <Target className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-secondary font-cyber drop-shadow-[0_0_10px_rgba(0,255,136,0.2)]">
                    {winRate}%
                  </div>
                  <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                    {filteredTrades.length} filtered trades
                  </p>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[#0d0e14]/60 border-accent/10 rounded-2xl shadow-xl hover:shadow-accent/5 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                    Profit Goal (Global)
                  </CardTitle>
                  <Zap className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold text-accent font-cyber">
                      {goalProgress.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      / ${profitGoal.toLocaleString()}
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary via-accent to-secondary"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[#0d0e14]/60 border-white/10 rounded-2xl shadow-xl transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-white/40 uppercase tracking-widest">
                    Filtered Yield
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold font-cyber ${totalR >= 0 ? "text-secondary" : "text-primary"}`}
                  >
                    {formatR(totalR)}
                  </div>
                  <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase tracking-tighter">
                    Filtered R-multiple
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Equity Curve */}
            {equityCurve.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2 px-2">
                  <Activity className="h-5 w-5 text-accent" />
                  <h2 className={sectionTitleStyle}>Equity Curve</h2>
                </div>
                <Card className="cyber-card bg-[#0d0e14]/60 border-accent/10 rounded-2xl shadow-2xl">
                  <CardContent className="p-8">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient
                            id="colorBalance"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#00ffff"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#00ffff"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.05)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="rgba(255,255,255,0.3)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "rgba(255,255,255,0.4)" }}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.3)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "rgba(255,255,255,0.4)" }}
                          tickFormatter={(value) =>
                            `$${value.toLocaleString()}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(13, 14, 20, 0.95)",
                            border: "1px solid rgba(0, 255, 255, 0.2)",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            boxShadow: "0 0 20px rgba(0, 255, 255, 0.1)",
                          }}
                          labelStyle={{ color: "#00ffff", fontWeight: "bold" }}
                          formatter={(value: any) => [
                            `$${value.toLocaleString()}`,
                            "Balance",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="balance"
                          stroke="#00ffff"
                          strokeWidth={2}
                          fill="url(#colorBalance)"
                          animationDuration={2000}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.section>
            )}

            {/* Monthly Performance */}
            {monthlyData.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-2 px-2">
                  <Calendar className="h-5 w-5 text-secondary" />
                  <h2 className={sectionTitleStyle}>Monthly Performance</h2>
                </div>
                <Card className="cyber-card bg-[#0d0e14]/60 border-secondary/10 rounded-2xl shadow-2xl">
                  <CardContent className="p-8">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={monthlyData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.05)"
                        />
                        <XAxis
                          dataKey="month"
                          stroke="rgba(255,255,255,0.3)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "rgba(255,255,255,0.4)" }}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.3)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "rgba(255,255,255,0.4)" }}
                          tickFormatter={(value) =>
                            `$${value.toLocaleString()}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "rgba(13, 14, 20, 0.95)",
                            border: "1px solid rgba(0, 255, 255, 0.2)",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            boxShadow: "0 0 20px rgba(0, 255, 255, 0.1)",
                          }}
                          formatter={(value: any) => [
                            `$${value.toLocaleString()}`,
                            "Profit/Loss",
                          ]}
                          labelStyle={{ color: "#00ffff", fontWeight: "bold" }}
                        />
                        <Bar
                          dataKey="profit"
                          radius={[8, 8, 0, 0]}
                          animationDuration={1500}
                        >
                          {monthlyData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.profit >= 0 ? "#00ff88" : "#ff0080"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.section>
            )}

            {/* Advanced Stats */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 mb-2 px-2">
                <Activity className="h-5 w-5 text-primary" />
                <h2 className={sectionTitleStyle}>Advanced Analytics</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Max Drawdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary font-cyber">
                      -${maxDrawdown.toLocaleString()}
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                      Largest capital decline
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Best Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {bestTrade ? (
                      <>
                        <div className="text-2xl font-bold text-secondary font-cyber">
                          +${Number(bestTrade.profit).toLocaleString()}
                        </div>
                        <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                          {bestTrade.actif} •{" "}
                          {new Date(bestTrade.date).toLocaleDateString()}
                        </p>
                      </>
                    ) : (
                      <div className="text-white/20 font-arcade text-[9px]">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Worst Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {worstTrade ? (
                      <>
                        <div className="text-2xl font-bold text-primary font-cyber">
                          ${Number(worstTrade.profit).toLocaleString()}
                        </div>
                        <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                          {worstTrade.actif} •{" "}
                          {new Date(worstTrade.date).toLocaleDateString()}
                        </p>
                      </>
                    ) : (
                      <div className="text-white/20 font-arcade text-[9px]">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Win Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-secondary font-cyber">
                      {bestStreak}
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                      Consecutive wins
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Loss Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary font-cyber">
                      {Math.abs(worstStreak)}
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                      Consecutive losses
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">
                      Current Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold font-cyber ${currentStreak >= 0 ? "text-secondary" : "text-primary"}`}
                    >
                      {currentStreak > 0 ? "+" : ""}
                      {currentStreak}
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">
                      {currentStreak > 0
                        ? "Winning"
                        : currentStreak < 0
                          ? "Losing"
                          : "Neutral"}
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[#0d0e14]/80 border-white/10 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-white/40 uppercase tracking-wider">Sharpe Ratio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-cyber ${sharpeRatio >= 1 ? 'text-secondary' : sharpeRatio >= 0 ? 'text-accent' : 'text-primary'}`}>
                      {sharpeRatio.toFixed(2)}
                    </div>
                    <p className="text-[9px] text-white/30 mt-2 font-arcade uppercase">Risk-adjusted return</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Calendar View - Last 60 days */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2 px-2">
                <Calendar className="h-5 w-5 text-accent" />
                <h2 className={sectionTitleStyle}>
                  Trading Calendar (Last 60 Days)
                </h2>
              </div>
              <Card className="cyber-card bg-[#0d0e14]/60 border-white/5 rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="grid grid-cols-10 gap-2">
                    {calendarData.map((day, i) => {
                      const intensity =
                        day.count === 0
                          ? 0
                          : Math.min(Math.abs(day.profit) / 500, 1);
                      const color =
                        day.count === 0
                          ? "bg-white/5"
                          : day.profit > 0
                            ? `bg-secondary`
                            : "bg-primary";
                      return (
                        <div
                          key={i}
                          className={`aspect-square rounded-lg ${color} border border-white/10 hover:scale-110 transition-all cursor-pointer relative group`}
                          style={{
                            opacity:
                              day.count === 0 ? 0.3 : 0.4 + intensity * 0.6,
                          }}
                          title={`${new Date(day.date).toLocaleDateString()}\n${day.count} trades\n$${day.profit.toLocaleString()}`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] font-bold text-white">
                              {day.count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-6 text-[8px] font-arcade text-white/30 uppercase">
                    <span>60 days ago</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-white/5 rounded border border-white/10" />
                        <span>No trades</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-secondary/60 rounded border border-white/10" />
                        <span>Profit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-primary/60 rounded border border-white/10" />
                        <span>Loss</span>
                      </div>
                    </div>
                    <span>Today</span>
                  </div>
                </CardContent>
              </Card>
            </motion.section>
          </TabsContent>
        </Tabs>
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
                  className={`w-20 h-20 border-2 rounded-xl overflow-hidden cursor-pointer transition-all shadow-lg ${i === previewPhoto.index ? "border-primary shadow-primary/20 scale-110" : "border-transparent opacity-40"}`}
                  onClick={() =>
                    setPreviewPhoto({ ...previewPhoto, url, index: i })
                  }
                >
                  <img src={url} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* TRADE DETAILS / EDIT MODAL */}
      <Dialog
        open={!!selectedTrade}
        onOpenChange={() => {
          setSelectedTrade(null);
          setIsEditing(false);
          setEditData(null);
        }}
      >
        <DialogContent className="max-w-2xl bg-[#0d0e14] border-white/10 text-white rounded-3xl p-0 overflow-hidden cyber-card shadow-2xl">
          <div
            className={`h-2 w-full bg-gradient-to-r ${isEditing ? "from-accent to-primary" : "from-primary via-accent to-secondary"} animate-gradient-x`}
          />

          <DialogHeader className="px-8 pt-8">
            <DialogTitle className="font-arcade text-white flex items-center gap-3">
              <div
                className={`p-2 rounded-xl bg-white/5 border border-white/10 ${isEditing ? "text-accent" : "text-primary"}`}
              >
                {isEditing ? (
                  <Edit2 className="h-5 w-5" />
                ) : (
                  <Activity className="h-5 w-5" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] tracking-[0.3em] uppercase">
                  {isEditing ? "Edit Trade" : "Trade Details"}
                </span>
                <span className="text-[10px] text-white/30 font-mono uppercase">
                  ID: {selectedTrade?.id}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedTrade && (
            <div className="px-8 pb-10 pt-4 space-y-8">
              {isEditing ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={editData?.date?.split("T")[0]}
                      onChange={(e) =>
                        setEditData({ ...editData, date: e.target.value })
                      }
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Asset
                    </Label>
                    <Input
                      value={editData?.actif}
                      onChange={(e) =>
                        setEditData({ ...editData, actif: e.target.value })
                      }
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Timeframe
                    </Label>
                    <Select
                      value={editData?.timeframe}
                      onValueChange={(v) =>
                        setEditData({ ...editData, timeframe: v })
                      }
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        {timeframes.map((tf) => (
                          <SelectItem key={tf} value={tf}>
                            {tf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Type
                    </Label>
                    <Select
                      value={editData?.type}
                      onValueChange={(v) => setEditData({ ...editData, type: v })}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0d0e14] border-white/10 rounded-xl">
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Profit / Loss ($)
                    </Label>
                    <Input
                      type="text"
                      value={editData?.profit}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || val === "-" || !isNaN(Number(val))) {
                          setEditData({
                            ...editData,
                            profit: val,
                          });
                        }
                      }}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Max Risk ($)
                    </Label>
                    <Input
                      type="text"
                      value={editData?.risk}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || val === "-" || !isNaN(Number(val))) {
                          setEditData({
                            ...editData,
                            risk: val,
                          });
                        }
                      }}
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Account
                    </Label>
                    <Input
                      value={editData?.compte}
                      onChange={(e) =>
                        setEditData({ ...editData, compte: e.target.value })
                      }
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Strategy
                    </Label>
                    <Input
                      value={editData?.strategie}
                      onChange={(e) =>
                        setEditData({ ...editData, strategie: e.target.value })
                      }
                      className="bg-white/5 border-white/10 rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Observations
                    </Label>
                    <Textarea
                      value={editData?.observations}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          observations: e.target.value,
                        })
                      }
                      className="bg-white/5 border-white/10 rounded-xl min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-white/40 uppercase">
                      Photos (Max 3)
                    </Label>
                    <div className="flex flex-wrap gap-4 mt-2">
                      {editData.photos?.map((url: string, i: number) => (
                        <div
                          key={i}
                          className="relative w-20 h-20 border border-white/10 rounded-xl overflow-hidden group"
                        >
                          <img
                            src={url}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditData({
                                ...editData,
                                photos: editData.photos.filter(
                                  (_: any, idx: number) => idx !== i,
                                ),
                              })
                            }
                            className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {editData.photos?.length < 3 && (
                        <Label className="flex items-center justify-center w-20 h-20 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-secondary transition-all">
                          {uploading ? (
                            <Loader2 className="animate-spin h-5 w-5" />
                          ) : (
                            <Plus className="h-5 w-5 text-white/20" />
                          )}
                          <Input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            disabled={uploading}
                          />
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
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Date
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-medium">
                        {new Date(selectedTrade.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Target className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Asset
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-bold text-secondary tracking-wide">
                        {selectedTrade.actif}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Clock className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Timeframe
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-medium">
                        {selectedTrade.timeframe}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Layers className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Strategy
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-medium">
                        {selectedTrade.strategie}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <Wallet className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Account
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-medium">
                        {selectedTrade.compte}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white/30">
                        <ShieldAlert className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Profit / R
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={`font-cyber text-lg font-bold ${Number(selectedTrade.profit) >= 0 ? "text-secondary" : "text-primary"}`}
                        >
                          {Number(selectedTrade.profit) >= 0 ? "+" : ""}$
                          {Number(selectedTrade.profit).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? "text-secondary/50" : "text-primary/50"}`}
                        >
                          (
                          {formatR(
                            getR(
                              Number(selectedTrade.profit),
                              Number(selectedTrade.risk),
                            ),
                          )}
                          )
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedTrade.observations && (
                    <div className="space-y-3 p-6 bg-white/[0.03] rounded-2xl border border-white/5 shadow-inner">
                      <div className="font-arcade text-[8px] text-white/20 tracking-[0.2em] uppercase">
                        Observations
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed font-cyber whitespace-pre-wrap">
                        {selectedTrade.observations}
                      </p>
                    </div>
                  )}

                  {selectedTrade.photos?.length > 0 && (
                    <div className="space-y-4">
                      <div className="font-arcade text-[8px] text-white/20 tracking-[0.2em] uppercase">
                        Photos
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {selectedTrade.photos.map((url: string, i: number) => (
                          <motion.div
                            key={i}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative aspect-video rounded-xl overflow-hidden border border-white/10 cursor-zoom-in group shadow-lg"
                            onClick={() =>
                              setPreviewPhoto({
                                url,
                                index: i,
                                photos: selectedTrade.photos,
                              })
                            }
                          >
                            <img
                              src={url}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
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
                      onClick={() => {
                        setIsEditing(false);
                        setEditData(null);
                      }}
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
                      onClick={() => {
                        setIsEditing(true);
                        setEditData({ ...selectedTrade });
                      }}
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
