"use client"

import { useState, useEffect } from "react"
import { useNetworkStore } from "@/lib/store"
import { healthApi } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/config"
import { AlertCircle, RefreshCw, CheckCircle2, WifiOff } from "lucide-react"

export function BackendStatusBanner() {
  const backendStatus = useNetworkStore((s) => s.backendStatus)
  const setBackendStatus = useNetworkStore((s) => s.setBackendStatus)
  const backendErrorDetail = useNetworkStore((s) => s.backendErrorDetail)
  const isOnline = useNetworkStore((s) => s.isOnline)
  const [isRetrying, setIsRetrying] = useState(false)
  const [currentApiUrl, setCurrentApiUrl] = useState("")

  useEffect(() => {
    setCurrentApiUrl(getApiBaseUrl() || "http://localhost:8000")
  }, [])

  // Only render when disconnected or recovering
  if (backendStatus === "CONNECTED") {
    return null
  }

  const handleManualRetry = async () => {
    setIsRetrying(true)
    setBackendStatus("RECOVERING")
    try {
      const res = await healthApi.check()
      if (res.status === 200) {
        setBackendStatus("CONNECTED")
      } else {
        setBackendStatus("DISCONNECTED", `Server returned HTTP ${res.status}`)
      }
    } catch (e: any) {
      setBackendStatus("DISCONNECTED", e?.message || "Connection refused")
    } finally {
      setIsRetrying(false)
    }
  }

  const currentApiUrlDisplay = currentApiUrl || "backend"

  return (
    <div className="border-b border-amber-500/30 bg-amber-950/80 backdrop-blur-md px-4 py-2.5 text-white transition-all">
      <div className="mx-auto flex max-w-[1600px] flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
            {!isOnline ? (
              <WifiOff className="h-4 w-4" />
            ) : backendStatus === "RECOVERING" || isRetrying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-amber-300">
                {!isOnline
                  ? "Offline Mode Active"
                  : backendStatus === "RECOVERING" || isRetrying
                  ? "Reconnecting to DRISHTI-X Backend..."
                  : "DRISHTI-X Backend Service Unavailable"}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/40 text-amber-200 border border-amber-500/20">
                {currentApiUrlDisplay}
              </span>
            </div>
            <p className="text-[11px] text-amber-200/80 mt-0.5">
              {!isOnline
                ? "Local records are saved to offline database and will automatically synchronize upon reconnection."
                : backendErrorDetail || "Please ensure the FastAPI service is running. Existing cached patient files remain accessible."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleManualRetry}
            disabled={isRetrying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-500/40 text-xs transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Retrying..." : "Retry Connection"}
          </button>
        </div>
      </div>
    </div>
  )
}

