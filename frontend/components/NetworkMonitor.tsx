"use client"

import { useEffect, useRef, useCallback } from "react"
import { useNetworkStore } from "@/lib/store"
import { syncPendingCases, getPendingCount } from "@/lib/offlineQueue"
import { healthApi } from "@/lib/api"
import { API_CONFIG } from "@/lib/config"

export function NetworkMonitor() {
  const setOnline = useNetworkStore((s) => s.setOnline)
  const setPendingSync = useNetworkStore((s) => s.setPendingSync)
  const setBackendStatus = useNetworkStore((s) => s.setBackendStatus)
  const backendStatus = useNetworkStore((s) => s.backendStatus)

  const isPollingRef = useRef(false)
  const consecutiveFailuresRef = useRef(0)

  const checkBackendHealth = useCallback(async () => {
    if (isPollingRef.current) return
    isPollingRef.current = true

    try {
      // Light ping to health endpoint
      const res = await healthApi.check()
      if (res.status === 200) {
        consecutiveFailuresRef.current = 0
        setBackendStatus("CONNECTED")
      } else {
        consecutiveFailuresRef.current += 1
        setBackendStatus(
          consecutiveFailuresRef.current > 1 ? "DISCONNECTED" : "RECOVERING",
          `Server responded with HTTP ${res.status}`
        )
      }
    } catch (err: any) {
      consecutiveFailuresRef.current += 1
      const errMsg = err?.message || "Failed to reach backend API"
      // If was previously disconnected, show recovering before marking disconnected
      setBackendStatus(
        consecutiveFailuresRef.current > 1 ? "DISCONNECTED" : "CONNECTING",
        errMsg
      )
    } finally {
      isPollingRef.current = false
    }
  }, [setBackendStatus])

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      // Trigger check immediately upon network reconnection
      checkBackendHealth()
      try {
        await syncPendingCases()
        const count = await getPendingCount()
        setPendingSync(count)
      } catch {
        /* silent — user will see pending count */
      }
    }

    const handleOffline = () => {
      setOnline(false)
      setBackendStatus("DISCONNECTED", "Device has lost network connectivity.")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    setOnline(navigator.onLine)

    // Initial check on mount
    checkBackendHealth()

    // Controlled heartbeat poll every 30s (or 10s if disconnected to speed up automatic recovery)
    const interval = setInterval(
      () => {
        checkBackendHealth()
      },
      backendStatus === "DISCONNECTED" ? API_CONFIG.POLL_INTERVAL_FAST_MS : API_CONFIG.HEALTH_CHECK_INTERVAL_MS
    )

    // Periodic pending sync count poll every 30s
    const syncInterval = setInterval(async () => {
      try {
        const count = await getPendingCount()
        setPendingSync(count)
      } catch {
        /* SSR safe */
      }
    }, 30_000)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      clearInterval(interval)
      clearInterval(syncInterval)
    }
  }, [setOnline, setPendingSync, checkBackendHealth, backendStatus, setBackendStatus])

  return null
}
