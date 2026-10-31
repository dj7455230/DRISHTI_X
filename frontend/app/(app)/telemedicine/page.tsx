"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { motion } from "framer-motion"
import { Satellite, Play, Loader2, AlertTriangle } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { cn } from "@/lib/utils"

const COLORS = ["#ef4444", "#f59e0b", "#10b981"]

export default function TelemedicinePage() {
  const [bandwidth, setBandwidth] = useState(1000)
  const [specialists, setSpecialists] = useState(2)
  const [reviewTime, setReviewTime] = useState(3)
  const [run, setRun] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: ["simulation", bandwidth, specialists, reviewTime, run],
    queryFn: () => api.get("/api/simulation/run", {
      params: { bandwidth_kbps: bandwidth, specialists, review_time_min: reviewTime }
    }).then(r => r.data),
    enabled: run,
    staleTime: 0,
  })

  const scenarios = data?.scenarios ? Object.entries(data.scenarios).map(([k, v]: any) => ({
    name: k.replace("_bandwidth_", " ").toUpperCase(),
    patients: v.patients_per_year,
    upload: v.avg_upload_time_sec,
    queue: v.avg_queue_length,
  })) : []

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Telemedicine <span className="gradient-text">Simulation</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Rural telemedicine pipeline simulation — queuing theory model
        </p>
      </div>

      <div className="glass-card px-4 py-3 border-yellow-500/30 bg-yellow-500/5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
        <p className="text-xs text-yellow-300">
          SIMULATION RESULTS — Python analytical model (Simulink not installed).
          Results are model estimates, not real-world measurements.
        </p>
      </div>

      {/* Parameters */}
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Satellite className="w-4 h-4 text-cyan-400" /> Simulation Parameters
        </h2>
        <div className="grid grid-cols-3 gap-5">
          {[
            { label: "Bandwidth (kbps)", val: bandwidth, set: setBandwidth, min: 64, max: 100000, step: 100 },
            { label: "Ophthalmologists", val: specialists, set: setSpecialists, min: 1, max: 20, step: 1 },
            { label: "Review Time (min)", val: reviewTime, set: setReviewTime, min: 1, max: 30, step: 0.5 },
          ].map(({ label, val, set: setter, min, max, step }) => (
            <div key={label}>
              <label className="text-xs text-slate-400 block mb-2">
                {label}: <span className="text-cyan-400 font-mono">{val}</span>
              </label>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => setter(Number(e.target.value))}
                className="w-full accent-cyan-400" />
              <div className="flex justify-between text-xs text-slate-600 mt-1">
                <span>{min}</span><span>{max}</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setRun(true)}
          disabled={isFetching}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-50">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isFetching ? "Simulating..." : "Run Simulation"}
        </button>
      </div>

      {/* Results */}
      {data && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Patients / Year", val: data.results.patients_per_year.toLocaleString() },
              { label: "Avg Upload Time", val: `${data.results.avg_upload_time_sec}s` },
              { label: "Specialist Util.", val: `${data.results.specialist_utilization_pct}%` },
              { label: "Avg Queue Length", val: data.results.avg_queue_length.toFixed(1) },
            ].map(({ label, val }) => (
              <div key={label} className="glass-card p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className="text-2xl font-bold text-cyan-400">{val}</p>
              </div>
            ))}
          </div>

          {/* Scenario comparison chart */}
          {scenarios.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">
                Bandwidth Scenario Comparison — Patients / Year
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scenarios} barSize={40}>
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 8 }} />
                  <Bar dataKey="patients" name="Patients/Year" radius={[4, 4, 0, 0]}>
                    {scenarios.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="text-xs text-slate-600">
            {data.simulink_status} — {data.disclaimer}
          </p>
        </motion.div>
      )}
    </div>
  )
}
