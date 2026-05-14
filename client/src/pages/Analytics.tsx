import { useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
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
          style={{
            position: "relative", zIndex: 20, display: "inline-flex", cursor: "help",
            alignItems: "center", gap: 4, borderBottom: "1px dotted color-mix(in srgb, var(--ink3) 40%, transparent)",
            textAlign: "left",
          }}
          tabIndex={0}
        >
          {label}
          <HelpCircle style={{ width: 12, height: 12, flexShrink: 0, color: "var(--ink3)" }} aria-hidden />
        </span>
      </HintTrigger>
      <HintContent
        side="top"
        sideOffset={8}
        className="z-[9999]"
        style={{
          minWidth: 260, maxWidth: 420, borderRadius: 0,
          border: "1px solid var(--rule)", background: "var(--at-surface)",
          padding: "12px 16px", textAlign: "left", fontSize: 12,
          fontFamily: "var(--font-serif)", fontWeight: 500, lineHeight: 1.6,
          letterSpacing: "normal", textTransform: "none", color: "var(--ink)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
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
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--at-bg)" }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 style={{ width: 48, height: 48, color: "var(--at-accent)" }} />
        </motion.div>
      </div>
    );

  if (!user) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--at-bg)", overflow: "hidden" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ width: "100%", maxWidth: 420 }}
        >
          <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 0 }}>
            <div style={{ padding: "36px 32px 0 32px", textAlign: "center" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>
                Trading actif
              </div>
              <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>
                Connexion
              </h1>
            </div>
            <div style={{ padding: "28px 32px 36px 32px" }}>
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 13, border: "1px solid var(--rule)", background: "var(--at-bg)", color: "var(--ink)", borderRadius: 0, height: 44, padding: "0 12px" }}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>
                    Password
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 13, border: "1px solid var(--rule)", background: "var(--at-bg)", color: "var(--ink)", borderRadius: 0, height: 44, padding: "0 12px" }}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                  <button
                    type="submit"
                    style={{
                      width: "100%", padding: "14px 0", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                      background: "var(--ink)", border: "1px solid var(--ink)", color: "var(--at-bg)", cursor: "pointer", transition: "opacity .15s",
                    }}
                  >
                    CONNECT
                  </button>
                  <button
                    type="button"
                    onClick={handleSignUp}
                    style={{
                      width: "100%", padding: "12px 0", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                      background: "transparent", border: "1px solid var(--rule)", color: "var(--ink2)", cursor: "pointer", transition: "color .15s",
                    }}
                  >
                    SIGN UP
                  </button>
                </div>
              </form>
            </div>
          </div>
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

  const goalProgress = (totalProfit / profitGoal) * 100;

  /* ── Atelier style constants ────────────────────────────── */
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: "var(--at-surface)", border: "1px solid var(--rule)",
    borderRadius: 0, fontSize: 12, fontFamily: "var(--font-mono)", boxShadow: "none",
  };
  const thStyle: React.CSSProperties = {
    position: "sticky", top: 0, background: "var(--at-surface)",
    padding: "10px 14px", fontSize: 9, fontFamily: "var(--font-mono)",
    letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)",
    fontWeight: 600, textAlign: "left", borderBottom: "1.5px solid var(--ink)",
    whiteSpace: "nowrap",
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 13, padding: "8px 12px",
    border: "1px solid var(--rule)", background: "var(--at-surface)",
    color: "var(--ink)", width: "100%", outline: "none",
  };

  const btnStd: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    border: "1px solid var(--rule)", background: "var(--at-surface)", color: "var(--ink)",
    padding: "8px 16px", cursor: "pointer", transition: "background .15s", display: "inline-flex", alignItems: "center", gap: 6,
  };
  const btnAccent: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--at-bg)",
    padding: "8px 16px", cursor: "pointer", transition: "opacity .15s", display: "inline-flex", alignItems: "center", gap: 6,
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", paddingBottom: 80 }}>
      {/* ── MASTHEAD ──────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid var(--ink)", paddingBottom: 14, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink2)", fontFamily: "var(--font-mono)" }}>
            Trading actif &middot; tous comptes
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--ink)", marginTop: 4, lineHeight: 1.2 }}>
            Le journal.
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={exportJSON} style={btnStd}>
            <Download size={12} /> Export
          </button>
          <label style={{ ...btnStd, cursor: "pointer" }}>
            <Upload size={12} /> Import
            <input type="file" style={{ display: "none" }} accept=".json" onChange={importJSON} />
          </label>
          <button onClick={handleLogout} style={{ ...btnStd, color: "var(--ink2)", borderColor: "var(--rule)" }}>
            <LogOut size={12} /> Disconnect
          </button>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────── */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="bg-transparent rounded-none p-0 h-auto" style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
          <TabsTrigger
            value="dashboard"
            className="bg-transparent rounded-none p-0 h-auto data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink2)", paddingBottom: 10, borderBottom: "2px solid transparent", transition: "all .15s" }}
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="bg-transparent rounded-none p-0 h-auto data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink2)", paddingBottom: 10, borderBottom: "2px solid transparent", transition: "all .15s" }}
          >
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  DASHBOARD TAB                                          */}
        {/* ════════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard" style={{ marginTop: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          {/* Dashboard KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)" }}>
            {/* Profit */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Profit
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: globalProfit >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
                {globalProfit >= 0 ? "+" : "-"}${Math.abs(globalProfit).toLocaleString()}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                Overall net performance
              </div>
            </div>

            {/* Win Rate */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Win Rate
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--at-pos)", marginTop: 6, letterSpacing: -0.5 }}>
                {globalWinRate}%
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                {globalCount} trades executed
              </div>
            </div>

            {/* Profit Goal */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Profit Goal
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <div
                  style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--at-accent)", letterSpacing: -0.5, cursor: "pointer" }}
                  onClick={() => setShowGoalInput(true)}
                >
                  {goalProgress.toFixed(1)}%
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>
                  / ${profitGoal.toLocaleString()}
                </div>
              </div>
              <div style={{ height: 3, width: "100%", background: "var(--at-bg)", overflow: "hidden", border: "1px solid var(--rule)", marginTop: 8 }}>
                <motion.div
                  style={{ height: "100%", background: "var(--at-accent)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* R-multiple */}
            <div style={{ padding: "16px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                <MetricHint label="R-multiple">
                  Sum of R values: each trade result divided by max loss
                  (risk). The total shows how many risk units were gained or
                  lost overall.
                </MetricHint>
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: globalTotalR >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
                {formatR(globalTotalR)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                Total R-multiple generated
              </div>
            </div>
          </div>

          {/* ── Add New Trade ──────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Add New Trade</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Saisie manuelle</span>
            </div>
            <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 28 }}>
              <form
                onSubmit={addTrade}
                style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(4, 1fr)" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={12} style={{ color: "var(--ink3)" }} /> Date
                  </Label>
                  <Input
                    name="date"
                    type="date"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    defaultValue={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={12} style={{ color: "var(--ink3)" }} /> Entry Time
                  </Label>
                  <Input
                    name="entry_time"
                    type="time"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    value={entryTime}
                    onChange={(e) => setEntryTime(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Target size={12} style={{ color: "var(--ink3)" }} /> Asset (Actif)
                  </Label>
                  <Input
                    name="actif"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    placeholder="e.g. BTC/USD"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={12} style={{ color: "var(--ink3)" }} /> Timeframe
                  </Label>
                  <Select name="timeframe" defaultValue="1H">
                    <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 38 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                      {timeframes.map((tf) => (
                        <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={12} style={{ color: "var(--ink3)" }} /> Type
                  </Label>
                  <Select name="type" defaultValue="long">
                    <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 38 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <TrendingUp size={12} style={{ color: "var(--ink3)" }} /> Result ($)
                  </Label>
                  <Input
                    name="profit"
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <ShieldAlert size={12} style={{ color: "var(--ink3)" }} /> Max Loss ($)
                  </Label>
                  <Input
                    name="risk"
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    placeholder="100.00"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Wallet size={12} style={{ color: "var(--ink3)" }} /> Account
                  </Label>
                  <Input
                    name="compte"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    placeholder="e.g. Main"
                    required
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Layers size={12} style={{ color: "var(--ink3)" }} /> Strategy
                  </Label>
                  <Input
                    name="strategie"
                    style={{ ...inputStyle, borderRadius: 0 }}
                    placeholder="e.g. Trend Follow"
                    required
                  />
                </div>
                <div style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>
                    Observations
                  </Label>
                  <Textarea
                    name="observations"
                    style={{ ...inputStyle, minHeight: 100, borderRadius: 0, resize: "vertical" }}
                    placeholder="Analyze market behavior, emotional state, and core learnings..."
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginTop: 2 }}>
                    CTRL+V TO PASTE SCREENSHOTS
                  </span>
                </div>
                <div style={{ gridColumn: "span 3", display: "flex", flexDirection: "column", gap: 6 }}>
                  <Label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>
                    Photos (Max 3)
                  </Label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 4 }}>
                    {selectedPhotos.map((url, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        style={{ position: "relative", width: 80, height: 80, border: "1px solid var(--rule)", overflow: "hidden" }}
                      >
                        <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Intel" />
                        <div style={{ position: "absolute", inset: 0, background: "var(--at-surface)", opacity: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity .15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedPhotos(selectedPhotos.filter((_, idx) => idx !== i))}
                            style={{ padding: 6, background: "var(--at-accent)", color: "var(--ink)", border: "none", cursor: "pointer" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    {selectedPhotos.length < 3 && (
                      <Label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 80, height: 80, border: "2px dashed var(--rule)", cursor: "pointer", transition: "border-color .15s" }}>
                        {uploading ? (
                          <Loader2 style={{ animation: "spin 1s linear infinite", width: 20, height: 20, color: "var(--at-accent)" }} />
                        ) : (
                          <Plus style={{ width: 22, height: 22, color: "var(--ink3)" }} />
                        )}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, marginTop: 4, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)" }}>Upload</span>
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
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={uploading}
                    style={{ ...btnAccent, width: "100%", padding: "14px 0", justifyContent: "center" }}
                  >
                    Save Trade
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* ── Recent Trades ──────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Recent Trades</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                {filteredTrades.length} entries
              </span>
            </div>
            <div style={{ border: "1px solid var(--rule)", overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Hour</th>
                      <th style={thStyle}>Asset</th>
                      <th style={thStyle}>Timeframe</th>
                      <th style={thStyle}>Type</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Result</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>R-Ratio</th>
                      <th style={thStyle}>Visuals</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filteredTrades.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            style={{ padding: "60px 0", textAlign: "center", color: "var(--ink3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}
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
                              style={{ borderBottom: "1px dotted var(--rule)", cursor: "pointer", transition: "background .15s" }}
                              onClick={() => setSelectedTrade(trade)}
                              onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--at-accent) 5%, transparent)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                              <td style={{ padding: "10px 14px", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                                {new Date(trade.date).toLocaleDateString()}
                              </td>
                              <td style={{ padding: "10px 14px", color: "var(--ink2)", fontVariantNumeric: "tabular-nums" }}>
                                {formatTradeTime(trade.date)}
                              </td>
                              <td style={{ padding: "10px 14px", color: "var(--ink)", fontFamily: "var(--font-serif)", fontWeight: 700 }}>
                                {trade.actif}
                              </td>
                              <td style={{ padding: "10px 14px", color: "var(--ink2)" }}>
                                {trade.timeframe}
                              </td>
                              <td style={{ padding: "10px 14px", fontWeight: 700, textTransform: "uppercase", fontSize: 10, color: trade.type === "long" ? "var(--at-pos)" : "var(--at-neg)" }}>
                                {trade.type === "long" ? "Long" : "Short"}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: Number(trade.profit) >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                                {Number(trade.profit) >= 0 ? "+" : "-"}${Math.abs(Number(trade.profit)).toLocaleString()}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: r >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                                {formatR(r)}
                              </td>
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  {trade.photos?.map((url: string, pi: number) => (
                                    <img
                                      key={pi}
                                      src={url}
                                      style={{ width: 28, height: 28, objectFit: "cover", border: "1px solid var(--rule)" }}
                                      alt="Trade Snapshot"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewPhoto({ url, index: pi, photos: trade.photos });
                                      }}
                                    />
                                  ))}
                                </div>
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                  <button
                                    style={{ background: "none", border: "none", color: "var(--ink3)", cursor: "pointer", padding: 4 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTrade(trade);
                                      setIsEditing(true);
                                      setEditData({ ...trade });
                                    }}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    style={{ background: "none", border: "none", color: "var(--ink3)", cursor: "pointer", padding: 4 }}
                                    onClick={(e) => deleteTrade(trade.id, e)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
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
            </div>
          </section>

          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  ANALYTICS TAB                                          */}
        {/* ════════════════════════════════════════════════════════ */}
        <TabsContent value="analytics" style={{ marginTop: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>

          {/* ── Filters ───────────────────────────────────────── */}
          <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Filter size={14} style={{ color: "var(--ink3)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>Filters</span>
              <button onClick={resetFilters} style={{ ...btnStd, marginLeft: "auto", padding: "4px 10px", fontSize: 10 }}>
                <RefreshCw size={10} /> Reset
              </button>
            </div>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Strategy</Label>
                <Select value={filterStrategy} onValueChange={setFilterStrategy}>
                  <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 34, fontSize: 12 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                    <SelectItem value="all">All Strategies</SelectItem>
                    {strategies.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Account</Label>
                <Select value={filterAccount} onValueChange={setFilterAccount}>
                  <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 34, fontSize: 12 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 34, fontSize: 12 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Time Range</Label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {(["24h", "7d", "30d", "all"] as const).map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => setFilterRange(range)}
                      style={{
                        padding: "6px 0", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
                        border: filterRange === range ? "1px solid var(--ink)" : "1px solid var(--rule)",
                        background: filterRange === range ? "var(--ink)" : "var(--at-surface)",
                        color: filterRange === range ? "var(--at-bg)" : "var(--ink2)",
                        cursor: "pointer", transition: "all .15s",
                      }}
                    >
                      {range === "all" ? "ALL" : range.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {(filterStrategy !== "all" || filterAccount !== "all" || filterType !== "all" || filterRange !== "all") && (
              <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--at-accent)" }}>
                Showing {filteredTrades.length} of {trades.length} trades
              </div>
            )}
          </div>

          {/* ── Equity Curve ──────────────────────────────────── */}
          {equityCurve.length > 0 && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Equity Curve</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                    Solde reel = capital initial + P/L cumule (trades filtres)
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Label
                    htmlFor="starting-balance"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", whiteSpace: "nowrap" }}
                  >
                    Capital initial ($)
                  </Label>
                  <Input
                    id="starting-balance"
                    type="number"
                    min={0}
                    step={100}
                    style={{ ...inputStyle, width: 120, height: 32, borderRadius: 0 }}
                    value={startingBalance}
                    onChange={(e) => setStartingBalance(Number(e.target.value) || 0)}
                    onBlur={() => {
                      if (user) {
                        localStorage.setItem(`startingBalance_${user.id}`, String(startingBalance));
                      }
                    }}
                  />
                </div>
              </div>
              <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 24 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={equityCurve}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7d2b1d" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#7d2b1d" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                    <XAxis dataKey="date" stroke="rgba(0,0,0,0.15)" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }} tick={{ fill: "#4a4540" }} />
                    <YAxis stroke="rgba(0,0,0,0.15)" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }} tick={{ fill: "#4a4540" }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "var(--ink)", fontWeight: "bold" }}
                      formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Solde"]}
                    />
                    <Area type="stepAfter" dataKey="balance" stroke="#7d2b1d" strokeWidth={2} fill="url(#colorBalance)" animationDuration={2000} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── Analytics KPI Row ─────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--rule)" }}>
            {/* Profit */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Profit
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: totalProfit >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
                {totalProfit >= 0 ? "+" : "-"}${Math.abs(totalProfit).toLocaleString()}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                Net performance
              </div>
            </div>

            {/* Win Rate */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Win Rate
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--at-pos)", marginTop: 6, letterSpacing: -0.5 }}>
                {winRate}%
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                {filteredTrades.length} trades
              </div>
            </div>

            {/* Profit Goal */}
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                Profit Goal
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <div
                  style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "var(--at-accent)", letterSpacing: -0.5, cursor: "pointer" }}
                  onClick={() => setShowGoalInput(true)}
                >
                  {goalProgress.toFixed(1)}%
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>
                  / ${profitGoal.toLocaleString()}
                </div>
              </div>
              <div style={{ height: 3, width: "100%", background: "var(--at-bg)", overflow: "hidden", border: "1px solid var(--rule)", marginTop: 8 }}>
                <motion.div
                  style={{ height: "100%", background: "var(--at-accent)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(goalProgress, 100)}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* R-multiple */}
            <div style={{ padding: "16px 22px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", fontFamily: "var(--font-mono)" }}>
                <MetricHint label="R-multiple">
                  Idem que le ratio R : somme des (profit / risque) sur
                  les trades correspondant aux filtres. Compare la
                  performance en multiples de risque, pas seulement en
                  dollars.
                </MetricHint>
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: totalR >= 0 ? "var(--at-pos)" : "var(--at-neg)", marginTop: 6, letterSpacing: -0.5 }}>
                {formatR(totalR)}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                Total R-multiple
              </div>
            </div>
          </div>

          {/* ── Advanced Stats ─────────────────────────────────── */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Advanced Analytics</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Statistiques avancees</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid var(--rule)" }}>
              {/* Max Drawdown */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>
                  <MetricHint label="Max drawdown">
                    Largest equity decline from a previous peak (starting
                    balance + cumulative P/L on filtered trades). Measures
                    worst capital pullback.
                  </MetricHint>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-neg)" }}>
                  -${maxDrawdown.toLocaleString()}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Largest capital decline
                </div>
              </div>

              {/* Best Trade */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Best Trade</div>
                {bestTrade ? (
                  <>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-pos)" }}>
                      +${Number(bestTrade.profit).toLocaleString()}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                      {bestTrade.actif} &bull; {new Date(bestTrade.date).toLocaleDateString()}
                    </div>
                  </>
                ) : (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>No data</div>
                )}
              </div>

              {/* Worst Trade */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Worst Trade</div>
                {worstTrade ? (
                  <>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-neg)" }}>
                      ${Number(worstTrade.profit).toLocaleString()}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                      {worstTrade.actif} &bull; {new Date(worstTrade.date).toLocaleDateString()}
                    </div>
                  </>
                ) : (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink3)" }}>No data</div>
                )}
              </div>

              {/* Win Streak */}
              <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Win Streak</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-pos)" }}>
                  {bestStreak}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Consecutive wins
                </div>
              </div>

              {/* Loss Streak */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Loss Streak</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-neg)" }}>
                  {Math.abs(worstStreak)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Consecutive losses
                </div>
              </div>

              {/* Current Streak */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Current Streak</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: currentStreak >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                  {currentStreak > 0 ? "+" : ""}{currentStreak}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  {currentStreak > 0 ? "Winning" : currentStreak < 0 ? "Losing" : "Neutral"}
                </div>
              </div>

              {/* Sharpe Ratio */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>
                  <MetricHint label="Sharpe ratio">
                    Here: average P/L divided by P/L standard deviation
                    (filtered series). Higher means better return relative
                    to variability. This is not an annualized institutional
                    Sharpe.
                  </MetricHint>
                </div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: sharpeRatio >= 1 ? "var(--at-pos)" : sharpeRatio >= 0 ? "var(--at-accent)" : "var(--at-neg)" }}>
                  {sharpeRatio.toFixed(2)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Risk-adjusted return
                </div>
              </div>

              {/* Average Loss */}
              <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Average Loss</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--at-neg)" }}>
                  -${Math.abs(avgLoss).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Mean loser size
                </div>
              </div>

              {/* Average RRR */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Average RRR</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: averageRRR >= 1 ? "var(--at-pos)" : "var(--at-accent)" }}>
                  {averageRRR.toFixed(2)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Avg win / avg loss
                </div>
              </div>

              {/* Expectancy */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Expectancy</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: expectancy >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                  {expectancy >= 0 ? "+" : "-"}${Math.abs(expectancy).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Expected value per trade
                </div>
              </div>

              {/* Profit Factor */}
              <div style={{ padding: "16px 18px", borderRight: "1px solid var(--rule)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 6 }}>Profit Factor</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: profitFactor >= 1 ? "var(--at-pos)" : "var(--at-neg)" }}>
                  {profitFactor.toFixed(2)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink3)", marginTop: 4 }}>
                  Gross profit / gross loss
                </div>
              </div>

              {/* Empty cell to complete the 4-col grid */}
              <div style={{ padding: "16px 18px" }} />
            </div>
          </section>

          {/* ── Monthly Performance ────────────────────────────── */}
          {monthlyPerformanceDetailedData.length > 0 && (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Monthly Performance</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPerformanceYear((y) => y - 1)}
                    style={{ ...btnStd, padding: "4px 8px" }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", minWidth: 70, textAlign: "center" }}>
                    {performanceYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPerformanceYear((y) => y + 1)}
                    style={{ ...btnStd, padding: "4px 8px" }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 24 }}>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={monthlyPerformanceDetailedData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                    <XAxis dataKey="monthLabel" stroke="rgba(0,0,0,0.15)" style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }} tick={{ fill: "#4a4540" }} />
                    <YAxis stroke="rgba(0,0,0,0.15)" style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }} tick={{ fill: "#4a4540" }} tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: any, _name: any, item: any) => {
                        const payload = item?.payload;
                        return [
                          `$${Number(value).toLocaleString()} • YTD: $${Number(payload?.cumPnl ?? 0).toLocaleString()} • ${payload?.trades ?? 0} trade${(payload?.trades ?? 0) > 1 ? "s" : ""} • ${formatR(payload?.r ?? 0)}`,
                          "Month result",
                        ];
                      }}
                      labelStyle={{ color: "var(--ink)", fontWeight: "bold" }}
                    />
                    <Bar dataKey="pnl" maxBarSize={52} radius={[0, 0, 0, 0]} animationDuration={1500}>
                      {monthlyPerformanceDetailedData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#3a6e3f" : "#7d2b1d"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── Trading Calendar ───────────────────────────────── */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Trading Calendar</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  style={{ ...btnStd, padding: "4px 8px" }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)", minWidth: 130, textAlign: "center" }}>
                  {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  style={{ ...btnStd, padding: "4px 8px" }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: "16px 20px" }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 980, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 220px", gap: 6 }}>
                    {weekdayLabels.map((label) => (
                      <div key={label} style={{ padding: "4px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                        {label}
                      </div>
                    ))}
                    <div style={{ padding: "4px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                      Weekly Summary
                    </div>
                  </div>
                  {calendarRows.map((row, rowIndex) => {
                    const week = monthWeekSummaries[rowIndex];
                    return (
                      <div key={`week-row-${rowIndex}`} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 220px", gap: 6 }}>
                        {row.map((day, i) => {
                          if (!day) {
                            return (
                              <div key={`empty-${rowIndex}-${i}`} style={{ aspectRatio: "1", border: "1px solid var(--rule)", background: "var(--at-surface)" }} />
                            );
                          }
                          const intensity = day.count ? Math.min(Math.abs(day.profit) / 500, 1) : 0;
                          const bgColor = day.count === 0
                            ? "var(--at-surface)"
                            : day.profit >= 0
                              ? `color-mix(in srgb, var(--at-pos) ${Math.round(15 + intensity * 25)}%, var(--at-surface))`
                              : `color-mix(in srgb, var(--at-neg) ${Math.round(15 + intensity * 25)}%, var(--at-surface))`;
                          return (
                            <div
                              key={day.key}
                              style={{
                                position: "relative", aspectRatio: "1", border: "1px solid var(--rule)", background: bgColor,
                                padding: 6, opacity: day.count === 0 ? 0.4 : 0.65 + intensity * 0.3,
                              }}
                              title={`${new Date(day.key + "T12:00:00").toLocaleDateString("fr-FR")}\n${day.count} trade(s)\nP/L: ${day.profit >= 0 ? "+" : ""}$${day.profit.toLocaleString()}\nR: ${formatR(day.dayR)}`}
                            >
                              <div style={{ position: "absolute", left: 6, top: 4, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ink)" }}>
                                {day.dayNumber}
                              </div>
                              {day.count > 0 && (
                                <div style={{ position: "absolute", inset: "24% 6px 6px 6px", background: "var(--at-surface)", padding: 4, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>
                                    {day.count} trade{day.count > 1 ? "s" : ""}
                                  </div>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)" }}>
                                    {day.profit >= 0 ? "+" : ""}${Math.abs(day.profit).toLocaleString()}
                                  </div>
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--at-accent)" }}>
                                    {formatR(day.dayR)}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ border: "1px solid var(--rule)", background: "var(--at-surface)", padding: "8px 12px" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>
                            Week {week.week} &bull; {week.rangeLabel}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", marginTop: 4 }}>
                            {week.pnl >= 0 ? "+" : "-"}${Math.abs(week.pnl).toLocaleString()}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--at-accent)" }}>{formatR(week.r)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink2)" }}>
                            {week.trades} trade{week.trades > 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          </div>
        </TabsContent>
      </Tabs>

      {/* ── Goal Dialog ──────────────────────────────────────── */}
      <Dialog open={showGoalInput} onOpenChange={setShowGoalInput}>
        <DialogContent className="rounded-none" style={{ maxWidth: 420, background: "var(--at-surface)", border: "1px solid var(--rule)", color: "var(--ink)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
              Edit Profit Goal
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>
              Goal Amount ($)
            </Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={profitGoal}
              onChange={(e) => setProfitGoal(Number(e.target.value) || 0)}
              style={{ ...inputStyle, borderRadius: 0, height: 40 }}
            />
          </div>
          <DialogFooter style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={() => setShowGoalInput(false)} style={btnStd}>Cancel</button>
            <button onClick={saveGoal} style={btnAccent}>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Photo Preview Modal ──────────────────────────────── */}
      <Dialog open={!!previewPhoto} onOpenChange={() => setPreviewPhoto(null)}>
        <DialogContent className="rounded-none" style={{ maxWidth: "95vw", maxHeight: "95vh", padding: 0, background: "color-mix(in srgb, var(--at-bg) 95%, transparent)", border: "none", boxShadow: "none", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <motion.div
            style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}
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
                style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
              />
            </AnimatePresence>

            {previewPhoto && previewPhoto.photos.length > 1 && (
              <>
                <button
                  style={{ position: "absolute", left: 32, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, background: "var(--at-bg)", border: "1px solid var(--rule)", color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={prevPhoto}
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  style={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, background: "var(--at-bg)", border: "1px solid var(--rule)", color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onClick={nextPhoto}
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            <DialogClose style={{ position: "absolute", top: 32, right: 32, padding: 12, background: "var(--at-bg)", border: "1px solid var(--rule)", color: "var(--ink)", cursor: "pointer" }}>
              <X size={20} />
            </DialogClose>
          </motion.div>
          {previewPhoto && previewPhoto.photos.length > 1 && (
            <div style={{ padding: 24, display: "flex", justifyContent: "center", gap: 12, background: "var(--at-surface)", borderTop: "1px solid var(--rule)", width: "100%" }}>
              {previewPhoto.photos.map((url, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.1 }}
                  style={{
                    width: 60, height: 60, border: i === previewPhoto.index ? "2px solid var(--at-accent)" : "2px solid transparent",
                    overflow: "hidden", cursor: "pointer", opacity: i === previewPhoto.index ? 1 : 0.4,
                    transition: "all .15s",
                  }}
                  onClick={() => setPreviewPhoto({ ...previewPhoto, url, index: i })}
                >
                  <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </motion.div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Trade Details / Edit Modal ────────────────────────── */}
      <Dialog
        open={!!selectedTrade}
        onOpenChange={() => {
          setSelectedTrade(null);
          setIsEditing(false);
          setEditData(null);
        }}
      >
        <DialogContent className="rounded-none" style={{ display: "flex", maxHeight: "min(90vh, 56rem)", width: "min(95vw, 42rem)", maxWidth: "42rem", flexDirection: "column", gap: 0, overflow: "hidden", border: "1px solid var(--rule)", background: "var(--at-surface)", padding: 0, color: "var(--ink)" }}>
          <div style={{ height: 3, width: "100%", flexShrink: 0, background: "var(--at-accent)" }} />

          <DialogHeader style={{ flexShrink: 0, padding: "28px 28px 8px 28px" }}>
            <DialogTitle style={{ display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left", fontFamily: "var(--font-serif)", color: "var(--ink)" }}>
              <div style={{ flexShrink: 0, border: "1px solid var(--rule)", background: "var(--at-bg)", padding: 8, color: isEditing ? "var(--at-accent)" : "var(--ink2)" }}>
                {isEditing ? <Edit2 size={18} /> : <Activity size={18} />}
              </div>
              <div style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)" }}>
                  {isEditing ? "Edit trade" : "Trade details"}
                </span>
                {selectedTrade && (
                  <>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedTrade.actif}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink3)" }}>
                      {new Date(selectedTrade.date).toLocaleDateString("fr-FR")} &middot; {formatTradeTime(selectedTrade.date)} &middot; {selectedTrade.timeframe}
                    </span>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedTrade && (
            <>
              <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "16px 28px 16px 28px" }}>
              {isEditing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Date</Label>
                    <Input
                      type="date"
                      value={getDateInputValue(editData?.date)}
                      onChange={(e) => setEditData({ ...editData, date: buildTradeDateTime(e.target.value, getTimeInputValue(editData?.date)) })}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Entry Time</Label>
                    <Input
                      type="time"
                      value={getTimeInputValue(editData?.date)}
                      onChange={(e) => setEditData({ ...editData, date: buildTradeDateTime(getDateInputValue(editData?.date), e.target.value) })}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Asset</Label>
                    <Input
                      value={editData?.actif}
                      onChange={(e) => setEditData({ ...editData, actif: e.target.value })}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Timeframe</Label>
                    <Select value={editData?.timeframe} onValueChange={(v) => setEditData({ ...editData, timeframe: v })}>
                      <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 38 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                        {timeframes.map((tf) => (<SelectItem key={tf} value={tf}>{tf}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Type</Label>
                    <Select value={editData?.type} onValueChange={(v) => setEditData({ ...editData, type: v })}>
                      <SelectTrigger className="rounded-none" style={{ ...inputStyle, height: 38 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none" style={{ background: "var(--at-surface)", border: "1px solid var(--rule)" }}>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Profit / Loss ($)</Label>
                    <Input
                      type="text"
                      value={editData?.profit}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || val === "-" || !isNaN(Number(val))) {
                          setEditData({ ...editData, profit: val });
                        }
                      }}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Max Risk ($)</Label>
                    <Input
                      type="text"
                      value={editData?.risk}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || val === "-" || !isNaN(Number(val))) {
                          setEditData({ ...editData, risk: val });
                        }
                      }}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Account</Label>
                    <Input
                      value={editData?.compte}
                      onChange={(e) => setEditData({ ...editData, compte: e.target.value })}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Strategy</Label>
                    <Input
                      value={editData?.strategie}
                      onChange={(e) => setEditData({ ...editData, strategie: e.target.value })}
                      style={{ ...inputStyle, borderRadius: 0, height: 38 }}
                    />
                  </div>
                  <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Observations</Label>
                    <Textarea
                      value={editData?.observations}
                      onChange={(e) => setEditData({ ...editData, observations: e.target.value })}
                      style={{ ...inputStyle, minHeight: 90, borderRadius: 0, resize: "vertical" }}
                    />
                  </div>
                  <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 6 }}>
                    <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink3)" }}>Photos (Max 3)</Label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                      {editData.photos?.map((url: string, i: number) => (
                        <div key={i} style={{ position: "relative", width: 64, height: 64, border: "1px solid var(--rule)", overflow: "hidden" }}>
                          <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button
                            type="button"
                            onClick={() => setEditData({ ...editData, photos: editData.photos.filter((_: any, idx: number) => idx !== i) })}
                            style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--at-accent) 80%, transparent)", opacity: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", transition: "opacity .15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {editData.photos?.length < 3 && (
                        <Label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, border: "2px dashed var(--rule)", cursor: "pointer", transition: "border-color .15s" }}>
                          {uploading ? (
                            <Loader2 style={{ animation: "spin 1s linear infinite", width: 18, height: 18 }} />
                          ) : (
                            <Plus style={{ width: 18, height: 18, color: "var(--ink3)" }} />
                          )}
                          <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                        </Label>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Calendar size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Date</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                        {new Date(selectedTrade.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Target size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Asset</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                        {selectedTrade.actif}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Clock size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Time</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                        {formatTradeTime(selectedTrade.date)}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Clock size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Timeframe</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                        {selectedTrade.timeframe}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Layers size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Strategy</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                        {selectedTrade.strategie}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <Wallet size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Account</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                        {selectedTrade.compte}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink3)" }}>
                        <ShieldAlert size={10} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Profit / R</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: Number(selectedTrade.profit) >= 0 ? "var(--at-pos)" : "var(--at-neg)" }}>
                          {Number(selectedTrade.profit) >= 0 ? "+" : ""}${Number(selectedTrade.profit).toLocaleString()}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: getR(Number(selectedTrade.profit), Number(selectedTrade.risk)) >= 0 ? "var(--at-pos)" : "var(--at-neg)", opacity: 0.6 }}>
                          ({formatR(getR(Number(selectedTrade.profit), Number(selectedTrade.risk)))})
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedTrade.observations && (
                    <div style={{ padding: 20, background: "var(--at-bg)", border: "1px solid var(--rule)" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 }}>
                        Observations
                      </div>
                      <p style={{ fontFamily: "var(--font-serif)", fontSize: 13, lineHeight: 1.6, color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                        {selectedTrade.observations}
                      </p>
                    </div>
                  )}

                  {selectedTrade.photos?.length > 0 && (
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "var(--ink3)", marginBottom: 10 }}>
                        Photos
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                        {selectedTrade.photos.map((url: string, i: number) => (
                          <motion.div
                            key={i}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", border: "1px solid var(--rule)", cursor: "zoom-in" }}
                            onClick={() => setPreviewPhoto({ url, index: i, photos: selectedTrade.photos })}
                          >
                            <img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <div
                              style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--at-accent) 20%, transparent)", opacity: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity .15s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}
                            >
                              <Maximize2 style={{ color: "var(--ink)", width: 18, height: 18 }} />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              </div>

              <div style={{ flexShrink: 0, display: "flex", gap: 12, borderTop: "1px solid var(--rule)", background: "var(--at-surface)", padding: "14px 28px" }}>
                {isEditing ? (
                  <>
                    <button
                      style={{ ...btnStd, flex: 1, justifyContent: "center", padding: "10px 0" }}
                      onClick={() => { setIsEditing(false); setEditData(null); }}
                    >
                      CANCEL
                    </button>
                    <button
                      style={{ ...btnAccent, flex: 1, justifyContent: "center", padding: "10px 0" }}
                      onClick={handleUpdateTrade}
                    >
                      <Save size={14} /> SAVE CHANGES
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      style={{ ...btnStd, flex: 1, justifyContent: "center", padding: "10px 0", color: "var(--at-neg)" }}
                      onClick={() => deleteTrade(selectedTrade.id)}
                    >
                      <Trash2 size={14} /> DELETE
                    </button>
                    <button
                      style={{ ...btnAccent, flex: 1, justifyContent: "center", padding: "10px 0" }}
                      onClick={() => { setIsEditing(true); setEditData({ ...selectedTrade }); }}
                    >
                      <Edit2 size={14} /> EDIT
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
