"use client"

import { useEffect } from "react"
import { useNetworkStore } from "@/lib/store"
import { syncPendingCases, getPendingCount } from "@/lib/offlineQueue"

export function NetworkMonitor() {
  const setOnline = useNetworkStore((s) => s.setOnline)
  const setPendingSync = useNetworkStore((s) => s.setPendingSync)

  useEffect(() => {
    const handleOnline = async () => {
      setOnline(true)
      // Auto-sync on reconnect
      try {
        await syncPendingCases()
        const count = await getPendingCount()
        setPendingSync(count)
      } catch { /* silent — user will see pending count */ }
    }

    const handleOffline = () => setOnline(false)

    window.addEventListener("online",  handleOnline)
    window.addEventListener("offline", handleOffline)
    setOnline(navigator.onLine)

    // Poll pending count every 30s
    const interval = setInterval(async () => {
      try {
        const count = await getPendingCount()
        setPendingSync(count)
      } catch { /* IndexedDB may not be available in SSR */ }
    }, 30_000)

    return () => {
      window.removeEventListener("online",  handleOnline)
      window.removeEventListener("offline", handleOffline)
      clearInterval(interval)
    }
  }, [setOnline, setPendingSync])

  return null
}
