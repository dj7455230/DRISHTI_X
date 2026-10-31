/**
 * DRISHTI-X — Rural Offline IndexedDB Architecture (Feature 31 & 34)
 * Secure local browser persistence for weak/intermittent connectivity at Primary Health Centres.
 *
 * Stores:
 * - pending_cases: Case metadata and offline fundus image Blobs.
 * - evidence_capsules: Compact 17-field JSON capsules.
 * - sync_queue: Priority-ordered items awaiting transmission.
 * - sync_history: Persistent log of completed or failed synchronizations.
 *
 * Privacy Note: Data is scoped to application IndexedDB; never plaintext in localStorage.
 */

const DB_NAME = "drishti_rural_db"
const DB_VERSION = 1

export interface OfflineCase {
  id: string
  case_number: string
  patient_id?: string
  patient_name: string
  patient_code: string
  patient_age: number
  patient_gender: string
  eye_side: "LEFT" | "RIGHT" | "BOTH"
  facility_code: string
  image_blob?: Blob
  image_checksum: string
  created_at: string
  status: "OFFLINE_SAVED" | "CAPSULE_SYNCED" | "SYNCED" | "FAILED"
  priority_level: "CRITICAL" | "HIGH" | "MEDIUM" | "ROUTINE"
  priority_score: number
  screening_purpose?: string
  notes?: string
}

export interface StoredCapsule {
  case_id: string
  case_number: string
  payload: any
  created_at: string
  is_synced: boolean
}

export interface QueueItem {
  idempotency_key: string
  case_id: string
  case_number: string
  sync_type: "CAPSULE" | "FULL_IMAGE"
  priority_level: "CRITICAL" | "HIGH" | "MEDIUM" | "ROUTINE"
  priority_score: number
  status: "QUEUED" | "SYNCING" | "SYNCED" | "FAILED"
  retry_count: number
  created_at: string
  last_error?: string
}

export interface SyncHistoryEntry {
  id?: number
  case_number: string
  sync_type: string
  priority_level: string
  status: "SUCCESS" | "FAILED"
  timestamp: string
  bytes_transferred: number
  message?: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment."))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains("pending_cases")) {
        db.createObjectStore("pending_cases", { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains("evidence_capsules")) {
        db.createObjectStore("evidence_capsules", { keyPath: "case_id" })
      }
      if (!db.objectStoreNames.contains("sync_queue")) {
        const queueStore = db.createObjectStore("sync_queue", { keyPath: "idempotency_key" })
        queueStore.createIndex("priority_level", "priority_level", { unique: false })
        queueStore.createIndex("status", "status", { unique: false })
      }
      if (!db.objectStoreNames.contains("sync_history")) {
        db.createObjectStore("sync_history", { keyPath: "id", autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const offlineDB = {
  // ── Case Storage ──
  async saveCase(c: OfflineCase): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending_cases", "readwrite")
      tx.objectStore("pending_cases").put(c)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  async getCases(): Promise<OfflineCase[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending_cases", "readonly")
      const req = tx.objectStore("pending_cases").getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  },

  async getCase(id: string): Promise<OfflineCase | undefined> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending_cases", "readonly")
      const req = tx.objectStore("pending_cases").get(id)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  async removeCase(id: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pending_cases", "readwrite")
      tx.objectStore("pending_cases").delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  // ── Evidence Capsules ──
  async saveCapsule(capsule: StoredCapsule): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("evidence_capsules", "readwrite")
      tx.objectStore("evidence_capsules").put(capsule)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  async getCapsule(caseId: string): Promise<StoredCapsule | undefined> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("evidence_capsules", "readonly")
      const req = tx.objectStore("evidence_capsules").get(caseId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  },

  // ── Sync Queue ──
  async enqueue(item: QueueItem): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readwrite")
      tx.objectStore("sync_queue").put(item)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  async getQueue(): Promise<QueueItem[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readonly")
      const req = tx.objectStore("sync_queue").getAll()
      req.onsuccess = () => {
        const items = req.result || []
        // Sort by priority order: CRITICAL -> HIGH -> MEDIUM -> ROUTINE
        const weights: Record<string, number> = {
          CRITICAL: 100,
          HIGH: 75,
          MEDIUM: 50,
          ROUTINE: 25,
        }
        items.sort((a, b) => {
          const wA = (weights[a.priority_level] || 25) + (a.priority_score || 0)
          const wB = (weights[b.priority_level] || 25) + (b.priority_score || 0)
          return wB - wA
        })
        resolve(items)
      }
      req.onerror = () => reject(req.error)
    })
  },

  async updateQueueStatus(
    idempotencyKey: string,
    status: QueueItem["status"],
    lastError?: string
  ): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readwrite")
      const store = tx.objectStore("sync_queue")
      const getReq = store.get(idempotencyKey)
      getReq.onsuccess = () => {
        const item: QueueItem = getReq.result
        if (item) {
          item.status = status
          if (lastError) item.last_error = lastError
          if (status === "FAILED") item.retry_count = (item.retry_count || 0) + 1
          store.put(item)
        }
        resolve()
      }
      getReq.onerror = () => reject(getReq.error)
    })
  },

  async removeQueueItem(idempotencyKey: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_queue", "readwrite")
      tx.objectStore("sync_queue").delete(idempotencyKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  // ── Sync History ──
  async addHistory(entry: SyncHistoryEntry): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_history", "readwrite")
      tx.objectStore("sync_history").add(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  async getHistory(limit: number = 50): Promise<SyncHistoryEntry[]> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sync_history", "readonly")
      const req = tx.objectStore("sync_history").getAll()
      req.onsuccess = () => {
        const records = (req.result || []).reverse().slice(0, limit)
        resolve(records)
      }
      req.onerror = () => reject(req.error)
    })
  },

  async clearAll(): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        ["pending_cases", "evidence_capsules", "sync_queue", "sync_history"],
        "readwrite"
      )
      tx.objectStore("pending_cases").clear()
      tx.objectStore("evidence_capsules").clear()
      tx.objectStore("sync_queue").clear()
      tx.objectStore("sync_history").clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}

