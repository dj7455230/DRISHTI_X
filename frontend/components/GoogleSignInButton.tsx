"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Link as LinkIcon,
  HelpCircle,
  X,
  KeyRound,
} from "lucide-react"

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void
          renderButton: (parent: HTMLElement, options: any) => void
          prompt?: (notification?: (notification: any) => void) => void
          cancel?: () => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  disabled?: boolean
  onSuccessRedirect?: string
}

export function GoogleSignInButton({
  disabled = false,
  onSuccessRedirect = "/dashboard",
}: GoogleSignInButtonProps) {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const googleContainerRef = useRef<HTMLDivElement>(null)

  // Status states
  const [statusState, setStatusState] = useState<"idle" | "loading" | "success" | "error" | "conflict">("idle")
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [pendingCredential, setPendingCredential] = useState<string>("")
  const [linkPassword, setLinkPassword] = useState<string>("")
  const [isLinking, setIsLinking] = useState<boolean>(false)
  const [linkError, setLinkError] = useState<string>("")
  const [showConfigHelp, setShowConfigHelp] = useState<boolean>(false)

  // Google Script & Client ID status
  const [isScriptLoaded, setIsScriptLoaded] = useState<boolean>(false)
  const [scriptLoadError, setScriptLoadError] = useState<boolean>(false)

  const rawClientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "")
    .trim()
    .replace(/^["']|["']$/g, "")
  const isClientIdConfigured =
    Boolean(rawClientId) &&
    !rawClientId.includes("your-google") &&
    !rawClientId.includes("CHANGE_ME") &&
    rawClientId.endsWith(".apps.googleusercontent.com")

  // 1. Dynamically load Google Identity Services SDK
  useEffect(() => {
    if (typeof window === "undefined") return

    // If script is already in document
    const existingScript = document.getElementById("google-gsi-client")
    if (existingScript) {
      if (window.google?.accounts?.id) {
        setIsScriptLoaded(true)
      } else {
        existingScript.addEventListener("load", () => setIsScriptLoaded(true))
      }
      return
    }

    const script = document.createElement("script")
    script.id = "google-gsi-client"
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => {
      setIsScriptLoaded(true)
    }
    script.onerror = () => {
      setScriptLoadError(true)
    }

    document.head.appendChild(script)
  }, [])

  // 2. Handle Google Credential Response from GIS
  const handleCredentialResponse = async (response: { credential: string }) => {
    if (!response?.credential) {
      setStatusState("error")
      setStatusMessage("Google did not return an authentication token. Please try again.")
      return
    }

    setStatusState("loading")
    setStatusMessage("Verifying with DRISHTI-X...")

    try {
      const res = await authApi.googleLogin(response.credential)
      const { access_token, user } = res.data

      localStorage.setItem("drishti_token", access_token)
      setAuth(access_token, user)

      setStatusState("success")
      setStatusMessage("Welcome back! Redirecting to clinical workspace...")

      setTimeout(() => {
        window.location.href = onSuccessRedirect
      }, 400)
    } catch (err: any) {
      const httpStatus = err.response?.status
      const detail = err.response?.data?.detail

      if (httpStatus === 409) {
        // Account Conflict: existing email/password account
        setPendingCredential(response.credential)
        setStatusState("conflict")
        setStatusMessage(
          typeof detail === "string"
            ? detail
            : "An account with this email already exists with password sign-in."
        )
      } else if (httpStatus === 401) {
        setStatusState("error")
        if (typeof detail === "string" && detail.toLowerCase().includes("audience mismatch")) {
          setStatusMessage("Google Client ID configuration mismatch. Please check your environment configuration.")
          setShowConfigHelp(true)
        } else {
          setStatusMessage(
            typeof detail === "string"
              ? detail
              : "Google authentication expired or invalid. Please sign in again."
          )
        }
      } else if (httpStatus === 403) {
        setStatusState("error")
        setStatusMessage("Your account has been deactivated. Please contact an administrator.")
      } else if (httpStatus === 503) {
        setStatusState("error")
        setStatusMessage("Google verification service is currently unavailable. Please try again later.")
      } else if (!err.response) {
        setStatusState("error")
        setStatusMessage("Network error: Unable to connect to DRISHTI-X server.")
      } else {
        setStatusState("error")
        setStatusMessage(
          typeof detail === "string" ? detail : "Unable to complete Google sign-in. Please try again."
        )
      }
    }
  }

  // 3. Render Google's official Sign In button when script is ready
  useEffect(() => {
    if (!isScriptLoaded || !isClientIdConfigured || !window.google?.accounts?.id) {
      return
    }

    if (!googleContainerRef.current) return

    try {
      window.google.accounts.id.initialize({
        client_id: rawClientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      // Calculate width to match container (capped between 280px and 400px per Google GSI guidelines)
      const containerWidth = googleContainerRef.current.clientWidth || 380
      const buttonWidth = Math.min(Math.max(containerWidth, 240), 400)

      googleContainerRef.current.innerHTML = ""
      window.google.accounts.id.renderButton(googleContainerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: buttonWidth,
      })
    } catch (e) {
      console.warn("[Google Sign-In] Initialization note:", e)
    }
  }, [isScriptLoaded, isClientIdConfigured, rawClientId])

  // 4. Handle Account Linking Confirmation
  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkPassword || !pendingCredential) return

    setIsLinking(true)
    setLinkError("")

    try {
      const res = await authApi.googleLink(pendingCredential, linkPassword)
      const { access_token, user } = res.data

      localStorage.setItem("drishti_token", access_token)
      setAuth(access_token, user)

      setStatusState("success")
      setStatusMessage("Account successfully linked! Entering workspace...")

      setTimeout(() => {
        window.location.href = onSuccessRedirect
      }, 400)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setLinkError(
        typeof detail === "string"
          ? detail
          : "Incorrect password. Unable to link Google account."
      )
    } finally {
      setIsLinking(false)
    }
  }

  const cancelConflict = () => {
    setStatusState("idle")
    setStatusMessage("")
    setPendingCredential("")
    setLinkPassword("")
    setLinkError("")
  }

  return (
    <div className="w-full">
      {/* Active Status Banners */}
      {statusState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-[#3b7f83]/20 bg-[#3b7f83]/5 px-4 py-3 text-sm font-medium text-[#173f56]"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#3b7f83]" />
          <span>{statusMessage || "Authenticating with Google..."}</span>
        </div>
      )}

      {statusState === "success" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {statusState === "error" && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-start gap-3 rounded-xl border border-[#ebc6c6] bg-[#fff5f5] px-4 py-3 text-sm text-[#a14545]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{statusMessage}</p>
            <button
              type="button"
              onClick={() => {
                setStatusState("idle")
                setStatusMessage("")
              }}
              className="mt-1 text-xs font-semibold underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Account Conflict & Linking Form */}
      {statusState === "conflict" && (
        <div
          role="region"
          aria-label="Account Linking"
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <LinkIcon className="h-4 w-4 text-amber-700" />
              Link Existing DRISHTI-X Account
            </div>
            <button
              type="button"
              onClick={cancelConflict}
              className="text-amber-700 hover:text-amber-900"
              aria-label="Close account linking"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            An account with this email already exists using password authentication. To securely link your Google Identity, please verify your current password:
          </p>

          {linkError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-100/90 px-3 py-2 text-xs text-red-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{linkError}</span>
            </div>
          )}

          <form onSubmit={handleLinkAccount} className="mt-4 space-y-3">
            <div className="relative">
              <input
                type="password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                placeholder="Enter your DRISHTI-X password"
                required
                className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 pr-10 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#3b7f83] focus:outline-none focus:ring-2 focus:ring-[#3b7f83]/20"
              />
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!linkPassword || isLinking}
                className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-[#173f56] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#102f42] disabled:opacity-50"
              >
                {isLinking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Linking...
                  </>
                ) : (
                  <>Verify & Link Account</>
                )}
              </button>

              <button
                type="button"
                onClick={cancelConflict}
                className="h-10 rounded-xl border border-amber-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-amber-100/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Google Sign-In Button Area */}
      {statusState !== "loading" && statusState !== "conflict" && (
        <div className="w-full">
          {isClientIdConfigured ? (
            /* Official Google GIS Button Container */
            <div className="w-full flex flex-col items-center">
              <div
                ref={googleContainerRef}
                className="w-full flex justify-center min-h-[50px]"
                aria-label="Continue with Google"
              />

              {scriptLoadError && (
                <p className="mt-2 text-xs text-center text-[#a14545]">
                  Google identity services could not be reached. Check network or ad blocker.
                </p>
              )}
            </div>
          ) : (
            /* Styled DRISHTI-X Standalone Button when OAuth Client ID is Pending Setup */
            <div className="w-full">
              <button
                type="button"
                onClick={() => setShowConfigHelp((prev) => !prev)}
                disabled={disabled}
                aria-label="Continue with Google (Pending OAuth Client ID configuration)"
                className="group relative flex h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-[#d7dfe0] bg-white px-4 text-sm font-semibold text-[#152938] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition hover:border-[#3b7f83]/50 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#3b7f83]/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* Official Google G SVG */}
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>

                <span className="tracking-[-0.01em]">Continue with Google</span>

                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  <Lock className="h-3 w-3" />
                  Setup required
                </span>
              </button>

              {/* Informative Configuration Panel */}
              {showConfigHelp && (
                <div
                  role="region"
                  aria-label="Google OAuth Configuration Guide"
                  className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm text-slate-600"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 text-[#3b7f83]" />
                      Google Cloud OAuth Setup
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowConfigHelp(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 text-slate-600 leading-relaxed">
                    Google Identity Services requires an official Google OAuth Web Client ID:
                  </p>
                  <ol className="mt-2 list-decimal list-inside space-y-1 font-mono text-[11px] text-slate-700">
                    <li>Create OAuth 2.0 Web Client ID in Google Cloud Console</li>
                    <li>Add <code>http://localhost:3000</code> to Authorized JavaScript Origins</li>
                    <li>Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code>frontend/.env.local</code></li>
                    <li>Set <code>GOOGLE_CLIENT_ID</code> in <code>backend/.env</code></li>
                  </ol>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Once set, Google&apos;s genuine sign-in button and identity popup activate automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

