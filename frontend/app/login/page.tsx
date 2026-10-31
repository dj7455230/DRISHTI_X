"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { authApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"
import { GoogleSignInButton } from "@/components/GoogleSignInButton"

import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ScanLine,
  Stethoscope,
  Sparkles,
} from "lucide-react"

import { motion } from "framer-motion"

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState("testdoc@example.com")
  const [password, setPassword] = useState("doctor123")
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState("")

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email, password),

    onSuccess: (res) => {
      const { access_token, user } = res.data

      localStorage.setItem("drishti_token", access_token)
      setAuth(access_token, user)

      router.push("/dashboard")
    },

    onError: (e: any) => {
      const detail = e.response?.data?.detail

      if (Array.isArray(detail)) {
        setError(
          detail
            .map((item: any) => item?.msg || "Validation error")
            .join(", ")
        )
      } else if (typeof detail === "string") {
        setError(detail)
      } else {
        setError(
          "Unable to sign in. Please verify clinical email and password."
        )
      }
    },
  })

  return (
    <main className="min-h-screen bg-[#07111F] text-[#F4F8FC] lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      {/* LEFT — EYE / RETINA IDENTITY */}
      <section
        className="relative hidden min-h-screen overflow-hidden lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(7,17,31,0.95) 0%, rgba(11,23,38,0.85) 40%, rgba(16,31,48,0.5) 75%, rgba(7,17,31,0.2) 100%), url('/retina-login.png')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,transparent_0%,rgba(7,17,31,0.4)_60%,rgba(7,17,31,0.9)_100%)]" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          {/* Brand */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#39D9D0]/30 bg-[#102436] shadow-[0_0_20px_rgba(57,217,208,0.2)]">
                <Eye className="h-5 w-5 text-[#39D9D0]" />
              </div>

              <div>
                <p className="text-[15px] font-bold tracking-[0.2em] text-white">
                  DRISHTI-X
                </p>
                <p className="mt-0.5 text-[9px] font-mono tracking-[0.15em] text-[#39D9D0]">
                  AI-ASSISTED RETINAL MICROVASCULATURE DIAGNOSTICS
                </p>
              </div>
            </div>

            <div className="rounded-full border border-white/10 bg-[#101F30]/80 px-3.5 py-1.5 text-[10px] font-mono text-[#39D9D0] backdrop-blur-sm">
              SIH 2026 EDITION
            </div>
          </div>

          {/* Hero */}
          <div className="max-w-[590px] pb-8 space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#39D9D0]">
              <ScanLine className="h-4 w-4" />
              See Beyond the Retina. Understand Every Signal.
            </div>

            <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.1]">
              Microvasculature Precision.{" "}
              <span className="gradient-text-cyan block mt-1">
                Clinical Trust at Scale.
              </span>
            </h1>

            <p className="text-xs sm:text-sm leading-relaxed text-[#9AAFC1]">
              A multi-modal AI platform combining temperature-calibrated 5-grade diabetic retinopathy classification, U-Net microvascular lesion segmentation, and interactive 3D anatomical exploration.
            </p>

            <div className="pt-4 flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-xs text-[#9AAFC1]">
                <ShieldCheck className="h-4 w-4 text-[#39D9D0]" />
                Quality Gate Blur & FOV Check
              </div>

              <div className="flex items-center gap-2 text-xs text-[#9AAFC1]">
                <Sparkles className="h-4 w-4 text-[#7C8CFF]" />
                Backprop Grad-CAM Feature Heatmaps
              </div>

              <div className="flex items-center gap-2 text-xs text-[#9AAFC1]">
                <Stethoscope className="h-4 w-4 text-emerald-400" />
                Ophthalmologist Decision Support
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-[10px] font-mono tracking-[0.1em] text-[#5A7184]">
            <span>AI-ASSISTED SCREENING PROTOTYPE</span>
            <span>NOT A STANDALONE MEDICAL DIAGNOSIS</span>
          </div>
        </div>
      </section>

      {/* RIGHT — LOGIN FORM */}
      <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-14 bg-[#07111F]">
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-[420px] space-y-6"
        >
          {/* Mobile brand header */}
          <div className="flex items-center gap-3 lg:hidden mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102436] border border-[#39D9D0]/30 text-[#39D9D0]">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold tracking-[0.18em] text-white">DRISHTI-X</p>
              <p className="text-[10px] text-[#39D9D0] font-mono">Retinal Diagnostics</p>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#39D9D0] block mb-1">
              Secure Clinical Gateway
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Practitioner Sign In
            </h2>
            <p className="mt-1 text-xs text-[#9AAFC1]">
              Authenticate to access patient registries, AI inference, and 3D eye exploration.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9AAFC1] mb-1.5">
                Clinical Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError("")
                }}
                placeholder="doctor@hospital.in"
                className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0] transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9AAFC1] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError("")
                  }}
                  className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0] transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-2.5 text-[#5A7184] hover:text-[#9AAFC1]"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loginMutation.mutate()}
              disabled={loginMutation.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] py-2.5 text-xs font-bold text-[#07111F] shadow-[0_0_20px_rgba(57,217,208,0.25)] hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  Access Platform
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono">
              <span className="bg-[#07111F] px-2 text-[#5A7184]">Or continue with</span>
            </div>
          </div>

          <GoogleSignInButton />

          <p className="text-center text-xs text-[#5A7184]">
            Don't have clinical credentials?{" "}
            <a href="/register" className="text-[#39D9D0] hover:underline font-medium">
              Register practitioner account
            </a>
          </p>
        </motion.div>
      </section>
    </main>
  )
}
