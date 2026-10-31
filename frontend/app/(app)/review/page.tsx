"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { screeningsApi } from "@/lib/api"
import Link from "next/link"
import {
  Stethoscope,
  ChevronRight,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

export default function ReviewPage() {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json")
  const [isExporting, setIsExporting] = useState<boolean>(false)

  // Fetch pending doctor reviews
  const { data: queue, isLoading: isQueueLoading } = useQuery({
    queryKey: ["screenings-review"],
    queryFn: () =>
      screeningsApi.list({ status: "HUMAN_REVIEW_REQUIRED", limit: 50 }).then((r) => r.data),
  })

  // Fetch clinician feedback analytics
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ["feedback-analytics"],
    queryFn: () => screeningsApi.feedbackAnalytics().then((r) => r.data),
    staleTime: 20_000,
  })

  const handleExport = async (format: "json" | "csv") => {
    setIsExporting(true)
    try {
      const res = await screeningsApi.feedbackExport(format)
      if (format === "csv") {
        const blob = new Blob([res.data], { type: "text/csv" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "clinician_feedback_export.csv"
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json",
        })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "clinician_feedback_export.json"
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error("Export failed", e)
    } finally {
      setIsExporting(false)
    }
  }

  const totalReviews = analytics?.total_reviews ?? 0
  const agreementRate = analytics?.ai_agreement_rate != null ? (analytics.ai_agreement_rate * 100).toFixed(1) : "—"
  const modifiedRate = analytics?.ai_modified_rate != null ? (analytics.ai_modified_rate * 100).toFixed(1) : "—"
  const heatmapUsefulness = analytics?.heatmap_usefulness_breakdown ?? {}
  const disagreementReasons = analytics?.top_disagreement_reasons ?? {}

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Stethoscope className="w-6 h-6 text-purple-400" />
            Doctor Review & <span className="gradient-text">Feedback Analytics</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Clinician governance loop: independent evaluation, structured disagreement audit, and curated export.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport("json")}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport("csv")}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4 border border-white/10 text-center">
          <p className="text-xs text-slate-400 mb-1">Total Doctor Reviews</p>
          <p className="text-3xl font-bold text-white">{totalReviews}</p>
        </div>
        <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">AI Agreement Rate</p>
          <p className="text-3xl font-bold text-emerald-400">{agreementRate}%</p>
        </div>
        <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">Doctor Modified Rate</p>
          <p className="text-3xl font-bold text-amber-400">{modifiedRate}%</p>
        </div>
        <div className="glass-card p-4 border border-cyan-500/30 bg-cyan-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">Quality Assessment Agreed</p>
          <p className="text-3xl font-bold text-cyan-400">{analytics?.quality_agreement_count ?? 0}</p>
        </div>
      </div>

      {/* Structured Insights: Heatmap Utility & Disagreements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Heatmap Clinical Usefulness Breakdown */}
        <div className="glass-card p-5 border border-white/10 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Grad-CAM Explainability Utility Breakdown
          </h3>
          <p className="text-xs text-slate-400">
            How clinicians rated the interpretability and alignment of Grad-CAM attention heatmaps.
          </p>

          <div className="space-y-2 pt-1 text-xs">
            {[
              ["HIGHLY_USEFUL", "Highly Useful", "text-emerald-400", "bg-emerald-500"],
              ["MODERATELY_USEFUL", "Moderately Useful", "text-cyan-400", "bg-cyan-500"],
              ["MISLEADING", "Misleading", "text-amber-400", "bg-amber-500"],
              ["NOT_USEFUL", "Not Useful", "text-red-400", "bg-red-500"],
            ].map(([key, label, textCol, barCol]) => {
              const count = heatmapUsefulness[key] ?? 0
              const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">{label}</span>
                    <span className={cn("font-mono font-semibold", textCol)}>
                      {count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={cn("h-full rounded-full", barCol)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top Disagreement Codes */}
        <div className="glass-card p-5 border border-white/10 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Top Clinical Disagreement Codes
          </h3>
          <p className="text-xs text-slate-400">
            Pathological nuances flagged during clinician disagreement overrides.
          </p>

          {Object.keys(disagreementReasons).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No disagreement codes recorded yet. Clinician modifications will be cataloged here.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {Object.entries(disagreementReasons).map(([code, count]: any) => (
                <div key={code} className="p-2.5 rounded-lg bg-white/5 flex items-center justify-between">
                  <span className="text-slate-300 font-mono text-[11px]">
                    {code.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10">
                    {count} case{count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clinical Governance Statement */}
      <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 space-y-1">
        <p className="font-semibold flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          Safety & Regulatory Governance Protocol:
        </p>
        <p className="text-slate-300 leading-relaxed">
          {analytics?.clinical_governance_notice ||
            "Continuous automated retraining in production is disabled to adhere to regulatory safety guidelines. Feedback is archived for offline expert audit."}
        </p>
      </div>

      {/* Pending Human Review Queue Section */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          Cases Pending Ophthalmologist Review ({queue?.length ?? 0})
        </h2>

        {isQueueLoading ? (
          <div className="text-cyan-400 animate-pulse py-8 text-center">Loading pending queue...</div>
        ) : (queue ?? []).length === 0 ? (
          <div className="glass-card p-10 text-center border border-white/10 rounded-xl">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/80 mx-auto mb-2" />
            <p className="text-slate-300 font-medium">All cases reviewed</p>
            <p className="text-xs text-slate-500 mt-1">
              No screenings currently require human intervention.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {(queue ?? []).map((s: any) => (
              <Link
                key={s.id}
                href={`/screenings/${s.id}`}
                className="glass-card px-5 py-4 flex items-center gap-4 hover:border-purple-500/30 transition-colors group rounded-xl border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-slate-300 truncate">
                    Case #{s.id.slice(0, 22)}...
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(s.created_at)}</p>
                </div>
                <span className="text-xs text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 rounded-full font-mono">
                  HUMAN REVIEW REQUIRED
                </span>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
