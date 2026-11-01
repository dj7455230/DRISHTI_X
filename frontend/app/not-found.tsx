"use client"

import Link from "next/link"
import { Eye, ArrowLeft, Home, ShieldAlert, Activity, FileText } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#07111F] text-[#F4F8FC] flex flex-col items-center justify-center p-6 selection:bg-[#39D9D0]/30 selection:text-[#39D9D0]">
      <div className="w-full max-w-md bg-[#0D1C2E] border border-white/10 rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#39D9D0]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[#7C8CFF]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Icon & 404 Header */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
          <Eye className="h-8 w-8 animate-pulse" />
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-3">
          Error 404 — Page Not Found
        </span>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          Clinical Resource Not Found
        </h1>

        <p className="text-sm text-slate-400 leading-relaxed mb-8">
          The requested clinical view or endpoint does not exist. Please use the quick navigation below to return to the active platform.
        </p>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#179C94] to-[#39D9D0] text-[#07111F] font-semibold text-sm hover:opacity-95 transition-all shadow-lg shadow-[#39D9D0]/20"
          >
            <Home className="h-4 w-4" />
            Go to Clinical Dashboard
          </Link>

          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Clinical Sign In
          </Link>
        </div>

        {/* Quick Nav Links */}
        <div className="mt-8 pt-6 border-t border-white/10 text-left">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Quick Navigation
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Link
              href="/screenings/new"
              className="flex items-center gap-1.5 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-[#39D9D0] transition"
            >
              <Activity className="h-3.5 w-3.5 text-[#39D9D0]" />
              New Screening
            </Link>
            <Link
              href="/patients"
              className="flex items-center gap-1.5 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-[#39D9D0] transition"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-[#7C8CFF]" />
              Patient Records
            </Link>
            <Link
              href="/demo"
              className="flex items-center gap-1.5 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-[#39D9D0] transition"
            >
              <Eye className="h-3.5 w-3.5 text-emerald-400" />
              Demo Showcase
            </Link>
            <a
              href="http://localhost:8000/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-[#39D9D0] transition"
            >
              <FileText className="h-3.5 w-3.5 text-amber-400" />
              API Docs (Swagger)
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

