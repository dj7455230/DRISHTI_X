"use client"

import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { patientsApi } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users,
  Plus,
  Search,
  ChevronRight,
  UserPlus,
  ShieldCheck,
  Activity,
  Calendar,
  AlertCircle,
  X,
  Stethoscope,
  Eye,
  Filter,
} from "lucide-react"
import Link from "next/link"
import { cn, DR_GRADE_LABELS, DR_GRADE_COLORS, formatDate } from "@/lib/utils"

export default function PatientsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [genderFilter, setGenderFilter] = useState<string>("ALL")
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)

  // Registration Form State
  const [name, setName] = useState("")
  const [age, setAge] = useState<number | "">("")
  const [gender, setGender] = useState("PREFER_NOT_TO_SAY")
  const [diabetesType, setDiabetesType] = useState("TYPE_2")
  const [diabetesDuration, setDiabetesDuration] = useState<number | "">("")
  const [diabetesTreatment, setDiabetesTreatment] = useState("ORAL")
  const [hba1c, setHba1c] = useState<number | "">("")
  const [district, setDistrict] = useState("Varanasi")
  const [state, setState] = useState("Uttar Pradesh")
  const [notes, setNotes] = useState("")

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => patientsApi.list({ limit: 100 }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const registerMutation = useMutation({
    mutationFn: (newPatientData: any) => patientsApi.create(newPatientData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      setIsRegisterOpen(false)
      // Reset form
      setName("")
      setAge("")
      setDiabetesDuration("")
      setHba1c("")
      setNotes("")
    },
  })

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    registerMutation.mutate({
      name: name.trim() || undefined,
      age: age ? Number(age) : undefined,
      gender,
      diabetes_type: diabetesType,
      diabetes_duration_years: diabetesDuration ? Number(diabetesDuration) : undefined,
      diabetes_treatment: diabetesTreatment,
      hba1c_value: hba1c ? Number(hba1c) : undefined,
      district: district.trim() || undefined,
      state: state.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const filtered =
    patients?.filter((p: any) => {
      const matchesSearch =
        !search ||
        p.patient_code?.toLowerCase().includes(search.toLowerCase()) ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.district?.toLowerCase().includes(search.toLowerCase())

      const matchesGender =
        genderFilter === "ALL" || p.gender === genderFilter

      return matchesSearch && matchesGender
    }) ?? []

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Patient <span className="gradient-text-cyan">Registry</span>
            </h1>
          </div>
          <p className="text-xs text-[#9AAFC1] mt-1">
            Registered clinical cohort ({patients?.length ?? 0} active records) for rural and hospital-based diabetic retinopathy screening.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsRegisterOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[#07111F] text-xs font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition active:scale-95"
        >
          <UserPlus className="w-4 h-4" /> Register New Patient
        </button>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#5A7184] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient code, name, or district..."
            className="w-full bg-[#101F30] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]/60 transition"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Filter className="w-3.5 h-3.5 text-[#5A7184]" />
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="bg-[#101F30] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F4F8FC] focus:outline-none focus:border-[#39D9D0]/60"
          >
            <option value="ALL">All Genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="PREFER_NOT_TO_SAY">Not Specified</option>
          </select>
        </div>
      </div>

      {/* PATIENT LIST */}
      {isLoading ? (
        <div className="text-[#39D9D0] animate-pulse py-12 text-center text-xs flex items-center justify-center gap-2">
          <Activity className="w-4 h-4 animate-spin" />
          Loading patient directory...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
          <Users className="w-12 h-12 text-[#5A7184] mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No Patients Found</h3>
          <p className="text-xs text-[#9AAFC1] mt-1 max-w-sm mx-auto">
            {search ? "No matching records found for this query." : "No patients have been registered in this clinical database."}
          </p>
          <button
            type="button"
            onClick={() => setIsRegisterOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#102436] text-[#39D9D0] border border-[#39D9D0]/30 text-xs font-semibold"
          >
            <UserPlus className="w-4 h-4" /> Register Patient
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((p: any, i: number) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <div className="glass-card glass-card-hover p-4 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
                <Link
                  href={`/patients/${p.id}`}
                  className="flex items-center gap-3.5 flex-1 min-w-0 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/20 flex items-center justify-center text-[#39D9D0] font-mono text-xs font-bold shrink-0 group-hover:scale-105 transition-transform">
                    {p.patient_code ? p.patient_code.slice(-3) : "PT"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white group-hover:text-[#39D9D0] transition-colors truncate">
                        {p.name || p.patient_code}
                      </p>
                      <span className="font-mono text-[10px] text-[#5A7184]">
                        {p.patient_code}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9AAFC1] mt-0.5">
                      {[
                        p.age && `Age ${p.age}`,
                        p.gender && p.gender !== "PREFER_NOT_TO_SAY" ? p.gender : null,
                        p.diabetes_type,
                        p.district,
                        p.state,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-mono text-[#5A7184]">
                      {p.screening_count ?? 0} screening{p.screening_count !== 1 ? "s" : ""}
                    </p>
                    {p.latest_dr_grade !== null && p.latest_dr_grade !== undefined ? (
                      <span className={cn("text-[11px] font-semibold", DR_GRADE_COLORS[p.latest_dr_grade])}>
                        {DR_GRADE_LABELS[p.latest_dr_grade]}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#5A7184]">No Prior Exam</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/screenings/new?patient_id=${p.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-[#39D9D0] text-[11px] font-semibold transition"
                    >
                      New Exam
                    </Link>

                    <Link
                      href={`/patients/${p.id}`}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#9AAFC1] hover:text-white transition"
                      aria-label="View patient profile"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* REGISTRATION MODAL */}
      <AnimatePresence>
        {isRegisterOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card w-full max-w-lg rounded-2xl border border-white/10 bg-[#0B1726] p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="w-5 h-5 text-[#39D9D0]" />
                  <h3 className="text-base font-bold text-white">Register Clinical Patient</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="p-1 text-[#9AAFC1] hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
                {/* Full Name */}
                <div>
                  <label className="block text-[#9AAFC1] mb-1 font-medium">Patient Full Name (Optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]"
                  />
                  {name.trim().length > 2 &&
                    patients?.some(
                      (p: any) =>
                        p.name &&
                        p.name.trim().toLowerCase() === name.trim().toLowerCase()
                    ) && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>
                          Duplicate Notice: Patient &quot;{name.trim()}&quot; is already registered.
                        </span>
                      </div>
                    )}
                </div>

                {/* Age & Gender */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">Age</label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={age}
                      onChange={(e) => setAge(e.target.value ? Number(e.target.value) : "")}
                      placeholder="e.g. 54"
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">Gender</label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#39D9D0]"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                      <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                    </select>
                  </div>
                </div>

                {/* Diabetes Profile */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">Diabetes Type</label>
                    <select
                      value={diabetesType}
                      onChange={(e) => setDiabetesType(e.target.value)}
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#39D9D0]"
                    >
                      <option value="TYPE_2">Type 2</option>
                      <option value="TYPE_1">Type 1</option>
                      <option value="GESTATIONAL">Gestational</option>
                      <option value="PRE_DIABETES">Pre-diabetes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">Duration (Years)</label>
                    <input
                      type="number"
                      min="0"
                      max="70"
                      value={diabetesDuration}
                      onChange={(e) => setDiabetesDuration(e.target.value ? Number(e.target.value) : "")}
                      placeholder="e.g. 8"
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">HbA1c (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="3"
                      max="20"
                      value={hba1c}
                      onChange={(e) => setHba1c(e.target.value ? Number(e.target.value) : "")}
                      placeholder="e.g. 7.8"
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]"
                    />
                  </div>
                </div>

                {/* District & State */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">District</label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#39D9D0]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9AAFC1] mb-1 font-medium">State</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white focus:outline-none focus:border-[#39D9D0]"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[#9AAFC1] mb-1 font-medium">Clinical Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Patient complains of intermittent blurred vision in right eye..."
                    className="w-full rounded-xl bg-[#101F30] border border-white/10 px-3 py-2 text-white placeholder-[#5A7184] focus:outline-none focus:border-[#39D9D0]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-2 rounded-xl text-[#9AAFC1] hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={registerMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#39D9D0] text-[#07111F] font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition disabled:opacity-50"
                  >
                    {registerMutation.isPending ? "Registering..." : "Confirm & Register"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
