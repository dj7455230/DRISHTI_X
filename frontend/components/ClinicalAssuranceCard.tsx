"use client"

import React from "react"
import {
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileText,
  AlertOctagon,
  ArrowRight,
  Stethoscope,
  Info,
} from "lucide-react"

interface AssuranceReason {
  rule_id: string
  category: string
  severity: "CRITICAL" | "WARNING" | "INFO" | string
  evidence_source: string
  explanation: string
  action_required: string
}

interface MismatchAlert {
  rule_id: string
  rule_name: string
  severity: "CRITICAL" | "WARNING" | "INFO" | string
  category: string
  description: string
  clinical_implication: string
  recommended_action: string
  non_destructive_notice: string
}

interface ClinicalAssuranceProps {
  decision?: "VALIDATED" | "HUMAN_REVIEW_REQUIRED" | "RECAPTURE_REQUIRED" | string
  priorityLevel?: number
  summary?: string
  reasons?: (AssuranceReason | string)[]
  mismatches?: {
    mismatch_detected: boolean
    critical_count: number
    warning_count: number
    alerts: MismatchAlert[]
    summary: string
  } | null
  qualityScore?: number | null
  confidence?: number | null
  referralPriority?: string | null
  referralScore?: number | null
  isReferable?: boolean | null
}

export default function ClinicalAssuranceCard({
  decision = "HUMAN_REVIEW_REQUIRED",
  priorityLevel = 2,
  summary,
  reasons = [],
  mismatches,
  qualityScore,
  confidence,
  referralPriority = "MEDIUM",
  referralScore,
  isReferable,
}: ClinicalAssuranceProps) {
  const getDecisionBadge = () => {
    switch (decision) {
      case "VALIDATED":
        return {
          bg: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
          title: "PRELIMINARY SCREENING VALIDATED",
          subtitle: "Clear fundus optics, high calibrated confidence, and concordant lesion markers.",
          bannerColor: "border-l-emerald-500",
        }
      case "RECAPTURE_REQUIRED":
        return {
          bg: "bg-rose-500/15 border-rose-500/40 text-rose-300",
          icon: <RotateCcw className="w-5 h-5 text-rose-400" />,
          title: "IMAGE RECAPTURE REQUIRED",
          subtitle: "Optical quality is below diagnostic threshold. Acquisition cannot proceed safely.",
          bannerColor: "border-l-rose-500",
        }
      case "HUMAN_REVIEW_REQUIRED":
      default:
        return {
          bg: "bg-amber-500/15 border-amber-500/40 text-amber-300",
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
          title: "HUMAN OPHTHALMOLOGIST REVIEW MANDATORY",
          subtitle: "Clinical governance safety gate triggered (borderline metrics, referable DR, or mismatch).",
          bannerColor: "border-l-amber-500",
        }
    }
  }

  const badge = getDecisionBadge()
  const alerts = mismatches?.alerts ?? []

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B1726] p-5 shadow-2xl space-y-5">
      {/* Three-Way Decision Banner (Feature 18) */}
      <div className={`p-4 rounded-xl border border-white/10 bg-[#101F30] border-l-4 ${badge.bannerColor} flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 shrink-0">
            {badge.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Safety Priority Level {priorityLevel}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
                Three-Way Decision
              </span>
            </div>
            <h2 className="text-base font-bold text-white tracking-wide mt-0.5">
              {badge.title}
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              {summary || badge.subtitle}
            </p>
          </div>
        </div>

        {/* Decision Pill */}
        <div className={`px-4 py-2 rounded-xl border font-bold text-xs tracking-wider flex items-center gap-2 shadow-lg ${badge.bg}`}>
          {decision}
        </div>
      </div>

      {/* Feature 16: Grade-Lesion Mismatch Detection Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              Grade-Lesion Mismatch Alerts (Feature 16)
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono">
                {alerts.length} Detected
              </span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Non-destructive safeguard: Original AI outputs are preserved
            </span>
          </div>

          <div className="space-y-2.5">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border transition ${
                  alert.severity === "CRITICAL"
                    ? "bg-rose-950/25 border-rose-500/40 text-rose-200"
                    : alert.severity === "WARNING"
                    ? "bg-amber-950/25 border-amber-500/40 text-amber-200"
                    : "bg-blue-950/25 border-blue-500/40 text-blue-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 border border-white/10">
                      {alert.rule_id}
                    </span>
                    <span className="font-semibold text-xs text-white">
                      {alert.rule_name}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                      alert.severity === "CRITICAL"
                        ? "bg-rose-500 text-white"
                        : alert.severity === "WARNING"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  {alert.description}
                </p>

                <div className="mt-2.5 pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-teal-400" />
                    <strong>Action:</strong> {alert.recommended_action}
                  </span>
                  <span className="text-slate-500 font-mono text-[10px] italic">
                    {alert.non_destructive_notice}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature 19: Auditable Reason Behind Assurance Decision */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-400" />
            Auditable Assurance Reasons & Rule Provenance (Feature 19)
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            {reasons.length} Clinical Safety Checks Logged
          </span>
        </div>

        <div className="space-y-2">
          {reasons.map((item, idx) => {
            const isObj = typeof item === "object" && item !== null
            const ruleId = isObj ? (item as AssuranceReason).rule_id : `REASON_${idx + 1}`
            const category = isObj ? (item as AssuranceReason).category : "GENERAL"
            const explanation = isObj ? (item as AssuranceReason).explanation : String(item)
            const source = isObj ? (item as AssuranceReason).evidence_source : "Clinical Safety Pipeline"
            const action = isObj ? (item as AssuranceReason).action_required : null

            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[#101F30]/70 border border-white/5 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-teal-400 px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/20">
                      {ruleId}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {category} • {source}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-normal">
                  {explanation}
                </p>

                {action && (
                  <p className="text-[11px] text-teal-300/90 font-medium flex items-center gap-1 pt-1">
                    <Stethoscope className="w-3 h-3 text-teal-400 shrink-0" />
                    <strong>Required Clinical Action:</strong> {action}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

