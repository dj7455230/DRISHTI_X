"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { patientsApi, screeningsApi } from "@/lib/api"
import { useParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Users,
  Scan,
  Plus,
  ChevronRight,
  TrendingUp,
  Activity,
  FileText,
  Calendar,
  AlertCircle,
  Eye,
  ShieldCheck,
  Brain,
  Stethoscope,
} from "lucide-react"
import { cn, DR_GRADE_LABELS, DR_GRADE_COLORS, DR_GRADE_BG, formatDate } from "@/lib/utils"

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: patient, isLoading: isPatientLoading } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id).then((r) => r.data),
    enabled: !!id,
  })

  const { data: screenings, isLoading: isScreeningsLoading } = useQuery({
    queryKey: ["patient-screenings", id],
    queryFn: () =>
      screeningsApi.list({ limit: 50 }).then((r) =>
        r.data.filter((s: any) => s.patient_id === id)
      ),
    enabled: !!id,
  })

  if (isPatientLoading) {
    return (
      <div className="text-[#39D9D0] animate-pulse py-16 text-center text-xs flex items-center justify-center gap-2">
        <Activity className="w-5 h-5 animate-spin" />
        Loading clinical profile...
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="glass-card p-8 text-center rounded-2xl border border-rose-500/30">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-white">Patient Record Not Found</h3>
        <p className="text-xs text-[#9AAFC1] mt-1">The requested patient ID does not exist in the database.</p>
        <Link href="/patients" className="mt-4 inline-block text-xs text-[#39D9D0] hover:underline">
          ← Return to Patient Directory
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* HEADER PROFILE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 flex items-center justify-center text-[#39D9D0] font-bold text-lg font-mono">
            {patient.patient_code ? patient.patient_code.slice(-3) : "PT"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">
                {patient.name || patient.patient_code}
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/5 text-[#5A7184]">
                {patient.patient_code}
              </span>
            </div>
            <p className="text-xs text-[#9AAFC1] mt-0.5">
              {[
                patient.age && `Age ${patient.age}`,
                patient.gender !== "PREFER_NOT_TO_SAY" ? patient.gender : null,
                patient.district,
                patient.state,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <Link
          href={`/screenings/new?patient_id=${patient.id}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[#07111F] text-xs font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> New Screening for Patient
        </Link>
      </div>

      {/* CLINICAL DATA CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Diabetes History */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#39D9D0] flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Diabetes Profile
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Classification:</span>
              <span className="font-semibold text-white">{patient.diabetes_type || "Type 2"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Duration:</span>
              <span className="font-semibold text-white">
                {patient.diabetes_duration_years ? `${patient.diabetes_duration_years} years` : "Not recorded"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Therapy:</span>
              <span className="font-semibold text-white">{patient.diabetes_treatment || "Oral Hypoglycemic"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Latest HbA1c:</span>
              <span className="font-semibold text-[#39D9D0]">
                {patient.hba1c_value ? `${patient.hba1c_value}%` : "Pending measurement"}
              </span>
            </div>
          </div>
        </div>

        {/* Visual & Eye History */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#7C8CFF] flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Ocular Background
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Prior DR History:</span>
              <span className="font-semibold text-white">{patient.history_of_dr || "None Known"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Past Treatments:</span>
              <span className="font-semibold text-white">{patient.previous_eye_treatment || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Co-morbidities:</span>
              <span className="font-semibold text-white">{patient.relevant_eye_conditions || "None reported"}</span>
            </div>
          </div>
        </div>

        {/* Clinical Facility & Demographics */}
        <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Facility Context
          </span>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">Primary Facility:</span>
              <span className="font-semibold text-white">{patient.facility_code || "Primary Health Centre"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">District:</span>
              <span className="font-semibold text-white">{patient.district || "Varanasi"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9AAFC1]">State:</span>
              <span className="font-semibold text-white">{patient.state || "Uttar Pradesh"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SCREENING TIMELINE ARCHIVE */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#39D9D0]" />
            Longitudinal Screening History ({screenings?.length ?? 0})
          </h2>
        </div>

        {isScreeningsLoading ? (
          <div className="text-xs text-[#5A7184] py-6 text-center">Loading screenings...</div>
        ) : !screenings || screenings.length === 0 ? (
          <div className="glass-card p-8 text-center rounded-xl border border-white/10">
            <p className="text-xs text-[#9AAFC1]">No screenings have been performed for this patient yet.</p>
            <Link
              href={`/screenings/new?patient_id=${patient.id}`}
              className="mt-3 inline-block text-xs text-[#39D9D0] font-semibold hover:underline"
            >
              Initiate Baseline Screening →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {screenings.map((s: any) => (
              <div
                key={s.id}
                className="glass-card glass-card-hover p-4 rounded-xl border border-white/10 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#102436] border border-white/10 flex items-center justify-center font-mono text-xs text-[#39D9D0]">
                    {s.eye_side === "RIGHT" ? "OD" : "OS"}
                  </div>
                  <div>
                    <span className="font-mono text-xs text-white">SCR-{s.id.slice(0, 8)}</span>
                    <p className="text-[10px] text-[#5A7184]">{formatDate(s.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-[#9AAFC1]">{s.status}</span>
                  <Link
                    href={`/analysis?id=${s.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-xs font-semibold text-[#39D9D0] transition"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Analyze
                  </Link>
                  <Link
                    href={`/screenings/${s.id}`}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-[#9AAFC1] hover:text-white transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
