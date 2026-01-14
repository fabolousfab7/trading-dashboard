import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, LogOut, TrendingUp, TrendingDown, Trash2 } from "lucide-react";

export default function TradingDashboard() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<any[]>([]);
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
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "Confirmation link sent." });
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  async function addTrade(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newTrade = {
      asset: formData.get("asset"),
      type: formData.get("type"),
      result: parseFloat(formData.get("result") as string),
      account: formData.get("account"),
      strategy: formData.get("strategy"),
      date: new Date().toISOString(),
      user_id: user.id
    };

    const { data, error } = await supabase.from("trades").insert([newTrade]).select();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTrades([data[0], ...trades]);
      (e.target as HTMLFormElement).reset();
    }
  }

  async function deleteTrade(id: number) {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (!error) setTrades(trades.filter(t => t.id !== id));
  }

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

  const totalProfit = trades.reduce((acc, t) => acc + Number(t.result), 0);
  const winRate = trades.length ? (trades.filter(t => Number(t.result) > 0).length / trades.length * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Trading Dashboard</h1>
          <Button variant="ghost" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
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

        <Card>
          <CardHeader><CardTitle>Add New Trade</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={addTrade} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Asset</Label>
                <Input name="asset" placeholder="e.g. BTC/USD" required />
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
                <Label>Result ($)</Label>
                <Input name="result" type="number" step="0.01" placeholder="Profit/Loss amount" required />
              </div>
              <div className="space-y-2">
                <Label>Account</Label>
                <Input name="account" placeholder="e.g. Main" required />
              </div>
              <div className="space-y-2">
                <Label>Strategy</Label>
                <Input name="strategy" placeholder="e.g. Trend Follow" required />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Add Trade</Button>
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
                    <th className="py-2 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(trade => (
                    <tr key={trade.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-4 text-muted-foreground">{new Date(trade.date).toLocaleDateString()}</td>
                      <td className="py-2 px-4 font-medium">{trade.asset}</td>
                      <td className="py-2 px-4 uppercase text-xs">{trade.type}</td>
                      <td className={`py-2 px-4 font-bold ${Number(trade.result) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ${Number(trade.result).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{trade.strategy}</td>
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
