"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react"
import { prioritySyncManager, SyncStatusListener } from "@/lib/offline/prioritySyncManager"
import { cn } from "@/lib/utils"

export function OfflineSyncBanner() {
  const [state, setState] = useState<{
    isOnline: boolean
    isSyncing: boolean
    pendingCount: number
    activeItem?: any
    lastSyncTime?: string
  }>({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
  })

  useEffect(() => {
    const unsubscribe = prioritySyncManager.subscribe((newState) => {
      setState(newState)
    })
    return () => unsubscribe()
  }, [])

  const handleManualSync = () => {
    prioritySyncManager.syncPendingQueue()
  }

  // If online and no pending cases and not syncing, show minimal status or hide
  if (state.isOnline && state.pendingCount === 0 && !state.isSyncing) {
    return null
  }

  return (
    <div
      className={cn(
        "w-full px-4 py-2.5 text-xs border-b transition-all duration-300 flex flex-wrap items-center justify-between gap-3 select-none",
        !state.isOnline
          ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
          : state.isSyncing
          ? "bg-cyan-950/40 border-cyan-500/40 text-cyan-200"
          : "bg-[#101F30] border-white/10 text-slate-300"
      )}
    >
      {/* Left: Connectivity & Priority Status */}
      <div className="flex items-center gap-2.5">
        {!state.isOnline ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold font-mono">
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span>OFFLINE — LOW-BANDWIDTH LOCAL MODE</span>
          </div>
        ) : state.isSyncing ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold font-mono animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>
              SYNCING {state.activeItem ? `${state.activeItem.priority_level} CASE` : "QUEUE"}...
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>CONNECTED</span>
          </div>
        )}

        <span className="text-slate-400 hidden sm:inline">|</span>

        <p className="text-[11px] leading-tight">
          {!state.isOnline ? (
            <span>
              Cases saved to local IndexedDB. Urgent cases are queued to synchronize first when connectivity returns.
            </span>
          ) : state.isSyncing && state.activeItem ? (
            <span>
              Uploading <strong className="text-white">{state.activeItem.case_number}</strong> ({state.activeItem.sync_type}) ahead of routine cases.
            </span>
          ) : (
            <span>
              <strong className="text-white">{state.pendingCount}</strong> case{state.pendingCount === 1 ? "" : "s"} waiting in local priority queue.
            </span>
          )}
        </p>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {state.isOnline && state.pendingCount > 0 && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={state.isSyncing}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] transition disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3 h-3", state.isSyncing && "animate-spin")} />
            {state.isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        )}

        <Link
          href="/offline-sync"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-medium border border-white/10 transition"
        >
          Queue Dashboard
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

