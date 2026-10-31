/**
 * DRISHTI-X — Clinical Priority-Aware Synchronization Manager (Feature 32 & 34)
 * Orchestrates client-side intelligent synchronization under weak/intermittent rural connectivity.
 *
 * Rules:
 * 1. Synchronizes in strict priority order: CRITICAL -> HIGH -> MEDIUM -> ROUTINE.
 * 2. Transmits compact Evidence Capsule first (~2-5 KB) for immediate remote doctor awareness.
 * 3. Transmits full-resolution fundus image second when bandwidth permits.
 * 4. Idempotency guarantees prevent duplicate server records on retry.
 * 5. Mandatory Safety Rule: Clinical priority-aware sync is a transport strategy only.
 *    It does not delay local emergency triage or clinical referral advisories.
 */

import { offlineDB, QueueItem, OfflineCase } from "./db"
import { screeningsApi } from "@/lib/api"

export type SyncStatusListener = (state: {
  isOnline: boolean
  isSyncing: boolean
  pendingCount: number
  activeItem?: QueueItem
  lastSyncTime?: string
}) => void

class PrioritySyncManager {
  private isSyncing = false
  private listeners: Set<SyncStatusListener> = new Set()
  private autoSyncInterval: any = null

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleNetworkRecovery())
      window.addEventListener("offline", () => this.notify())
      // Check every 30 seconds if online and items pending
      this.autoSyncInterval = setInterval(() => {
        if (navigator.onLine && !this.isSyncing) {
          this.syncPendingQueue()
        }
      }, 30_000)
    }
  }

  public subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener)
    this.notify()
    return () => this.listeners.delete(listener)
  }

  private async notify(activeItem?: QueueItem) {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true
    const queue = await offlineDB.getQueue()
    const pendingCount = queue.filter((q) => q.status === "QUEUED" || q.status === "FAILED").length

    this.listeners.forEach((fn) =>
      fn({
        isOnline,
        isSyncing: this.isSyncing,
        pendingCount,
        activeItem,
        lastSyncTime: new Date().toISOString(),
      })
    )
  }

  public async handleNetworkRecovery() {
    console.log("[PrioritySync] Network restored. Initiating priority-aware synchronization...")
    await this.syncPendingQueue()
  }

  /**
   * Main synchronization loop. Processes pending queue in strict priority order.
   */
  public async syncPendingQueue(): Promise<{
    processed: number
    success: number
    failed: number
  }> {
    if (this.isSyncing) return { processed: 0, success: 0, failed: 0 }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.log("[PrioritySync] Device is offline. Halting sync.")
      return { processed: 0, success: 0, failed: 0 }
    }

    this.isSyncing = true
    let processed = 0
    let success = 0
    let failed = 0

    try {
      const queue = await offlineDB.getQueue()
      // Filter for items ready to sync
      const pendingItems = queue.filter(
        (item) => item.status === "QUEUED" || (item.status === "FAILED" && item.retry_count < 5)
      )

      for (const item of pendingItems) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break

        await this.notify(item)
        await offlineDB.updateQueueStatus(item.idempotency_key, "SYNCING")
        processed++

        try {
          if (item.sync_type === "CAPSULE") {
            await this.syncSingleCapsule(item)
          } else if (item.sync_type === "FULL_IMAGE") {
            await this.syncSingleImage(item)
          }

          await offlineDB.updateQueueStatus(item.idempotency_key, "SYNCED")
          await offlineDB.addHistory({
            case_number: item.case_number,
            sync_type: item.sync_type,
            priority_level: item.priority_level,
            status: "SUCCESS",
            timestamp: new Date().toISOString(),
            bytes_transferred: item.sync_type === "CAPSULE" ? 3500 : 850000,
            message: `${item.sync_type} synchronized to central server successfully.`,
          })
          success++
        } catch (err: any) {
          console.error(`[PrioritySync] Failed syncing ${item.case_number}:`, err)
          failed++
          const errorMsg = err?.response?.data?.detail?.message || err.message || "Network transfer failure"
          await offlineDB.updateQueueStatus(item.idempotency_key, "FAILED", errorMsg)
          await offlineDB.addHistory({
            case_number: item.case_number,
            sync_type: item.sync_type,
            priority_level: item.priority_level,
            status: "FAILED",
            timestamp: new Date().toISOString(),
            bytes_transferred: 0,
            message: `Sync failed: ${errorMsg}`,
          })
        }
      }
    } finally {
      this.isSyncing = false
      await this.notify()
    }

    return { processed, success, failed }
  }

  private async syncSingleCapsule(item: QueueItem): Promise<void> {
    const storedCapsule = await offlineDB.getCapsule(item.case_id)
    if (!storedCapsule) {
      throw new Error(`Evidence Capsule for case ${item.case_id} not found in local store.`)
    }

    const payload = {
      ...storedCapsule.payload,
      idempotency_key: item.idempotency_key,
    }

    const res = await screeningsApi.syncCapsule(payload)
    const serverScreeningId = res.data.screening_id

    // Update local case status
    const localCase = await offlineDB.getCase(item.case_id)
    if (localCase) {
      localCase.status = "CAPSULE_SYNCED"
      await offlineDB.saveCase(localCase)

      // If local case has an image blob, enqueue full image upload next
      if (localCase.image_blob) {
        await offlineDB.enqueue({
          idempotency_key: `full-img-${serverScreeningId}-${localCase.image_checksum.slice(0, 16)}`,
          case_id: serverScreeningId,
          case_number: localCase.case_number,
          sync_type: "FULL_IMAGE",
          priority_level: localCase.priority_level,
          priority_score: localCase.priority_score,
          status: "QUEUED",
          retry_count: 0,
          created_at: new Date().toISOString(),
        })
      }
    }
  }

  private async syncSingleImage(item: QueueItem): Promise<void> {
    // Find case by server screening id or local id
    const cases = await offlineDB.getCases()
    const match = cases.find((c) => c.case_number === item.case_number)
    if (!match || !match.image_blob) {
      throw new Error(`Full retinal image blob for case ${item.case_number} not available locally.`)
    }

    const file = new File([match.image_blob], `${match.case_number}.jpg`, {
      type: "image/jpeg",
    })

    await screeningsApi.uploadFullImage(item.case_id, file)

    // Mark local case as fully synced
    match.status = "SYNCED"
    await offlineDB.saveCase(match)
  }
}

export const prioritySyncManager = new PrioritySyncManager()

