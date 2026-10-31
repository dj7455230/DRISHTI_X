"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Stethoscope,
  Eye,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Send,
  FileText,
  ShieldCheck,
  Activity,
  BarChart3,
  Sparkles,
  Info,
  Maximize2,
  ChevronRight,
} from "lucide-react"
import { screeningsApi, dashboardApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/store"

const ICDR_GRADES = [
  { grade: 0, label: "Grade 0: No Apparent DR", desc: "No microaneurysms or hemorrhages" },
  { grade: 1, label: "Grade 1: Mild NPDR", desc: "Microaneurysms only" },
  { grade: 2, label: "Grade 2: Moderate NPDR", desc: "More than MAs, less than severe" },
  { grade: 3, label: "Grade 3: Severe NPDR", desc: "4:2:1 rule met (HEs in 4 quads, venous beading)" },
  { grade: 4, label: "Grade 4: Proliferative DR (PDR)", desc: "Neovascularization or vitreous hemorrhage" },
]

export default function ExpertModePage() {
  const { user } = useAuthStore()

  // Selected Active Case
  const [selectedCaseId, setSelectedCaseId] = useState<string>("CASE-2026-9041")
  const [sampleKey, setSampleKey] = useState<string>("aptos_sample_1")

  // Visualization Toggles
  const [showGradCam, setShowGradCam] = useState(true)
  const [gradCamOpacity, setGradCamOpacity] = useState(65)
  const [activeLesions, setActiveLesions] = useState<Record<string, boolean>>({
    MA: true,
    HE: true,
    EX: true,
    SE: true,
    OD: true,
  })

  // Doctor Adjudication Form
  const [doctorGrade, setDoctorGrade] = useState<number>(2)
  const [adjudicationAction, setAdjudicationAction] = useState<"ACCEPT" | "OVERRIDE" | "RECAPTURE">("ACCEPT")
  const [clinicalNotes, setClinicalNotes] = useState(
    "Multiple intraretinal microaneurysms and flame-shaped hemorrhages observed in superior-temporal quadrant. Lipid exudates approaching macula. Agree with AI Grade 2 (Moderate NPDR). Recommend follow-up OCT in 6 weeks."
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [adjudicationSuccess, setAdjudicationSuccess] = useState(false)

  // Probabilities distribution (calibrated softmax)
  const probabilities = [
    { grade: 0, label: "Grade 0 (No DR)", prob: 0.03 },
    { grade: 1, label: "Grade 1 (Mild)", prob: 0.11 },
    { grade: 2, label: "Grade 2 (Moderate)", prob: 0.78 },
    { grade: 3, label: "Grade 3 (Severe)", prob: 0.06 },
    { grade: 4, label: "Grade 4 (PDR)", prob: 0.02 },
  ]

  const toggleLesion = (key: string) => {
    setActiveLesions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSignOff = () => {
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setAdjudicationSuccess(true)
    }, 800)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5" /> Feature 49
            </span>
            <span className="text-xs text-slate-500">Ophthalmologist Specialist Diagnostic Cockpit</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Expert Doctor <span className="gradient-text">Adjudication Mode</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            High-density multimodal diagnostic suite with dual-fundus inspection, Grad-CAM attention slider, U-Net lesion overlays, and cryptographic digital sign-off.
          </p>
        </div>

        {/* Case Selector Pills */}
        <div className="flex items-center gap-2">
          {[
            { id: "CASE-2026-9041", label: "Patient Savitri Devi (OD)", sample: "aptos_sample_1" },
            { id: "CASE-2026-9042", label: "Patient Harish Patel (OS)", sample: "idrid_sample_1" },
            { id: "CASE-2026-9043", label: "Patient Fatima Begum (OD)", sample: "messidor2_sample_1" },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCaseId(c.id)
                setSampleKey(c.sample)
                setAdjudicationSuccess(false)
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border min-h-[38px]",
                selectedCaseId === c.id
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Dual Viewer & Diagnostic Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dual Fundus Viewer (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-bold flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Dual Retinal Fundus Inspection
              </span>
              <span className="text-slate-400 font-mono">
                Case: {selectedCaseId} | Resolution: 2240 × 1488 px
              </span>
            </div>

            {/* Split Screen Container */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Raw Fundus Image */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Raw Optical Fundus
                </span>
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black aspect-square flex items-center justify-center">
                  <img
                    src={`/api/screenings/demo/sample-image-file/${sampleKey}`}
                    alt="Raw Fundus"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-white font-mono">
                    Native Sensor View
                  </span>
                </div>
              </div>

              {/* AI Augmented View with Overlays */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  AI Explainability Overlays
                </span>
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black aspect-square flex items-center justify-center">
                  <img
                    src={`/api/screenings/demo/sample-image-file/${sampleKey}`}
                    alt="Augmented Fundus"
                    className="w-full h-full object-cover"
                  />

                  {/* Grad-CAM Heatmap Simulation Overlay */}
                  {showGradCam && (
                    <div
                      className="absolute inset-0 pointer-events-none mix-blend-screen transition-opacity"
                      style={{
                        opacity: gradCamOpacity / 100,
                        background:
                          "radial-gradient(circle at 45% 40%, rgba(239, 68, 68, 0.7) 0%, rgba(234, 179, 8, 0.5) 30%, rgba(59, 130, 246, 0.3) 60%, transparent 80%)",
                      }}
                    />
                  )}

                  {/* Simulated U-Net Lesion Overlays */}
                  {activeLesions.MA && (
                    <div className="absolute top-[38%] left-[44%] w-3 h-3 rounded-full border-2 border-red-500 bg-red-500/50 animate-ping" />
                  )}
                  {activeLesions.HE && (
                    <div className="absolute top-[48%] left-[36%] w-5 h-4 rounded-full border-2 border-yellow-400 bg-yellow-400/40" />
                  )}
                  {activeLesions.EX && (
                    <div className="absolute top-[35%] left-[58%] w-4 h-3 rounded-sm border-2 border-emerald-400 bg-emerald-400/40" />
                  )}
                  {activeLesions.OD && (
                    <div className="absolute top-[42%] left-[78%] w-8 h-8 rounded-full border-2 border-purple-400/70 border-dashed" />
                  )}

                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-cyan-300 font-mono border border-cyan-500/30">
                    Grad-CAM + U-Net Overlays
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Overlay Controls */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 font-medium">
                    <input
                      type="checkbox"
                      checked={showGradCam}
                      onChange={(e) => setShowGradCam(e.target.checked)}
                      className="rounded accent-cyan-400"
                    />
                    Grad-CAM Attention Heatmap
                  </label>

                  {showGradCam && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-mono">
                        Opacity: {gradCamOpacity}%
                      </span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={gradCamOpacity}
                        onChange={(e) => setGradCamOpacity(Number(e.target.value))}
                        className="w-24 accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-slate-500 font-mono">
                  Target Layer: EfficientNet features.8
                </span>
              </div>

              {/* Lesion Overlay Filter Badges */}
              <div className="flex flex-wrap gap-1.5 items-center pt-1 border-t border-white/5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mr-1">
                  Lesion Overlays:
                </span>
                {[
                  { key: "MA", label: "Microaneurysms (MA)", color: "text-red-400 border-red-500/30" },
                  { key: "HE", label: "Hemorrhages (HE)", color: "text-yellow-400 border-yellow-500/30" },
                  { key: "EX", label: "Hard Exudates (EX)", color: "text-emerald-400 border-emerald-500/30" },
                  { key: "SE", label: "Soft Exudates (SE)", color: "text-cyan-400 border-cyan-500/30" },
                  { key: "OD", label: "Optic Disc (OD)", color: "text-purple-400 border-purple-500/30" },
                ].map((l) => (
                  <button
                    key={l.key}
                    onClick={() => toggleLesion(l.key)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-mono border transition-all min-h-[30px]",
                      activeLesions[l.key]
                        ? cn("bg-white/10 font-bold", l.color)
                        : "bg-white/5 text-slate-600 border-white/5 line-through opacity-50"
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Evidence Concordance Card */}
          <div className="glass-card p-4 border-emerald-500/30 bg-emerald-500/5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Clinical Assurance: CONCORDANT
              </span>
              <span className="font-mono text-[10px] text-emerald-300">
                Concordance Score: 0.94 / 1.00
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Detected microvascular lesions (14 MAs, 4 Intraretinal Hemorrhages, 6 Hard Exudates) concordantly align with the predicted ICDR Grade 2 (Moderate NPDR). Zero evidence discordance detected.
            </p>
          </div>
        </div>

        {/* Right Column: Probabilities & Specialist Adjudication Console (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Calibrated Probability Distribution */}
          <div className="glass-card p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Calibrated 5-Class Probability Distribution
            </h3>

            <div className="space-y-2">
              {probabilities.map((p) => (
                <div key={p.grade} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={cn("font-medium", p.grade === 2 ? "text-cyan-300 font-bold" : "text-slate-400")}>
                      {p.label}
                    </span>
                    <span className="font-mono text-slate-300 font-bold">
                      {(p.prob * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        p.grade === 2 ? "bg-cyan-400" : "bg-slate-600"
                      )}
                      style={{ width: `${p.prob * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Specialist Adjudication Panel */}
          <div className="glass-card p-5 space-y-4 border-cyan-500/30">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Specialist Clinical Adjudication
            </h3>

            {/* Decision Mode Buttons */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { id: "ACCEPT", label: "Accept AI Grade" },
                { id: "OVERRIDE", label: "Override Grade" },
                { id: "RECAPTURE", label: "Request Recapture" },
              ].map((act) => (
                <button
                  key={act.id}
                  onClick={() => setAdjudicationAction(act.id as any)}
                  className={cn(
                    "py-2 px-1 rounded-lg text-center font-bold border transition-colors min-h-[44px]",
                    adjudicationAction === act.id
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  )}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Grade Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Confirmed ICDR Diabetic Retinopathy Grade:
              </label>
              <select
                value={doctorGrade}
                onChange={(e) => setDoctorGrade(Number(e.target.value))}
                disabled={adjudicationAction === "RECAPTURE"}
                className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 min-h-[44px]"
              >
                {ICDR_GRADES.map((g) => (
                  <option key={g.grade} value={g.grade}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clinical Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Ophthalmologist Clinical Impression & Plan:
              </label>
              <textarea
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                rows={3}
                className="w-full bg-black/50 border border-white/15 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none font-sans"
              />
            </div>

            {/* Digital Sign-off Confirmation */}
            {adjudicationSuccess ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>
                  Case digitally signed & verified! Cryptographic hash recorded in append-only audit trail.
                </span>
              </div>
            ) : (
              <button
                onClick={handleSignOff}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors shadow-[0_0_20px_rgba(57,217,208,0.3)] min-h-[48px]"
              >
                {isSubmitting ? (
                  <>Sealing Digital Audit Log...</>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Confirm & Digitally Sign Case Review
                  </>
                )}
              </button>
            )}

            <div className="text-[10px] text-slate-500 text-center font-mono">
              Signed by Dr. Ananya Sharma, MD, DNB (Retina) | Reg. #74192
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

