"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Satellite,
  AlertTriangle,
  Play,
  RotateCcw,
  BarChart3,
  Network,
  Users,
  Activity,
  Layers,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Server,
  Zap,
} from "lucide-react"
import { simulationApi } from "@/lib/api"
import { cn } from "@/lib/utils"

export default function SimulationHubPage() {
  const [activeTab, setActiveTab] = useState<"BANDWIDTH" | "WORKLOAD" | "MESH">("BANDWIDTH")

  // Feature 38 inputs
  const [casesCount, setCasesCount] = useState<number>(100)
  const [bandwidthKbps, setBandwidthKbps] = useState<number>(128)
  const [uptimePct, setUptimePct] = useState<number>(85)
  const [randomSeed, setRandomSeed] = useState<number>(42)

  // Feature 39 inputs
  const [workloadCases, setWorkloadCases] = useState<number>(500)
  const [specialistsCount, setSpecialistsCount] = useState<number>(3)
  const [reviewTimeMin, setReviewTimeMin] = useState<number>(3.5)
  const [triageMode, setTriageMode] = useState<string>("BALANCED")

  // Fetch Bandwidth Comparison (Feature 38)
  const { data: bwData, isFetching: isBwFetching, refetch: refetchBw } = useQuery({
    queryKey: ["simBandwidth", casesCount, bandwidthKbps, uptimePct, randomSeed],
    queryFn: async () => {
      const res = await simulationApi.bandwidthComparison({
        num_cases: casesCount,
        bandwidth_kbps: bandwidthKbps,
        uptime_pct: uptimePct,
        random_seed: randomSeed,
      })
      return res.data
    },
  })

  // Fetch Specialist Workload (Feature 39)
  const { data: workloadData, isFetching: isWorkloadFetching, refetch: refetchWorkload } = useQuery({
    queryKey: ["simWorkload", workloadCases, specialistsCount, reviewTimeMin, triageMode],
    queryFn: async () => {
      const res = await simulationApi.specialistWorkload({
        num_cases: workloadCases,
        specialists: specialistsCount,
        avg_review_time_min: reviewTimeMin,
        referral_triage_mode: triageMode,
      })
      return res.data
    },
  })

  // Fetch Rural Network Mesh (Feature 37)
  const { data: meshData, isFetching: isMeshFetching } = useQuery({
    queryKey: ["simMesh", specialistsCount],
    queryFn: async () => {
      const res = await simulationApi.networkMesh({ specialists: specialistsCount })
      return res.data
    },
  })

  // Export results JSON
  const handleExportJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5" /> Features 37–39
            </span>
            <span className="text-xs text-slate-500">Discrete-Event Queuing & Telemedicine Modeling</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Telemedicine & Network <span className="gradient-text">Simulation Hub</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Evaluate bandwidth constraints, priority-aware transport speedups, and ophthalmologist review capacity under rural constraints.
          </p>
        </div>
      </div>

      {/* Prominent Mandatory Simulation Disclaimer */}
      <div className="glass-card px-4 py-3 border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>SIMULATION RESULTS:</strong> Based on Python discrete-event queuing theory models. Not real-world clinical measurements. (Simulink unavailable on Apple Silicon Python 3.14).
          </span>
        </div>
        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] shrink-0 border border-amber-500/30">
          PYTHON NETWORK SIMULATION
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        {[
          { id: "BANDWIDTH", label: "Bandwidth Comparison (FIFO vs Priority)", icon: Zap },
          { id: "WORKLOAD", label: "Specialist Workload & Queuing", icon: Users },
          { id: "MESH", label: "Multi-PHC Network Mesh", icon: Server },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all",
                isActive
                  ? "border-cyan-400 text-cyan-300 bg-cyan-500/5"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* TAB 1: BANDWIDTH COMPARISON (FEATURE 38) */}
      {activeTab === "BANDWIDTH" && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Simulation Inputs (Identical Distribution & Seed)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  Cases Count: <span className="text-cyan-400 font-mono font-bold">{casesCount}</span>
                </label>
                <input
                  type="range"
                  min={20}
                  max={300}
                  step={10}
                  value={casesCount}
                  onChange={(e) => setCasesCount(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  Bandwidth: <span className="text-cyan-400 font-mono font-bold">{bandwidthKbps} kbps</span>
                </label>
                <input
                  type="range"
                  min={32}
                  max={1024}
                  step={32}
                  value={bandwidthKbps}
                  onChange={(e) => setBandwidthKbps(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  Link Uptime: <span className="text-cyan-400 font-mono font-bold">{uptimePct}%</span>
                </label>
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={5}
                  value={uptimePct}
                  onChange={(e) => setUptimePct(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  PRNG Seed: <span className="text-cyan-400 font-mono font-bold">{randomSeed}</span>
                </label>
                <input
                  type="number"
                  value={randomSeed}
                  onChange={(e) => setRandomSeed(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono text-xs outline-none"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-500 text-[11px]">
                Both strategies evaluated under identical Poisson arrivals and payloads.
              </span>
              <button
                onClick={() => handleExportJson(bwData, "drishti_bandwidth_comparison.json")}
                disabled={!bwData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 bg-slate-800/80 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
            </div>
          </div>

          {/* Results Comparison Side-by-Side */}
          {bwData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strategy A: Normal FIFO */}
              <div className="glass-card p-5 space-y-4 border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-300">Strategy A: Standard FIFO Sync</h3>
                    <p className="text-[11px] text-slate-500">Sequential full-resolution images (~1.2 MB each)</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">
                    UNPRIORITIZED
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Time to 1st Critical Case:</span>
                    <span className="text-xl font-bold font-mono text-red-400">
                      {bwData.fifo_strategy.summary.time_to_first_critical_sec}s
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Time to All Critical Cases:</span>
                    <span className="text-xl font-bold font-mono text-slate-200">
                      {bwData.fifo_strategy.summary.time_to_all_critical_sec}s
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <span className="text-slate-400 font-semibold block text-[11px]">Average Delay by Priority:</span>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-red-400">CRITICAL:</span>
                      <span className="text-slate-300">{bwData.fifo_strategy.summary.avg_wait_by_priority_sec.CRITICAL}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-400">HIGH:</span>
                      <span className="text-slate-300">{bwData.fifo_strategy.summary.avg_wait_by_priority_sec.HIGH}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-400">MEDIUM:</span>
                      <span className="text-slate-300">{bwData.fifo_strategy.summary.avg_wait_by_priority_sec.MEDIUM}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-400">ROUTINE:</span>
                      <span className="text-slate-300">{bwData.fifo_strategy.summary.avg_wait_by_priority_sec.ROUTINE}s</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy B: DRISHTI-X Priority-Aware */}
              <div className="glass-card p-5 space-y-4 border-cyan-500/30 bg-cyan-500/5">
                <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20">
                  <div>
                    <h3 className="text-sm font-bold text-cyan-300">Strategy B: DRISHTI-X Priority Sync</h3>
                    <p className="text-[11px] text-cyan-200/70">Capsule ahead (3.2 KB) + Dynamic Priority Aging</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
                    PRIORITY AWARE
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/20">
                    <span className="text-slate-400 block text-[11px]">Time to 1st Critical Case:</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {bwData.priority_aware_strategy.summary.time_to_first_critical_sec}s
                      </span>
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center">
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                        {bwData.comparison_highlights.first_critical_arrival_reduction_pct}% faster
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/20">
                    <span className="text-slate-400 block text-[11px]">Time to All Critical Cases:</span>
                    <span className="text-xl font-bold font-mono text-cyan-200">
                      {bwData.priority_aware_strategy.summary.time_to_all_critical_sec}s
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-500/20 space-y-2 text-xs">
                  <span className="text-slate-400 font-semibold block text-[11px]">Average Delay by Priority:</span>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-red-400 font-bold">CRITICAL:</span>
                      <span className="text-emerald-400 font-bold">
                        {bwData.priority_aware_strategy.summary.avg_wait_by_priority_sec.CRITICAL}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-400">HIGH:</span>
                      <span className="text-cyan-300">
                        {bwData.priority_aware_strategy.summary.avg_wait_by_priority_sec.HIGH}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-400">MEDIUM:</span>
                      <span className="text-slate-300">
                        {bwData.priority_aware_strategy.summary.avg_wait_by_priority_sec.MEDIUM}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-400">ROUTINE:</span>
                      <span className="text-slate-400">
                        {bwData.priority_aware_strategy.summary.avg_wait_by_priority_sec.ROUTINE}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SPECIALIST WORKLOAD & QUEUING (FEATURE 39) */}
      {activeTab === "WORKLOAD" && (
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Specialist Capacity & Triage Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  Screening Intake: <span className="text-cyan-400 font-mono font-bold">{workloadCases} cases</span>
                </label>
                <input
                  type="range"
                  min={100}
                  max={1000}
                  step={50}
                  value={workloadCases}
                  onChange={(e) => setWorkloadCases(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  Ophthalmologists: <span className="text-cyan-400 font-mono font-bold">{specialistsCount}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={specialistsCount}
                  onChange={(e) => setSpecialistsCount(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  Review Time/Case: <span className="text-cyan-400 font-mono font-bold">{reviewTimeMin} min</span>
                </label>
                <input
                  type="range"
                  min={1.5}
                  max={10}
                  step={0.5}
                  value={reviewTimeMin}
                  onChange={(e) => setReviewTimeMin(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Triage Protocol</label>
                <select
                  value={triageMode}
                  onChange={(e) => setTriageMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white text-xs outline-none"
                >
                  <option value="CONSERVATIVE">Conservative (25% Normal Audit)</option>
                  <option value="BALANCED">Balanced (15% Normal Audit)</option>
                  <option value="AGGRESSIVE">Aggressive (5% Normal Audit)</option>
                </select>
              </div>
            </div>
          </div>

          {workloadData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1: Cohort Intake Breakdown */}
              <div className="glass-card p-5 space-y-3 text-xs">
                <h3 className="font-semibold text-white">Screening Cohort Breakdown</h3>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Normal / Mild DR:</span>
                    <span className="text-slate-200">{workloadData.cohort_breakdown.normal_or_mild} cases (60%)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Moderate DR:</span>
                    <span className="text-amber-400">{workloadData.cohort_breakdown.moderate_npdr} cases (15%)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Severe / Proliferative DR:</span>
                    <span className="text-red-400 font-bold">{workloadData.cohort_breakdown.severe_pdr_critical} cases (15%)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Discordant / Uncertain:</span>
                    <span className="text-purple-400">{workloadData.cohort_breakdown.discordant_uncertain} cases (10%)</span>
                  </div>
                </div>
              </div>

              {/* Card 2: FIFO vs DRISHTI Workload */}
              <div className="glass-card p-5 space-y-3 text-xs">
                <h3 className="font-semibold text-white">Workload & Specialist Utilization</h3>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Daily Review Capacity:</span>
                    <span className="text-cyan-400">{workloadData.capacity.daily_capacity_cases} cases/day</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Unassisted FIFO Load:</span>
                    <span className="text-red-400">{workloadData.unassisted_fifo.utilization_pct}% ({workloadData.unassisted_fifo.backlog_end_of_day} backlog)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-cyan-500/20">
                    <span className="text-cyan-300">DRISHTI-X Triage Load:</span>
                    <span className="text-emerald-400 font-bold">{workloadData.drishti_priority_triage.utilization_pct}% ({workloadData.drishti_priority_triage.backlog_end_of_day} backlog)</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-slate-900/60">
                    <span className="text-slate-400">Burnout Risk Status:</span>
                    <span className={cn(
                      "font-bold",
                      workloadData.drishti_priority_triage.burnout_risk === "LOW" ? "text-emerald-400" : "text-amber-400"
                    )}>
                      {workloadData.drishti_priority_triage.burnout_risk}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Critical Delay Reduction */}
              <div className="glass-card p-5 space-y-3 text-xs border-emerald-500/30 bg-emerald-500/5">
                <h3 className="font-semibold text-emerald-300">Clinical Impact</h3>
                <div className="space-y-3 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Critical Case Wait Time:</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-2xl font-bold font-mono text-emerald-400">
                        {workloadData.drishti_priority_triage.avg_critical_wait_hours} hrs
                      </span>
                      <span className="text-slate-500 line-through text-xs font-mono">
                        {workloadData.unassisted_fifo.avg_critical_wait_hours} hrs FIFO
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                    <strong>{workloadData.outcomes.critical_delay_reduction_pct}% faster</strong> review for severe/urgent patients through AI priority triage.
                  </div>

                  <p className="text-[10px] text-slate-400 leading-tight">
                    {workloadData.outcomes.clinical_governance_rule}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MULTI-PHC NETWORK MESH (FEATURE 37) */}
      {activeTab === "MESH" && (
        <div className="space-y-6">
          {meshData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="glass-card p-4">
                  <span className="text-slate-400 block text-[11px]">Total Rural PHC Nodes:</span>
                  <span className="text-2xl font-bold text-white font-mono">{meshData.network_summary.total_phcs}</span>
                </div>
                <div className="glass-card p-4">
                  <span className="text-slate-400 block text-[11px]">Daily Screenings:</span>
                  <span className="text-2xl font-bold text-cyan-400 font-mono">{meshData.network_summary.total_daily_screenings}</span>
                </div>
                <div className="glass-card p-4">
                  <span className="text-slate-400 block text-[11px]">Evidence Capsule Success:</span>
                  <span className="text-2xl font-bold text-emerald-400 font-mono">{meshData.network_summary.capsule_success_rate_pct}%</span>
                </div>
                <div className="glass-card p-4">
                  <span className="text-slate-400 block text-[11px]">Full Image Sync Rate:</span>
                  <span className="text-2xl font-bold text-purple-400 font-mono">{meshData.network_summary.full_image_sync_pct}%</span>
                </div>
              </div>

              {/* PHC Table */}
              <div className="glass-card overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="p-3">PHC Node</th>
                      <th className="p-3">District</th>
                      <th className="p-3">Bandwidth</th>
                      <th className="p-3">Uptime</th>
                      <th className="p-3">Daily Cases</th>
                      <th className="p-3">Capsules Synced</th>
                      <th className="p-3">Full Images Synced</th>
                      <th className="p-3">Critical Transit Delay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {meshData.phc_nodes.map((node: any) => (
                      <tr key={node.phc_id} className="hover:bg-slate-900/40">
                        <td className="p-3 font-semibold text-white">{node.name}</td>
                        <td className="p-3 text-slate-400">{node.district}</td>
                        <td className="p-3 text-cyan-400">{node.bandwidth_kbps} kbps</td>
                        <td className="p-3 text-slate-300">{node.uptime_pct}%</td>
                        <td className="p-3 text-slate-200">{node.daily_volume}</td>
                        <td className="p-3 text-emerald-400 font-bold">{node.capsules_synced} (100%)</td>
                        <td className="p-3 text-slate-300">{node.full_images_synced} ({node.sync_efficiency_pct}%)</td>
                        <td className="p-3 text-amber-400 font-bold">{node.critical_capsule_delay_sec}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

