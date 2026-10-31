"use client"

import { useQuery } from "@tanstack/react-query"
import { dashboardApi } from "@/lib/api"
import { motion } from "framer-motion"
import { ClipboardList, Shield, Search } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { useState } from "react"
import { useAuthStore } from "@/lib/store"

const ACTION_COLORS: Record<string, string> = {
  USER_REGISTERED:  "text-emerald-400",
  USER_LOGIN:       "text-cyan-400",
  SCREENING_CREATED:"text-blue-400",
  IMAGE_UPLOADED:   "text-purple-400",
  AI_PREDICTION:    "text-yellow-400",
  DOCTOR_REVIEW:    "text-orange-400",
  RECAPTURE_REQUESTED: "text-red-400",
  REPORT_GENERATED: "text-slate-300",
}

export default function AuditPage() {
  const { user } = useAuthStore()
  const [search, setSearch] = useState("")

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["audit"],
    queryFn: () => dashboardApi.audit({ limit: 200 }).then(r => r.data),
    enabled: user?.role === "ADMIN",
  })

  if (user?.role !== "ADMIN") {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-12">
        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-white font-semibold">Access Restricted</p>
        <p className="text-slate-400 text-sm mt-2">Audit trail is visible to ADMIN role only.</p>
      </div>
    )
  }

  const filtered = (logs ?? []).filter((l: any) =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.user_role?.toLowerCase().includes(search.toLowerCase()) ||
    l.detail?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-cyan-400" />
          Audit <span className="gradient-text">Trail</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Immutable log of all system actions — AI predictions, doctor reviews, logins
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter by action, role, or detail..."
          className="w-full bg-white/5 border border-white/15 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 text-red-400 text-sm">
          Failed to load audit logs. Backend may not be connected.
        </div>
      )}

      {isLoading ? (
        <div className="text-cyan-400 animate-pulse py-8 text-center">Loading audit trail...</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {["Timestamp", "Action", "Role", "Model Version", "Detail"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 uppercase tracking-widest font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No audit logs yet.</td></tr>
              ) : (
                filtered.map((log: any, i: number) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs font-semibold", ACTION_COLORS[log.action] ?? "text-slate-300")}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{log.user_role ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{log.model_version ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{log.detail ?? "—"}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
