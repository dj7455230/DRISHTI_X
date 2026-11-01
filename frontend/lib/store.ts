/**
 * DRISHTI-X — Zustand Global State Store
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface User {
  id: string
  email: string
  full_name: string
  role: "HEALTH_WORKER" | "OPHTHALMOLOGIST" | "ADMIN"
  facility_name?: string
  facility_location?: string
  auth_provider?: string
  avatar_url?: string
}

interface AuthStore {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  setAuth: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) =>
        set({ token, user, isAuthenticated: true }),
      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("drishti_token")
        }
        set({ token: null, user: null, isAuthenticated: false })
      },
    }),
    {
      name: "drishti-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true
          if (typeof window !== "undefined") {
            localStorage.setItem("drishti_token", state.token)
          }
        }
      },
    }
  )
)

export type BackendConnectionStatus = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "RECOVERING"

interface NetworkStore {
  isOnline: boolean
  backendStatus: BackendConnectionStatus
  lastCheckedAt: string | null
  backendErrorDetail: string | null
  pendingSyncCount: number
  setOnline: (online: boolean) => void
  setBackendStatus: (status: BackendConnectionStatus, detail?: string | null) => void
  setPendingSync: (count: number) => void
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  isOnline: true,
  backendStatus: "CONNECTING",
  lastCheckedAt: null,
  backendErrorDetail: null,
  pendingSyncCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setBackendStatus: (backendStatus, detail = null) =>
    set({
      backendStatus,
      backendErrorDetail: detail,
      lastCheckedAt: new Date().toISOString(),
    }),
  setPendingSync: (pendingSyncCount) => set({ pendingSyncCount }),
}))
