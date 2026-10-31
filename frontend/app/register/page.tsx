"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { authApi } from "@/lib/api"
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ScanLine,
  UserRound,
  Stethoscope,
  Building2,
} from "lucide-react"
import { motion } from "framer-motion"

const ROLES = [
  {
    value: "HEALTH_WORKER",
    label: "Health Worker / PHC Staff",
  },
  {
    value: "OPHTHALMOLOGIST",
    label: "Ophthalmologist / Doctor",
  },
  {
    value: "ADMIN",
    label: "Administrator",
  },
]

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "HEALTH_WORKER",
    facility_name: "",
    facility_location: "",
  })

  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState("")

  const registerMutation = useMutation({
    mutationFn: () => authApi.register(form),

    onSuccess: () => {
      router.push("/login?registered=1")
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
          "Unable to create your account. Please check the information and try again."
        )
      }
    },
  })

  const set =
    (key: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement
      >
    ) => {
      setForm((previous) => ({
        ...previous,
        [key]: e.target.value,
      }))

      if (error) setError("")
    }

  return (
    <main className="min-h-screen bg-[#07111F] lg:grid lg:grid-cols-[0.92fr_1.08fr]">

      {/* ─────────────────────────────
          LEFT — EYE CARE IDENTITY
      ───────────────────────────── */}
      <section
        className="relative hidden min-h-screen overflow-hidden lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(10,34,52,0.95) 0%, rgba(17,54,72,0.84) 48%, rgba(42,104,108,0.55) 100%), url('/retina-login.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* subtle clinical retinal rings */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-52 top-[22%] h-[560px] w-[560px] rounded-full border border-white/10" />
          <div className="absolute -left-36 top-[27%] h-[440px] w-[440px] rounded-full border border-white/10" />
          <div className="absolute -left-20 top-[32%] h-[320px] w-[320px] rounded-full border border-white/10" />
        </div>

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#101F30]/10 backdrop-blur-sm">
              <Eye className="h-5 w-5 text-white" />
            </div>

            <div>
              <p className="text-[15px] font-semibold tracking-[0.22em] text-white">
                DRISHTI-X
              </p>

              <p className="mt-0.5 text-[10px] tracking-[0.17em] text-white/55">
                RETINAL SCREENING PLATFORM
              </p>
            </div>
          </div>

          {/* Main Story */}
          <div className="max-w-[530px] pb-8">

            <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#9fd1d3]">
              Rural eye-care workflow
            </p>

            <h1 className="text-[48px] font-semibold leading-[1.07] tracking-[-0.045em] text-white xl:text-[57px]">
              A clearer path from
              <span className="block text-[#b9dfe3]">
                screening to review.
              </span>
            </h1>

            <p className="mt-6 max-w-[470px] text-[14px] leading-7 text-white/65">
              Bring retinal screening, evidence review and referral
              decisions into one clinical workflow designed for health
              workers and ophthalmologists.
            </p>

            {/* Clinical workflow */}
            <div className="mt-10 space-y-4">

              <div className="flex items-center gap-3 text-sm text-white/70">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#101F30]/5">
                  <ScanLine className="h-3.5 w-3.5 text-[#9fd1d3]" />
                </div>

                <span>
                  Capture and assess retinal images
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm text-white/70">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#101F30]/5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#9fd1d3]" />
                </div>

                <span>
                  Validate prediction with clinical evidence
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm text-white/70">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#101F30]/5">
                  <Stethoscope className="h-3.5 w-3.5 text-[#9fd1d3]" />
                </div>

                <span>
                  Route priority cases for specialist review
                </span>
              </div>

            </div>
          </div>

          {/* Bottom */}
          <div className="flex items-center justify-between border-t border-white/10 pt-5 text-[10px] tracking-[0.13em] text-white/35">
            <span>AI-ASSISTED CLINICAL SCREENING</span>
            <span>RURAL EYE CARE</span>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────
          RIGHT — ACCOUNT CREATION
      ───────────────────────────── */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 sm:px-10 lg:px-14 xl:px-20">

        {/* subtle optic-disc-inspired background */}
        <div className="pointer-events-none absolute -right-32 -top-36 h-[420px] w-[420px] rounded-full bg-[#39D9D0]/5" />
        <div className="pointer-events-none absolute -right-12 -top-16 h-[245px] w-[245px] rounded-full border border-white/5" />

        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
          className="relative z-10 w-full max-w-[600px]"
        >

          {/* Mobile Brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#39D9D0]">
              <Eye className="h-5 w-5 text-white" />
            </div>

            <div>
              <p className="font-semibold tracking-[0.16em] text-white">
                DRISHTI-X
              </p>

              <p className="text-[10px] tracking-[0.12em] text-slate-400">
                RETINAL SCREENING PLATFORM
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-7">

            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.21em] text-[#39D9D0]">
              Clinical workspace access
            </p>

            <h2 className="text-[32px] font-semibold tracking-[-0.035em] text-white">
              Create your account
            </h2>

            <p className="mt-2 max-w-[500px] text-sm leading-6 text-[#9AAFC1]">
              Set up your profile according to your role in the
              retinal screening workflow.
            </p>

          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Main Form */}
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">

            {/* Full Name */}
            <div className="sm:col-span-1">
              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                Full name
              </label>

              <div className="relative">
                <UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A7184]" />

                <input
                  type="text"
                  value={form.full_name}
                  onChange={set("full_name")}
                  placeholder="Dr. Ananya Singh"
                  className="h-[50px] w-full rounded-xl border border-white/10 bg-[#101F30] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#5A7184] focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
                />
              </div>
            </div>

            {/* Email */}
            <div className="sm:col-span-1">
              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                Email address
              </label>

              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="doctor@clinic.in"
                className="h-[50px] w-full rounded-xl border border-white/10 bg-[#101F30] px-4 text-sm text-white outline-none transition placeholder:text-[#5A7184] focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
              />
            </div>

            {/* Password */}
            <div className="sm:col-span-1">
              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                Password
              </label>

              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Minimum 8 characters"
                  className="h-[50px] w-full rounded-xl border border-white/10 bg-[#101F30] px-4 pr-12 text-sm text-white outline-none transition placeholder:text-[#5A7184] focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
                />

                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#879198] transition hover:text-[#3b7f83]"
                  aria-label={
                    showPwd
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="sm:col-span-1">

              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                Clinical role
              </label>

              <select
                value={form.role}
                onChange={set("role")}
                className="h-[50px] w-full appearance-none rounded-xl border border-white/10 bg-[#101F30] px-4 text-sm text-white outline-none transition focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
              >
                {ROLES.map((role) => (
                  <option
                    key={role.value}
                    value={role.value}
                  >
                    {role.label}
                  </option>
                ))}
              </select>

            </div>

            {/* Facility */}
            <div className="sm:col-span-1">

              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                Facility
                <span className="ml-1 font-normal text-[#9ba3a8]">
                  optional
                </span>
              </label>

              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5A7184]" />

                <input
                  type="text"
                  value={form.facility_name}
                  onChange={set("facility_name")}
                  placeholder="Primary Health Centre"
                  className="h-[50px] w-full rounded-xl border border-white/10 bg-[#101F30] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#5A7184] focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
                />
              </div>

            </div>

            {/* Location */}
            <div className="sm:col-span-1">

              <label className="mb-2 block text-[12px] font-semibold tracking-wide text-[#9AAFC1]">
                District / location
                <span className="ml-1 font-normal text-[#9ba3a8]">
                  optional
                </span>
              </label>

              <input
                type="text"
                value={form.facility_location}
                onChange={set("facility_location")}
                placeholder="Bhopal, Madhya Pradesh"
                className="h-[50px] w-full rounded-xl border border-white/10 bg-[#101F30] px-4 text-sm text-white outline-none transition placeholder:text-[#5A7184] focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/8"
              />

            </div>

          </div>

          {/* Role context */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#dbe8e7] bg-[#edf6f5] px-4 py-3">

            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-[#3b7f83]" />

            <p className="text-[11px] leading-5 text-[#627378]">
              Access and workflow options are adapted to your
              selected clinical role. Specialist review features
              require an ophthalmologist account.
            </p>

          </div>

          {/* CTA */}
          <button
            onClick={() => registerMutation.mutate()}
            disabled={
              !form.email ||
              !form.password ||
              !form.full_name ||
              registerMutation.isPending
            }
            className="group mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#39D9D0] px-5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(23,63,86,0.16)] transition hover:bg-[#102f42] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create clinical workspace
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>

          {/* Login */}
          <div className="mt-6 flex items-center justify-center gap-1 text-sm text-[#77828a]">

            <span>
              Already registered?
            </span>

            <a
              href="/login"
              className="font-semibold text-[#3b7277] transition hover:text-[#28575b]"
            >
              Sign in
            </a>

          </div>

          {/* Disclaimer */}
          <div className="mt-7 border-t border-[#dfe3e3] pt-5">

            <div className="flex items-start gap-3">

              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#66837d]" />

              <p className="text-[11px] leading-5 text-[#899298]">
                DRISHTI-X supports retinal screening and clinical
                decision-making. It does not replace diagnosis by a
                qualified ophthalmologist.
              </p>

            </div>

          </div>

        </motion.div>
      </section>

    </main>
  )
}