"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { screeningsApi } from "@/lib/api"
import { motion } from "framer-motion"
import {
  Scan,
  Search,
  ChevronRight,
  Filter,
  Brain,
  FileText,
  AlertTriangle,
  Plus,
  Activity,
  Eye,
} from "lucide-react"
import Link from "next/link"
import { cn, formatDate } from "@/lib/utils"

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "HUMAN_REVIEW_REQUIRED", label: "Human Review" },
  { value: "ANALYZED", label: "Analyzed" },
  { value: "RECAPTURE_REQUIRED", label: "Recapture" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "PENDING", label: "Pending" },
]

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  HIGH: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  MEDIUM: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  LOW: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
}

export default function ScreeningsPage() {
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")

  const { data: screenings, isLoading } = useQuery({
    queryKey: ["screenings", statusFilter],
    queryFn: () =>
      screeningsApi
        .list({
          limit: 100,
          ...(statusFilter ? { status: statusFilter } : {}),
        })
        .then((r) => r.data),
    refetchInterval: 20_000,
  })

  const filtered =
    screenings?.filter((s: any) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        s.id?.toLowerCase().includes(q) ||
        s.case_number?.toLowerCase().includes(q) ||
        s.patient_code?.toLowerCase().includes(q) ||
        s.eye_side?.toLowerCase().includes(q)
      )
    }) ?? []

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Scan className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Screening <span className="gradient-text-cyan">Archive</span>
            </h1>
          </div>
          <p className="text-xs text-[#9AAFC1] mt-1">
            Complete registry of {screenings?.length ?? 0} photographic retinal examinations, quality audits, and AI classifications.
          </p>
        </div>

        <Link
          href="/screenings/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[#07111F] text-xs font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Start New Screening
        </Link>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#5A7184] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by screening ID, patient code, or eye..."
            className="w-full bg-[#101F30] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]/60 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap self-stretch sm:self-auto">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-medium border transition-colors",
                statusFilter === opt.value
                  ? "bg-[#102436] border-[#39D9D0]/50 text-[#39D9D0] shadow-[0_0_10px_rgba(57,217,208,0.15)]"
                  : "bg-[#101F30] border-white/5 text-[#9AAFC1] hover:text-white"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* SCREENING LIST */}
      {isLoading ? (
        <div className="text-[#39D9D0] animate-pulse py-12 text-center text-xs flex items-center justify-center gap-2">
          <Activity className="w-4 h-4 animate-spin" />
          Loading screening cases...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
          <Scan className="w-12 h-12 text-[#5A7184] mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No Screenings Found</h3>
          <p className="text-xs text-[#9AAFC1] mt-1 max-w-sm mx-auto">
            {search || statusFilter ? "No screenings match the specified filters." : "No screening examinations exist in the database."}
          </p>
          <Link
            href="/screenings/new"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#39D9D0] text-[#07111F] text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Start New Screening
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((s: any, i: number) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <div className="glass-card glass-card-hover p-4 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                <Link
                  href={`/screenings/${s.id}`}
                  className="flex items-center gap-3.5 flex-1 min-w-0 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#102436] border border-white/10 flex items-center justify-center text-[#39D9D0] font-mono text-xs font-bold shrink-0 group-hover:scale-105 transition-transform">
                    {s.eye_side === "RIGHT" ? "OD" : "OS"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono font-bold text-white group-hover:text-[#39D9D0] transition-colors truncate">
                        {s.case_number || (s.id ? `SCR-${s.id.slice(0, 8)}` : "SCR-CASE")}
                      </p>
                      {s.patient_code && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-[#5A7184]">
                          {s.patient_code}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9AAFC1] mt-0.5">
                      Examined: {formatDate(s.created_at)} · {s.facility_name || "Primary Health Centre"}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  {/* Status Badge */}
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase px-2 py-0.5 rounded border",
                      s.status === "REVIEWED"
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : s.status === "HUMAN_REVIEW_REQUIRED"
                        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                        : s.status === "RECAPTURE_REQUIRED"
                        ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                        : s.status === "ANALYZED"
                        ? "text-[#39D9D0] border-[#39D9D0]/30 bg-[#39D9D0]/10"
                        : "text-[#5A7184] border-white/10 bg-white/5"
                    )}
                  >
                    {s.status?.replace(/_/g, " ")}
                  </span>

                  {s.referral_priority && s.referral_priority !== "LOW" && (
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded border",
                        PRIORITY_COLOR[s.referral_priority] ?? "text-slate-400"
                      )}
                    >
                      {s.referral_priority}
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/analysis?id=${s.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-[#39D9D0] text-[11px] font-semibold transition"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      Analyze
                    </Link>

                    <Link
                      href={`/screenings/${s.id}`}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#9AAFC1] hover:text-white transition"
                      aria-label="View report"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
