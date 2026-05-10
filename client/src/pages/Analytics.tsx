import { useState, useEffect, useCallback, type ReactNode } from "react";
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
import {
  Tooltip as Hint,
  TooltipTrigger as HintTrigger,
  TooltipContent as HintContent,
} from "@/components/ui/tooltip";
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
  HelpCircle,
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

function MetricHint({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Hint delayDuration={150}>
      <HintTrigger asChild>
        <span
          className="relative z-20 inline-flex cursor-help items-center gap-1 border-b border-dotted border-[--ink3]/40 text-left underline-offset-2 hover:border-[--at-accent]/60"
          tabIndex={0}
        >
          {label}
          <HelpCircle className="h-3 w-3 shrink-0 text-[--ink3]" aria-hidden />
        </span>
      </HintTrigger>
      <HintContent
        side="top"
        sideOffset={8}
        className="z-[9999] min-w-[260px] max-w-[420px] rounded-xl border border-[--rule] bg-[--at-surface] px-4 py-3 text-left text-[12px] font-medium font-cyber normal-case leading-relaxed tracking-normal text-[--ink] shadow-md"
      >
        {children}
      </HintContent>
    </Hint>
  );
}

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
  const [startingBalance, setStartingBalance] = useState<number>(0);

  // Filters
  const [filterStrategy, setFilterStrategy] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRange, setFilterRange] = useState<"24h" | "7d" | "30d" | "all">(
    "all",
  );
  const [entryTime, setEntryTime] = useState<string>(
    new Date().toTimeString().slice(0, 5),
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [performanceYear, setPerformanceYear] = useState<number>(
    new Date().getFullYear(),
  );

  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
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
      const savedStart = localStorage.getItem(`startingBalance_${user.id}`);
      if (savedStart != null && savedStart !== "")
        setStartingBalance(parseFloat(savedStart));
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
      const isUnconfirmed =
        error.message.toLowerCase().includes("email") ||
        error.message.toLowerCase().includes("confirm") ||
        error.message.toLowerCase().includes("invalid");
      toast({
        title: "Login failed",
        description: isUnconfirmed
          ? `${error.message} — Si votre compte est nouveau, confirmez votre email ou désactivez "Confirm email" dans Supabase Auth.`
          : error.message,
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
    });
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } else if (data.user && !data.session) {
      toast({
        title: "Vérification requise",
        description: "Un email de confirmation a été envoyé. Confirmez-le puis connectez-vous. Ou désactivez 'Confirm email' dans Supabase Auth pour vous connecter directement.",
      });
    } else {
      toast({
        title: "Compte créé",
        description: "Connecté avec succès !",
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
      date: buildTradeDateTime(formData.get("date"), entryTime),
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
      setEntryTime(new Date().toTimeString().slice(0, 5));
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
    setFilterRange("all");
  };

  if (loading && !trades.length)
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-12 w-12 text-[--at-accent]" />
        </motion.div>
      </div>
    );

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background font-cyber overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-0.5 bg-[--at-accent]/10 border border-[--at-accent]/20 rounded-2xl"
        >
          <Card className="cyber-card border-none bg-[--at-surface] rounded-2xl">
            <CardHeader className="text-center pt-8">
              <div className="w-16 h-16 bg-[--at-accent]/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[--at-accent]/20">
                <Hexagon className="h-8 w-8 text-[--at-accent]" />
              </div>
              <CardTitle className="font-arcade text-xl text-[--at-accent] tracking-widest">
                TRADING TERMINAL
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[--at-accent] font-arcade text-[9px] uppercase tracking-wider">
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-[--at-bg] border-[--rule] focus:border-[--at-accent] transition-all rounded-xl h-12"
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[--at-accent] font-arcade text-[9px] uppercase tracking-wider">
                    Password
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[--at-bg] border-[--rule] focus:border-[--at-accent] transition-all rounded-xl h-12"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="flex flex-col gap-3 pt-4">
                  <Button
                    type="submit"
                    className="w-full bg-[--at-accent] hover:bg-[--at-accent]/80 text-[--at-bg] font-arcade text-[10px] h-12 rounded-xl transition-all active:scale-[0.98]"
                  >
                    CONNECT
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSignUp}
                    className="w-full text-[--ink3] hover:text-[--ink] font-arcade text-[10px] h-10 transition-all"
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

  const formatTradeTime = (value: string | null | undefined) => {
    if (!value) return "--:--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--";
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const buildTradeDateTime = (
    dateValue: FormDataEntryValue | null,
    timeValue: string,
  ) => {
    if (!dateValue || typeof dateValue !== "string")
      return new Date().toISOString();
    return new Date(`${dateValue}T${timeValue || "00:00"}:00`).toISOString();
  };

  const getDateInputValue = (value: string | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  };

  const getTimeInputValue = (value: string | null | undefined) => {
    if (!value) return "00:00";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "00:00";
    return date.toTimeString().slice(0, 5);
  };

  /** Parse date du trade en local (évite décalage UTC sur YYYY-MM-DD). */
  const parseTradeDateLocal = (value: string | null | undefined): Date => {
    if (!value) return new Date(NaN);
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return new Date(NaN);
    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      12,
      0,
      0,
      0,
    );
  };

  const dateKeyFromTrade = (value: string | null | undefined): string => {
    const d = parseTradeDateLocal(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const dateKeyFromDate = (value: Date): string => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const formatEquityChartLabel = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const isTradeInRange = (tradeDateRaw: string | null | undefined) => {
    if (filterRange === "all") return true;
    const tradeDate = new Date(tradeDateRaw || "");
    if (Number.isNaN(tradeDate.getTime())) return false;
    const now = new Date();
    const hours =
      filterRange === "24h" ? 24 : filterRange === "7d" ? 24 * 7 : 24 * 30;
    const minDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
    return tradeDate >= minDate;
  };
  const rangeStartDateForChart =
    filterRange === "all"
      ? null
      : new Date(
          Date.now() -
            (filterRange === "24h" ? 24 : filterRange === "7d" ? 24 * 7 : 24 * 30) *
              60 *
              60 *
              1000,
        );

  // Apply filters
  const filteredTrades = trades.filter((t) => {
    if (filterStrategy !== "all" && t.strategie !== filterStrategy)
      return false;
    if (filterAccount !== "all" && t.compte !== filterAccount) return false;
    if (filterType !== "all" && t.type !== filterType) return false;
    if (!isTradeInRange(t.date)) return false;
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

  // Calculate equity curve (absolute balance = starting capital + cumul P/L)
  const sortedTrades = [...filteredTrades].sort(
    (a, b) =>
      parseTradeDateLocal(a.date).getTime() -
      parseTradeDateLocal(b.date).getTime(),
  );

  type EquityPoint = { date: string; balance: number; index: number };
  const equityCurve: EquityPoint[] = [];
  let runningBalance = startingBalance;

  if (
    rangeStartDateForChart &&
    sortedTrades.length > 0 &&
    dateKeyFromTrade(sortedTrades[0].date) > dateKeyFromDate(rangeStartDateForChart)
  ) {
    equityCurve.push({
      date: formatEquityChartLabel(rangeStartDateForChart),
      balance: startingBalance,
      index: -1,
    });
  }

  sortedTrades.forEach((t, i) => {
    runningBalance += Number(t.profit);
    equityCurve.push({
      date: formatEquityChartLabel(parseTradeDateLocal(t.date)),
      balance: runningBalance,
      index: i,
    });
  });

  // Advanced stats
  const winningTrades = filteredTrades.filter((t) => Number(t.profit) > 0);
  const losingTrades = filteredTrades.filter((t) => Number(t.profit) < 0);
  const avgProfit = winningTrades.length
    ? winningTrades.reduce((sum, t) => sum + Number(t.profit), 0) /
      winningTrades.length
    : 0;
  const avgLoss = losingTrades.length
    ? losingTrades.reduce((sum, t) => sum + Number(t.profit), 0) /
      losingTrades.length
    : 0;
  const averageRRR = avgLoss !== 0 ? avgProfit / Math.abs(avgLoss) : 0;
  const expectancy =
    filteredTrades.length > 0
      ? totalProfit / filteredTrades.length
      : 0;
  const grossProfit = winningTrades.reduce(
    (sum, t) => sum + Number(t.profit),
    0,
  );
  const grossLossAbs = Math.abs(
    losingTrades.reduce((sum, t) => sum + Number(t.profit), 0),
  );
  const profitFactor = grossLossAbs !== 0 ? grossProfit / grossLossAbs : 0;
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

  // Calculate max drawdown (on absolute equity curve)
  let peak = startingBalance;
  let maxDrawdown = 0;
  runningBalance = startingBalance;
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

  const dailyStatsMap = filteredTrades.reduce(
    (acc: Record<string, { profit: number; count: number; dayR: number }>, t) => {
      const key = dateKeyFromTrade(t.date);
      if (!key) return acc;
      if (!acc[key]) acc[key] = { profit: 0, count: 0, dayR: 0 };
      const p = Number(t.profit);
      acc[key].profit += p;
      acc[key].count += 1;
      acc[key].dayR += getR(p, Number(t.risk));
      return acc;
    },
    {},
  );

  const monthStart = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  );
  const monthEnd = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  );
  const daysInMonth = monthEnd.getDate();
  const mondayFirstOffset = (monthStart.getDay() + 6) % 7;
  const calendarCells: Array<
    | {
        dayNumber: number;
        key: string;
        profit: number;
        count: number;
        dayR: number;
      }
    | null
  > = [];
  for (let i = 0; i < mondayFirstOffset; i++) calendarCells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const y = monthStart.getFullYear();
    const m = String(monthStart.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    const stats = dailyStatsMap[key] ?? { profit: 0, count: 0, dayR: 0 };
    calendarCells.push({
      dayNumber: day,
      key,
      profit: stats.profit,
      count: stats.count,
      dayR: stats.dayR,
    });
  }
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const calendarRows = Array.from(
    { length: Math.ceil(calendarCells.length / 7) },
    (_, w) => calendarCells.slice(w * 7, w * 7 + 7),
  );

  const monthWeekSummaries = calendarRows.map((row, w) => {
      const slice = row.filter(Boolean) as Array<{
        dayNumber: number;
        key: string;
        profit: number;
        count: number;
        dayR: number;
      }>;
      const pnl = slice.reduce((sum, d) => sum + d.profit, 0);
      const r = slice.reduce((sum, d) => sum + d.dayR, 0);
      const trades = slice.reduce((sum, d) => sum + d.count, 0);
      const firstDay = slice[0]?.dayNumber;
      const lastDay = slice[slice.length - 1]?.dayNumber;
      return {
        week: w + 1,
        pnl,
        r,
        trades,
        rangeLabel:
          firstDay && lastDay
            ? `${monthStart.toLocaleDateString("en-US", {
                month: "short",
              })} ${firstDay}-${lastDay}`
            : `${monthStart.toLocaleDateString("en-US", { month: "short" })}`,
      };
    });
  const annualMonthMap: Record<
    string,
    {
      pnl: number;
      trades: number;
      r: number;
    }
  > = {};
  trades.forEach((t) => {
    const d = parseTradeDateLocal(t.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== performanceYear) return;
    const monthIndex = d.getMonth();
    const monthKey = String(monthIndex);
    if (!annualMonthMap[monthKey]) {
      annualMonthMap[monthKey] = { pnl: 0, trades: 0, r: 0 };
    }
    const p = Number(t.profit);
    const r = getR(p, Number(t.risk));
    annualMonthMap[monthKey].pnl += p;
    annualMonthMap[monthKey].trades += 1;
    annualMonthMap[monthKey].r += r;
  });
  let runningYearPnl = 0;
  const monthlyPerformanceDetailedData = Array.from({ length: 12 }, (_, monthIndex) => {
    const bucket = annualMonthMap[String(monthIndex)] ?? {
      pnl: 0,
      trades: 0,
      r: 0,
    };
    runningYearPnl += bucket.pnl;
    return {
      monthLabel: new Date(performanceYear, monthIndex, 1).toLocaleDateString(
        "en-US",
        { month: "short" },
      ),
      pnl: bucket.pnl,
      cumPnl: runningYearPnl,
      trades: bucket.trades,
      r: bucket.r,
    };
  });
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

  const sectionTitleStyle =
    "font-serif text-sm font-bold text-[--at-accent] tracking-[0.15em] uppercase";

  const goalProgress = (totalProfit / profitGoal) * 100;

  return (
    <div className="min-h-screen font-cyber pb-20 selection:bg-[--at-accent]/30">
      <div className="mx-auto max-w-7xl p-4 lg:p-8 space-y-10">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-[--rule] pb-10">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-[--at-accent]/10 rounded-2xl border border-[--at-accent]/20">
              <Hexagon className="h-8 w-8 text-[--at-accent]" />
            </div>
            <div>
              <h1 className="text-3xl font-arcade text-[--at-accent] leading-tight tracking-wider uppercase">
                Trading Terminal
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex bg-[--at-bg] p-1 rounded-xl border border-[--rule]">
              <Button
                variant="ghost"
                size="sm"
                onClick={exportJSON}
                className="text-[--ink2] hover:text-[--ink] hover:bg-[--at-accent]/5 rounded-lg px-4"
              >
                <Download className="mr-2 h-4 w-4" /> EXPORT
              </Button>
              <div className="w-px h-4 bg-[--rule] my-auto mx-1" />
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-[--ink2] hover:text-[--ink] hover:bg-[--at-accent]/5 rounded-lg px-4"
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
              className="border-[--at-accent]/20 text-[--at-accent]/70 hover:text-[--at-accent] hover:bg-[--at-accent]/10 hover:border-[--at-accent]/40 rounded-xl px-4 transition-all"
            >
              <LogOut className="mr-2 h-4 w-4" /> DISCONNECT
            </Button>
          </div>
        </header>

        {/* TABS */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-[--at-bg] border border-[--rule] p-1 rounded-2xl h-14">
            <TabsTrigger
              value="dashboard"
              className="rounded-xl font-arcade text-[10px] data-[state=active]:bg-[--at-accent] data-[state=active]:text-[--at-bg] transition-all"
            >
              <Activity className="mr-2 h-4 w-4" />
              DASHBOARD
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="rounded-xl font-arcade text-[10px] data-[state=active]:bg-[--at-accent] data-[state=active]:text-[--at-bg] transition-all"
            >
              <LineChartIcon className="mr-2 h-4 w-4" />
              ANALYTICS
            </TabsTrigger>
          </TabsList>

        <TabsContent value="dashboard" className="space-y-12 mt-10">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                  Profit
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-[--at-neg]" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold font-cyber ${globalProfit >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                >
                  {globalProfit >= 0 ? "+" : "-"}$
                  {Math.abs(globalProfit).toLocaleString()}
                </div>
                <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                  Overall net performance
                </p>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                  Win Rate
                </CardTitle>
                <Target className="h-4 w-4 text-[--at-pos]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[--at-pos] font-cyber">
                  {globalWinRate}%
                </div>
                <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                  {globalCount} trades executed
                </p>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                  Profit Goal
                </CardTitle>
                <Zap className="h-4 w-4 text-[--at-accent]" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end justify-between">
                  <div
                    className="text-3xl font-bold text-[--at-accent] font-cyber cursor-pointer group flex items-center gap-2"
                    onClick={() => setShowGoalInput(true)}
                  >
                    {goalProgress.toFixed(1)}%
                    <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-[--ink3] font-mono">
                    / ${profitGoal.toLocaleString()}
                  </div>
                </div>
                <div className="h-1.5 w-full bg-[--at-bg] rounded-full overflow-hidden border border-[--rule]">
                  <motion.div
                    className="h-full bg-[--at-accent]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                  <MetricHint label="R-multiple">
                    Sum of R values: each trade result divided by max loss
                    (risk). The total shows how many risk units were gained or
                    lost overall.
                  </MetricHint>
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-[--at-pos]" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold font-cyber ${globalTotalR >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                >
                  {formatR(globalTotalR)}
                </div>
                <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                  Total R-multiple generated
                </p>
              </CardContent>
            </Card>
          </section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2 px-2">
                <Plus className="h-5 w-5 text-[--at-neg]" />
                <h2 className={sectionTitleStyle}>Add New Trade</h2>
              </div>
              <Card className="cyber-card border-[--rule] bg-[--at-surface] rounded-2xl">
                <CardContent className="p-8">
                  <form
                    onSubmit={addTrade}
                    className="grid gap-8 md:grid-cols-2 lg:grid-cols-4"
                  >
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Calendar className="h-4 w-4 text-[--at-pos]" /> Date
                      </Label>
                      <Input
                        name="date"
                        type="date"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        defaultValue={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Clock className="h-4 w-4 text-[--at-accent]" /> Entry Time
                      </Label>
                      <Input
                        name="entry_time"
                        type="time"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        value={entryTime}
                        onChange={(e) => setEntryTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Target className="h-4 w-4 text-[--at-neg]" /> Asset
                        (Actif)
                      </Label>
                      <Input
                        name="actif"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        placeholder="e.g. BTC/USD"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Clock className="h-4 w-4 text-[--at-pos]" /> Timeframe
                      </Label>
                      <Select name="timeframe" defaultValue="1H">
                        <SelectTrigger className="bg-[--at-bg] border-[--rule] rounded-xl h-11 text-[--ink]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
                          {timeframes.map((tf) => (
                            <SelectItem
                              key={tf}
                              value={tf}
                              className="hover:bg-[--at-accent]/20 focus:bg-[--at-accent]/20"
                            >
                              {tf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Activity className="h-4 w-4 text-[--at-neg]" /> Type
                      </Label>
                      <Select name="type" defaultValue="long">
                        <SelectTrigger className="bg-[--at-bg] border-[--rule] rounded-xl h-11 text-[--ink]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
                          <SelectItem value="long" className="text-[--at-pos]">
                            Long
                          </SelectItem>
                          <SelectItem
                            value="short"
                            className="text-[--at-neg]"
                          >
                            Short
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <TrendingUp className="h-4 w-4 text-[--at-pos]" /> Result
                        ($)
                      </Label>
                      <Input
                        name="profit"
                        type="number"
                        step="0.01"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <ShieldAlert className="h-4 w-4 text-[--at-neg]" /> Max
                        Loss ($)
                      </Label>
                      <Input
                        name="risk"
                        type="number"
                        step="0.01"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        placeholder="100.00"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Wallet className="h-4 w-4 text-[--at-pos]" /> Account
                      </Label>
                      <Input
                        name="compte"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        placeholder="e.g. Main"
                        required
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] flex items-center gap-3 uppercase font-semibold">
                        <Layers className="h-4 w-4 text-[--at-neg]" /> Strategy
                      </Label>
                      <Input
                        name="strategie"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] rounded-xl focus:ring-[--at-accent]/20 h-11"
                        placeholder="e.g. Trend Follow"
                        required
                      />
                    </div>
                    <div className="space-y-4 md:col-span-2 lg:col-span-4">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] uppercase font-semibold">
                        Observations
                      </Label>
                      <Textarea
                        name="observations"
                        className="bg-[--at-bg] border-[--rule] text-[--ink] min-h-[120px] rounded-2xl p-4 focus:ring-[--at-accent]/20"
                        placeholder="Analyze market behavior, emotional state, and core learnings..."
                      />
                      <p className="text-[8px] text-[--ink3] font-arcade tracking-wider mt-2 uppercase">
                        CTRL+V TO PASTE SCREENSHOTS
                      </p>
                    </div>
                    <div className="space-y-4 md:col-span-2 lg:col-span-3">
                      <Label className="font-arcade text-[10px] text-[--ink] tracking-[0.1em] uppercase font-semibold">
                        Photos (Max 3)
                      </Label>
                      <div className="flex flex-wrap gap-5 mt-2">
                        {selectedPhotos.map((url, i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="relative w-28 h-28 border border-[--rule] rounded-2xl overflow-hidden group"
                          >
                            <img
                              src={url}
                              className="w-full h-full object-cover"
                              alt="Intel"
                            />
                            <div className="absolute inset-0 bg-[--at-surface] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPhotos(
                                    selectedPhotos.filter(
                                      (_, idx) => idx !== i,
                                    ),
                                  )
                                }
                                className="p-2 bg-[--at-accent]/80 text-[--ink] rounded-xl hover:bg-[--at-accent] transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                        {selectedPhotos.length < 3 && (
                          <Label className="flex flex-col items-center justify-center w-28 h-28 border-2 border-dashed border-[--rule] rounded-2xl cursor-pointer hover:border-[--at-accent]/50 hover:bg-[--at-accent]/5 transition-all group">
                            {uploading ? (
                              <Loader2 className="animate-spin h-6 w-6 text-[--at-accent]" />
                            ) : (
                              <Plus className="h-7 w-7 text-[--ink3] group-hover:text-[--at-accent] group-hover:scale-110 transition-transform" />
                            )}
                            <span className="text-[8px] mt-2 text-[--ink3] group-hover:text-[--at-accent] font-arcade uppercase tracking-tighter">
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
                        className="w-full bg-[--at-accent] hover:bg-[--at-accent]/80 text-[--at-bg] font-arcade text-[11px] h-14 rounded-2xl transition-all active:scale-[0.98]"
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
                <History className="h-5 w-5 text-[--at-accent]" />
                <h2 className={sectionTitleStyle}>Recent Trades</h2>
              </div>
              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-left text-[12px] font-cyber">
                      <thead>
                        <tr className="border-b border-[--rule] bg-[--at-surface] text-[--at-pos] font-bold font-arcade text-[9px] tracking-[0.2em]">
                          <th className="py-6 px-6">Date</th>
                          <th className="py-6 px-6">Hour</th>
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
                                colSpan={9}
                                className="py-20 text-center text-[--ink3] font-arcade text-[10px] tracking-widest uppercase"
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
                                  className="border-b border-[--rule] hover:bg-[--at-accent]/5 transition-all group cursor-pointer relative"
                                  onClick={() => setSelectedTrade(trade)}
                                >
                                  <td className="py-6 px-6 text-[--ink] font-mono tracking-tighter">
                                    {new Date(trade.date).toLocaleDateString()}
                                  </td>
                                  <td className="py-6 px-6 text-[--ink2] font-mono tracking-tighter">
                                    {formatTradeTime(trade.date)}
                                  </td>
                                  <td className="py-6 px-6 text-[--ink] font-bold">
                                    {trade.actif}
                                  </td>
                                  <td className="py-6 px-6 text-[--ink2]">
                                    {trade.timeframe}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold uppercase text-[10px] ${trade.type === "long" ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                                  >
                                    {trade.type === "long" ? "Long" : "Short"}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold ${Number(trade.profit) >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                                  >
                                    {Number(trade.profit) >= 0 ? "+" : "-"}$
                                    {Math.abs(
                                      Number(trade.profit),
                                    ).toLocaleString()}
                                  </td>
                                  <td
                                    className={`py-6 px-6 font-bold ${getR(Number(trade.profit), Number(trade.risk)) >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
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
                                            className="w-8 h-8 object-cover rounded-lg border border-[--rule] transition-transform hover:scale-110 hover:z-10"
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
                                        className="text-[--ink3] hover:text-[--ink] hover:bg-[--at-accent]/10 rounded-lg"
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
                                        className="text-[--ink3] hover:text-[--at-neg] hover:bg-[--at-accent]/10 rounded-lg"
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
            {/* Filters */}
            <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Filter className="h-4 w-4 text-[--at-accent]" />
                  <h3 className="font-arcade text-[9px] text-[--ink2] uppercase tracking-wider">
                    Filters
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="ml-auto text-[--ink3] hover:text-[--ink] h-7 px-3 font-arcade text-[8px]"
                  >
                    <RefreshCw className="h-3 w-3 mr-2" /> RESET
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label className="font-arcade text-[8px] text-[--ink3] uppercase">
                      Strategy
                    </Label>
                    <Select
                      value={filterStrategy}
                      onValueChange={setFilterStrategy}
                    >
                      <SelectTrigger className="bg-[--at-bg] border-[--rule] h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
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
                    <Label className="font-arcade text-[8px] text-[--ink3] uppercase">
                      Account
                    </Label>
                    <Select
                      value={filterAccount}
                      onValueChange={setFilterAccount}
                    >
                      <SelectTrigger className="bg-[--at-bg] border-[--rule] h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
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
                    <Label className="font-arcade text-[8px] text-[--ink3] uppercase">
                      Type
                    </Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="bg-[--at-bg] border-[--rule] h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2 lg:col-span-1">
                    <Label className="font-arcade text-[8px] text-[--ink3] uppercase">
                      Time Range
                    </Label>
                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={filterRange === "24h" ? "default" : "ghost"}
                        onClick={() => setFilterRange("24h")}
                        className="h-9 rounded-xl px-0 text-[11px] font-cyber tracking-wide"
                      >
                        24H
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={filterRange === "7d" ? "default" : "ghost"}
                        onClick={() => setFilterRange("7d")}
                        className="h-9 rounded-xl px-0 text-[11px] font-cyber tracking-wide"
                      >
                        7D
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={filterRange === "30d" ? "default" : "ghost"}
                        onClick={() => setFilterRange("30d")}
                        className="h-9 rounded-xl px-0 text-[11px] font-cyber tracking-wide"
                      >
                        30D
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={filterRange === "all" ? "default" : "ghost"}
                        onClick={() => setFilterRange("all")}
                        className="h-9 rounded-xl px-0 text-[11px] font-cyber tracking-wide"
                      >
                        ALL
                      </Button>
                    </div>
                  </div>
                </div>
                {(filterStrategy !== "all" ||
                  filterAccount !== "all" ||
                  filterType !== "all" ||
                  filterRange !== "all") && (
                  <div className="mt-4 text-[9px] text-[--at-accent] font-arcade uppercase">
                    Showing {filteredTrades.length} of {trades.length} trades
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Equity Curve */}
            {equityCurve.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="mb-2 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-[--at-accent]" />
                    <div className="flex flex-col gap-0.5">
                      <h2 className={sectionTitleStyle}>Equity Curve</h2>
                      <span className="font-cyber text-[11px] tracking-wide text-[--ink3]">
                        Solde reel = capital initial + P/L cumule (trades filtres)
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Label
                      htmlFor="starting-balance"
                      className="whitespace-nowrap font-arcade text-[8px] uppercase text-[--ink3]"
                    >
                      Capital initial ($)
                    </Label>
                    <Input
                      id="starting-balance"
                      type="number"
                      min={0}
                      step={100}
                      className="h-9 w-[7.5rem] rounded-xl border-[--rule] bg-[--at-bg] text-sm"
                      value={startingBalance}
                      onChange={(e) =>
                        setStartingBalance(Number(e.target.value) || 0)
                      }
                      onBlur={() => {
                        if (user) {
                          localStorage.setItem(
                            `startingBalance_${user.id}`,
                            String(startingBalance),
                          );
                        }
                      }}
                    />
                  </div>
                </div>
                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
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
                              stopColor="#7d2b1d"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#7d2b1d"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.08)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="rgba(0,0,0,0.15)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "#4a4540" }}
                        />
                        <YAxis
                          stroke="rgba(0,0,0,0.15)"
                          style={{ fontSize: "10px", fontFamily: "monospace" }}
                          tick={{ fill: "#4a4540" }}
                          tickFormatter={(value) =>
                            `$${value.toLocaleString()}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fbf8f1",
                            border: "1px solid #d9d3c4",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            boxShadow: "none",
                          }}
                          labelStyle={{ color: "#7d2b1d", fontWeight: "bold" }}
                          formatter={(value: any) => [
                            `$${Number(value).toLocaleString()}`,
                            "Solde",
                          ]}
                        />
                        <Area
                          type="stepAfter"
                          dataKey="balance"
                          stroke="#7d2b1d"
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

            {/* Performance Metrics */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                    Profit
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-[--at-neg]" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold font-cyber ${totalProfit >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"} `}
                  >
                    {totalProfit >= 0 ? "+" : "-"}$
                    {Math.abs(totalProfit).toLocaleString()}
                  </div>
                  <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                    Net performance
                  </p>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                    Win Rate
                  </CardTitle>
                  <Target className="h-4 w-4 text-[--at-pos]" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-[--at-pos] font-cyber ">
                    {winRate}%
                  </div>
                  <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                    {filteredTrades.length} trades
                  </p>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                    Profit Goal
                  </CardTitle>
                  <Zap className="h-4 w-4 text-[--at-accent]" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div
                      className="text-3xl font-bold text-[--at-accent] font-cyber cursor-pointer group flex items-center gap-2"
                      onClick={() => setShowGoalInput(true)}
                    >
                      {goalProgress.toFixed(1)}%
                      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-[10px] text-[--ink3] font-mono">
                      / ${profitGoal.toLocaleString()}
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-[--at-bg] rounded-full overflow-hidden border border-[--rule]">
                    <motion.div
                      className="h-full bg-[--at-accent]"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="font-arcade text-[10px] text-[--ink3] uppercase tracking-widest">
                    <MetricHint label="R-multiple">
                      Idem que le ratio R : somme des (profit ÷ risque) sur
                      les trades correspondant aux filtres. Compare la
                      performance en multiples de risque, pas seulement en
                      dollars.
                    </MetricHint>
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-[--at-pos]" />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold font-cyber ${totalR >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                  >
                    {formatR(totalR)}
                  </div>
                  <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase tracking-tighter">
                    Total R-multiple
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Advanced Stats */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 mb-2 px-2">
                <Activity className="h-5 w-5 text-[--at-neg]" />
                <h2 className={sectionTitleStyle}>Advanced Analytics</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      <MetricHint label="Max drawdown">
                        Largest equity decline from a previous peak (starting
                        balance + cumulative P/L on filtered trades). Measures
                        worst capital pullback.
                      </MetricHint>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[--at-neg] font-cyber">
                      -${maxDrawdown.toLocaleString()}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Largest capital decline
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Best Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {bestTrade ? (
                      <>
                        <div className="text-2xl font-bold text-[--at-pos] font-cyber">
                          +${Number(bestTrade.profit).toLocaleString()}
                        </div>
                        <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                          {bestTrade.actif} •{" "}
                          {new Date(bestTrade.date).toLocaleDateString()}
                        </p>
                      </>
                    ) : (
                      <div className="text-[--ink3] font-arcade text-[9px]">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Worst Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {worstTrade ? (
                      <>
                        <div className="text-2xl font-bold text-[--at-neg] font-cyber">
                          ${Number(worstTrade.profit).toLocaleString()}
                        </div>
                        <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                          {worstTrade.actif} •{" "}
                          {new Date(worstTrade.date).toLocaleDateString()}
                        </p>
                      </>
                    ) : (
                      <div className="text-[--ink3] font-arcade text-[9px]">
                        No data
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Win Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[--at-pos] font-cyber">
                      {bestStreak}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Consecutive wins
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Loss Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[--at-neg] font-cyber">
                      {Math.abs(worstStreak)}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Consecutive losses
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Current Streak
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`text-2xl font-bold font-cyber ${currentStreak >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                    >
                      {currentStreak > 0 ? "+" : ""}
                      {currentStreak}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      {currentStreak > 0
                        ? "Winning"
                        : currentStreak < 0
                          ? "Losing"
                          : "Neutral"}
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      <MetricHint label="Sharpe ratio">
                        Here: average P/L divided by P/L standard deviation
                        (filtered series). Higher means better return relative
                        to variability. This is not an annualized institutional
                        Sharpe.
                      </MetricHint>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-cyber ${sharpeRatio >= 1 ? 'text-[--at-pos]' : sharpeRatio >= 0 ? 'text-[--at-accent]' : 'text-[--at-neg]'}`}>
                      {sharpeRatio.toFixed(2)}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">Risk-adjusted return</p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Average Loss
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[--at-neg] font-cyber">
                      -${Math.abs(avgLoss).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Mean loser size
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Average RRR
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-cyber ${averageRRR >= 1 ? "text-[--at-pos]" : "text-[--at-accent]"}`}>
                      {averageRRR.toFixed(2)}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Avg win / avg loss
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Expectancy
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-cyber ${expectancy >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                      {expectancy >= 0 ? "+" : "-"}$
                      {Math.abs(expectancy).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Expected value per trade
                    </p>
                  </CardContent>
                </Card>

                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="font-arcade text-[9px] text-[--ink3] uppercase tracking-wider">
                      Profit Factor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold font-cyber ${profitFactor >= 1 ? "text-[--at-pos]" : "text-[--at-neg]"}`}>
                      {profitFactor.toFixed(2)}
                    </div>
                    <p className="text-[9px] text-[--ink3] mt-2 font-arcade uppercase">
                      Gross profit / gross loss
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Monthly Performance with weekly precision */}
            {monthlyPerformanceDetailedData.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="space-y-6"
              >
                <div className="mb-2 flex flex-col gap-3 px-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-[--at-pos]" />
                    <h2 className={sectionTitleStyle}>Monthly Performance</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPerformanceYear((y) => y - 1)}
                      className="h-8 w-8 rounded-lg border border-[--rule]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-[90px] text-center text-[11px] font-arcade uppercase tracking-wider text-[--ink2]">
                      {performanceYear}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPerformanceYear((y) => y + 1)}
                      className="h-8 w-8 rounded-lg border border-[--rule]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                  <CardContent className="p-8">
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart
                        data={monthlyPerformanceDetailedData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.08)"
                        />
                        <XAxis
                          dataKey="monthLabel"
                          stroke="rgba(0,0,0,0.15)"
                          style={{ fontSize: "11px", fontFamily: "monospace" }}
                          tick={{ fill: "#4a4540" }}
                        />
                        <YAxis
                          stroke="rgba(0,0,0,0.15)"
                          style={{ fontSize: "11px", fontFamily: "monospace" }}
                          tick={{ fill: "#4a4540" }}
                          tickFormatter={(value) =>
                            `$${value.toLocaleString()}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#fbf8f1",
                            border: "1px solid #d9d3c4",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontFamily: "monospace",
                            boxShadow: "none",
                          }}
                          formatter={(value: any, _name: any, item: any) => {
                            const payload = item?.payload;
                            return [
                              `$${Number(value).toLocaleString()} • YTD: $${Number(payload?.cumPnl ?? 0).toLocaleString()} • ${payload?.trades ?? 0} trade${(payload?.trades ?? 0) > 1 ? "s" : ""} • ${formatR(payload?.r ?? 0)}`,
                              "Month result",
                            ];
                          }}
                          labelStyle={{ color: "#7d2b1d", fontWeight: "bold" }}
                        />
                        <Bar
                          dataKey="pnl"
                          maxBarSize={52}
                          radius={[12, 12, 0, 0]}
                          animationDuration={1500}
                        >
                          {monthlyPerformanceDetailedData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.pnl >= 0 ? "#3a6e3f" : "#7d2b1d"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.section>
            )}

            {/* Calendar View - Monthly */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <div className="mb-2 flex flex-col gap-3 px-2 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-[--at-accent]" />
                  <h2 className={sectionTitleStyle}>Trading Calendar</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                    className="h-8 w-8 rounded-lg border border-[--rule]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[150px] text-center text-[11px] font-arcade uppercase tracking-wider text-[--ink2]">
                    {monthStart.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCalendarMonth(
                        new Date(
                          calendarMonth.getFullYear(),
                          calendarMonth.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                    className="h-8 w-8 rounded-lg border border-[--rule]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Card className="cyber-card bg-[--at-surface] border-[--rule] rounded-2xl">
                <CardContent className="p-4 md:p-6">
                  <div className="overflow-x-auto">
                    <div className="min-w-[980px] space-y-2">
                      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_220px] gap-2">
                        {weekdayLabels.map((label) => (
                          <div
                            key={label}
                            className="py-1 text-center text-[10px] font-cyber uppercase tracking-wider text-[--ink3]"
                          >
                            {label}
                          </div>
                        ))}
                        <div className="py-1 text-center text-[10px] font-cyber uppercase tracking-wider text-[--ink3]">
                          Weekly Summary
                        </div>
                      </div>
                      {calendarRows.map((row, rowIndex) => {
                        const week = monthWeekSummaries[rowIndex];
                        return (
                          <div
                            key={`week-row-${rowIndex}`}
                            className="grid grid-cols-[repeat(7,minmax(0,1fr))_220px] gap-2"
                          >
                            {row.map((day, i) => {
                          if (!day) {
                            return (
                              <div
                                key={`empty-${rowIndex}-${i}`}
                                className="aspect-square rounded-lg border border-[--rule] bg-[--at-surface]"
                              />
                            );
                          }
                          const intensity = day.count
                            ? Math.min(Math.abs(day.profit) / 500, 1)
                            : 0;
                          const colorClass =
                            day.count === 0
                              ? "bg-[--at-surface]"
                              : day.profit >= 0
                                ? "bg-[--at-pos]/40"
                                : "bg-[--at-neg]/40";
                              return (
                                <div
                                  key={day.key}
                                  className={`relative aspect-square rounded-lg border border-[--rule] ${colorClass} p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]`}
                                  style={{
                                    opacity: day.count === 0 ? 0.35 : 0.62 + intensity * 0.3,
                                  }}
                                  title={`${new Date(day.key + "T12:00:00").toLocaleDateString("fr-FR")}\n${day.count} trade(s)\nP/L: ${day.profit >= 0 ? "+" : ""}$${day.profit.toLocaleString()}\nR: ${formatR(day.dayR)}`}
                                >
                                  <div className="absolute left-1.5 top-1 text-[10px] font-bold text-[--ink]">
                                    {day.dayNumber}
                                  </div>
                                  {day.count > 0 && (
                                    <div className="absolute inset-x-1.5 top-[24%] bottom-1.5 rounded-md bg-[--at-surface] p-1 text-center flex flex-col items-center justify-center gap-1">
                                      <div className="text-[11px] font-bold text-[--ink]">
                                        {day.count} trade{day.count > 1 ? "s" : ""}
                                      </div>
                                      <div className="text-[11px] font-mono text-[--ink]">
                                        {day.profit >= 0 ? "+" : ""}${Math.abs(day.profit).toLocaleString()}
                                      </div>
                                      <div className="text-[11px] font-mono text-[--at-accent]">
                                        {formatR(day.dayR)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="rounded-xl border border-[--rule] bg-[--at-surface] px-3 py-2">
                              <div className="text-[9px] font-arcade uppercase text-[--ink3]">
                                Week {week.week} • {week.rangeLabel}
                              </div>
                              <div className="mt-1 text-[12px] text-[--ink]">
                                {week.pnl >= 0 ? "+" : "-"}${Math.abs(week.pnl).toLocaleString()}
                              </div>
                              <div className="text-[11px] text-[--at-accent]">{formatR(week.r)}</div>
                              <div className="text-[11px] text-[--ink2]">
                                {week.trades} trade{week.trades > 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showGoalInput} onOpenChange={setShowGoalInput}>
        <DialogContent className="max-w-md bg-[--at-surface] border-[--rule] text-[--ink] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-arcade text-[11px] uppercase tracking-wider">
              Edit Profit Goal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
              Goal Amount ($)
            </Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={profitGoal}
              onChange={(e) => setProfitGoal(Number(e.target.value) || 0)}
              className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="ghost"
              onClick={() => setShowGoalInput(false)}
              className="font-arcade text-[10px]"
            >
              Cancel
            </Button>
            <Button
              onClick={saveGoal}
              className="bg-[--at-accent] hover:bg-[--at-accent]/80 text-[--at-bg] font-arcade text-[10px]"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PHOTO PREVIEW MODAL */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-[--at-bg]/95 border-none shadow-none flex flex-col justify-center items-center">
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
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-xl"
              />
            </AnimatePresence>

            {previewPhoto && previewPhoto.photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-10 top-1/2 -translate-y-1/2 w-16 h-16 bg-[--at-bg] text-[--ink] hover:bg-[--at-accent]/20 rounded-2xl border border-[--rule]"
                  onClick={prevPhoto}
                >
                  <ChevronLeft className="h-10 w-10" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-10 top-1/2 -translate-y-1/2 w-16 h-16 bg-[--at-bg] text-[--ink] hover:bg-[--at-accent]/20 rounded-2xl border border-[--rule]"
                  onClick={nextPhoto}
                >
                  <ChevronRight className="h-10 w-10" />
                </Button>
              </>
            )}

            <DialogClose className="absolute top-10 right-10 p-4 bg-[--at-bg] text-[--ink] hover:bg-[--at-accent]/80 hover:text-[--ink] rounded-2xl border border-[--rule] transition-all active:scale-90">
              <X className="h-8 w-8" />
            </DialogClose>
          </motion.div>
          {previewPhoto && previewPhoto.photos.length > 1 && (
            <div className="p-8 flex justify-center gap-4 bg-[--at-surface] border-t border-[--rule] w-full">
              {previewPhoto.photos.map((url, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.1 }}
                  className={`w-20 h-20 border-2 rounded-xl overflow-hidden cursor-pointer transition-all ${i === previewPhoto.index ? "border-[--at-accent] scale-110" : "border-transparent opacity-40"}`}
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
        <DialogContent className="flex max-h-[min(90vh,56rem)] w-[min(95vw,42rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-3xl border-[--rule] bg-[--at-surface] p-0 text-[--ink] cyber-card">
          <div
            className={`h-2 w-full shrink-0 bg-[--at-accent]`}
          />

          <DialogHeader className="shrink-0 px-8 pb-2 pt-8">
            <DialogTitle className="flex items-start gap-4 text-left font-cyber text-[--ink] sm:items-center">
              <div
                className={`shrink-0 rounded-xl border border-[--rule] bg-[--at-bg] p-2.5 ${isEditing ? "text-[--at-accent]" : "text-[--at-neg]"}`}
              >
                {isEditing ? (
                  <Edit2 className="h-5 w-5" />
                ) : (
                  <Activity className="h-5 w-5" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-arcade text-[10px] uppercase tracking-[0.22em] text-[--ink3]">
                  {isEditing ? "Edit trade" : "Trade details"}
                </span>
                {selectedTrade && (
                  <>
                    <span className="truncate text-lg font-semibold tracking-wide text-[--ink]">
                      {selectedTrade.actif}
                    </span>
                    <span className="text-[11px] text-[--ink3]">
                      {new Date(selectedTrade.date).toLocaleDateString("fr-FR")}{" "}
                      · {formatTradeTime(selectedTrade.date)} ·{" "}
                      {selectedTrade.timeframe}
                    </span>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedTrade && (
            <>
              <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-8 py-4">
              {isEditing ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Date
                    </Label>
                    <Input
                      type="date"
                      value={getDateInputValue(editData?.date)}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          date: buildTradeDateTime(
                            e.target.value,
                            getTimeInputValue(editData?.date),
                          ),
                        })
                      }
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Entry Time
                    </Label>
                    <Input
                      type="time"
                      value={getTimeInputValue(editData?.date)}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          date: buildTradeDateTime(
                            getDateInputValue(editData?.date),
                            e.target.value,
                          ),
                        })
                      }
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Asset
                    </Label>
                    <Input
                      value={editData?.actif}
                      onChange={(e) =>
                        setEditData({ ...editData, actif: e.target.value })
                      }
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Timeframe
                    </Label>
                    <Select
                      value={editData?.timeframe}
                      onValueChange={(v) =>
                        setEditData({ ...editData, timeframe: v })
                      }
                    >
                      <SelectTrigger className="bg-[--at-bg] border-[--rule] rounded-xl h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
                        {timeframes.map((tf) => (
                          <SelectItem key={tf} value={tf}>
                            {tf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Type
                    </Label>
                    <Select
                      value={editData?.type}
                      onValueChange={(v) => setEditData({ ...editData, type: v })}
                    >
                      <SelectTrigger className="bg-[--at-bg] border-[--rule] rounded-xl h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[--at-surface] border-[--rule] rounded-xl">
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
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
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
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
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Account
                    </Label>
                    <Input
                      value={editData?.compte}
                      onChange={(e) =>
                        setEditData({ ...editData, compte: e.target.value })
                      }
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Strategy
                    </Label>
                    <Input
                      value={editData?.strategie}
                      onChange={(e) =>
                        setEditData({ ...editData, strategie: e.target.value })
                      }
                      className="bg-[--at-bg] border-[--rule] rounded-xl h-11"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
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
                      className="bg-[--at-bg] border-[--rule] rounded-xl min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-arcade text-[9px] text-[--ink3] uppercase">
                      Photos (Max 3)
                    </Label>
                    <div className="flex flex-wrap gap-4 mt-2">
                      {editData.photos?.map((url: string, i: number) => (
                        <div
                          key={i}
                          className="relative w-20 h-20 border border-[--rule] rounded-xl overflow-hidden group"
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
                            className="absolute inset-0 bg-[--at-accent]/80 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {editData.photos?.length < 3 && (
                        <Label className="flex items-center justify-center w-20 h-20 border-2 border-dashed border-[--rule] rounded-xl cursor-pointer hover:border-[--at-accent] transition-all">
                          {uploading ? (
                            <Loader2 className="animate-spin h-5 w-5" />
                          ) : (
                            <Plus className="h-5 w-5 text-[--ink3]" />
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
                      <div className="flex items-center gap-2 text-[--ink3]">
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
                      <div className="flex items-center gap-2 text-[--ink3]">
                        <Target className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Asset
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-bold text-[--at-pos] tracking-wide">
                        {selectedTrade.actif}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[--ink3]">
                        <Clock className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Time
                        </span>
                      </div>
                      <p className="font-cyber text-sm font-medium">
                        {formatTradeTime(selectedTrade.date)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[--ink3]">
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
                      <div className="flex items-center gap-2 text-[--ink3]">
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
                      <div className="flex items-center gap-2 text-[--ink3]">
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
                      <div className="flex items-center gap-2 text-[--ink3]">
                        <ShieldAlert className="h-3 w-3" />
                        <span className="font-arcade text-[8px] uppercase tracking-widest">
                          Profit / R
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={`font-cyber text-lg font-bold ${Number(selectedTrade.profit) >= 0 ? "text-[--at-pos]" : "text-[--at-neg]"}`}
                        >
                          {Number(selectedTrade.profit) >= 0 ? "+" : ""}$
                          {Number(selectedTrade.profit).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? "text-[--at-pos]/50" : "text-[--at-neg]/50"}`}
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
                    <div className="space-y-3 p-6 bg-[--at-surface] rounded-2xl border border-[--rule]">
                      <div className="font-arcade text-[8px] text-[--ink3] tracking-[0.2em] uppercase">
                        Observations
                      </div>
                      <p className="text-sm text-[--ink] leading-relaxed font-cyber whitespace-pre-wrap">
                        {selectedTrade.observations}
                      </p>
                    </div>
                  )}

                  {selectedTrade.photos?.length > 0 && (
                    <div className="space-y-4">
                      <div className="font-arcade text-[8px] text-[--ink3] tracking-[0.2em] uppercase">
                        Photos
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {selectedTrade.photos.map((url: string, i: number) => (
                          <motion.div
                            key={i}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative aspect-video rounded-xl overflow-hidden border border-[--rule] cursor-zoom-in group"
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
                            <div className="absolute inset-0 bg-[--at-accent]/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <Maximize2 className="text-[--ink] h-5 w-5" />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>

              <DialogFooter className="shrink-0 flex-col gap-4 border-t border-[--rule] bg-[--at-surface] px-8 py-4 sm:flex-row">
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      className="flex-1 font-arcade text-[10px] h-12 rounded-xl text-[--ink3] hover:text-[--ink]"
                      onClick={() => {
                        setIsEditing(false);
                        setEditData(null);
                      }}
                    >
                      CANCEL
                    </Button>
                    <Button
                      className="flex-1 bg-[--at-accent] hover:bg-[--at-accent]/80 text-[--at-bg] font-arcade text-[10px] h-12 rounded-xl transition-all active:scale-[0.98]"
                      onClick={handleUpdateTrade}
                    >
                      <Save className="mr-2 h-4 w-4" /> SAVE CHANGES
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 border-[--at-accent]/20 text-[--at-neg]/70 hover:bg-[--at-accent]/10 font-arcade text-[10px] h-12 rounded-xl"
                      onClick={() => deleteTrade(selectedTrade.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> DELETE
                    </Button>
                    <Button
                      className="flex-1 bg-[--at-accent] hover:bg-[--at-accent]/80 text-[--at-bg] font-arcade text-[10px] h-12 rounded-xl"
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
