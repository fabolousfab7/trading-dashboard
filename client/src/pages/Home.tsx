import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, LogOut, TrendingUp, TrendingDown, Trash2, Image as ImageIcon, X, Download, Upload } from "lucide-react";

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
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Supabase allows disabling email confirmation in the project settings.
    // We try to sign up; if settings allow, it works immediately.
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          email_confirmed: true // This is a metadata hint, actual enforcement is in Supabase Dashboard
        }
      }
    });
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else if (data.user && !data.session) {
      toast({ title: "Account created", description: "Email confirmation might still be required based on Supabase project settings." });
    } else {
      toast({ title: "Success", description: "Account created and logged in!" });
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function uploadFile(file: File) {
    if (selectedPhotos.length >= 2) {
      toast({ title: "Limit reached", description: "Maximum 2 photos allowed", variant: "destructive" });
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
      compte: formData.get("compte"),
      strategie: formData.get("strategie"),
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

  async function deleteTrade(id: number) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (!error) {
      setTrades(trades.filter(t => t.id !== id));
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
            id: undefined, // Let Supabase generate new IDs
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

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Trading Dashboard Login</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Login</Button>
                <Button type="button" variant="outline" onClick={handleSignUp} className="flex-1">Sign Up</Button>
              </div>
            </form>
          </CardContent>
        </Card>
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
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Trading Dashboard</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportJSON}><Download className="mr-2 h-4 w-4" /> Export</Button>
            <div className="relative">
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" /> Import
                  <input type="file" className="hidden" accept=".json" onChange={importJSON} />
                </label>
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
              {totalProfit >= 0 ? <TrendingUp className="text-green-500" /> : <TrendingDown className="text-red-500" />}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${totalProfit.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{winRate}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{trades.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Profit by Strategy</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(statsByStrategy).map(([strategy, data]: [string, any]) => (
                  <div key={strategy} className="flex justify-between items-center text-sm border-b pb-1">
                    <span>{strategy} ({data.count})</span>
                    <span className={data.profit >= 0 ? "text-green-500" : "text-red-500 font-bold"}>
                      ${data.profit.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Profit by Account</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(statsByAccount).map(([account, data]: [string, any]) => (
                  <div key={account} className="flex justify-between items-center text-sm border-b pb-1">
                    <span>{account} ({data.count})</span>
                    <span className={data.profit >= 0 ? "text-green-500" : "text-red-500 font-bold"}>
                      ${data.profit.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Trade</CardTitle>
            <p className="text-xs text-muted-foreground">Tip: You can paste images from clipboard (Ctrl+V)</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={addTrade} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="space-y-2">
                <Label>Asset (Actif)</Label>
                <Input name="actif" placeholder="e.g. BTC/USD" required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select name="type" defaultValue="long">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Result ($) (Profit)</Label>
                <Input name="profit" type="number" step="0.01" placeholder="Profit/Loss amount" required />
              </div>
              <div className="space-y-2">
                <Label>Account (Compte)</Label>
                <Input name="compte" placeholder="e.g. Main" required />
              </div>
              <div className="space-y-2">
                <Label>Strategy (Strategie)</Label>
                <Input name="strategie" placeholder="e.g. Trend Follow" required />
              </div>
              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <Label>Photos (Max 2)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedPhotos.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 border rounded overflow-hidden">
                      <img src={url} className="w-full h-full object-cover" alt="Trade detail" />
                      <button 
                        type="button"
                        onClick={() => setSelectedPhotos(selectedPhotos.filter((_, idx) => idx !== i))}
                        className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {selectedPhotos.length < 2 && (
                    <Label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded cursor-pointer hover:bg-muted">
                      {uploading ? <Loader2 className="animate-spin h-6 w-6" /> : <Plus className="h-6 w-6" />}
                      <span className="text-[10px] mt-1">Upload/Paste</span>
                      <Input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
                    </Label>
                  )}
                </div>
              </div>
              <div className="flex items-end lg:col-start-3">
                <Button type="submit" className="w-full" disabled={uploading}>
                  <Plus className="mr-2 h-4 w-4" /> Add Trade
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Trades</CardTitle></CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-4">Date</th>
                    <th className="py-2 px-4">Asset</th>
                    <th className="py-2 px-4">Type</th>
                    <th className="py-2 px-4">Result</th>
                    <th className="py-2 px-4">Strategy</th>
                    <th className="py-2 px-4">Photos</th>
                    <th className="py-2 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(trade => (
                    <tr key={trade.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4 text-muted-foreground">{new Date(trade.date).toLocaleDateString()}</td>
                      <td className="py-2 px-4 font-medium">{trade.actif}</td>
                      <td className="py-2 px-4 uppercase text-xs">{trade.type}</td>
                      <td className={`py-2 px-4 font-bold ${Number(trade.profit) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${Number(trade.profit).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{trade.strategie}</td>
                      <td className="py-2 px-4">
                        <div className="flex gap-1">
                          {trade.photos?.map((url: string, i: number) => (
                            <img key={i} src={url} className="w-8 h-8 object-cover rounded border cursor-zoom-in" alt="Trade" onClick={() => window.open(url, '_blank')} />
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-4">
                        <Button variant="ghost" size="icon" onClick={() => deleteTrade(trade.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
