"use client"

import React from "react"
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  Info,
  Layers,
} from "lucide-react"

interface EvidenceConcordanceProps {
  concordanceCategory?: "HIGH_AGREEMENT" | "MEDIUM_AGREEMENT" | "LOW_AGREEMENT" | string
  concordanceScore?: number | null
  confidenceWeight?: number | null
  predictedGrade?: number | null
  gradeLabel?: string | null
  lesionBurden?: {
    microaneurysms: number
    hemorrhages: number
    hard_exudates: number
    total_lesions: number
    retinal_coverage_pct?: number
  } | null
  supportingEvidence?: string[]
  conflictingEvidence?: string[]
  missingEvidence?: string[]
  clinicalRationale?: string | null
  rulesTriggered?: string[]
}

export default function EvidenceConcordanceCard({
  concordanceCategory = "MEDIUM_AGREEMENT",
  concordanceScore,
  confidenceWeight,
  predictedGrade,
  gradeLabel,
  lesionBurden,
  supportingEvidence = [],
  conflictingEvidence = [],
  missingEvidence = [],
  clinicalRationale,
  rulesTriggered = [],
}: EvidenceConcordanceProps) {
  const getBadgeStyle = () => {
    switch (concordanceCategory) {
      case "HIGH_AGREEMENT":
        return {
          bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          label: "HIGH AGREEMENT",
          desc: "Predicted DR grade matches segmented lesion findings under ICDR criteria.",
        }
      case "LOW_AGREEMENT":
        return {
          bg: "bg-rose-500/15 border-rose-500/30 text-rose-300",
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
          label: "LOW AGREEMENT (DISCREPANCY)",
          desc: "Significant divergence between model grade and detected lesion pathology.",
        }
      case "MEDIUM_AGREEMENT":
      default:
        return {
          bg: "bg-amber-500/15 border-amber-500/30 text-amber-300",
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          label: "MEDIUM AGREEMENT",
          desc: "Partial lesion overlap; findings are plausible within borderline grade boundaries.",
        }
    }
  }

  const badge = getBadgeStyle()

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0B1726] p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              Evidence Concordance Engine
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                Feature 15
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic biological alignment between EfficientNet-B0 classification & U-Net lesion segmentation.
            </p>
          </div>
        </div>

        {/* Concordance Category Pill */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-semibold text-xs tracking-wide ${badge.bg}`}>
          {badge.icon}
          <span>{badge.label}</span>
          {concordanceScore != null && (
            <span className="ml-1 font-mono text-[11px] opacity-90">
              ({(concordanceScore * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Rationale Callout */}
      {clinicalRationale && (
        <div className="p-3.5 rounded-xl bg-[#101F30] border border-white/5 text-xs text-slate-300 leading-relaxed">
          <p className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-teal-400" />
            Clinical Rationale:
          </p>
          {clinicalRationale}
        </div>
      )}

      {/* Evidence Breakdown Grid: Supporting vs Conflicting vs Missing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {/* Supporting Evidence */}
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-300 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Supporting Findings ({supportingEvidence.length})
          </div>
          {supportingEvidence.length > 0 ? (
            <ul className="space-y-1.5 text-[11px] text-slate-300">
              {supportingEvidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No direct positive alignment detected.</p>
          )}
        </div>

        {/* Conflicting Evidence */}
        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-rose-300 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            Conflicting Evidence ({conflictingEvidence.length})
          </div>
          {conflictingEvidence.length > 0 ? (
            <ul className="space-y-1.5 text-[11px] text-slate-300">
              {conflictingEvidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No contradictory lesions detected.</p>
          )}
        </div>

        {/* Missing Expected Pathology */}
        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300 text-xs">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            Expected Absent Pathology ({missingEvidence.length})
          </div>
          {missingEvidence.length > 0 ? (
            <ul className="space-y-1.5 text-[11px] text-slate-300">
              {missingEvidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-500 italic">No expected features are noticeably absent.</p>
          )}
        </div>
      </div>

      {/* Rules Triggered Footnote */}
      {rulesTriggered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[10px] text-slate-500 font-mono">
          <span>Evaluated ICDR Rules:</span>
          {rulesTriggered.map((rule, idx) => (
            <span key={idx} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-slate-400">
              {rule}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

