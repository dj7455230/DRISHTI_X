/**
 * DRISHTI-X — Centralized Environment & API Configuration
 *
 * Single source of truth for all API base URLs, paths, timeouts, and headers.
 * Resolves browser vs server rendering contexts and avoids hardcoded strings across components.
 */

// Centralized API Base URL resolution
export function getApiBaseUrl(): string {
  // If running in browser:
  if (typeof window !== "undefined") {
    // 1. If explicitly configured with an external HTTPS domain (e.g. deployed backend), use it
    if (
      process.env.NEXT_PUBLIC_API_URL &&
      process.env.NEXT_PUBLIC_API_URL.trim() &&
      !process.env.NEXT_PUBLIC_API_URL.includes("localhost") &&
      !process.env.NEXT_PUBLIC_API_URL.includes("127.0.0.1")
    ) {
      return process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/$/, "")
    }

    // 2. Default for browser: use relative empty string ("")
    // Every /api/* and /uploads/* request routes through the Next.js same-origin reverse proxy.
    // This completely prevents:
    // - macOS IPv6 [::1] vs IPv4 127.0.0.1 socket lookup failures
    // - Browser CORS preflight blocks
    // - Mixed-content security blocks
    // - Disconnected port 8000 errors
    return ""
  }

  // Server-side (Node.js SSR runtime):
  if (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.trim()) {
    return process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/$/, "")
  }
  return "http://127.0.0.1:8000"
}

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  TIMEOUT_MS: 30000,
  HEALTH_CHECK_INTERVAL_MS: 30000,
  POLL_INTERVAL_FAST_MS: 10000,
  RETRY_COUNT: 2,
  BACKOFF_DELAY_MS: 1500,
} as const

