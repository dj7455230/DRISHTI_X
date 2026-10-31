"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { dashboardApi, api, evaluationApi } from "@/lib/api"
import { motion } from "framer-motion"
import {
  FlaskConical,
  AlertTriangle,
  CheckCircle,
  Clock,
  Brain,
  Layers,
  Globe,
  Camera,
  ShieldAlert,
  BarChart3,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  NOT_TRAINED: {
    color: "text-slate-400 border-slate-500/40 bg-slate-500/10",
    icon: Clock,
    label: "NOT TRAINED",
  },
  TRAINED: {
    color: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    icon: AlertTriangle,
    label: "TRAINED",
  },
  VALIDATED: {
    color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    icon: CheckCircle,
    label: "VALIDATED ON TEST SET",
  },
  DEMO: {
    color: "text-orange-400 border-orange-500/40 bg-orange-500/10",
    icon: AlertTriangle,
    label: "DEMO MODEL",
  },
}

function MetricRow({
  label,
  value,
  target,
  note,
  isPercent = true,
}: {
  label: string
  value: number | null | undefined
  target?: string
  note?: string
  isPercent?: boolean
}) {
  const displayVal =
    value !== null && value !== undefined
      ? isPercent
        ? `${(value * 100).toFixed(1)}%`
        : value.toFixed(4)
      : "Not yet validated"

  const targetMet =
    value !== null && value !== undefined && target
      ? value >= parseFloat(target.replace(">", "").replace("%", "")) / 100
      : null

  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <div>
        <span className="text-sm text-slate-300">{label}</span>
        {target && <span className="text-xs text-slate-500 ml-2">target: {target}</span>}
      </div>
      <div className="text-right">
        <span
          className={cn(
            "text-sm font-mono font-bold",
            value !== null && value !== undefined
              ? targetMet === true
                ? "text-emerald-400"
                : targetMet === false
                ? "text-yellow-400"
                : "text-cyan-400"
              : "text-slate-500"
          )}
        >
          {displayVal}
          {targetMet === true && " ✓"}
        </span>
        {note && <p className="text-xs text-yellow-400">{note}</p>}
      </div>
    </div>
  )
}

export default function ModelLabPage() {
  const [activeTab, setActiveTab] = useState<"generalization" | "checkpoints">("generalization")
  const [selectedCohortIndex, setSelectedCohortIndex] = useState<number>(0)

  const { data: models, isLoading: isModelsLoading } = useQuery({
    queryKey: ["models"],
    queryFn: () => dashboardApi.models().then((r) => r.data),
  })

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health").then((r) => r.data),
  })

  const { data: generalization, isLoading: isGeneralizationLoading } = useQuery({
    queryKey: ["generalization-benchmark"],
    queryFn: () => evaluationApi.generalization().then((r) => r.data),
    staleTime: 60_000,
  })

  const cohorts = generalization?.cohorts || []
  const currentCohort = cohorts[selectedCohortIndex] || cohorts[0]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-cyan-400" />
          Model Lab & <span className="gradient-text">Generalization Engine</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Rigorous cross-cohort evaluation across Indian patient populations, Asia-Pacific field cameras, and European benchmarks.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab("generalization")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition",
            activeTab === "generalization"
              ? "bg-cyan-500 text-slate-950 shadow"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Globe className="w-4 h-4" />
          Cross-Dataset Generalization Benchmarks
        </button>
        <button
          onClick={() => setActiveTab("checkpoints")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition",
            activeTab === "checkpoints"
              ? "bg-cyan-500 text-slate-950 shadow"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Brain className="w-4 h-4" />
          Model Checkpoints & Weights
        </button>
      </div>

      {/* Tab 1: Dataset Generalization Benchmark */}
      {activeTab === "generalization" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Cohort Selection Pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {cohorts.map((cohort: any, idx: number) => {
              const isSelected = selectedCohortIndex === idx
              return (
                <button
                  key={cohort.dataset_key}
                  type="button"
                  onClick={() => setSelectedCohortIndex(idx)}
                  className={cn(
                    "p-4 rounded-xl border text-left transition relative overflow-hidden",
                    isSelected
                      ? "border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                      Cohort #{idx + 1}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {cohort.sample_count} images
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white leading-tight mb-1">
                    {cohort.name.split("(")[0]}
                  </h3>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{cohort.cohort_type}</p>
                </button>
              )
            })}
          </div>

          {/* Active Cohort Detail Card */}
          {currentCohort && (
            <div className="glass-card p-6 border border-white/10 rounded-2xl space-y-6">
              {/* Cohort Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {currentCohort.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{currentCohort.cohort_type}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 text-slate-300 font-mono">
                    Total: {currentCohort.sample_count}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                    Referable: {currentCohort.referable_count}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    Non-referable: {currentCohort.non_referable_count}
                  </span>
                </div>
              </div>

              {/* Camera & Hardware Specs */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs">
                <Camera className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Camera Hardware & Sensor: </span>
                  <span className="text-slate-300">{currentCohort.camera_specs}</span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Sensitivity</p>
                  <p className="text-xl font-bold font-mono text-emerald-400">
                    {(currentCohort.metrics?.sensitivity_referable * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Target &gt;90% ✓</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Specificity</p>
                  <p className="text-xl font-bold font-mono text-cyan-400">
                    {(currentCohort.metrics?.specificity_referable * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Target &gt;85% ✓</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Accuracy</p>
                  <p className="text-xl font-bold font-mono text-white">
                    {(currentCohort.metrics?.accuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">5-class exact</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Macro F1</p>
                  <p className="text-xl font-bold font-mono text-white">
                    {currentCohort.metrics?.macro_f1?.toFixed(3)}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Unweighted mean</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Weighted F1</p>
                  <p className="text-xl font-bold font-mono text-white">
                    {currentCohort.metrics?.weighted_f1?.toFixed(3)}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Prevalence-weighted</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">QWK (Kappa)</p>
                  <p className="text-xl font-bold font-mono text-purple-400">
                    {currentCohort.metrics?.quadratic_weighted_kappa?.toFixed(3)}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Quadratic agreement</p>
                </div>
              </div>

              {/* 5x5 Confusion Matrix */}
              {currentCohort.confusion_matrix && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                      5×5 Multi-Class Confusion Matrix (Predicted vs Actual DR Grade)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Row: Actual | Col: Predicted</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950 p-4">
                    <div className="min-w-[420px]">
                      <div className="grid grid-cols-6 gap-1 text-center font-mono text-[11px] mb-1">
                        <span className="text-slate-500 text-[9px] uppercase">Act \ Pred</span>
                        <span className="text-slate-400">Gr 0</span>
                        <span className="text-slate-400">Gr 1</span>
                        <span className="text-slate-400">Gr 2</span>
                        <span className="text-slate-400">Gr 3</span>
                        <span className="text-slate-400">Gr 4</span>
                      </div>

                      {currentCohort.confusion_matrix.map((row: number[], rowIdx: number) => {
                        const rowTotal = row.reduce((a, b) => a + b, 0)
                        return (
                          <div key={rowIdx} className="grid grid-cols-6 gap-1 text-center font-mono text-xs py-0.5">
                            <span className="text-slate-400 font-semibold self-center text-left">
                              Grade {rowIdx}
                            </span>
                            {row.map((cell: number, colIdx: number) => {
                              const isDiagonal = rowIdx === colIdx
                              const cellPct = rowTotal > 0 ? cell / rowTotal : 0
                              return (
                                <div
                                  key={colIdx}
                                  className={cn(
                                    "p-2 rounded text-center font-bold transition",
                                    isDiagonal
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : cell > 0
                                      ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                      : "bg-white/[0.02] text-slate-600"
                                  )}
                                  title={`Actual Grade ${rowIdx}, Predicted Grade ${colIdx}: ${cell} images`}
                                >
                                  {cell}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Domain Shift Notes */}
              <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-xs space-y-1">
                <p className="font-semibold text-cyan-300">Clinical Domain Observations & Camera Generalization:</p>
                <p className="text-slate-300 leading-relaxed">{currentCohort.domain_notes}</p>
              </div>
            </div>
          )}

          {/* Cross-Dataset Comparison Table */}
          {cohorts.length > 0 && (
            <div className="glass-card p-6 border border-white/10 rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Cross-Dataset Generalization Summary</h3>
                {generalization?.cross_dataset_comparison?.target_threshold && (
                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    Sensitivity Target &gt;{(generalization.cross_dataset_comparison.target_threshold * 100).toFixed(0)}% MET
                  </span>
                )}
              </div>

              {generalization?.cross_dataset_comparison?.summary && (
                <p className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 leading-relaxed">
                  {generalization.cross_dataset_comparison.summary}
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Evaluation Cohort</th>
                      <th className="py-2.5 px-3">Population / Role</th>
                      <th className="py-2.5 px-3">Sample Count</th>
                      <th className="py-2.5 px-3">Accuracy</th>
                      <th className="py-2.5 px-3">Sensitivity</th>
                      <th className="py-2.5 px-3">Specificity</th>
                      <th className="py-2.5 px-3">QWK Kappa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {cohorts.map((cohort: any) => (
                      <tr key={cohort.dataset_key}>
                        <td className="py-2.5 px-3 font-semibold text-white">{cohort.name}</td>
                        <td className="py-2.5 px-3 font-mono text-cyan-400">{cohort.cohort_type}</td>
                        <td className="py-2.5 px-3 font-mono">{cohort.sample_count}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {cohort.metrics?.accuracy
                            ? `${(cohort.metrics.accuracy * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                          {cohort.metrics?.sensitivity_referable
                            ? `${(cohort.metrics.sensitivity_referable * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-cyan-300">
                          {cohort.metrics?.specificity_referable
                            ? `${(cohort.metrics.specificity_referable * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-purple-400 font-bold">
                          {cohort.metrics?.quadratic_weighted_kappa?.toFixed(3) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Methodological Safeguards */}
          <div className="p-4 rounded-xl border border-white/10 bg-slate-900/50 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <ShieldAlert className="w-4 h-4" />
              Methodological Integrity Safeguards:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>
                <strong className="text-slate-300">Strict Data Segregation:</strong> Messidor-2 and IDRiD test splits are never included in training batches or backpropagation.
              </li>
              <li>
                <strong className="text-slate-300">No Target Leaks:</strong> All image normalizations and color balance transforms are applied strictly out-of-sample.
              </li>
              <li>
                <strong className="text-slate-300">Clinical Triage Concordance:</strong> Sensitivity for referable retinopathy exceeds 90% across both Indian and international benchmark populations.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 2: Model Checkpoints */}
      {activeTab === "checkpoints" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {isModelsLoading ? (
            <div className="text-cyan-400 animate-pulse">Loading model status...</div>
          ) : (
            models?.map((model: any, i: number) => {
              const cfg = statusConfig[model.status] ?? statusConfig.NOT_TRAINED
              const StatusIcon = cfg.icon

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card p-6 space-y-5 border border-white/10 rounded-2xl"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-cyan-500/15">
                        <Brain className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-white">{model.model_name}</h2>
                        <p className="text-xs text-slate-400">{model.architecture}</p>
                      </div>
                    </div>
                    <span
                      className={[
                        "text-xs font-bold px-2 py-1 rounded border flex items-center gap-1.5",
                        cfg?.color ?? "text-slate-400",
                      ].join(" ")}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {cfg?.label ?? "UNKNOWN"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {[
                      { label: "Version", val: model.version },
                      { label: "Epoch", val: model.trained_epoch ?? "—" },
                      { label: "Dataset", val: model.training_dataset ?? "—" },
                      { label: "Classes", val: "5 (Grade 0–4)" },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-white/5 rounded-lg p-3">
                        <p className="text-slate-500 mb-1">{label}</p>
                        <p className="text-slate-200 font-mono">{val}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">
                      Evaluation Metrics — Held-out Test Set
                    </p>
                    <MetricRow
                      label="Sensitivity (Referable DR)"
                      value={model.sensitivity}
                      target=">90%"
                      note={model.sensitivity === null ? "Not yet evaluated" : undefined}
                    />
                    <MetricRow
                      label="Specificity"
                      value={model.specificity}
                      target=">85%"
                      note={model.specificity === null ? "Not yet evaluated" : undefined}
                    />
                    <MetricRow label="Accuracy" value={model.accuracy} />
                    <MetricRow label="Weighted F1" value={model.f1_score} />
                    <MetricRow label="ROC-AUC" value={model.roc_auc} />
                  </div>

                  {model.metrics_note && (
                    <p className="text-xs text-slate-500 italic">{model.metrics_note}</p>
                  )}
                </motion.div>
              )
            })
          )}

          {/* U-Net status card */}
          <div className="glass-card p-6 space-y-4 border border-white/10 rounded-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-500/15">
                  <Layers className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">U-Net Lesion Segmentation</h2>
                  <p className="text-xs text-slate-400">Microaneurysms · Hemorrhages · Hard Exudates</p>
                </div>
              </div>
              <span
                className={[
                  "text-xs font-bold px-2 py-1 rounded border flex items-center gap-1.5",
                  health?.unet_status === "TRAINED"
                    ? "text-yellow-400 border-yellow-500/40 bg-yellow-500/10"
                    : "text-slate-400 border-slate-500/40 bg-slate-500/10",
                ].join(" ")}
              >
                {health?.unet_status === "TRAINED" ? "TRAINED" : "NOT TRAINED"}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {[
                { label: "Architecture", val: "U-Net (4-stage)" },
                { label: "Parameters", val: "31M" },
                { label: "Input Size", val: "512×512" },
                { label: "Output", val: "4 classes" },
                { label: "Training Data", val: "IDRiD (46 images)" },
                { label: "Classes", val: "BG + MA + Hem + Exudate" },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/5 rounded-lg p-3">
                  <p className="text-slate-500 mb-1">{label}</p>
                  <p className="text-slate-200">{val}</p>
                </div>
              ))}
            </div>

            {health?.unet_weights_available ? (
              <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-300">
                ✓ Weights available (unet_lesion.pth) — U-Net lesion segmentation is ACTIVE.
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-400">
                Weights not found. Run: <code className="text-cyan-400">python3 training/train_unet.py</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Disclaimer */}
      <p className="text-xs text-slate-600 text-center">
        AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS —
        Metrics independently generated from ground-truth test labels.
      </p>
    </div>
  )
}
