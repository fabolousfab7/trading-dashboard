import { Link, useLocation } from "wouter"
import { Home, BarChart3, Briefcase, Wallet, Bitcoin, Receipt } from "lucide-react"

const NAV = [
  { path: "/", label: "ACCUEIL", icon: Home },
  { path: "/analytics", label: "TRADING ACTIF", icon: BarChart3 },
  { path: "/ibkr", label: "FHF / IBKR", icon: Briefcase },
  { path: "/crypto", label: "CRYPTO LT", icon: Bitcoin },
  { path: "/pea", label: "PEA PERSO", icon: Wallet },
  { path: "/compta", label: "COMPTA", icon: Receipt },
]

export default function Sidebar() {
  const [location] = useLocation()
  return (
    <aside className="w-56 min-h-screen border-r border-cyan-500/20 bg-black/60 backdrop-blur-sm sticky top-0 self-start">
      <div className="p-4 border-b border-cyan-500/20">
        <h1 className="text-lg font-mono font-bold tracking-wider">
          <span className="text-cyan-400">F</span>
          <span className="text-fuchsia-500">.H.F</span>
          <span className="text-cyan-400">.</span>
        </h1>
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-1">
          Trading Terminal
        </p>
      </div>
      <nav className="p-2 space-y-1">
        {NAV.map((item) => {
          const active = location === item.path
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-3 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all ${
                active
                  ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                  : "text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/5 border border-transparent"
              }`}>
                <Icon size={14} />
                {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
