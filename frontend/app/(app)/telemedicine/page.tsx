"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Satellite,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  Send,
  Eye,
  Camera,
  Layers,
  Sparkles,
  Download,
  RefreshCw,
  FileText,
  User,
  Activity,
  Maximize2,
  ExternalLink,
} from "lucide-react"
import { screeningsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { SafeImage } from "@/components/SafeImage"

const PRIORITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  HIGH: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  ROUTINE: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
}

const GRADE_LABELS: Record<number, string> = {
  0: "Grade 0 — No DR",
  1: "Grade 1 — Mild NPDR",
  2: "Grade 2 — Moderate NPDR",
  3: "Grade 3 — Severe NPDR",
  4: "Grade 4 — Proliferative DR",
}

export default function TelemedicinePortalPage() {
  const queryClient = useQueryClient()
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>("ALL")
  const [actionTab, setActionTab] = useState<"ACCEPT" | "REVIEW_FURTHER" | "REFER" | "RECAPTURE">("ACCEPT")
  const [doctorGrade, setDoctorGrade] = useState<number>(2)
  const [doctorNotes, setDoctorNotes] = useState<string>("")
  const [referralUrgency, setReferralUrgency] = useState<string>("URGENT")
  const [referralDest, setReferralDest] = useState<string>("District Ophthalmic Hospital")
  const [showGradCam, setShowGradCam] = useState<boolean>(true)
  const [showLesionMask, setShowLesionMask] = useState<boolean>(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Fetch Telemedicine Referral Queue
  const { data: queue = [], isLoading, refetch } = useQuery({
    queryKey: ["telemedicineQueue"],
    queryFn: async () => {
      const res = await screeningsApi.telemedicineQueue()
      return res.data
    },
    refetchInterval: 10000,
  })

  // Selected case
  const activeCase = queue.find((c: any) => c.id === selectedCaseId) || queue[0] || null

  // Fetch full details of active case if selected
  const { data: caseDetail } = useQuery({
    queryKey: ["screeningDetail", activeCase?.id],
    queryFn: async () => {
      if (!activeCase?.id) return null
      const res = await screeningsApi.get(activeCase.id)
      return res.data
    },
    enabled: !!activeCase?.id,
  })

  // Fetch Evidence Capsule for active case
  const { data: capsuleDetail } = useQuery({
    queryKey: ["evidenceCapsule", activeCase?.id],
    queryFn: async () => {
      if (!activeCase?.id) return null
      try {
        const res = await screeningsApi.getCapsule(activeCase.id)
        return res.data
      } catch {
        return null
      }
    },
    enabled: !!activeCase?.id,
  })

  // Request Full Image Mutation
  const requestFullImageMutation = useMutation({
    mutationFn: async (id: string) => {
      return screeningsApi.requestFullImage(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telemedicineQueue"] })
      queryClient.invalidateQueries({ queryKey: ["screeningDetail", activeCase?.id] })
      setSuccessMsg("Expedited full-resolution image requested from rural PHC node.")
      setTimeout(() => setSuccessMsg(null), 4000)
    },
  })

  // Submit Doctor Action Mutation
  const submitActionMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!activeCase?.id) return
      return screeningsApi.recordAction(activeCase.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telemedicineQueue"] })
      queryClient.invalidateQueries({ queryKey: ["screeningDetail", activeCase?.id] })
      setSuccessMsg(`Clinical action [${actionTab}] successfully recorded and synced to rural PHC.`)
      setTimeout(() => setSuccessMsg(null), 4000)
    },
  })

  const filteredQueue = queue.filter((c: any) => {
    if (filterTier === "ALL") return true
    return c.priority_tier === filterTier || c.priority_level === filterTier
  })

  const isLimitedEvidence = activeCase?.full_image_pending || activeCase?.status === "CAPSULE_SYNCED"

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
              <Satellite className="w-3.5 h-3.5" /> Feature 35
            </span>
            <span className="text-xs text-slate-500">Rural-Telemedicine Tele-Consultation Hub</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Remote Ophthalmologist <span className="gradient-text">Specialist Portal</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Asynchronous triage, Evidence Capsule inspection, and clinical referral validation for rural PHCs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 text-xs hover:bg-slate-700/60 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh Queue
          </button>
        </div>
      </div>

      {/* Success Notification */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card px-4 py-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2.5"
          >
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Left Queue (1/3), Right Review Workspace (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Priority Referral Queue */}
        <div className="lg:col-span-4 space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                Telemedicine Queue
              </h2>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {queue.length} Pending
              </span>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "ROUTINE"].map((tier) => (
                <button
                  key={tier}
                  onClick={() => setFilterTier(tier)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs transition-colors shrink-0",
                    filterTier === tier
                      ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-medium"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  )}
                >
                  {tier}
                </button>
              ))}
            </div>

            {/* Queue List */}
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {filteredQueue.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No cases pending telemedicine review in this tier.
                </div>
              ) : (
                filteredQueue.map((item: any) => {
                  const badge = PRIORITY_BADGES[item.priority_tier || item.priority_level] || PRIORITY_BADGES.ROUTINE
                  const isSelected = activeCase?.id === item.id

                  return (
                    <motion.div
                      key={item.id}
                      onClick={() => setSelectedCaseId(item.id)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all text-xs space-y-2",
                        isSelected
                          ? "bg-slate-800/90 border-cyan-500/50 shadow-lg shadow-cyan-500/5"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-200 font-semibold">{item.case_number}</span>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", badge.bg, badge.text, badge.border)}>
                          {item.priority_tier || item.priority_level} ({Math.round(item.priority_score || 0)})
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span>{item.patient?.name || "Patient"} • {item.patient?.age || "?"}y ({item.patient?.gender || "N/A"})</span>
                        <span className="text-[10px] text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                        <span className="text-slate-400">
                          AI: <strong className="text-slate-200">{item.prediction?.predicted_grade !== null && item.prediction?.predicted_grade !== undefined ? `Grade ${item.prediction.predicted_grade}` : "Pending"}</strong>
                        </span>
                        {item.capsule_synced && item.full_image_pending ? (
                          <span className="text-amber-400 text-[10px] flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Capsule Only
                          </span>
                        ) : (
                          <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Full Image Synced
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Case Review Workspace */}
        <div className="lg:col-span-8 space-y-5">
          {!activeCase ? (
            <div className="glass-card p-12 text-center text-slate-500">
              <Eye className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-60" />
              Select a screening case from the queue to start tele-ophthalmology review.
            </div>
          ) : (
            <>
              {/* Limited Evidence Alert Banner */}
              {isLimitedEvidence && (
                <div className="glass-card p-4 border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-300">
                        LIMITED EVIDENCE — Capsule Preview Only
                      </h4>
                      <p className="text-xs text-amber-200/80 mt-0.5">
                        High-resolution fundus image is currently queuing over the rural link. Specialist evaluation
                        conducted at this stage is designated as <strong>Limited Tele-Triage</strong>.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => requestFullImageMutation.mutate(activeCase.id)}
                    disabled={requestFullImageMutation.isPending || activeCase.full_image_pending}
                    className="shrink-0 px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                  >
                    {requestFullImageMutation.isPending ? "Requesting..." : "Request Urgent Full Image"}
                  </button>
                </div>
              )}

              {/* Case Summary Card */}
              <div className="glass-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {activeCase.case_number}
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-bold border",
                        PRIORITY_BADGES[activeCase.priority_tier || activeCase.priority_level]?.bg,
                        PRIORITY_BADGES[activeCase.priority_tier || activeCase.priority_level]?.text,
                        PRIORITY_BADGES[activeCase.priority_tier || activeCase.priority_level]?.border
                      )}>
                        {activeCase.priority_tier || activeCase.priority_level} (Score: {activeCase.priority_score})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Patient: <span className="text-slate-200 font-medium">{activeCase.patient?.name}</span> ({activeCase.patient?.age}y, {activeCase.patient?.gender}) • Diabetes: {activeCase.patient?.diabetes_type || "Type 2"} (Duration: {activeCase.patient?.diabetes_duration_years || "N/A"} yrs, HbA1c: {activeCase.patient?.hba1c ? `${activeCase.patient.hba1c}%` : "Not recorded"})
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-500 block">Screening Status</span>
                    <span className="text-xs font-mono font-semibold text-cyan-400">{activeCase.status}</span>
                  </div>
                </div>

                {/* Evidence Inspection & Fundus Workspace */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Retinal Image / Thumbnail */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-cyan-400" />
                        {isLimitedEvidence ? "Evidence Capsule Thumbnail (128x128)" : "Full-Resolution Fundus"}
                      </span>
                      {!isLimitedEvidence && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowGradCam(!showGradCam)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] border transition-colors",
                              showGradCam ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "border-slate-700 text-slate-400"
                            )}
                          >
                            Grad-CAM
                          </button>
                          <button
                            onClick={() => setShowLesionMask(!showLesionMask)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] border transition-colors",
                              showLesionMask ? "bg-purple-500/20 border-purple-500/40 text-purple-300" : "border-slate-700 text-slate-400"
                            )}
                          >
                            Lesion Mask
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="relative aspect-square w-full rounded-lg bg-black/60 border border-slate-800 flex items-center justify-center overflow-hidden">
                      {isLimitedEvidence && capsuleDetail?.thumbnail_preview ? (
                        <SafeImage
                          src={capsuleDetail.thumbnail_preview.startsWith("data:") ? capsuleDetail.thumbnail_preview : `data:image/jpeg;base64,${capsuleDetail.thumbnail_preview}`}
                          alt="Evidence Capsule Thumbnail"
                          className="w-full h-full object-contain filter contrast-125"
                          fallbackTitle="Thumbnail Preview Unavailable"
                        />
                      ) : caseDetail?.fundus_image?.image_url ? (
                        <SafeImage
                          src={caseDetail.fundus_image.image_url}
                          alt="Full Fundus Retinal Image"
                          className="w-full h-full object-contain"
                          fallbackTitle="Fundus Retinal Image Unavailable"
                        />
                      ) : (
                        <div className="text-center p-4 text-slate-500 text-xs">
                          <Camera className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          <span>Image stream initializing...</span>
                        </div>
                      )}

                      {/* Limited evidence watermark if preview only */}
                      {isLimitedEvidence && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-500/80 text-black font-bold text-[10px] tracking-wide">
                          LIMITED CAPSULE PREVIEW
                        </div>
                      )}
                    </div>

                    {/* SHA-256 Checksum Provenance */}
                    <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Image SHA-256 Checksum:</span>
                        <span className="font-mono text-cyan-400 truncate max-w-[180px]">
                          {capsuleDetail?.image_checksum || caseDetail?.fundus_image?.checksum || "Verifying..."}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[10px]">
                        <span>Facility Node:</span>
                        <span>{capsuleDetail?.facility_code || "PHC-RURAL-01"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: AI Clinical Assurance Signals */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      AI Decision Support & Clinical Assurance
                    </h4>

                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Predicted DR Grade:</span>
                          <span className="font-bold text-white">
                            {GRADE_LABELS[activeCase.prediction?.predicted_grade ?? -1] || "Evaluation Pending"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prediction Confidence:</span>
                          <span className="font-mono text-cyan-400 font-semibold">
                            {activeCase.prediction?.confidence ? `${Math.round(activeCase.prediction.confidence * 100)}%` : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Quality Gate Status:</span>
                          <span className="text-emerald-400 font-medium">
                            {activeCase.prediction?.quality_grade || "OPTIMAL"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Lesion Concordance:</span>
                          <span className="text-cyan-300">
                            {activeCase.prediction?.concordance_status || "CONCORDANT"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Microaneurysms Detected:</span>
                          <span className="text-slate-200">
                            {caseDetail?.lesion_evidence?.microaneurysms_count ?? (capsuleDetail?.lesion_evidence_summary?.microaneurysms ? "Present" : "None")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Hard Exudates Detected:</span>
                          <span className="text-slate-200">
                            {caseDetail?.lesion_evidence?.hard_exudates_count ?? (capsuleDetail?.lesion_evidence_summary?.hard_exudates ? "Present" : "None")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Doctor Clinical Review Action Section */}
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      Specialist Confirmation & Action Directives
                    </h4>
                    <span className="text-xs text-slate-400">Asynchronous Tele-Diagnosis</span>
                  </div>

                  {/* Action Tabs */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "ACCEPT", label: "Accept / Confirm", color: "text-emerald-400" },
                      { id: "REVIEW_FURTHER", label: "Review Further", color: "text-cyan-400" },
                      { id: "REFER", label: "Refer to Tertiary", color: "text-red-400" },
                      { id: "RECAPTURE", label: "Request Recapture", color: "text-amber-400" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActionTab(tab.id as any)}
                        className={cn(
                          "py-2 px-3 rounded-lg border text-xs font-medium transition-all text-center",
                          actionTab === tab.id
                            ? "bg-slate-800 border-cyan-500/50 text-white shadow-sm"
                            : "bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Form fields based on tab */}
                  <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-3">
                    {actionTab === "ACCEPT" && (
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">
                          Confirmed DR Grade (Ophthalmologist Adjudicated)
                        </label>
                        <select
                          value={doctorGrade}
                          onChange={(e) => setDoctorGrade(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
                        >
                          <option value={0}>Grade 0 — No Apparent Retinopathy</option>
                          <option value={1}>Grade 1 — Mild Non-Proliferative DR</option>
                          <option value={2}>Grade 2 — Moderate Non-Proliferative DR</option>
                          <option value={3}>Grade 3 — Severe Non-Proliferative DR</option>
                          <option value={4}>Grade 4 — Proliferative DR</option>
                        </select>
                      </div>
                    )}

                    {actionTab === "REFER" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Referral Urgency</label>
                          <select
                            value={referralUrgency}
                            onChange={(e) => setReferralUrgency(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
                          >
                            <option value="CRITICAL">EMERGENT (Same-Day Vitreoretinal Evaluation)</option>
                            <option value="HIGH">URGENT (Within 1-2 Weeks)</option>
                            <option value="MEDIUM">ROUTINE (Within 1 Month)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Destination Facility</label>
                          <input
                            type="text"
                            value={referralDest}
                            onChange={(e) => setReferralDest(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">
                        Clinical Directives & Ophthalmologist Notes
                      </label>
                      <textarea
                        rows={3}
                        value={doctorNotes}
                        onChange={(e) => setDoctorNotes(e.target.value)}
                        placeholder="Enter clinical recommendations, follow-up intervals, or laser/anti-VEGF referral directives for rural PHC health worker..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:border-cyan-500 outline-none placeholder:text-slate-600"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() =>
                          submitActionMutation.mutate({
                            action: actionTab,
                            doctor_grade: actionTab === "ACCEPT" ? doctorGrade : undefined,
                            notes: doctorNotes,
                            referral_urgency: actionTab === "REFER" ? referralUrgency : undefined,
                            referral_destination: actionTab === "REFER" ? referralDest : undefined,
                          })
                        }
                        disabled={submitActionMutation.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {submitActionMutation.isPending ? "Recording Review..." : "Record & Transmit Review to PHC"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
