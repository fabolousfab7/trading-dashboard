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
    <aside className="w-56 min-h-screen border-r border-[--rule] bg-[--at-surface] sticky top-0 self-start">
      <div className="p-4 border-b border-[--rule]">
        <h1 className="text-lg font-serif font-bold tracking-wide">
          <span className="text-[--at-accent]">Pilotage.</span>
        </h1>
        <p className="text-[10px] text-[--ink3] font-mono uppercase tracking-widest mt-1">
          Trading Terminal
        </p>
      </div>
      <nav className="py-1">
        {SECTIONS.map((section, idx) => (
          <div key={section.label}>
            {idx > 0 && <div className="border-t border-dotted border-[--rule] mx-2" />}
            <div className="text-[9px] text-[--ink3] font-serif uppercase tracking-[0.2em] px-3 pt-3 pb-1">
              {section.label}
            </div>
            <div className="px-2 space-y-0.5">
              {section.items.map((item) => {
                const active = location === item.path
                const Icon = item.icon
                return (
                  <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-3 py-2 rounded text-xs font-serif tracking-wide transition-all ${
                      active
                        ? "bg-[--at-accent]/10 text-[--at-accent] border border-[--at-accent]/30"
                        : "text-[--ink2] hover:text-[--at-accent] hover:bg-[--at-accent]/5 border border-transparent"
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
      <div className="absolute bottom-4 left-0 right-0 px-4">
        <p className="text-[8px] text-[--ink3] font-serif italic leading-relaxed border-t border-dotted border-[--rule] pt-3">
          « Le marché est un mécanisme de transfert d'argent des impatients vers les patients. »
        </p>
      </div>
    </aside>
  )
}
