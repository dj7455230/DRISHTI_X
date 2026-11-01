import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getApiBaseUrl } from "./config"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DR_GRADE_LABELS: Record<number, string> = {
  0: "No DR",
  1: "Mild NPDR",
  2: "Moderate NPDR",
  3: "Severe NPDR",
  4: "Proliferative DR",
}

export const DR_GRADE_COLORS: Record<number, string> = {
  0: "text-emerald-400",
  1: "text-yellow-400",
  2: "text-orange-400",
  3: "text-red-400",
  4: "text-red-600",
}

export const DR_GRADE_BG: Record<number, string> = {
  0: "bg-emerald-500/20 border-emerald-500/40",
  1: "bg-yellow-500/20 border-yellow-500/40",
  2: "bg-orange-500/20 border-orange-500/40",
  3: "bg-red-500/20 border-red-500/40",
  4: "bg-red-700/20 border-red-700/40",
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
}

export const ASSURANCE_COLORS: Record<string, string> = {
  VALIDATED: "text-emerald-400",
  HUMAN_REVIEW_REQUIRED: "text-yellow-400",
  RECAPTURE_REQUIRED: "text-red-400",
}

export function formatConfidence(conf: number | null | undefined): string {
  if (conf === null || conf === undefined) return "N/A"
  return `${(conf * 100).toFixed(1)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

/**
 * Standardized API Error Formatter for DRISHTI-X.
 * Accurately categorizes errors instead of showing ambiguous backend unavailable messages.
 */
export function formatApiErrorMessage(error: any, fallback: string = "Operation failed"): string {
  // 1. Client-side JavaScript Runtime Error
  if (error instanceof TypeError || (error instanceof Error && !("response" in error) && (error as any).name !== "AxiosError")) {
    return `Client processing error: ${error.message}. Please verify input and retry.`
  }

  // 2. Network Timeout
  if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
    return "Server connection timed out (30s). Please check network latency and retry."
  }

  // 3. Backend Offline / Network Error
  if (error?.code === "ERR_NETWORK" || error?.message === "Network Error" || (!error?.response && error?.request)) {
    const configuredUrl = getApiBaseUrl() || "http://localhost:8000"
    return `Backend connection unavailable: unable to reach DRISHTI-X API server. Please ensure the backend is running via ./run.sh or on port 8000.`
  }

  // 4. HTTP Status Code Categorization
  const status = error?.response?.status
  const data = error?.response?.data

  // 401 Unauthorized
  if (status === 401) {
    return "Authentication required or session expired. Please log in again to continue."
  }

  // 403 Forbidden
  if (status === 403) {
    return "Access denied: your account role does not have permission for this clinical action."
  }

  // 404 Not Found
  if (status === 404) {
    if (typeof data?.detail === "string") return data.detail
    return "The requested patient or clinical resource was not found."
  }

  // 422 Validation Error
  if (status === 422) {
    const detail = data?.detail
    if (Array.isArray(detail) && detail.length > 0) {
      const fieldErrors = detail.map((err: any) => {
        const fieldName = Array.isArray(err?.loc) ? err.loc.filter((l: any) => l !== "body").join(".") : "field"
        const msg = err?.msg || "invalid format"
        return `${fieldName}: ${msg}`
      })
      return `Validation failed — ${fieldErrors.join("; ")}`
    }
    if (typeof detail === "string") return `Validation error: ${detail}`
    return "Invalid or incomplete request format. Please verify required fields."
  }

  // AI Model Unavailable
  if (data?.error_code === "ERR_MODEL_UNAVAILABLE" || (typeof data?.detail === "string" && (data.detail.includes("checkpoint") || data.detail.includes("weights")))) {
    return `AI Model Unavailable: ${data.detail || "Model checkpoint is not loaded."}`
  }

  // 500 / 503 Database or Downstream Service Error
  if (status === 500 || status === 503) {
    const detailStr = typeof data?.detail === "string" ? data.detail : ""
    if (detailStr.toLowerCase().includes("database") || detailStr.toLowerCase().includes("postgres") || detailStr.toLowerCase().includes("sqlite")) {
      return `Database unavailable: ${detailStr}`
    }
    if (status === 503) {
      return `Service temporarily unavailable: ${detailStr || "Downstream service not ready."}`
    }
    return detailStr ? `Server error: ${detailStr}` : "Internal database or server error occurred. Please retry safely."
  }

  // Custom Detail Messages
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail
  if (typeof data?.message === "string" && data.message.trim()) return data.message
  if (typeof data === "string" && data.trim()) return data

  return fallback
}

/**
 * Standardize and resolve image URLs coming from the backend or local static assets.
 * Handles:
 * - base64 Data URLs (data:image/...)
 * - Relative upload paths (/uploads/...) -> prepends API_BASE if not on same origin or rewrites
 * - Relative API demo paths (/api/...) -> ensures proper absolute or relative path
 * - Full http(s) URLs -> preserved
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url || !url.trim()) return ""
  if (url.startsWith("data:") || url.startsWith("blob:")) return url
  if (url.startsWith("http://") || url.startsWith("https://")) return url

  const apiBase = getApiBaseUrl().replace(/\/$/, "")

  // If path starts with /uploads or /api, ensure it resolves to backend API host when accessed directly
  if (url.startsWith("/uploads/") || url.startsWith("uploads/")) {
    const cleanPath = url.startsWith("/") ? url : `/${url}`
    return apiBase ? `${apiBase}${cleanPath}` : cleanPath
  }

  if (url.startsWith("/api/screenings/demo/sample-image-file/")) {
    return apiBase ? `${apiBase}${url}` : url
  }

  return url
}
