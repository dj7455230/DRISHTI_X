/**
 * DRISHTI-X — Offline Queue
 * When network is unavailable in rural camps, cases and retinal images are stored locally in IndexedDB.
 * On reconnection, they are automatically synced to the backend in batches.
 * Never silently loses cases.
 */

export interface QueuedCase {
  id: string
  type: "CREATE_PATIENT" | "CREATE_SCREENING" | "UPLOAD_IMAGE" | "ANALYZE" | "OFFLINE_SCREENING"
  payload: any
  createdAt: string
  retries: number
  status: "PENDING" | "SYNCING" | "FAILED"
  error?: string
}

const DB_NAME = "drishti_offline"
const STORE = "pending_cases"
const VERSION = 2

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment"))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(item: Omit<QueuedCase, "retries" | "status">): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const req = tx.objectStore(STORE).put({ ...item, retries: 0, status: "PENDING" })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const req = tx.objectStore(STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function getPendingCases(): Promise<QueuedCase[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly")
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as QueuedCase[])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function getPendingCount(): Promise<number> {
  const cases = await getPendingCases()
  return cases.filter((c) => c.status === "PENDING").length
}

export async function retryAllFailed(): Promise<void> {
  const cases = await getPendingCases()
  const db = await openDB()
  const tx = db.transaction(STORE, "readwrite")
  const store = tx.objectStore(STORE)
  for (const item of cases) {
    if (item.status === "FAILED") {
      store.put({ ...item, status: "PENDING", retries: 0, error: undefined })
    }
  }
}

export async function clearAll(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const req = tx.objectStore(STORE).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Attempt to sync all pending cases.
 * Called automatically when the browser comes back online or via manual trigger.
 */
export async function syncPendingCases(
  onProgress?: (msg: string) => void
): Promise<{ synced: number; failed: number }> {
  const cases = await getPendingCases()
  const pending = cases.filter((c) => c.status === "PENDING" && c.retries < 3)

  let synced = 0
  let failed = 0

  for (const item of pending) {
    try {
      onProgress?.(`Syncing: ${item.type} (${item.id.slice(0, 8)})`)
      const { api } = await import("./api")

      if (item.type === "OFFLINE_SCREENING") {
        // Sync complete offline case with patient and image
        await api.post("/api/screenings/sync", { cases: [item.payload] })
      } else if (item.type === "CREATE_PATIENT") {
        await api.post("/api/patients", item.payload)
      } else if (item.type === "CREATE_SCREENING") {
        await api.post("/api/screenings", item.payload)
      } else if (item.type === "UPLOAD_IMAGE") {
        const formData = new FormData()
        if (item.payload.base64) {
          const res = await fetch(item.payload.base64)
          const blob = await res.blob()
          formData.append("file", blob, item.payload.filename || "offline_fundus.jpg")
        }
        await api.post(`/api/screenings/${item.payload.screening_id}/image`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      } else if (item.type === "ANALYZE") {
        await api.post(`/api/screenings/${item.payload.screening_id}/analyze`)
      }

      await dequeue(item.id)
      synced++
      onProgress?.(`✓ Synced: ${item.type}`)
    } catch (e: any) {
      failed++
      const errMsg = e?.response?.data?.detail || e?.message || "Sync error"
      const db = await openDB()
      const updated: QueuedCase = {
        ...item,
        retries: item.retries + 1,
        status: item.retries >= 2 ? "FAILED" : "PENDING",
        error: String(errMsg),
      }
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(updated)
      onProgress?.(`✗ Failed: ${item.type} (retry ${item.retries + 1}/3)`)
    }
  }

  return { synced, failed }
}
