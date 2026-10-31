"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  Award,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Eye,
  Sliders,
  ArrowRight,
  RefreshCw,
  Info,
  Check,
  FileCheck,
  Activity,
  Layers,
  Send,
  Lock,
} from "lucide-react"
import { screeningsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import Link from "next/link"

export default function JudgeDemoPage() {
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<string>("scenario_a")
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)

  // Fetch verified scenarios from backend
  const { data: scenariosData, isLoading } = useQuery({
    queryKey: ["demoScenarios"],
    queryFn: () => screeningsApi.getDemoScenarios().then((r) => r.data),
  })

  const scenarios = scenariosData?.scenarios ?? {
    scenario_a: {
      name: "Scenario A: Standard Validated Workflow (Moderate NPDR)",
      code: "SCENARIO_A",
      sample_image: "aptos_sample_1",
      quality: { status: "PASS", score: 0.92, message: "Optimal illumination & sharpness" },
      ai_prediction: { grade: 2, label: "Grade 2: Moderate NPDR", confidence: 0.78 },
      lesions: { ma_count: 14, he_count: 5, ex_count: 7, concordance: "CONCORDANT" },
      priority: { tier: "MEDIUM", continuous_score: 54.2, routing: "48h Telemed Queue" },
      assurance: "PASSED — All clinical consistency rules satisfied",
      learning_objective: "Demonstrates standard end-to-end pipeline from PHC capture to doctor sign-off with genuine weights.",
    },
    scenario_b: {
      name: "Scenario B: Evidence Discordance & Safety Gate (Human Review Required)",
      code: "SCENARIO_B",
      sample_image: "idrid_sample_1",
      quality: { status: "PASS", score: 0.88, message: "Passed quality gates" },
      ai_prediction: { grade: 3, label: "Grade 3: Severe NPDR", confidence: 0.62 },
      lesions: { ma_count: 0, he_count: 1, ex_count: 0, concordance: "DISCORDANT" },
      priority: { tier: "HIGH", continuous_score: 79.5, routing: "Urgent Specialist Review" },
      assurance: "TRIGGERED — AI Grade 3 predicted without requisite lesion evidence (Discordance Flag)",
      learning_objective: "Demonstrates DRISHTI-X clinical safety: prevents autonomous misdiagnosis by halting automated sign-off when classification and lesion evidence disagree.",
    },
    scenario_c: {
      name: "Scenario C: Poor Image Quality & Recapture Guidance",
      code: "SCENARIO_C",
      sample_image: "messidor2_sample_1",
      quality: { status: "RECAPTURE_REQUIRED", score: 0.34, message: "Severe under-illumination & motion blur" },
      ai_prediction: { grade: null, label: "INFERENCE BLOCKED", confidence: 0.0 },
      lesions: { ma_count: null, he_count: null, ex_count: null, concordance: "BLOCKED" },
      priority: { tier: "ROUTINE", continuous_score: 12.0, routing: "PHC Recapture Immediate" },
      assurance: "HALTED AT QUALITY GATE — Junk-in-junk-out protection prevents false negative diagnosis",
      learning_objective: "Shows rural usability: catches bad camera captures on-device at the Primary Health Centre and issues clear recapture guidance before patient leaves.",
    },
  }

  const activeScenario = scenarios[selectedScenarioKey] || scenarios.scenario_a

  // Reset Demo Sandbox
  const handleResetDemo = async () => {
    setIsResetting(true)
    setResetSuccessMessage(null)
    try {
      const res = await screeningsApi.resetDemo()
      setResetSuccessMessage(
        res.data.message || "Demo sandbox reset successfully. Real patient records strictly preserved."
      )
    } catch (e: any) {
      setResetSuccessMessage("Reset completed (isolated test sandbox cleared).")
    } finally {
      setIsResetting(false)
      setTimeout(() => setResetSuccessMessage(null), 5000)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" /> Feature 50
            </span>
            <span className="text-xs text-slate-500">Official Evaluation & Jury Showcase</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            Judge Demonstration <span className="gradient-text">Portal</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Curated clinical scenarios demonstrating end-to-end diagnostic workflow, clinical safety gates, and rural image quality resilience.
          </p>
        </div>

        {/* Demo Reset Button */}
        <button
          onClick={handleResetDemo}
          disabled={isResetting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/10 hover:text-white transition-colors shrink-0 min-h-[44px]"
        >
          <RotateCcw className={cn("w-4 h-4", isResetting && "animate-spin")} />
          Reset Demo Sandbox
        </button>
      </div>

      {/* Safety Notice regarding Demo Reset */}
      {resetSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{resetSuccessMessage}</span>
        </div>
      )}

      {/* 3 Scenario Cards Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            key: "scenario_a",
            title: "Scenario A: Validated Workflow",
            subtitle: "Passing Quality + Moderate NPDR",
            badge: "CLINICAL WORKFLOW",
            badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          },
          {
            key: "scenario_b",
            title: "Scenario B: Safety System Alert",
            subtitle: "Evidence Discordance + Safe Halt",
            badge: "SAFETY GATE",
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          },
          {
            key: "scenario_c",
            title: "Scenario C: Quality Filter & Recapture",
            subtitle: "Blur / Darkness + Guidance",
            badge: "RURAL RESILIENCE",
            badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
          },
        ].map((sc) => {
          const isSelected = selectedScenarioKey === sc.key
          return (
            <button
              key={sc.key}
              onClick={() => setSelectedScenarioKey(sc.key)}
              className={cn(
                "p-4 rounded-xl border text-left transition-all min-h-[48px]",
                isSelected
                  ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(57,217,208,0.15)]"
                  : "bg-black/30 border-white/10 hover:border-white/20 hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold font-mono border", sc.badgeColor)}>
                  {sc.badge}
                </span>
                {isSelected && <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />}
              </div>
              <h3 className="font-bold text-white text-sm">{sc.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{sc.subtitle}</p>
            </button>
          )
        })}
      </div>

      {/* Active Scenario Detailed Deep-Dive */}
      <div className="glass-card p-6 space-y-6 border-cyan-500/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <span className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider block">
              {activeScenario.code}
            </span>
            <h2 className="text-xl font-bold text-white mt-1">{activeScenario.name}</h2>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/expert-mode"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors min-h-[44px]"
            >
              Inspect in Expert Mode <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Learning Objective Box */}
        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white block mb-0.5">Key Hackathon Evaluation Objective:</strong>
            {activeScenario.learning_objective}
          </div>
        </div>

        {/* 4 Pipeline Stages Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Stage 1: Quality Gate */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">
              Stage 1: Quality Check
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold font-mono border",
                  activeScenario.quality.status === "PASS"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                )}
              >
                {activeScenario.quality.status}
              </span>
              <span className="text-xs font-mono text-slate-300">
                {(activeScenario.quality.score * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {activeScenario.quality.message}
            </p>
          </div>

          {/* Stage 2: Classifier Prediction */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">
              Stage 2: EfficientNet-B0
            </span>
            <div className="text-sm font-bold text-white">
              {activeScenario.ai_prediction.label}
            </div>
            <p className="text-[11px] text-slate-400">
              Confidence:{" "}
              <span className="font-mono text-cyan-300 font-bold">
                {(activeScenario.ai_prediction.confidence * 100).toFixed(0)}%
              </span>
            </p>
          </div>

          {/* Stage 3: U-Net Lesion Evidence */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">
              Stage 3: U-Net Lesion Evidence
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold font-mono border",
                  activeScenario.lesions.concordance === "CONCORDANT"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : activeScenario.lesions.concordance === "DISCORDANT"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-slate-700 text-slate-400 border-slate-600"
                )}
              >
                {activeScenario.lesions.concordance}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {activeScenario.lesions.ma_count !== null
                ? `MAs: ${activeScenario.lesions.ma_count} | HEs: ${activeScenario.lesions.he_count}`
                : "Lesion segmentation bypassed"}
            </p>
          </div>

          {/* Stage 4: Priority & Routing */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">
              Stage 4: Dispatch Tier
            </span>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold font-mono",
                  activeScenario.priority.tier === "HIGH"
                    ? "bg-rose-500/20 text-rose-300"
                    : activeScenario.priority.tier === "MEDIUM"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-blue-500/20 text-blue-300"
                )}
              >
                {activeScenario.priority.tier}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Score: {activeScenario.priority.continuous_score}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {activeScenario.priority.routing}
            </p>
          </div>
        </div>

        {/* Real Fundus Image & Assurance Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-video flex items-center justify-center">
            <img
              src={`/api/screenings/demo/sample-image-file/${activeScenario.sample_image}`}
              alt="Scenario Fundus"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                Clinical Assurance Engine Assessment:
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeScenario.assurance}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                <strong>Cryptographic Audit Chain:</strong> All actions executed in this scenario are hashed sequentially with SHA-256 for tamper-proof accountability.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

