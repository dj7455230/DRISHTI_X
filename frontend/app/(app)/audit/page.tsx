"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { dashboardApi } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import {
  ClipboardList,
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
  Link as LinkIcon,
  Filter,
  Copy,
  Check,
  ShieldCheck,
  Lock,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { useAuthStore } from "@/lib/store"

const ACTION_COLORS: Record<string, string> = {
  USER_REGISTERED: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  USER_LOGIN: "text-cyan-400 border-cyan-500/20 bg-cyan-500/10",
  AUTH_LOGIN_FAILED: "text-rose-400 border-rose-500/20 bg-rose-500/10",
  SCREENING_CREATED: "text-blue-400 border-blue-500/20 bg-blue-500/10",
  IMAGE_UPLOADED: "text-purple-400 border-purple-500/20 bg-purple-500/10",
  AI_PREDICTION: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10",
  AI_PREDICTION_COMPLETED: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10",
  DOCTOR_REVIEW: "text-orange-400 border-orange-500/20 bg-orange-500/10",
  DOCTOR_REVIEW_ACCEPTED: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  DOCTOR_REVIEW_OVERRIDDEN: "text-amber-400 border-amber-500/20 bg-amber-500/10",
  RECAPTURE_REQUESTED: "text-red-400 border-red-500/20 bg-red-500/10",
  REPORT_GENERATED: "text-slate-300 border-slate-500/20 bg-slate-500/10",
  PATIENT_REGISTERED: "text-teal-400 border-teal-500/20 bg-teal-500/10",
  DEMO_ENVIRONMENT_RESET: "text-indigo-400 border-indigo-500/20 bg-indigo-500/10",
}

const CATEGORIES = [
  { id: "ALL", label: "All Events" },
  { id: "AI", label: "AI Predictions", filter: "AI_" },
  { id: "CLINICAL", label: "Doctor Reviews", filter: "DOCTOR_" },
  { id: "AUTH", label: "Auth & Security", filter: "AUTH" },
  { id: "SCREENING", label: "Screenings", filter: "SCREENING" },
]

export default function AuditPage() {
  const { user } = useAuthStore()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("ALL")
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  // Fetch audit logs
  const {
    data: logs,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["audit"],
    queryFn: () => dashboardApi.audit({ limit: 200 }).then((r) => r.data),
    enabled: user?.role === "ADMIN",
  })

  // Cryptographic Chain Verification Query
  const {
    data: chainReport,
    isLoading: isVerifying,
    refetch: verifyChain,
  } = useQuery({
    queryKey: ["auditVerifyChain"],
    queryFn: () => dashboardApi.verifyAuditChain().then((r) => r.data),
    enabled: user?.role === "ADMIN",
  })

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedHash(text)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  if (user?.role !== "ADMIN") {
    return (
      <div className="glass-card p-12 text-center max-w-lg mx-auto mt-12">
        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-white font-semibold">Access Restricted</p>
        <p className="text-slate-400 text-sm mt-2">
          Cryptographic audit trail is visible to ADMIN role only.
        </p>
      </div>
    )
  }

  const selectedCategoryFilter = CATEGORIES.find((c) => c.id === category)?.filter

  const filtered = (logs ?? []).filter((l: any) => {
    const matchesCategory =
      !selectedCategoryFilter ||
      (l.action && l.action.toUpperCase().includes(selectedCategoryFilter)) ||
      (category === "AUTH" && (l.action.includes("USER_") || l.action.includes("AUTH_")))

    const matchesSearch =
      !search ||
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.user_role?.toLowerCase().includes(search.toLowerCase()) ||
      l.detail?.toLowerCase().includes(search.toLowerCase()) ||
      l.event_hash?.toLowerCase().includes(search.toLowerCase())

    return matchesCategory && matchesSearch
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Feature 44
            </span>
            <span className="text-xs text-slate-500">Immutable Cryptographic Log</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-cyan-400" />
            Audit <span className="gradient-text">Trail & Hash Chain</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Tamper-evident append-only journal secured via forward SHA-256 hash chaining.
          </p>
        </div>

        <button
          onClick={() => {
            verifyChain()
            refetch()
          }}
          disabled={isVerifying}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors shrink-0 disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={cn("w-4 h-4", isVerifying && "animate-spin")} />
          Verify Chain Integrity
        </button>
      </div>

      {/* Cryptographic Verification Status Banner */}
      <div
        className={cn(
          "glass-card p-5 border transition-colors",
          chainReport?.chain_status === "INTACT"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : chainReport?.chain_status === "COMPROMISED"
            ? "border-rose-500/30 bg-rose-500/5"
            : "border-slate-800 bg-slate-900/50"
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "p-2.5 rounded-xl border mt-0.5",
                chainReport?.chain_status === "INTACT"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-400"
              )}
            >
              {chainReport?.chain_status === "INTACT" ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-base">
                  Audit Chain Status:
                </span>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide border",
                    chainReport?.chain_status === "INTACT"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  )}
                >
                  {chainReport?.chain_status || "CHECKING"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {chainReport?.chain_status === "INTACT"
                  ? `Cryptographic seal verified across all ${chainReport?.total_records_verified ?? 0} sequential audit entries. No records omitted, altered, or injected.`
                  : "Cryptographic break detected! An audit entry has been altered or omitted."}
              </p>
            </div>
          </div>

          {chainReport?.latest_hash && (
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-medium">
                Chain Head Hash (SHA-256)
              </span>
              <div className="flex items-center gap-1.5 mt-1 bg-black/40 px-2.5 py-1 rounded-lg border border-white/10 font-mono text-[11px] text-cyan-300">
                <Hash className="w-3 h-3 text-cyan-400" />
                <span>{chainReport.latest_hash.slice(0, 16)}...{chainReport.latest_hash.slice(-8)}</span>
                <button
                  onClick={() => copyToClipboard(chainReport.latest_hash)}
                  className="p-1 hover:text-white transition-colors"
                  title="Copy full SHA-256 hash"
                >
                  {copiedHash === chainReport.latest_hash ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border min-h-[36px]",
                category === cat.id
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, hash, or detail..."
            className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 min-h-[40px]"
          />
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-rose-500/30 text-rose-400 text-sm">
          Failed to load audit logs. Please verify database connectivity.
        </div>
      )}

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="text-cyan-400 animate-pulse py-12 text-center text-sm">
          Loading tamper-evident audit journal...
        </div>
      ) : (
        <div className="glass-card overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-white/10 bg-black/20">
                  <th className="px-4 py-3 text-slate-400 uppercase tracking-widest font-medium">
                    Timestamp (UTC)
                  </th>
                  <th className="px-4 py-3 text-slate-400 uppercase tracking-widest font-medium">
                    Action Event
                  </th>
                  <th className="px-4 py-3 text-slate-400 uppercase tracking-widest font-medium">
                    Actor / Role
                  </th>
                  <th className="px-4 py-3 text-slate-400 uppercase tracking-widest font-medium">
                    Cryptographic Hash Chaining
                  </th>
                  <th className="px-4 py-3 text-slate-400 uppercase tracking-widest font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No matching audit entries found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((log: any, i: number) => {
                    const badgeClass =
                      ACTION_COLORS[log.action] ||
                      "text-slate-300 border-white/10 bg-white/5"

                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        className="hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="px-4 py-3 text-slate-400 font-mono whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded text-[11px] font-semibold border font-mono",
                              badgeClass
                            )}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          <div className="flex flex-col">
                            <span className="font-medium">{log.user_role || "SYSTEM"}</span>
                            {log.ip_address && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                {log.ip_address}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {log.event_hash ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 text-cyan-300">
                                <Hash className="w-3 h-3 text-cyan-500 shrink-0" />
                                <span>{log.event_hash.slice(0, 10)}...{log.event_hash.slice(-6)}</span>
                                <button
                                  onClick={() => copyToClipboard(log.event_hash)}
                                  className="text-slate-500 hover:text-white"
                                  title="Copy event hash"
                                >
                                  {copiedHash === log.event_hash ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-500 truncate max-w-[200px]">
                                prev: {log.prev_event_hash ? `${log.prev_event_hash.slice(0, 8)}...` : "GENESIS"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 font-mono">legacy_unhashed</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-sm">
                          <p className="truncate" title={log.detail || ""}>
                            {log.detail || "—"}
                          </p>
                          {log.model_version && (
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                              Model: {log.model_version}
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
