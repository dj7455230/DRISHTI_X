/**
 * DRISHTI-X — API Client
 * Centralized, typed Axios client with unified error handling, timeout, and auth interceptor.
 */
import axios from "axios"
import { getApiBaseUrl, API_CONFIG } from "./config"

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: API_CONFIG.TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
})

// Attach JWT token to every request (with multiple storage fallbacks)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    let token = localStorage.getItem("drishti_token")
    if (!token) {
      try {
        const storedAuth = localStorage.getItem("drishti-auth")
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth)
          token = parsed?.state?.token
        }
      } catch (e) {
        // Safe silent fallback
      }
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle 401 globally (except on auth endpoints and screening workflow to avoid abruptly discarding clinical form drafts)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ""
    const isAuthRoute =
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/google") ||
      url.includes("/api/auth/register")
    const isWorkflowRoute = url.includes("/api/screenings") || url.includes("/api/patients")

    if (!isAuthRoute && !isWorkflowRoute && err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("drishti_token")
      window.location.href = "/login"
    }
    return Promise.reject(err)
  }
)

// ─── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),
  register: (data: object) => api.post("/api/auth/register", data),
  googleLogin: (credential: string) =>
    api.post("/api/auth/google", { credential }),
  googleLink: (credential: string, password: string) =>
    api.post("/api/auth/google/link", { credential, password }),
  me: () => api.get("/api/auth/me"),
  permissionMatrix: () => api.get("/api/auth/permission-matrix"),
}

// ─── Patients ─────────────────────────────────────────────────
export const patientsApi = {
  create: (data: object, params?: object) => api.post("/api/patients", data, { params }),
  update: (id: string, data: object) => api.put(`/api/patients/${id}`, data),
  list: (params?: object) => api.get("/api/patients", { params }),
  get: (id: string) => api.get(`/api/patients/${id}`),
  checkDuplicate: (data: object) => api.post("/api/patients/check-duplicate", data),
  screenings: (id: string) => api.get(`/api/patients/${id}/screenings`),
  compare: (id: string, screening1Id: string, screening2Id: string) =>
    api.get(`/api/patients/${id}/compare`, {
      params: { screening1_id: screening1Id, screening2_id: screening2Id },
    }),
}

// ─── Screenings ───────────────────────────────────────────────
export const screeningsApi = {
  intake: (data: object) => api.post("/api/screenings/intake", data),
  create: (data: object) => api.post("/api/screenings", data),
  update: (id: string, data: object) => api.patch(`/api/screenings/${id}`, data),
  list: (params?: object) => api.get("/api/screenings", { params }),
  get: (id: string) => api.get(`/api/screenings/${id}`),
  uploadImage: (id: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.post(`/api/screenings/${id}/image`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  qualityCheck: (id: string) => api.post(`/api/screenings/${id}/quality-check`),
  analyze: (id: string) => api.post(`/api/screenings/${id}/analyze`),
  doctorReview: (id: string, data: object) =>
    api.post(`/api/screenings/${id}/doctor-review`, data),
  recapture: (id: string, reason: string) =>
    api.post(`/api/screenings/${id}/recapture`, null, { params: { reason } }),
  getReferral: (id: string) => api.get(`/api/screenings/${id}/referral`),
  saveReferral: (id: string, data: object) =>
    api.post(`/api/screenings/${id}/referral`, data),
  syncBatch: (cases: any[]) => api.post("/api/screenings/sync", { cases }),
  feedbackAnalytics: () => api.get("/api/screenings/feedback/analytics"),
  feedbackExport: (format: string = "json") =>
    api.get("/api/screenings/feedback/export", { params: { format } }),
  getReport: (id: string) => api.get(`/api/screenings/${id}/report`),
  generateReport: (id: string) => api.post(`/api/screenings/${id}/report`),
  getDemoSamples: () => api.get("/api/screenings/demo/sample-images"),
  getDemoSampleBlob: (sampleKey: string) =>
    api.get(`/api/screenings/demo/sample-image-file/${sampleKey}`, {
      responseType: "blob",
    }),
  // Advanced Features 11-19
  segment: (id: string) => api.post(`/api/screenings/${id}/segment`),
  getLesionEvidence: (id: string) => api.get(`/api/screenings/${id}/lesion-evidence`),
  gradcam: (id: string, params?: object) =>
    api.post(`/api/screenings/${id}/gradcam`, null, { params }),
  getExplainability: (id: string) => api.get(`/api/screenings/${id}/explainability`),
  getConcordance: (id: string) => api.get(`/api/screenings/${id}/concordance`),
  getMismatches: (id: string) => api.get(`/api/screenings/${id}/mismatches`),
  getAssurance: (id: string) => api.get(`/api/screenings/${id}/assurance`),
  // Features 21-30
  jobStatus: (id: string) => api.get(`/api/screenings/${id}/job-status`),
  reviewAction: (id: string, data: object) =>
    api.post(`/api/screenings/${id}/review-action`, data),
  getReviewActions: (id: string) =>
    api.get(`/api/screenings/${id}/review-actions`),
  // Features 31-34: Rural Low-Bandwidth, Capsule & Priority Sync
  syncCapsule: (capsule: object) => api.post("/api/screenings/capsule", capsule),
  uploadFullImage: (id: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.post(`/api/screenings/${id}/full-image`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  uploadChunk: (id: string, formData: FormData, params: object) =>
    api.post(`/api/screenings/${id}/upload-chunk`, formData, {
      params,
      headers: { "Content-Type": "multipart/form-data" },
    }),
  syncPriorityBatch: (batch: object) =>
    api.post("/api/screenings/sync/priority-batch", batch),
  getCapsule: (id: string) => api.get(`/api/screenings/${id}/capsule`),
  getSyncQueue: (params?: object) =>
    api.get("/api/screenings/sync/queue", { params }),
  getSyncHistory: (params?: object) =>
    api.get("/api/screenings/sync/history", { params }),
  // Features 35: Telemedicine Specialist Portal
  telemedicineQueue: (params?: object) =>
    api.get("/api/screenings/telemedicine/queue", { params }),
  requestFullImage: (id: string) =>
    api.post(`/api/screenings/${id}/request-full-image`),
  recordAction: (id: string, data: object) =>
    api.post(`/api/screenings/${id}/actions`, data),
  // Feature 50: Judge-Ready Curated Demo Scenarios
  getDemoScenarios: () => api.get("/api/screenings/demo/scenarios"),
  resetDemo: () => api.post("/api/screenings/demo/reset"),
}

// ─── Referrals ────────────────────────────────────────────────
export const referralsApi = {
  list: (params?: object) => api.get("/api/referrals", { params }),
  get: (id: string) => api.get(`/api/referrals/${id}`),
  update: (id: string, data: object) => api.patch(`/api/referrals/${id}`, data),
}

// ─── Evaluation / Benchmarks ──────────────────────────────────
export const evaluationApi = {
  generalization: () => api.get("/api/evaluation/generalization"),
  metrics: () => api.get("/api/evaluation/metrics"),
  export: () => api.get("/api/evaluation/export", { responseType: "blob" }),
  // Features 41, 42, 43
  inventory: () => api.get("/api/evaluation/datasets/inventory"),
  modelsInfo: () => api.get("/api/evaluation/models/info"),
  adapters: () => api.get("/api/evaluation/cross-dataset/adapters"),
  validateAdapter: (payload: object) =>
    api.post("/api/evaluation/cross-dataset/validate", payload),
}

// ─── Simulation & Discrete-Event Models ───────────────────────
export const simulationApi = {
  networkMesh: (params?: object) => api.get("/api/simulation/network-mesh", { params }),
  bandwidthComparison: (params?: object) => api.get("/api/simulation/bandwidth-comparison", { params }),
  specialistWorkload: (params?: object) => api.get("/api/simulation/specialist-workload", { params }),
  run: (params?: object) => api.get("/api/simulation/run", { params }),
  scenarios: () => api.get("/api/simulation/scenarios"),
}

// ─── Dashboard ────────────────────────────────────────────────
export const dashboardApi = {
  statistics: () => api.get("/api/dashboard/statistics"),
  ophthalmologistDashboard: (params?: object) =>
    api.get("/api/ophthalmologist/dashboard", { params }),
  referralQueue: (params?: object) =>
    api.get("/api/dashboard/referral-queue", { params }),
  models: () => api.get("/api/models"),
  audit: (params?: object) => api.get("/api/audit", { params }),
  verifyAuditChain: () => api.get("/api/audit/verify-chain"),
  datasets: () => api.get("/api/datasets"),
}

// ─── MATLAB Engine ────────────────────────────────────────────
export const matlabApi = {
  status: () => api.get("/api/engine/matlab/status"),
  testConnection: () => api.post("/api/engine/matlab/test-connection"),
}

// ─── Admin Management ─────────────────────────────────────────
export const adminApi = {
  users: (params?: object) => api.get("/api/admin/users", { params }),
  createUser: (data: object) => api.post("/api/admin/users", data),
  updateUser: (id: string, data: object) => api.patch(`/api/admin/users/${id}`, data),
  auditLogs: (params?: object) => api.get("/api/admin/audit-logs", { params }),
  stats: () => api.get("/api/admin/stats"),
}

// ─── Health & Readiness ───────────────────────────────────────
export const healthApi = {
  check: () => api.get("/api/health"),
  ready: () => api.get("/ready"),
  rootHealth: () => api.get("/health"),
  root: () => api.get("/"),
}
