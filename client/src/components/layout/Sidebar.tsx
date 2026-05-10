import { Link, useLocation } from "wouter"
import { Home, BarChart3, Briefcase, Wallet, Bitcoin, Users, Receipt, TrendingUp } from "lucide-react"

const SECTIONS = [
  {
    label: "PATRIMOINE",
    items: [
      { path: "/", label: "Accueil", icon: Home },
    ]
  },
  {
    label: "FHF",
    items: [
      { path: "/fhf", label: "Pilotage", icon: TrendingUp },
      { path: "/ibkr", label: "IBKR", icon: Briefcase },
      { path: "/compta", label: "Compta", icon: Receipt },
    ]
  },
  {
    label: "PERSO",
    items: [
      { path: "/crypto", label: "Crypto Perso", icon: Bitcoin },
      { path: "/crypto-shared", label: "Crypto R+F", icon: Users },
      { path: "/pea", label: "PEA", icon: Wallet },
    ]
  },
  {
    label: "TRANSVERSAL",
    items: [
      { path: "/analytics", label: "Trading Actif", icon: BarChart3 },
    ]
  },
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
      <nav className="py-1">
        {SECTIONS.map((section, idx) => (
          <div key={section.label}>
            {idx > 0 && <div className="border-t border-cyan-500/10 mx-2" />}
            <div className="text-[9px] text-zinc-600 font-mono uppercase tracking-[0.2em] px-3 pt-3 pb-1">
              {section.label}
            </div>
            <div className="px-2 space-y-0.5">
              {section.items.map((item) => {
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
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
