"use client"
import { useAuthStore } from "@/lib/store"
import { Settings } from "lucide-react"

export default function SettingsPage() {
  const { user } = useAuthStore()
  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3">
        <Settings className="w-6 h-6 text-cyan-400" />
        <span className="gradient-text">Settings</span>
      </h1>
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Account</h2>
        {[
          { label: "Full Name", val: user?.full_name },
          { label: "Email",    val: user?.email },
          { label: "Role",     val: user?.role?.replace("_", " ") },
          { label: "Facility", val: user?.facility_name ?? "—" },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between py-2 border-b border-white/5">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-xs text-slate-200">{val}</span>
          </div>
        ))}
      </div>
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white">System</h2>
        {[
          { label: "API URL",       val: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000" },
          { label: "Model Status",  val: "NOT_TRAINED" },
          { label: "MATLAB",        val: "NOT AVAILABLE" },
          { label: "Demo Mode",     val: "ACTIVE" },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between py-2 border-b border-white/5">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-xs font-mono text-cyan-400">{val}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 text-center">
        AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS
      </p>
    </div>
  )
}
