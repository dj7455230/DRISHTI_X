"use client"

import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { screeningsApi, dashboardApi } from "@/lib/api"
import Link from "next/link"
import {
  Stethoscope,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  AlertOctagon,
  Scale,
  Eye,
  Filter,
  UserCheck,
  Activity,
  ArrowUpRight,
  Clock,
  RotateCcw,
  Send,
  HelpCircle,
  Check,
  X,
  ExternalLink,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

export default function ReviewPage() {
  const queryClient = useQueryClient()
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json")
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [queueType, setQueueType] = useState<"review" | "recapture">("review")
  const [filterPriority, setFilterPriority] = useState<string>("ALL")
  const [selectedCaseForAction, setSelectedCaseForAction] = useState<any | null>(null)
  const [actionType, setActionType] = useState<"ACCEPT" | "REVIEW_FURTHER" | "REFER" | "RECAPTURE" | null>(null)
  const [actionNotes, setActionNotes] = useState<string>("")
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>("")
  const [referralDestination, setReferralDestination] = useState<string>("Regional Tertiary Eye Hospital")
  const [referralUrgency, setReferralUrgency] = useState<string>("HIGH")

  // Fetch Priority Referral Queue (Features 21 & 22)
  const { data: queueData, isLoading: isQueueLoading } = useQuery({
    queryKey: ["referral-queue", queueType, filterPriority],
    queryFn: () =>
      dashboardApi
        .referralQueue({
          queue_type: queueType,
          priority: filterPriority === "ALL" ? undefined : filterPriority,
          sort_by: "priority_score",
          limit: 100,
        })
        .then((r) => r.data),
    staleTime: 10_000,
  })

  // Fetch dedicated ophthalmologist dashboard summary metrics
  const { data: opData } = useQuery({
    queryKey: ["ophthalmologist-dashboard"],
    queryFn: () => dashboardApi.ophthalmologistDashboard({ limit: 100 }).then((r) => r.data),
    staleTime: 10_000,
  })

  // Fetch clinician feedback analytics
  const { data: analytics } = useQuery({
    queryKey: ["feedback-analytics"],
    queryFn: () => screeningsApi.feedbackAnalytics().then((r) => r.data),
    staleTime: 20_000,
  })

  // Mutation for Doctor Review Action (Features 23 & 24)
  const reviewActionMutation = useMutation({
    mutationFn: (data: {
      screeningId: string
      action: "ACCEPT" | "REVIEW_FURTHER" | "REFER" | "RECAPTURE"
      notes?: string
      referral_destination?: string
      referral_urgency?: string
      recapture_reason?: string
      agreed_with_ai?: boolean
    }) => {
      const { screeningId, ...payload } = data
      return screeningsApi.reviewAction(screeningId, payload)
    },
    onSuccess: () => {
      setActionSuccessMsg(`Action recorded successfully in immutable clinical audit log.`)
      setTimeout(() => setActionSuccessMsg(""), 4000)
      setSelectedCaseForAction(null)
      setActionType(null)
      setActionNotes("")
      queryClient.invalidateQueries({ queryKey: ["referral-queue"] })
      queryClient.invalidateQueries({ queryKey: ["ophthalmologist-dashboard"] })
    },
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

  const handleQuickAction = (c: any, action: "ACCEPT" | "REVIEW_FURTHER" | "REFER" | "RECAPTURE") => {
    setSelectedCaseForAction(c)
    setActionType(action)
    setActionNotes("")
  }

  const submitAction = () => {
    if (!selectedCaseForAction || !actionType) return
    reviewActionMutation.mutate({
      screeningId: selectedCaseForAction.id,
      action: actionType,
      notes: actionNotes || `Doctor ${actionType.replace("_", " ")} signed from Priority Referral Queue`,
      agreed_with_ai: actionType === "ACCEPT",
      referral_destination: actionType === "REFER" ? referralDestination : undefined,
      referral_urgency: actionType === "REFER" ? referralUrgency : undefined,
      recapture_reason: actionType === "RECAPTURE" ? (actionNotes || "Suboptimal image quality requires recapture") : undefined,
    })
  }

  const cases = queueData?.cases ?? []
  const summary = queueData?.summary ?? {}
  const metrics = opData?.metrics ?? {}
  const totalReviews = analytics?.total_reviews ?? 0
  const heatmapUsefulness = analytics?.heatmap_usefulness_breakdown ?? {}
  const disagreementReasons = analytics?.top_disagreement_reasons ?? {}

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Stethoscope className="w-6 h-6 text-purple-400" />
            Priority Referral Queue & <span className="gradient-text">Doctor Clinical Triage</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Features 21–24: Rule-based 0–100 deterministic clinical triage, immutable doctor review actions, and non-autonomous human-in-the-loop oversight.
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

      {/* Non-Diagnostic Disclaimer Banner */}
      <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-200 uppercase tracking-wide text-[11px]">
            Operational Priority Triage Notice (Rule Engine v1.0.0)
          </p>
          <p className="text-amber-300/90 text-[11px] mt-0.5 leading-relaxed">
            Priority scores (0–100) and triage tiers are operational queue-sorting aids derived from AI grade, quality metrics, and evidence concordance. They do not constitute an autonomous clinical diagnosis. The ophthalmologist retains sole clinical authority.
          </p>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Clinical Triage Metrics Cards (Feature 21 & 22) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="glass-card p-3.5 border border-white/10 rounded-xl text-center">
          <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Queue Total</p>
          <p className="text-2xl font-bold text-white font-mono">{queueData?.total ?? 0}</p>
        </div>
        <div className="glass-card p-3.5 border border-rose-500/30 bg-rose-500/5 rounded-xl text-center">
          <p className="text-[11px] text-rose-300/80 uppercase tracking-wider mb-1">Critical (≥70)</p>
          <p className="text-2xl font-bold text-rose-400 font-mono">{summary.critical ?? metrics.critical_cases ?? 0}</p>
        </div>
        <div className="glass-card p-3.5 border border-amber-500/30 bg-amber-500/5 rounded-xl text-center">
          <p className="text-[11px] text-amber-300/80 uppercase tracking-wider mb-1">High (50–69)</p>
          <p className="text-2xl font-bold text-amber-400 font-mono">{summary.high ?? 0}</p>
        </div>
        <div className="glass-card p-3.5 border border-cyan-500/30 bg-cyan-500/5 rounded-xl text-center">
          <p className="text-[11px] text-cyan-300/80 uppercase tracking-wider mb-1">Medium (25–49)</p>
          <p className="text-2xl font-bold text-cyan-400 font-mono">{summary.medium ?? 0}</p>
        </div>
        <div className="glass-card p-3.5 border border-emerald-500/30 bg-emerald-500/5 rounded-xl text-center">
          <p className="text-[11px] text-emerald-300/80 uppercase tracking-wider mb-1">Routine (&lt;25)</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{summary.routine ?? 0}</p>
        </div>
        <div className="glass-card p-3.5 border border-orange-500/30 bg-orange-500/5 rounded-xl text-center">
          <p className="text-[11px] text-orange-300/80 uppercase tracking-wider mb-1">Recapture Needed</p>
          <p className="text-2xl font-bold text-orange-400 font-mono">{summary.recapture ?? metrics.recapture_required ?? 0}</p>
        </div>
      </div>

      {/* Priority Review Queue Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Queue Type Switcher: Review Queue vs Recapture Queue */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0B1726] border border-white/10">
            <button
              type="button"
              onClick={() => setQueueType("review")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5",
                queueType === "review"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              Active Review Queue ({summary.critical ? summary.critical + summary.high + summary.medium + summary.routine : cases.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueType("recapture")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5",
                queueType === "recapture"
                  ? "bg-orange-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Recapture Queue ({summary.recapture ?? 0})
            </button>
          </div>

          {/* Priority Triage Level Filter */}
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#101F30] p-1 text-xs">
            <span className="text-[10px] text-slate-400 font-mono px-2">Triage:</span>
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "ROUTINE"].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setFilterPriority(lvl)}
                className={cn(
                  "px-2.5 py-1 rounded font-medium transition text-xs",
                  filterPriority === lvl
                    ? lvl === "CRITICAL"
                      ? "bg-rose-500/30 text-rose-300 border border-rose-500/50"
                      : lvl === "HIGH"
                      ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                      : "bg-white/20 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {isQueueLoading ? (
          <div className="text-teal-400 animate-pulse py-12 text-center text-sm">
            Loading prioritized triage queue...
          </div>
        ) : cases.length === 0 ? (
          <div className="glass-card p-12 text-center border border-white/10 rounded-2xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-500/80 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No Cases in this Queue</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              All cases in the selected filter ({filterPriority}) have been reviewed or signed off by the clinical team.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c: any) => {
              const priorityLevel = c.priority_level || "ROUTINE"
              const isCrit = priorityLevel === "CRITICAL"
              const isHigh = priorityLevel === "HIGH"
              const isMed = priorityLevel === "MEDIUM"
              const caseNo = c.case_number || (c.id ? `DX-CASE-${c.id.slice(0, 8).toUpperCase()}` : "DX-CASE-UNKNOWN")

              return (
                <div
                  key={c.id}
                  className={cn(
                    "glass-card p-4 rounded-xl border transition-all duration-200",
                    isCrit
                      ? "border-rose-500/40 bg-rose-950/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
                      : isHigh
                      ? "border-amber-500/30 bg-amber-950/15"
                      : isMed
                      ? "border-cyan-500/20 bg-cyan-950/10"
                      : "border-white/10 bg-[#0B1726]"
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Patient & Case Identifiers */}
                    <div className="space-y-1.5 min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{c.patient_name}</span>
                        {c.patient_code && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                            {c.patient_code}
                          </span>
                        )}
                        {c.patient_age && (
                          <span className="text-xs text-slate-400">
                            {c.patient_age} yrs • {c.patient_gender || "Unknown"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-[11px] text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                          {caseNo}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                          <Clock className="w-3 h-3" />
                          {c.created_at ? formatDate(c.created_at) : "Recently"}
                        </span>
                        {c.review_count > 0 && (
                          <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            {c.review_count} prior review{c.review_count > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI Findings Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Priority Score Pill (Feature 22) */}
                      <div
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-mono font-bold border flex items-center gap-1.5",
                          isCrit
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            : isHigh
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : isMed
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        )}
                      >
                        <span>{priorityLevel}</span>
                        <span className="text-[10px] opacity-80">({c.priority_score ?? 0}/100)</span>
                      </div>

                      {/* AI DR Grade */}
                      {c.predicted_grade != null ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold">
                          <span>Grade {c.predicted_grade}:</span>
                          <span>{c.grade_label}</span>
                          {c.confidence != null && (
                            <span className="text-[10px] font-mono text-teal-400/80">
                              ({(c.confidence * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs">
                          Not Graded
                        </div>
                      )}

                      {/* Assurance Status */}
                      {c.assurance_status && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-slate-300">
                          {c.assurance_status.replace(/_/g, " ")}
                        </span>
                      )}

                      {/* Mismatch Alert Flag */}
                      {c.mismatch_detected && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300">
                          <AlertOctagon className="w-3 h-3 text-rose-400" />
                          Mismatch Flagged
                        </span>
                      )}
                    </div>

                    {/* Quick Doctor Review Actions (Features 23 & 24) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/5">
                      <button
                        type="button"
                        onClick={() => handleQuickAction(c, "ACCEPT")}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1"
                        title="Accept AI Prediction"
                      >
                        <Check className="w-3 h-3" />
                        Accept
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickAction(c, "REVIEW_FURTHER")}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center gap-1"
                        title="Request Secondary Consultation / Further Review"
                      >
                        <HelpCircle className="w-3 h-3" />
                        Review Further
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickAction(c, "REFER")}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition flex items-center gap-1"
                        title="Clinical Escalation / Hospital Referral"
                      >
                        <Send className="w-3 h-3" />
                        Refer
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickAction(c, "RECAPTURE")}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 transition flex items-center gap-1"
                        title="Reject Image & Request Quality Recapture"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Recapture
                      </button>

                      {/* Detail Link */}
                      <Link
                        href={`/screenings/${c.id}`}
                        className="p-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition"
                        title="Open Full Screening Detail"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Factor Breakdown Preview if Available */}
                  {c.priority_factors && Object.keys(c.priority_factors).length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-300">Triage Factors:</span>
                      {c.priority_factors.base_grade_points != null && (
                        <span>Grade Pts: +{c.priority_factors.base_grade_points}</span>
                      )}
                      {c.priority_factors.low_confidence_points != null && c.priority_factors.low_confidence_points > 0 && (
                        <span className="text-amber-400">Low Conf: +{c.priority_factors.low_confidence_points}</span>
                      )}
                      {c.priority_factors.mismatch_penalty != null && c.priority_factors.mismatch_penalty > 0 && (
                        <span className="text-rose-400">Mismatch: +{c.priority_factors.mismatch_penalty}</span>
                      )}
                      {c.priority_factors.poor_quality_points != null && c.priority_factors.poor_quality_points > 0 && (
                        <span className="text-orange-400">Quality Risk: +{c.priority_factors.poor_quality_points}</span>
                      )}
                      {c.priority_factors.diabetic_duration_points != null && c.priority_factors.diabetic_duration_points > 0 && (
                        <span className="text-cyan-400">History: +{c.priority_factors.diabetic_duration_points}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Doctor Action Modal (Feature 23 & 24) */}
      {selectedCaseForAction && actionType && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-lg w-full p-6 rounded-2xl border border-white/20 bg-[#0B1726] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-purple-400" />
                Confirm Doctor Clinical Action: {actionType.replace("_", " ")}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedCaseForAction(null)
                  setActionType(null)
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
              <p>
                <span className="text-slate-400">Case Number:</span>{" "}
                <span className="font-mono font-bold text-teal-300">
                  {selectedCaseForAction.case_number || selectedCaseForAction.id}
                </span>
              </p>
              <p>
                <span className="text-slate-400">Patient:</span>{" "}
                <span className="font-semibold text-white">{selectedCaseForAction.patient_name}</span> (
                {selectedCaseForAction.patient_code})
              </p>
              <p>
                <span className="text-slate-400">AI Assessment:</span> Grade {selectedCaseForAction.predicted_grade} (
                {selectedCaseForAction.grade_label}), Priority: {selectedCaseForAction.priority_level} (
                {selectedCaseForAction.priority_score}/100)
              </p>
            </div>

            {/* Action-Specific Inputs */}
            {actionType === "REFER" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Referral Destination Center
                  </label>
                  <input
                    type="text"
                    value={referralDestination}
                    onChange={(e) => setReferralDestination(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-[#101F30] border border-white/10 text-white"
                    placeholder="e.g. Apex Retinal Center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Referral Urgency</label>
                  <select
                    value={referralUrgency}
                    onChange={(e) => setReferralUrgency(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-[#101F30] border border-white/10 text-white"
                  >
                    <option value="CRITICAL">Critical (Immediate ophthalmology consultation)</option>
                    <option value="HIGH">High (Within 2 weeks)</option>
                    <option value="MEDIUM">Medium (Within 1-2 months)</option>
                    <option value="ROUTINE">Routine Annual Follow-up</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Clinical Observation & Audit Notes:
              </label>
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                rows={3}
                className="w-full text-xs px-3 py-2 rounded-lg bg-[#101F30] border border-white/10 text-white placeholder-slate-500"
                placeholder={
                  actionType === "ACCEPT"
                    ? "Confirming concordance with fundus examination."
                    : actionType === "RECAPTURE"
                    ? "State reason for image recapture (e.g., poor focus, motion blur, pupil obstruction)..."
                    : "Add clinical context or reason for referral/further review..."
                }
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setSelectedCaseForAction(null)
                  setActionType(null)
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAction}
                disabled={reviewActionMutation.isPending}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition flex items-center gap-1.5"
              >
                {reviewActionMutation.isPending ? "Recording Audit..." : "Confirm & Sign Action"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Governance & Disagreement Analytics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
        {/* Heatmap Clinical Usefulness Breakdown */}
        <div className="glass-card p-5 border border-white/10 rounded-xl space-y-3 bg-[#0B1726]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Grad-CAM Explainability Utility Breakdown
          </h3>
          <p className="text-xs text-slate-400">
            Clinician evaluations of EfficientNet-B0 saliency heatmap clinical relevance.
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

        {/* Top Clinical Disagreements & Governance Protocol */}
        <div className="glass-card p-5 border border-white/10 rounded-xl space-y-3 bg-[#0B1726]">
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
                  <span className="text-slate-300 font-mono text-[11px]">{code.replace(/_/g, " ")}</span>
                  <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10">
                    {count} case{count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
            <p className="font-semibold flex items-center gap-1.5 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              Safety Governance Policy:
            </p>
            <p className="text-slate-300 text-[10px] mt-0.5 leading-relaxed">
              Continuous automated retraining in production is disabled to adhere to medical device software safety guidelines. Feedback is archived in immutable logs for offline expert audit.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
