"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { dashboardApi, api } from "@/lib/api"
import { useAuthStore } from "@/lib/store"
import { cn, formatDate } from "@/lib/utils"
import { motion } from "framer-motion"
import { Eye3DViewer } from "@/components/Eye3DViewer"

import {
  Users,
  Scan,
  UserCheck,
  Camera,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Stethoscope,
  ImageIcon,
  Brain,
  Activity,
  ChevronRight,
  Sparkles,
  Cuboid,
  Cpu,
  FileText,
  Clock,
  Plus,
  Send,
} from "lucide-react"

import type { LucideIcon } from "lucide-react"

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  helper,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  tone: "cyan" | "violet" | "amber" | "rose"
  helper: string
}) {
  const toneStyles = {
    cyan: {
      border: "border-[#39D9D0]/20",
      iconBg: "bg-[#39D9D0]/10 text-[#39D9D0] border border-[#39D9D0]/30",
      glow: "hover:shadow-[0_0_20px_rgba(57,217,208,0.15)]",
    },
    violet: {
      border: "border-[#7C8CFF]/20",
      iconBg: "bg-[#7C8CFF]/10 text-[#7C8CFF] border border-[#7C8CFF]/30",
      glow: "hover:shadow-[0_0_20px_rgba(124,140,255,0.15)]",
    },
    amber: {
      border: "border-amber-500/20",
      iconBg: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
      glow: "hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]",
    },
    rose: {
      border: "border-rose-500/20",
      iconBg: "bg-rose-500/10 text-rose-400 border border-rose-500/30",
      glow: "hover:shadow-[0_0_20px_rgba(244,63,94,0.15)]",
    },
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`glass-card p-4 rounded-xl border ${toneStyles[tone].border} ${toneStyles[tone].glow} transition-all`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5A7184]">
            {label}
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#F4F8FC]">
            {value}
          </p>
          <p className="mt-1 text-[11px] text-[#9AAFC1]">
            {helper}
          </p>
        </div>

        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneStyles[tone].iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [interactiveEyeOpen, setInteractiveEyeOpen] = useState(true)

  const {
    data: stats,
    isLoading: isStatsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.statistics().then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health").then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data: queue } = useQuery({
    queryKey: ["referral-queue"],
    queryFn: () => dashboardApi.referralQueue({ limit: 5 }).then((r) => r.data),
  })

  const { data: reports } = useQuery({
    queryKey: ["recent-reports"],
    queryFn: () => api.get("/api/reports?limit=4").then((r) => r.data),
  })

  const modelStatus = health?.model_status ?? "CHECKING..."
  const unetStatus = health?.unet_status ?? "NOT_TRAINED"
  const modelReady = modelStatus === "TRAINED" || modelStatus === "VALIDATED"
  const firstName = user?.full_name?.split(" ")[0] || "Practitioner"

  const metrics = [
    {
      label: "Total Patients",
      value: stats?.total_patients ?? 0,
      icon: Users,
      tone: "cyan" as const,
      helper: "Registered clinical records",
    },
    {
      label: "Total Screenings",
      value: stats?.total_screenings ?? 0,
      icon: Scan,
      tone: "violet" as const,
      helper: "Retinal exams conducted",
    },
    {
      label: "Specialist Review",
      value: stats?.human_review_required ?? 0,
      icon: UserCheck,
      tone: "amber" as const,
      helper: "Awaiting clinical decision",
    },
    {
      label: "Recaptures Needed",
      value: stats?.recapture_required ?? 0,
      icon: Camera,
      tone: "rose" as const,
      helper: "Quality gate ungradable",
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* COMMAND HERO BANNER */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0B1726] via-[#101F30] to-[#07111F] p-6 lg:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-[#39D9D0]/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-[#7C8CFF]/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[#39D9D0] animate-ping" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#39D9D0]">
                Diagnostic Command Center
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, <span className="gradient-text-cyan">{firstName}</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#9AAFC1] leading-relaxed">
              DRISHTI-X AI screening pipeline is operational. Real-time microvasculature assessment, temperature-calibrated grading, and 3D retinal visualization active.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
              <Link
                href="/screenings/new"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[#07111F] font-bold shadow-[0_0_20px_rgba(57,217,208,0.3)] hover:brightness-110 transition active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Start New Screening
              </Link>
              <Link
                href="/analysis"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-[#39D9D0] font-semibold transition"
              >
                <Brain className="w-4 h-4" />
                Retinal Analysis Workspace
              </Link>
              <Link
                href="/eye-explorer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101F30] hover:bg-[#15273D] border border-[#7C8CFF]/30 text-[#7C8CFF] font-semibold transition"
              >
                <Cuboid className="w-4 h-4" />
                3D Eye Explorer
              </Link>
            </div>
          </div>

          {/* Model Status Card */}
          <div className="glass-card p-4 rounded-xl border border-white/10 w-full lg:w-72 shrink-0 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#5A7184] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#39D9D0]" />
                AI Model Nodes
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${modelReady ? "bg-[#39D9D0]/15 text-[#39D9D0]" : "bg-amber-500/15 text-amber-400"}`}>
                {modelStatus}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#9AAFC1]">DR Classifier:</span>
                <span className="font-mono text-white">EfficientNet-B0</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#9AAFC1]">Calibration:</span>
                <span className="font-mono text-[#39D9D0]">T = 1.604 (Fitted)</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#9AAFC1]">Lesion Segmenter:</span>
                <span className="font-mono text-[#7C8CFF]">{unetStatus}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#9AAFC1]">Explainability:</span>
                <span className="font-mono text-white">Grad-CAM (Conv2d)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* METRIC CARDS ROW */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, idx) => (
          <MetricCard
            key={idx}
            label={m.label}
            value={m.value}
            icon={m.icon}
            tone={m.tone}
            helper={m.helper}
          />
        ))}
      </section>

      {/* DUAL COMMAND SECTION: 3D EYE VIEWER HERO + CLINICAL REFERRAL QUEUE */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: 3D ANATOMICAL EYE VIEWER HERO */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cuboid className="w-4 h-4 text-[#39D9D0]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                3D Retinal Anatomical Reference
              </h2>
            </div>
            <Link
              href="/eye-explorer"
              className="text-xs text-[#39D9D0] hover:underline flex items-center gap-1 font-medium"
            >
              Full 3D Explorer <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <Eye3DViewer
            initialStructure="retina"
            height="h-[460px]"
            showInspectionDrawer={true}
          />
        </div>

        {/* RIGHT: PRIORITY QUEUE & RECENT REPORTS */}
        <div className="lg:col-span-5 space-y-6 flex flex-col">
          {/* Priority Referral Queue */}
          <div className="glass-card p-5 rounded-xl border border-white/10 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Priority Referral Queue
                    </h3>
                    <p className="text-[10px] text-[#5A7184]">
                      Cases requiring expedited specialist review
                    </p>
                  </div>
                </div>

                <Link
                  href="/referrals"
                  className="text-xs text-[#39D9D0] hover:underline flex items-center gap-0.5 font-medium"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {!queue || queue.length === 0 ? (
                <div className="flex min-h-[140px] flex-col items-center justify-center text-center p-4">
                  <ShieldCheck className="h-8 w-8 text-[#39D9D0]/50 mb-2" />
                  <p className="text-xs font-semibold text-white">No active priority referrals</p>
                  <p className="text-[11px] text-[#5A7184] mt-0.5 max-w-[200px]">
                    High-risk screenings and ungradable images will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 3).map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-[#0B1726] border border-white/5 hover:border-white/15 transition flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-bold tracking-wide",
                              item.referral_priority === "CRITICAL"
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : item.referral_priority === "HIGH"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            )}
                          >
                            {item.referral_priority}
                          </span>
                          <span className="text-[11px] font-mono text-white">
                            SCR-{item.id?.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#5A7184]">
                          {formatDate(item.created_at)}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#5A7184] block">Risk Score</span>
                        <span className="text-xs font-mono font-bold text-[#F4F8FC]">
                          {item.referral_score?.toFixed(0) ?? "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Diagnostic Protocol Steps */}
            <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-[#07111F]/70 border border-white/5">
                <span className="text-[9px] font-mono text-[#39D9D0] block">STEP 1</span>
                <span className="text-[10px] text-white font-medium block">Quality Gate</span>
              </div>
              <div className="p-2 rounded bg-[#07111F]/70 border border-white/5">
                <span className="text-[9px] font-mono text-[#7C8CFF] block">STEP 2</span>
                <span className="text-[10px] text-white font-medium block">AI Inference</span>
              </div>
              <div className="p-2 rounded bg-[#07111F]/70 border border-white/5">
                <span className="text-[9px] font-mono text-emerald-400 block">STEP 3</span>
                <span className="text-[10px] text-white font-medium block">Doctor Review</span>
              </div>
            </div>
          </div>

          {/* Recent Reports Widget */}
          <div className="glass-card p-5 rounded-xl border border-white/10">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#7C8CFF]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Generated Diagnostic Reports
                </h3>
              </div>
              <Link href="/reports" className="text-xs text-[#7C8CFF] hover:underline font-medium">
                All Reports →
              </Link>
            </div>

            {!reports || reports.length === 0 ? (
              <p className="text-xs text-[#5A7184] py-3 text-center">
                No reports generated yet. Reports are produced upon screening review.
              </p>
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 2).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0B1726] border border-white/5 text-xs">
                    <span className="font-mono text-white text-[11px]">RPT-{r.screening_id?.slice(0, 10)}</span>
                    <a
                      href={`/api/screenings/${r.screening_id}/report/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#39D9D0] hover:underline font-mono"
                    >
                      Download PDF
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
