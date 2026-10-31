/**
 * DRISHTI-X — API Client
 * Typed Axios client for all backend endpoints.
 */
import axios from "axios"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
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
      window.location.href = "/sign-in"
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
}

// ─── Patients ─────────────────────────────────────────────────
export const patientsApi = {
  create: (data: object) => api.post("/api/patients", data),
  update: (id: string, data: object) => api.put(`/api/patients/${id}`, data),
  list: (params?: object) => api.get("/api/patients", { params }),
  get: (id: string) => api.get(`/api/patients/${id}`),
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
}

// ─── Dashboard ────────────────────────────────────────────────
export const dashboardApi = {
  statistics: () => api.get("/api/dashboard/statistics"),
  referralQueue: (params?: object) =>
    api.get("/api/dashboard/referral-queue", { params }),
  models: () => api.get("/api/models"),
  audit: (params?: object) => api.get("/api/audit", { params }),
  datasets: () => api.get("/api/datasets"),
}

// ─── Health ────────────────────────────────────────────────────
export const healthApi = {
  check: () => api.get("/api/health"),
}
