"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { patientsApi } from "@/lib/api"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  Users,
  Scan,
  Plus,
  ChevronRight,
  TrendingUp,
  Activity,
  FileText,
  Calendar,
  AlertCircle,
  Eye,
  ShieldCheck,
  Brain,
  Stethoscope,
  ArrowRightLeft,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false)

  const { data: patient, isLoading: isPatientLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id).then((r) => r.data),
    enabled: !!id,
  })

  // Feature 25: Longitudinal screening history query
  const { data: historyData, isLoading: isScreeningsLoading } = useQuery({
    queryKey: ["patient-screenings-history", id],
    queryFn: () => patientsApi.screenings(id).then((r) => r.data),
    enabled: !!id,
  })

  const screenings = historyData?.screenings ?? []

  // Comparison query enabled when modal is opened with 2 selected screenings
  const s1 = selectedForCompare[0]
  const s2 = selectedForCompare[1]
  const { data: compareData, isLoading: isCompareLoading } = useQuery({
    queryKey: ["patient-screenings-compare", id, s1, s2],
    queryFn: () =>
      patientsApi
        .compare(id, s1, s2)
        .then((r) => r.data),
    enabled: showCompareModal && !!s1 && !!s2,
  })

  const toggleSelectForCompare = (screeningId: string) => {
    if (selectedForCompare.includes(screeningId)) {
      setSelectedForCompare(selectedForCompare.filter((sid) => sid !== screeningId))
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], screeningId])
      } else {
        setSelectedForCompare([...selectedForCompare, screeningId])
      }
    }
  }

  const openQuickCompare = () => {
    if (screenings.length >= 2) {
      // Pick first two if none selected
      if (selectedForCompare.length < 2) {
        setSelectedForCompare([screenings[1].id, screenings[0].id])
      }
      setShowCompareModal(true)
    }
  }

  if (isPatientLoading) {
    return (
      <div className="text-[#39D9D0] animate-pulse py-16 text-center text-xs flex items-center justify-center gap-2">
        <Activity className="w-5 h-5 animate-spin" />
        Loading clinical profile...
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="glass-card p-8 text-center rounded-2xl border border-rose-500/30">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-white">Patient Record Not Found</h3>
        <p className="text-xs text-[#9AAFC1] mt-1">The requested patient ID does not exist in the database.</p>
        <Link href="/patients" className="mt-4 inline-block text-xs text-[#39D9D0] hover:underline">
          ← Return to Patient Directory
        </Link>
      </div>
    )
  }

  const comparison = compareData?.comparison

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* HEADER PROFILE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 flex items-center justify-center text-[#39D9D0] font-bold text-lg font-mono">
            {patient.patient_code ? patient.patient_code.slice(-3) : "PT"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">
                {patient.name || patient.patient_code}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/5 text-[#5A7184]">
                {patient.patient_code}
              </span>
            </div>
            <p className="text-xs text-[#9AAFC1] mt-0.5">
              {[
                patient.age && `Age ${patient.age}`,
                patient.gender !== "PREFER_NOT_TO_SAY" ? patient.gender : null,
                patient.district,
                patient.state,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {screenings.length >= 2 && (
            <button
              type="button"
              onClick={openQuickCompare}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Compare Screenings
            </button>
          )}

          <Link
            href={`/screenings/new?patient_id=${patient.id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[#07111F] text-xs font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition active:scale-95"
          >
            <Plus className="w-4 h-4" /> New Screening
          </Link>
        </div>
      </div>

      {/* CLINICAL DATA CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Diabetes History */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#39D9D0] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Diabetes Profile
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Classification:</span>
              <span className="font-semibold text-white">{patient.diabetes_type || "Type 2"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Duration:</span>
              <span className="font-semibold text-white">
                {patient.diabetes_duration_years ? `${patient.diabetes_duration_years} years` : "Not recorded"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Therapy:</span>
              <span className="font-semibold text-white">{patient.diabetes_treatment || "Oral Hypoglycemic"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Latest HbA1c:</span>
              <span className="font-semibold text-[#39D9D0]">
                {patient.hba1c_value ? `${patient.hba1c_value}%` : "Pending measurement"}
              </span>
            </div>
          </div>
        </div>

        {/* Visual & Eye History */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#7C8CFF] flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Ocular Background
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Prior DR History:</span>
              <span className="font-semibold text-white">{patient.history_of_dr || "None Known"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Past Treatments:</span>
              <span className="font-semibold text-white">{patient.previous_eye_treatment || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Co-morbidities:</span>
              <span className="font-semibold text-white">{patient.relevant_eye_conditions || "None reported"}</span>
            </div>
          </div>
        </div>

        {/* Clinical Facility & Demographics */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Facility Context
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Primary Facility:</span>
              <span className="font-semibold text-white">{patient.facility_code || "Primary Health Centre"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">District:</span>
              <span className="font-semibold text-white">{patient.district || "Varanasi"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">State:</span>
              <span className="font-semibold text-white">{patient.state || "Uttar Pradesh"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* LONGITUDINAL SCREENING HISTORY (Feature 25) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#39D9D0]" />
            Longitudinal Screening History ({screenings.length})
          </h2>

          {selectedForCompare.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono">
                {selectedForCompare.length}/2 selected for comparison
              </span>
              {selectedForCompare.length === 2 && (
                <button
                  type="button"
                  onClick={() => setShowCompareModal(true)}
                  className="px-3 py-1 rounded-lg bg-purple-600 text-white font-bold text-xs shadow-md transition"
                >
                  View Side-by-Side Comparison →
                </button>
              )}
            </div>
          )}
        </div>

        {isScreeningsLoading ? (
          <div className="text-xs text-[#5A7184] py-8 text-center animate-pulse">Loading longitudinal history...</div>
        ) : screenings.length === 0 ? (
          <div className="glass-card p-8 text-center rounded-xl border border-white/10">
            <p className="text-xs text-[#9AAFC1]">No screenings have been performed for this patient yet.</p>
            <Link
              href={`/screenings/new?patient_id=${patient.id}`}
              className="mt-3 inline-block text-xs text-[#39D9D0] font-semibold hover:underline"
            >
              Initiate Baseline Screening →
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {screenings.map((s: any) => {
              const isSelected = selectedForCompare.includes(s.id)
              const caseNo = s.case_number || `DX-CASE-${s.id.slice(0, 8).toUpperCase()}`
              const priorityLevel = s.priority_level || "ROUTINE"

              return (
                <div
                  key={s.id}
                  className={cn(
                    "glass-card p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3",
                    isSelected
                      ? "border-purple-500/60 bg-purple-950/20"
                      : "border-white/10 hover:border-white/20 bg-[#0B1726]"
                  )}
                >
                  {/* Left: Eye side, Case number, Date */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelectForCompare(s.id)}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition",
                        isSelected
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "border-white/20 hover:border-white/40 text-transparent"
                      )}
                      title="Select for longitudinal comparison"
                    >
                      ✓
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-[#102436] border border-white/10 flex items-center justify-center font-mono text-xs font-bold text-[#39D9D0]">
                      {s.eye_side === "RIGHT" ? "OD" : "OS"}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-teal-300">{caseNo}</span>
                        {s.latest_doctor_action && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300">
                            Dr: {s.latest_doctor_action}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#5A7184] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {s.created_at ? formatDate(s.created_at) : "Unknown date"}
                      </p>
                    </div>
                  </div>

                  {/* Center: AI Findings & Priority */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {s.predicted_grade != null ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 font-semibold">
                        <span>Grade {s.predicted_grade}:</span>
                        <span>{s.grade_label}</span>
                        {s.confidence != null && (
                          <span className="text-[10px] font-mono opacity-80">
                            ({(s.confidence * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-xs">Awaiting Analysis</span>
                    )}

                    {/* Priority Tier */}
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold px-2 py-0.5 rounded border",
                        priorityLevel === "CRITICAL"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : priorityLevel === "HIGH"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : priorityLevel === "MEDIUM"
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                          : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      )}
                    >
                      {priorityLevel} ({s.priority_score ?? 0})
                    </span>

                    {/* Quality Tier */}
                    {s.quality_tier && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Q: {s.quality_tier} ({((s.image_quality_score ?? 0) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/analysis?id=${s.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-xs font-semibold text-[#39D9D0] transition"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      Inspect
                    </Link>
                    <Link
                      href={`/screenings/${s.id}`}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                      title="Open Detail"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SIDE-BY-SIDE LONGITUDINAL COMPARISON MODAL (Feature 25) */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-3xl w-full p-6 rounded-2xl border border-white/20 bg-[#0B1726] shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                  Longitudinal Screening Comparison
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Side-by-side progression analysis between examination dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isCompareLoading ? (
              <div className="py-12 text-center text-teal-400 text-xs animate-pulse">
                Computing progression metrics and delta analysis...
              </div>
            ) : !comparison ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Please select two valid screenings to view comparison.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progression Banner */}
                <div
                  className={cn(
                    "p-4 rounded-xl border flex items-center justify-between",
                    comparison.ai_progression === "PROGRESSED"
                      ? "bg-rose-950/30 border-rose-500/40 text-rose-300"
                      : comparison.ai_progression === "REGRESSED"
                      ? "bg-cyan-950/30 border-cyan-500/40 text-cyan-300"
                      : "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                  )}
                >
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider font-bold">
                      DR Progression Status: {comparison.ai_progression}
                    </p>
                    <p className="text-[11px] opacity-90">
                      Elapsed interval between examinations:{" "}
                      <span className="font-bold">{comparison.interval_days} days</span>.
                      Grade delta:{" "}
                      <span className="font-bold">
                        {comparison.ai_grade_delta > 0 ? `+${comparison.ai_grade_delta}` : comparison.ai_grade_delta}
                      </span>
                    </p>
                  </div>
                  <div
                    className={cn(
                      "px-3 py-1.5 rounded-lg font-mono font-bold text-xs uppercase",
                      comparison.ai_progression === "PROGRESSED"
                        ? "bg-rose-500 text-white"
                        : comparison.ai_progression === "REGRESSED"
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-emerald-500 text-slate-950"
                    )}
                  >
                    {comparison.ai_progression}
                  </div>
                </div>

                {/* Side-by-Side Comparison Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Screening 1 (Earlier) */}
                  <div className="p-4 rounded-xl bg-[#101F30] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-[11px] font-mono text-slate-400 uppercase">Baseline Examination</span>
                      <span className="text-[11px] font-mono font-bold text-teal-300">
                        {compareData.screening1?.case_number}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-400">
                        Date:{" "}
                        <span className="text-white">
                          {compareData.screening1?.created_at ? formatDate(compareData.screening1.created_at) : "—"}
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Eye: <span className="text-white">{compareData.screening1?.eye_side}</span>
                      </p>
                      <p className="text-slate-400">
                        AI Grade:{" "}
                        <span className="font-bold text-teal-300">
                          Grade {compareData.screening1?.predicted_grade} ({compareData.screening1?.grade_label})
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Confidence:{" "}
                        <span className="text-white">
                          {((compareData.screening1?.confidence ?? 0) * 100).toFixed(0)}%
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Doctor Action:{" "}
                        <span className="text-purple-300 font-semibold">
                          {compareData.screening1?.latest_doctor_action || "Pending"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Screening 2 (Follow-up) */}
                  <div className="p-4 rounded-xl bg-[#101F30] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-[11px] font-mono text-slate-400 uppercase">Follow-up Examination</span>
                      <span className="text-[11px] font-mono font-bold text-teal-300">
                        {compareData.screening2?.case_number}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="text-slate-400">
                        Date:{" "}
                        <span className="text-white">
                          {compareData.screening2?.created_at ? formatDate(compareData.screening2.created_at) : "—"}
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Eye: <span className="text-white">{compareData.screening2?.eye_side}</span>
                      </p>
                      <p className="text-slate-400">
                        AI Grade:{" "}
                        <span className="font-bold text-teal-300">
                          Grade {compareData.screening2?.predicted_grade} ({compareData.screening2?.grade_label})
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Confidence:{" "}
                        <span className="text-white">
                          {((compareData.screening2?.confidence ?? 0) * 100).toFixed(0)}%
                        </span>
                      </p>
                      <p className="text-slate-400">
                        Doctor Action:{" "}
                        <span className="text-purple-300 font-semibold">
                          {compareData.screening2?.latest_doctor_action || "Pending"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mandatory Biomicroscopy Clinical Disclaimer */}
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-bold uppercase tracking-wider text-[10px] text-amber-200">
                      Mandatory Longitudinal Clinical Disclaimer
                    </p>
                    <p className="text-[11px] mt-0.5 leading-relaxed text-amber-300/90">
                      {comparison.clinical_notice ||
                        "Longitudinal AI progression tracking does not replace regular stereoscopic biomicroscopy. Sudden vision changes require immediate specialist evaluation."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
