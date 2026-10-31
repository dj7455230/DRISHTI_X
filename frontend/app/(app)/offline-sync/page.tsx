"use client"

import React, { useEffect, useState } from "react"
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Database,
  Trash2,
  HardDrive,
  Activity,
  Send,
  Eye,
  ArrowRight,
  ShieldAlert,
} from "lucide-react"
import { offlineDB, OfflineCase, QueueItem, SyncHistoryEntry } from "@/lib/offline/db"
import { prioritySyncManager } from "@/lib/offline/prioritySyncManager"
import { cn, formatDate } from "@/lib/utils"

export default function OfflineSyncPage() {
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCases, setPendingCases] = useState<OfflineCase[]>([])
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [historyEntries, setHistoryEntries] = useState<SyncHistoryEntry[]>([])
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [activeTab, setActiveTab] = useState<"queue" | "cases" | "history">("queue")

  const loadData = async () => {
    try {
      const cases = await offlineDB.getCases()
      const queue = await offlineDB.getQueue()
      const history = await offlineDB.getHistory(50)
      setPendingCases(cases)
      setQueueItems(queue)
      setHistoryEntries(history)

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate()
        setStorageEstimate({
          usage: est.usage || 0,
          quota: est.quota || 0,
        })
      }
    } catch (e) {
      console.error("Failed to load local DB state:", e)
    }
  }

  useEffect(() => {
    setIsOnline(navigator.onLine)
    loadData()

    const unsubscribe = prioritySyncManager.subscribe((state) => {
      setIsOnline(state.isOnline)
      setIsSyncing(state.isSyncing)
      loadData()
    })

    return () => unsubscribe()
  }, [])

  const handleTriggerSync = async () => {
    await prioritySyncManager.syncPendingQueue()
    await loadData()
  }

  const handleClearLocalStore = async () => {
    if (confirm("Are you sure you want to clear local offline storage? Any un-synced cases will be removed.")) {
      await offlineDB.clearAll()
      await loadData()
    }
  }

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <HardDrive className="w-6 h-6 text-teal-400" />
            Rural Offline Queue & <span className="gradient-text">Priority Sync</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Features 31 & 34: Local IndexedDB persistence, low-bandwidth mode, and priority-aware auto-synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={!isOnline || isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Synchronizing Queue..." : "Sync All Cases Now"}
          </button>

          <button
            type="button"
            onClick={handleClearLocalStore}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 text-xs font-medium transition"
            title="Clear local IndexedDB store"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Local Cache
          </button>
        </div>
      </div>

      {/* Mandatory Clinical Safety Disclaimer Notice (Feature 32) */}
      <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold uppercase tracking-wider text-[11px] text-amber-300">
            Mandatory Rural Clinical Transport Policy
          </p>
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            Clinical priority-aware synchronization is a bandwidth transport strategy designed for weak rural connectivity. It must <strong>never</strong> delay local emergency or hospital referral instructions. Patients flagged with critical symptoms or ungradable vision changes must receive immediate clinical care regardless of whether their screening record has synchronized to the central cloud server.
          </p>
        </div>
      </div>

      {/* Connectivity & Storage Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Network State */}
        <div className="glass-card p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Network State</p>
            <p className={cn("text-base font-bold mt-1 flex items-center gap-2", isOnline ? "text-emerald-400" : "text-amber-400")}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isOnline ? "Connected (Online)" : "Offline (Low-BW Mode)"}
            </p>
          </div>
          <div className={cn("w-3 h-3 rounded-full animate-ping", isOnline ? "bg-emerald-500" : "bg-amber-500")} />
        </div>

        {/* Sync Status */}
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Active Sync Engine</p>
          <p className="text-base font-bold text-white mt-1 flex items-center gap-2">
            <RefreshCw className={cn("w-4 h-4 text-teal-400", isSyncing && "animate-spin")} />
            {isSyncing ? "Transferring..." : "Idle / Listening"}
          </p>
        </div>

        {/* Local Pending Queue */}
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Queue Items Pending</p>
          <p className="text-2xl font-bold font-mono text-cyan-400 mt-0.5">
            {queueItems.filter((q) => q.status === "QUEUED" || q.status === "FAILED").length}
          </p>
        </div>

        {/* Local Storage Quota */}
        <div className="glass-card p-4 rounded-xl border border-white/10">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">IndexedDB Storage</p>
          <p className="text-base font-bold text-white mt-1">
            {storageEstimate
              ? `${(storageEstimate.usage / (1024 * 1024)).toFixed(1)} MB used`
              : "Active"}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {storageEstimate
              ? `of ${(storageEstimate.quota / (1024 * 1024 * 1024)).toFixed(0)} GB browser quota`
              : "Isolated client database"}
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={cn(
            "px-4 py-2 rounded-xl font-bold transition flex items-center gap-2",
            activeTab === "queue"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Priority Sync Queue ({queueItems.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("cases")}
          className={cn(
            "px-4 py-2 rounded-xl font-bold transition flex items-center gap-2",
            activeTab === "cases"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Database className="w-3.5 h-3.5" />
          Offline Cases ({pendingCases.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-4 py-2 rounded-xl font-bold transition flex items-center gap-2",
            activeTab === "history"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Synchronization History ({historyEntries.length})
        </button>
      </div>

      {/* TAB 1: PRIORITY SYNC QUEUE */}
      {activeTab === "queue" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Cases are dispatched in strict clinical priority order: <strong>CRITICAL</strong> first, followed by <strong>HIGH</strong>, <strong>MEDIUM</strong>, and <strong>ROUTINE</strong>.
            </span>
            <span className="font-mono text-[11px]">Fairness Aging Factor: +0.5 pts/min</span>
          </div>

          {queueItems.length === 0 ? (
            <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">Priority Sync Queue is Clean</h3>
              <p className="text-xs text-slate-400 mt-1">
                All locally captured retinal cases and Evidence Capsules have been transmitted to the central server.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {queueItems.map((item, idx) => {
                const isCrit = item.priority_level === "CRITICAL"
                const isHigh = item.priority_level === "HIGH"
                const isMed = item.priority_level === "MEDIUM"

                return (
                  <div
                    key={item.idempotency_key}
                    className={cn(
                      "glass-card p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all",
                      isCrit
                        ? "border-rose-500/40 bg-rose-950/20"
                        : isHigh
                        ? "border-amber-500/30 bg-amber-950/15"
                        : isMed
                        ? "border-cyan-500/20 bg-cyan-950/10"
                        : "border-white/10 bg-[#0B1726]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-slate-300">
                        #{idx + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-teal-300 text-xs">{item.case_number}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                            {item.sync_type}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase",
                              isCrit
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : isHigh
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : isMed
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            )}
                          >
                            {item.priority_level} ({item.priority_score})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Queued: {formatDate(item.created_at)}
                          {item.retry_count > 0 && ` • Retries: ${item.retry_count}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg",
                          item.status === "SYNCING"
                            ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
                            : item.status === "SYNCED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : item.status === "FAILED"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-white/10 text-slate-300"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OFFLINE CASES STORE */}
      {activeTab === "cases" && (
        <div className="space-y-3">
          {pendingCases.length === 0 ? (
            <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
              <Database className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No Offline Cases Saved</h3>
              <p className="text-xs text-slate-400 mt-1">
                Cases created while offline or in low-bandwidth mode will be indexed here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingCases.map((c) => (
                <div key={c.id} className="glass-card p-4 rounded-xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-300">{c.case_number}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300">
                      {c.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 space-y-0.5">
                    <p>
                      <strong className="text-white">{c.patient_name}</strong> ({c.patient_age}y, {c.patient_gender})
                    </p>
                    <p className="text-slate-400 text-[11px]">Facility: {c.facility_code} • Eye: {c.eye_side}</p>
                    <p className="text-slate-400 text-[10px] font-mono truncate">
                      SHA-256: {c.image_checksum}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SYNCHRONIZATION HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {historyEntries.length === 0 ? (
            <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
              <Clock className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white">No Sync History Logged</h3>
              <p className="text-xs text-slate-400 mt-1">
                Completed synchronization events and transmission logs will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyEntries.map((h, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        h.status === "SUCCESS" ? "bg-emerald-400" : "bg-rose-400"
                      )}
                    />
                    <span className="font-mono font-bold text-teal-300">{h.case_number}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                      {h.sync_type}
                    </span>
                    <span className="text-slate-400 text-[11px]">{h.message}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 text-[10px] font-mono shrink-0">
                    <span>{(h.bytes_transferred / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>{formatDate(h.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

