import { useEffect, useState, ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import Sidebar from "./Sidebar"

export default function Layout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="min-h-screen bg-[--at-bg]" />
  if (!user) return <>{children}</>

  return (
    <div className="min-h-screen bg-[--at-bg] text-[--ink] flex">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  )
}
