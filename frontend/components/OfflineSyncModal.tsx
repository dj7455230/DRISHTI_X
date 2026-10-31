"use client"

import React, { useState, useEffect } from "react"
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Database,
  ArrowUpRight,
  Trash2,
} from "lucide-react"
import {
  getPendingCases,
  syncPendingCases,
  retryAllFailed,
  clearAll,
  QueuedCase,
} from "@/lib/offlineQueue"
import { useNetworkStore } from "@/lib/store"

interface OfflineSyncModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OfflineSyncModal({ isOpen, onClose }: OfflineSyncModalProps) {
  const [cases, setCases] = useState<QueuedCase[]>([])
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [syncProgress, setSyncProgress] = useState<string>("")
  const [syncSummary, setSyncSummary] = useState<{ synced: number; failed: number } | null>(null)

  const isOnline = useNetworkStore((s) => s.isOnline)
  const setPendingSync = useNetworkStore((s) => s.setPendingSync)

  const loadCases = async () => {
    try {
      const list = await getPendingCases()
      setCases(list)
      setPendingSync(list.filter((c) => c.status === "PENDING").length)
    } catch {
      setCases([])
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadCases()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleManualSync = async () => {
    setIsSyncing(true)
    setSyncProgress("Initiating batch synchronization...")
    setSyncSummary(null)
    try {
      const result = await syncPendingCases((msg) => setSyncProgress(msg))
      setSyncSummary(result)
      await loadCases()
    } catch (err: any) {
      setSyncProgress(`Sync interrupted: ${err?.message || "Network error"}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleRetryFailed = async () => {
    await retryAllFailed()
    await loadCases()
  }

  const handleClearAll = async () => {
    if (confirm("Are you sure you want to clear all offline items? Unsynced records will be permanently removed.")) {
      await clearAll()
      await loadCases()
    }
  }

  const pendingCount = cases.filter((c) => c.status === "PENDING").length
  const failedCount = cases.filter((c) => c.status === "FAILED").length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isOnline
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Rural Offline Queue
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                    isOnline
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {isOnline ? "Online" : "Offline"}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {cases.length} case{cases.length === 1 ? "" : "s"} preserved in local storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Instructions */}
        <div className="p-4 bg-slate-950/40 border-b border-white/5">
          <p className="text-xs text-slate-300 leading-relaxed">
            Designed for mobile screening vans and rural health sub-centres with intermittent connectivity.
            Retinal photographs and patient entries are encrypted and queued locally. Synchronize whenever cellular or Wi-Fi connectivity is restored.
          </p>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">
                Pending: <strong className="text-cyan-400">{pendingCount}</strong>
              </span>
              <span className="text-slate-400">
                Failed: <strong className="text-red-400">{failedCount}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition border border-amber-500/30"
                >
                  Reset Failed ({failedCount})
                </button>
              )}
              {cases.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Clear All Offline Storage"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing || !isOnline || cases.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-cyan-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          </div>

          {/* Sync Progress Banner */}
          {syncProgress && (
            <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>{syncProgress}</span>
            </div>
          )}

          {/* Sync Summary Banner */}
          {syncSummary && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Sync Complete: {syncSummary.synced} synced, {syncSummary.failed} failed.
              </span>
            </div>
          )}

          {/* Queue items list */}
          {cases.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
              <Database className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">Queue is completely empty</p>
              <p className="text-xs text-slate-500 mt-1">All local cases have been synchronized to DRISHTI-X cloud.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between text-xs hover:border-white/10 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-cyan-400">
                        {item.type.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          item.status === "PENDING"
                            ? "bg-amber-500/20 text-amber-300"
                            : item.status === "FAILED"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-cyan-500/20 text-cyan-300"
                        }`}
                      >
                        {item.status} {item.retries > 0 ? `(${item.retries} retries)` : ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      ID: {item.id.slice(0, 16)}... • Queued: {new Date(item.createdAt).toLocaleTimeString()}
                    </p>
                    {item.error && (
                      <p className="text-[11px] text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {item.error}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {item.payload?.client_case_id || item.payload?.patient_id || "Case"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Protected offline SQLite / IndexedDB replica</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

