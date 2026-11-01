"use client"

import React, { useState, useMemo } from "react"
import { RetinalDisease3DViewer } from "@/components/RetinalDisease3DViewer"
import { RETINAL_DISEASES, type RetinalDisease } from "@/lib/retinal-diseases"
import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle2,
  Dot,
  AlertCircle,
  AlertTriangle,
  Flame,
  Droplet,
  Eye,
  Cloud,
  Activity,
  Shield,
  Stethoscope,
  Pill,
  TrendingUp,
  AlertOctagon,
  ChevronRight,
  Info,
  Microscope,
} from "lucide-react"

const ICON_MAP: Record<string, typeof CheckCircle2> = {
  CheckCircle2,
  Dot,
  AlertCircle,
  AlertTriangle,
  Flame,
  Droplet,
  Eye,
  Cloud,
}

const SEVERITY_COLORS: Record<string, string> = {
  None: "#34D399",
  Mild: "#FBBF24",
  Moderate: "#F97316",
  Severe: "#EF4444",
  Proliferative: "#DC2626",
  "Sight-Threatening": "#991B1B",
}

export default function RetinaDiseaseExplorerPage() {
  const [selectedId, setSelectedId] = useState<string>("moderate-npdr")
  const [activeTab, setActiveTab] = useState<"overview" | "symptoms" | "pathophysiology" | "treatment">("overview")

  const selectedDisease = useMemo(
    () => RETINAL_DISEASES.find((d) => d.id === selectedId) || RETINAL_DISEASES[0],
    [selectedId]
  )

  const diseasesByCategory = useMemo(() => {
    const groups: Record<string, RetinalDisease[]> = {}
    for (const d of RETINAL_DISEASES) {
      if (!groups[d.category]) groups[d.category] = []
      groups[d.category].push(d)
    }
    return groups
  }, [])

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Microscope className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              3D <span className="gradient-text-cyan">Retinal Disease Explorer</span>
            </h1>
          </div>
          <p className="text-xs text-[#9AAFC1] mt-1 max-w-2xl">
            Explore retinal diseases in interactive 3D — see how lesions appear on the retina, understand pathophysiology, symptoms, and treatment pathways.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full bg-[#102436] border border-[#39D9D0]/20 px-3 py-1.5 text-xs text-[#39D9D0]">
          <Microscope className="w-3.5 h-3.5" />
          <span>{RETINAL_DISEASES.length} Diseases Modeled</span>
        </div>
      </div>

      {/* CLINICAL DISCLAIMER */}
      <div className="medical-banner rounded-xl p-3 text-xs text-[#9AAFC1] flex items-center gap-2.5">
        <Info className="w-4 h-4 text-[#39D9D0] shrink-0" />
        <span>
          <strong>Educational Tool:</strong> This 3D explorer illustrates retinal pathologies for clinical education. AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS.
        </span>
      </div>

      {/* DISEASE SELECTOR STRIP */}
      <div className="space-y-3">
        {Object.entries(diseasesByCategory).map(([category, diseases]) => (
          <div key={category}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#5A7184] mb-2">{category}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2">
              {diseases.map((disease) => {
                const Icon = ICON_MAP[disease.icon] || Activity
                const isActive = selectedId === disease.id
                return (
                  <button
                    key={disease.id}
                    type="button"
                    onClick={() => setSelectedId(disease.id)}
                    className={`glass-card glass-card-hover p-2.5 text-left rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isActive
                        ? "border-[#39D9D0] bg-[#102436] shadow-[0_0_15px_rgba(57,217,208,0.15)]"
                        : "border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: `${disease.accentColor}15`,
                          borderColor: `${disease.accentColor}40`,
                          color: disease.accentColor,
                        }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-[#39D9D0] animate-pulse" />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-white leading-tight">{disease.shortName}</span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded inline-block w-fit"
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[disease.severity]}20`,
                        color: SEVERITY_COLORS[disease.severity],
                      }}
                    >
                      {disease.severity}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 3D VIEWER + DISEASE INFO — ANIMATED TRANSITION */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDisease.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          {/* 3D RETINA WITH LESIONS */}
          <RetinalDisease3DViewer disease={selectedDisease} height="h-[560px]" />

          {/* DISEASE INFO PANEL */}
          <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
            {/* HEADER BAR */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-white/10"
              style={{ background: `linear-gradient(135deg, ${selectedDisease.accentColor}10, transparent)` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: `${selectedDisease.accentColor}15`,
                    borderColor: `${selectedDisease.accentColor}40`,
                    color: selectedDisease.accentColor,
                  }}
                >
                  {(() => {
                    const Icon = ICON_MAP[selectedDisease.icon] || Activity
                    return <Icon className="w-5 h-5" />
                  })()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedDisease.name}</h2>
                  <p className="text-xs text-[#9AAFC1]">{selectedDisease.category} · {selectedDisease.severity}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedDisease.drGrade >= 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#102436] border border-white/10 text-xs font-mono text-[#39D9D0]">
                    DR Grade {selectedDisease.drGrade}
                  </span>
                )}
                <span
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{
                    backgroundColor: `${SEVERITY_COLORS[selectedDisease.severity]}20`,
                    color: SEVERITY_COLORS[selectedDisease.severity],
                  }}
                >
                  {selectedDisease.severity}
                </span>
              </div>
            </div>

            {/* SUMMARY */}
            <div className="p-4">
              <p className="text-sm text-[#F4F8FC] leading-relaxed">{selectedDisease.summary}</p>
            </div>

            {/* TAB BAR */}
            <div className="flex items-center gap-1 px-4 border-b border-white/10 overflow-x-auto">
              {([
                { id: "overview" as const, label: "Overview", icon: Info },
                { id: "symptoms" as const, label: "Symptoms & Signs", icon: Activity },
                { id: "pathophysiology" as const, label: "Pathophysiology", icon: Microscope },
                { id: "treatment" as const, label: "Treatment & Prognosis", icon: Stethoscope },
              ]).map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-[#39D9D0] text-[#39D9D0]"
                        : "border-transparent text-[#9AAFC1] hover:text-white"
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* TAB CONTENT */}
            <div className="p-4 min-h-[200px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "overview" && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#5A7184] mb-1.5">Description</h4>
                        <p className="text-sm text-[#F4F8FC] leading-relaxed">{selectedDisease.description}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-lg bg-[#101F30] p-3 border border-white/5">
                          <h4 className="text-[10px] uppercase font-semibold text-[#7C8CFF] mb-1.5 flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3" /> Prevalence
                          </h4>
                          <p className="text-xs text-[#F4F8FC]">{selectedDisease.prevalence}</p>
                        </div>
                        <div className="rounded-lg bg-[#101F30] p-3 border border-white/5">
                          <h4 className="text-[10px] uppercase font-semibold text-[#7C8CFF] mb-1.5 flex items-center gap-1.5">
                            <AlertOctagon className="w-3 h-3" /> Risk Factors
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDisease.riskFactors.map((rf, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#9AAFC1] border border-white/10">
                                {rf}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "symptoms" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#39D9D0] mb-2 flex items-center gap-1.5">
                          <Activity className="w-3 h-3" /> Symptoms (Patient-Reported)
                        </h4>
                        <ul className="space-y-1.5">
                          {selectedDisease.symptoms.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#F4F8FC]">
                              <ChevronRight className="w-3 h-3 text-[#39D9D0] mt-0.5 shrink-0" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#7C8CFF] mb-2 flex items-center gap-1.5">
                          <Eye className="w-3 h-3" /> Clinical Signs (Observed)
                        </h4>
                        <ul className="space-y-1.5">
                          {selectedDisease.signs.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#9AAFC1]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7C8CFF] mt-1 shrink-0" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {activeTab === "pathophysiology" && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#7C8CFF] mb-1.5 flex items-center gap-1.5">
                          <Microscope className="w-3 h-3" /> Disease Mechanism
                        </h4>
                        <p className="text-sm text-[#F4F8FC] leading-relaxed">{selectedDisease.pathophysiology}</p>
                      </div>
                      {selectedDisease.lesions.length > 0 && (
                        <div className="rounded-lg bg-[#102436] p-3 border border-[#39D9D0]/20">
                          <h4 className="text-[10px] uppercase font-semibold text-[#39D9D0] mb-2 flex items-center gap-1.5">
                            <Info className="w-3 h-3" /> Visible Lesions in 3D Model ({selectedDisease.lesions.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {Array.from(new Set(selectedDisease.lesions.map((l) => l.type))).map((type) => {
                              const count = selectedDisease.lesions.filter((l) => l.type === type).length
                              return (
                                <span key={type} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[#F4F8FC]">
                                  {type.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} ×{count}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "treatment" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#34D399] mb-2 flex items-center gap-1.5">
                          <Pill className="w-3 h-3" /> Treatment Options
                        </h4>
                        <ul className="space-y-1.5">
                          {selectedDisease.treatment.map((t, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#F4F8FC]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] mt-1 shrink-0" />
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-[10px] uppercase font-semibold text-[#FBBF24] mb-2 flex items-center gap-1.5">
                          <Shield className="w-3 h-3" /> Prognosis
                        </h4>
                        <p className="text-xs text-[#F4F8FC] leading-relaxed">{selectedDisease.prognosis}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
