"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { api, screeningsApi } from "@/lib/api"
import { useAuthStore } from "@/lib/store"

import {
  Activity,
  AlertTriangle,
  AlertCircle,
  Brain,
  Camera,
  CheckCircle2,
  CircleAlert,
  Eye,
  ImageIcon,
  Loader2,
  Microscope,
  RefreshCcw,
  ShieldCheck,
  Stethoscope,
  FileText,
  Download,
  Printer,
  Send,
} from "lucide-react"

import type { LucideIcon } from "lucide-react"

import {
  cn,
  DR_GRADE_BG,
  DR_GRADE_COLORS,
  DR_GRADE_LABELS,
  formatConfidence,
} from "@/lib/utils"
import { GradCamViewer } from "@/components/GradCamViewer"
import LesionViewer from "@/components/LesionViewer"

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000"

async function loadClinicalReport(id: string) {
  try {
    const response = await api.get(
      `/api/screenings/${id}/report`
    )

    return response.data
  } catch (error: any) {
    // Report does not exist yet -> generate it once
    if (error?.response?.status === 404) {
      const response = await api.post(
        `/api/screenings/${id}/report`
      )

      return response.data
    }

    throw error
  }
}

async function regenerateReport(id: string) {
  const response = await api.post(
    `/api/screenings/${id}/report`
  )

  return response.data
}

function getAssuranceConfig(decision?: string | null) {
  switch (decision) {
    case "VALIDATED":
      return {
        title: "Validated Prediction",
        description:
          "Prediction and supporting retinal evidence are sufficiently aligned for screening support.",
        badge:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        panel: "bg-emerald-500/10",
        icon: "text-emerald-400",
      }

    case "HUMAN_REVIEW_REQUIRED":
      return {
        title: "Human Review Required",
        description:
          "The available evidence requires qualified clinical review before further action.",
        badge:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",
        panel: "bg-amber-500/10",
        icon: "text-amber-400",
      }

    case "RECAPTURE_REQUIRED":
      return {
        title: "Recapture Required",
        description:
          "Image quality is insufficient for reliable retinal screening assessment.",
        badge:
          "border-rose-500/30 bg-rose-500/10 text-rose-400",
        panel: "bg-rose-500/10",
        icon: "text-rose-400",
      }

    default:
      return {
        title: "Screening Assessment",
        description:
          "Clinical assurance information is not yet available.",
        badge:
          "border-white/10 bg-[#101F30] text-[#62747a]",
        panel: "bg-[#101F30]",
        icon: "text-[#647d82]",
      }
  }
}

function mediaUrl(path?: string | null) {
  if (!path) return ""

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path
  }

  return `${API_BASE}/${path.replace(/^\/+/, "")}`
}

export default function ScreeningDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const [doctorGrade, setDoctorGrade] =
    useState<number | null>(null)

  const [doctorNotes, setDoctorNotes] =
    useState("")

  const [aiAccepted, setAiAccepted] =
    useState(true)

  const [heatmapUsefulness, setHeatmapUsefulness] =
    useState<string>("MODERATELY_USEFUL")

  const [qualityAgreed, setQualityAgreed] =
    useState<boolean>(true)

  const [disagreementReasons, setDisagreementReasons] =
    useState<string[]>([])

  // Referral states
  const [referralFacility, setReferralFacility] =
    useState("Varanasi District Eye Hospital")
  const [referralUrgency, setReferralUrgency] =
    useState<string>("MEDIUM")
  const [appointmentDate, setAppointmentDate] =
    useState("")
  const [followUpDate, setFollowUpDate] =
    useState("")
  const [referralNotes, setReferralNotes] =
    useState("")
  const [referralSuccessMsg, setReferralSuccessMsg] =
    useState("")

  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["screening-report", id],

    queryFn: () =>
      loadClinicalReport(id),

    retry: false,
  })

  const { data: referralData } = useQuery({
    queryKey: ["screening-referral", id],
    queryFn: () => screeningsApi.getReferral(id).then((r) => r.data).catch(() => null),
    retry: false,
  })

  const analyzeMutation = useMutation({
    mutationFn: () =>
      screeningsApi.analyze(id),

    onSuccess: async () => {
      await regenerateReport(id)

      await queryClient.invalidateQueries({
        queryKey: ["screening-report", id],
      })
    },
  })

  const reviewMutation = useMutation({
    mutationFn: () =>
      screeningsApi.doctorReview(id, {
        doctor_grade: doctorGrade,
        doctor_notes: doctorNotes,
        ai_grade_accepted: aiAccepted,
        heatmap_usefulness: heatmapUsefulness,
        quality_assessment_agreed: qualityAgreed,
        disagreement_reasons: disagreementReasons,
      }),

    onSuccess: async () => {
      await regenerateReport(id)

      await queryClient.invalidateQueries({
        queryKey: ["screening-report", id],
      })
    },
  })

  const referralMutation = useMutation({
    mutationFn: () =>
      screeningsApi.saveReferral(id, {
        screening_id: id,
        patient_id: patient?.id,
        urgency: referralUrgency,
        referred_facility: referralFacility,
        appointment_date: appointmentDate ? new Date(appointmentDate).toISOString() : undefined,
        follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : undefined,
        clinical_notes: referralNotes,
      }),
    onSuccess: async () => {
      setReferralSuccessMsg("Referral successfully scheduled with facility!")
      await queryClient.invalidateQueries({
        queryKey: ["screening-report", id],
      })
      await queryClient.invalidateQueries({
        queryKey: ["screening-referral", id],
      })
    },
  })

  const recaptureMutation = useMutation({
    mutationFn: () =>
      screeningsApi.recapture(
        id,
        "Recapture requested by operator"
      ),

    onSuccess: async () => {
      await regenerateReport(id)

      await queryClient.invalidateQueries({
        queryKey: ["screening-report", id],
      })
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">

        <div className="flex items-center gap-3 text-sm text-[#9AAFC1]">

          <Activity className="h-5 w-5 animate-pulse text-[#3b7f83]" />

          Preparing clinical evidence report...

        </div>

      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">

        <p className="font-semibold text-rose-400">
          Unable to load screening report
        </p>

        <p className="mt-2 text-sm text-[#a96d68]">
          Confirm that the backend service is running and try again.
        </p>

      </div>
    )
  }

  const screening = report.screening || {}
  const patient = report.patient || {}

  const quality =
    report.image_quality || null

  const pred =
    report.ai_prediction || null

  const assurance =
    report.assurance || {}

  const doctorReview =
    report.doctor_review || null

  const lesionSummary =
    pred?.lesion_summary || null

  const predictedGrade =
    pred?.predicted_grade

  const hasPrediction =
    predictedGrade !== null &&
    predictedGrade !== undefined

  const recommendation =
    report.recommendation || {}

  const displayRecommendation =
    pred?.is_demo || !hasPrediction
      ? {
          clinical_pathway: "HUMAN_REVIEW_REQUIRED",
          action:
            "Ophthalmologist review is required before assigning a referral timeline or treatment pathway.",
        }
      : recommendation

  const assuranceStyle =
    getAssuranceConfig(
      assurance?.decision
    )

  const isDoctor =
    user?.role === "OPHTHALMOLOGIST" ||
    user?.role === "ADMIN"

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 pb-12">

      {/* HEADER */}
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">

        <div>

          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3c7c7e]">

            <Eye className="h-3.5 w-3.5" />

            Clinical Evidence Report

          </div>

          <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[#F4F8FC]">
            Retinal screening report
          </h1>

          <p className="mt-2 max-w-[680px] text-[12px] leading-5 text-[#9AAFC1]">
            Image quality, retinal evidence, screening classification
            and clinical assurance brought together in one review.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">

            <span className="font-mono text-[9px] text-[#5A7184]">
              Case {screening.id || id}
            </span>

            {patient.patient_code && (
              <span className="text-[9px] text-[#9AAFC1]">
                Patient {patient.patient_code}
              </span>
            )}

            {patient.age && (
              <span className="text-[9px] text-[#9AAFC1]">
                Age {patient.age}
              </span>
            )}

          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-[#101F30] px-4 py-2 text-[10px] font-semibold text-[#F4F8FC] shadow-sm transition hover:bg-[#102436]"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Report
          </button>

          <a
            href={`${API_BASE}/api/screenings/${id}/report/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-[#173f56] bg-[#173f56] px-4 py-2 text-[10px] font-semibold text-white shadow-sm transition hover:bg-[#102f42]"
          >
            <FileText className="h-3.5 w-3.5" />
            Publish / Download PDF Report
          </a>

          <span
            className={cn(
              "rounded-full border px-4 py-2 text-[10px] font-bold",
              assuranceStyle.badge
            )}
          >
            {assuranceStyle.title}
          </span>

          {screening.status && (
            <span className="rounded-full border border-white/10 bg-[#101F30] px-4 py-2 text-[10px] font-semibold text-[#63767c]">
              {String(screening.status).replaceAll("_", " ")}
            </span>
          )}
        </div>

      </section>

      {/* MANDATORY CLINICAL DISCLAIMER BANNER */}
      <section className="rounded-2xl border border-[#eab308]/40 bg-amber-500/10 p-4 text-amber-300 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ca8a04]" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Clinical Disclaimer & Decision Support Notice
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-300">
              DRISHTI-X provides AI-assisted diabetic retinopathy screening support only. This result is not a definitive diagnosis and must be reviewed by a qualified eye-care professional. Model predictions and heatmaps may be incorrect. Unsuitable images may require recapture. Clinical decisions must not be based solely on this AI output.
            </p>
          </div>
        </div>
      </section>

      {/* RECAPTURE GUIDANCE BANNER */}
      {(!quality?.is_gradable || assurance?.decision === "RECAPTURE_REQUIRED" || screening?.status === "RECAPTURE_REQUIRED") && (
        <section className="rounded-2xl border border-[#ef4444]/30 bg-rose-500/10 p-5 text-rose-300 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#dc2626]" />
            <div className="space-y-2">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#b91c1c]">
                Image Unsuitable for Reliable Screening — Recapture Required
              </h3>
              <p className="text-[11px] leading-relaxed text-rose-300">
                The uploaded fundus photograph did not meet optical quality criteria. AI prediction is withheld or unverified to avoid clinical misinterpretation.
              </p>
              {quality?.feedback && (
                <p className="text-[11px] font-semibold text-rose-300">
                  Findings: {quality.feedback}
                </p>
              )}
              {quality?.recapture_guidance && quality.recapture_guidance.length > 0 && (
                <div className="mt-2 rounded-xl bg-[#101F30]/70 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#b91c1c]">
                    Recommended Recapture Steps:
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[10px] text-rose-300">
                    {quality.recapture_guidance.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ASSURANCE HERO */}
      <section
        className={cn(
          "relative overflow-hidden rounded-[26px] border border-white/10 p-6 lg:p-7",
          assuranceStyle.panel
        )}
      >

        <div className="absolute -right-20 -top-24 h-60 w-60 rounded-full border border-white/60" />

        <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border border-white/70" />

        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

          <div className="flex items-start gap-4">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#101F30] shadow-sm">

              <ShieldCheck
                className={cn(
                  "h-5 w-5",
                  assuranceStyle.icon
                )}
              />

            </div>

            <div>

              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#809297]">
                Clinical Assurance Decision
              </p>

              <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-[#F4F8FC]">
                {assuranceStyle.title}
              </h2>

              <p className="mt-2 max-w-[670px] text-[11px] leading-5 text-[#667e84]">
                {assuranceStyle.description}
              </p>

            </div>

          </div>

          {assurance.referral_priority && (
            <div className="min-w-[185px] rounded-2xl border border-white/80 bg-[#101F30]/70 p-4">

              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#9AAFC1]">
                Referral Priority
              </p>

              <div className="mt-2 flex items-end justify-between">

                <p
                  className={cn(
                    "text-[17px] font-bold",
                    assurance.referral_priority === "CRITICAL"
                      ? "text-[#b44d4d]"
                      : assurance.referral_priority === "HIGH"
                      ? "text-[#ae682b]"
                      : assurance.referral_priority === "MEDIUM"
                      ? "text-[#987125]"
                      : "text-emerald-400"
                  )}
                >
                  {assurance.referral_priority}
                </p>

                <div className="text-right">

                  <p className="text-[8px] text-[#9aa6a9]">
                    score
                  </p>

                  <p className="text-lg font-semibold text-[#294750]">
                    {assurance.referral_score != null
                      ? Number(
                          assurance.referral_score
                        ).toFixed(0)
                      : "—"}
                  </p>

                </div>

              </div>

            </div>
          )}

        </div>

      </section>

      {/* DEMO MODE */}
      {pred?.is_demo && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">

          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a67a2f]" />

          <div>

            <p className="text-[10px] font-semibold text-[#806329]">
              Demo environment
            </p>

            <p className="mt-1 text-[10px] leading-5 text-[#907847]">
              Trained retinal classifier weights are not loaded on
              this device. Classification is therefore withheld and
              the case remains routed for human review.
            </p>

          </div>

        </section>
      )}

      {/* PIPELINE */}
      <section className="rounded-[24px] border border-white/10 bg-[#101F30] p-5 shadow-[0_10px_30px_rgba(38,69,80,0.035)]">

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

          <EvidenceStage
            number="01"
            icon={ImageIcon}
            title="Image Quality"
            status={
              quality
                ? quality.is_gradable
                  ? "Gradable"
                  : "Needs recapture"
                : "Unavailable"
            }
            complete={Boolean(quality)}
          />

          <EvidenceStage
            number="02"
            icon={Brain}
            title="DR Prediction"
            status={
              hasPrediction
                ? `Grade ${predictedGrade}`
                : pred
                ? "Unavailable"
                : "Pending"
            }
            complete={Boolean(pred)}
          />

          <EvidenceStage
            number="03"
            icon={Microscope}
            title="Evidence Check"
            status={
              pred?.concordance_level ||
              (lesionSummary
                ? "Evidence available"
                : "Unavailable")
            }
            complete={Boolean(
              lesionSummary
            )}
          />

          <EvidenceStage
            number="04"
            icon={ShieldCheck}
            title="Clinical Assurance"
            status={
              assurance.decision
                ? String(
                    assurance.decision
                  ).replaceAll("_", " ")
                : "Pending"
            }
            complete={Boolean(
              assurance.decision
            )}
          />

        </div>

      </section>

      {/* MAIN GRID */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">

        {/* LEFT */}
        <div className="space-y-5">

          {/* CLASSIFICATION */}
          <section className="rounded-[24px] border border-white/10 bg-[#101F30] p-6 shadow-[0_10px_30px_rgba(38,69,80,0.04)]">

            <div className="flex items-center justify-between gap-4">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102436]">

                  <Brain className="h-4 w-4 text-[#397b7c]" />

                </div>

                <div>

                  <h2 className="text-[14px] font-semibold text-[#F4F8FC]">
                    DR screening result
                  </h2>

                  <p className="mt-0.5 text-[9px] text-[#929fa3]">
                    Retinal severity assessment
                  </p>

                </div>

              </div>

              {pred?.model_status && (
                <span className="rounded-full bg-[#102436] px-3 py-1.5 text-[9px] font-semibold text-[#9AAFC1]">
                  {pred.model_status}
                </span>
              )}

            </div>

            {pred ? (
              <div className="mt-6">

                <div
                  className={cn(
                    "rounded-2xl border p-5",
                    hasPrediction
                      ? DR_GRADE_BG[
                          Number(
                            predictedGrade
                          )
                        ]
                      : "border-white/10 bg-[#101F30]"
                  )}
                >

                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#9AAFC1]">
                    Screening Classification
                  </p>

                  <p
                    className={cn(
                      "mt-2 text-[25px] font-semibold tracking-[-0.025em]",
                      hasPrediction
                        ? DR_GRADE_COLORS[
                            Number(
                              predictedGrade
                            )
                          ]
                        : "text-[#60757b]"
                    )}
                  >
                    {hasPrediction
                      ? `Grade ${predictedGrade} · ${
                          DR_GRADE_LABELS[
                            Number(
                              predictedGrade
                            )
                          ]
                        }`
                      : "Classification unavailable"}
                  </p>

                  {pred.confidence !== null &&
                    pred.confidence !== undefined ? (
                      <div className="mt-2.5 flex flex-col gap-1 border-t border-black/5 pt-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-[#657b81]">
                            Confidence Score:
                          </span>
                          <span className="font-semibold text-[#376f72]">
                            {formatConfidence(pred.confidence)}
                          </span>
                        </div>
                        <span className="inline-block self-start rounded bg-amber-500/20 px-2 py-0.5 text-[8.5px] font-semibold text-[#92400e]">
                          {pred.confidence_type || "Model probability — not calibrated"}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-2 text-[10px] text-[#94a3b8]">
                        Confidence unavailable
                      </p>
                    )}

                </div>

                {pred.probabilities && (
                  <div className="mt-6">

                    <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#909ea2]">
                      Grade Probability Distribution
                    </p>

                    <div className="space-y-3">

                      {Object.entries(
                        pred.probabilities
                      ).map(
                        ([grade, probability]: any) => (
                          <div
                            key={grade}
                            className="grid grid-cols-[105px_1fr_45px] items-center gap-3"
                          >

                            <span className="text-[9px] text-[#70858b]">
                              Grade {grade}
                            </span>

                            <div className="h-2 overflow-hidden rounded-full bg-[#0B1726]">

                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  Number(
                                    grade
                                  ) ===
                                    Number(
                                      predictedGrade
                                    )
                                    ? "bg-[#4c8b8a]"
                                    : "bg-[#c9d8d7]"
                                )}
                                style={{
                                  width: `${
                                    Number(
                                      probability
                                    ) * 100
                                  }%`,
                                }}
                              />

                            </div>

                            <span className="text-right font-mono text-[9px] text-[#708086]">
                              {(
                                Number(
                                  probability
                                ) * 100
                              ).toFixed(1)}
                              %
                            </span>

                          </div>
                        )
                      )}

                    </div>

                  </div>
                )}

                {pred.is_referable !== null &&
                  pred.is_referable !== undefined && (
                    <div
                      className={cn(
                        "mt-6 flex items-center gap-3 rounded-xl border px-4 py-3",
                        pred.is_referable
                          ? "border-rose-500/30 bg-rose-500/10"
                          : "border-emerald-500/30 bg-emerald-500/10"
                      )}
                    >

                      {pred.is_referable ? (
                        <AlertTriangle className="h-4 w-4 text-[#ae514d]" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-[#487b63]" />
                      )}

                      <div>

                        <p
                          className={cn(
                            "text-[10px] font-bold",
                            pred.is_referable
                              ? "text-[#9e4d49]"
                              : "text-emerald-400"
                          )}
                        >
                          {pred.is_referable
                            ? "REFERABLE DR"
                            : "NON-REFERABLE DR"}
                        </p>

                        <p className="mt-0.5 text-[9px] text-[#849297]">
                          {pred.is_referable
                            ? "Specialist review recommended"
                            : "No referable DR indicated by screening"}
                        </p>

                      </div>

                    </div>
                  )}

              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-white/10 bg-[#101F30] py-8 text-center">

                <p className="text-[11px] text-[#9AAFC1]">
                  No screening prediction available.
                </p>

                {screening.status ===
                  "IMAGE_UPLOADED" && (
                  <button
                    onClick={() =>
                      analyzeMutation.mutate()
                    }
                    disabled={
                      analyzeMutation.isPending
                    }
                    className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-xl bg-[#173f56] px-5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >

                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4" />
                        Run screening analysis
                      </>
                    )}

                  </button>
                )}

              </div>
            )}

          </section>

          {/* IMAGE QUALITY */}
          {quality && (
            <section className="rounded-[24px] border border-white/10 bg-[#101F30] p-6 shadow-[0_10px_30px_rgba(38,69,80,0.04)]">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="text-[14px] font-semibold text-[#F4F8FC]">
                    Image quality evidence
                  </h2>

                  <p className="mt-1 text-[9px] text-[#929fa3]">
                    Capture quality assessed before classification
                  </p>

                </div>

                <span
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[9px] font-bold",
                    quality.is_gradable
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-[#a7504c]"
                  )}
                >
                  {quality.is_gradable
                    ? "GRADABLE"
                    : "UNGRADABLE"}
                </span>

              </div>

              <div className="mt-6 space-y-4">

                {[
                  [
                    "Overall Quality",
                    quality.quality_score,
                  ],
                  [
                    "Focus",
                    quality.focus_score,
                  ],
                  [
                    "Illumination",
                    quality.illumination_score,
                  ],
                  [
                    "Field of View",
                    quality.fov_score,
                  ],
                ].map(([label, value]) => {

                  const numeric =
                    Number(value)

                  return (
                    <div
                      key={String(label)}
                      className="grid grid-cols-[105px_1fr_38px] items-center gap-3"
                    >

                      <span className="text-[9px] text-[#9AAFC1]">
                        {String(label)}
                      </span>

                      <div className="h-2 overflow-hidden rounded-full bg-[#0B1726]">

                        <div
                          className={cn(
                            "h-full rounded-full",
                            numeric >= 70
                              ? "bg-[#5b987c]"
                              : numeric >= 50
                              ? "bg-[#c69b4a]"
                              : "bg-[#c86b66]"
                          )}
                          style={{
                            width: `${Math.min(
                              100,
                              numeric || 0
                            )}%`,
                          }}
                        />

                      </div>

                      <span className="text-right font-mono text-[9px] text-[#677a80]">
                        {Number.isFinite(
                          numeric
                        )
                          ? numeric.toFixed(0)
                          : "—"}
                      </span>

                    </div>
                  )
                })}

              </div>

              {quality.feedback && (
                <div className="mt-5 rounded-xl bg-[#f5f9f8] px-4 py-3">

                  <p className="text-[10px] leading-5 text-[#6c8187]">
                    {quality.feedback}
                  </p>

                </div>
              )}

            </section>
          )}

        </div>

        {/* RIGHT */}
        <div className="space-y-5">

          {/* EXPLAINABILITY */}
          <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[#101F30] shadow-[0_10px_30px_rgba(38,69,80,0.04)]">

            <div className="border-b border-white/10 px-6 py-5">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102436]">

                  <Eye className="h-4 w-4 text-[#397b7c]" />

                </div>

                <div>

                  <h2 className="text-[14px] font-semibold text-[#F4F8FC]">
                    Explainability & retinal evidence
                  </h2>

                  <p className="mt-0.5 text-[9px] text-[#929fa3]">
                    Independent evidence supporting the screening output
                  </p>

                </div>

              </div>

            </div>

            {quality?.original_path ? (
              <div className="p-4">
                <GradCamViewer
                  originalImageUrl={mediaUrl(quality.original_path)}
                  gradcamUrl={pred?.gradcam_path ? mediaUrl(pred.gradcam_path) : null}
                  heatmapUrl={pred?.gradcam_heatmap_path ? mediaUrl(pred.gradcam_heatmap_path) : null}
                  targetClass={pred?.predicted_grade}
                  targetClassLabel={pred?.grade_label}
                  targetLayer={pred?.gradcam_target_layer || "backbone.features.8.0"}
                  isGenerating={analyzeMutation.isPending}
                />
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center bg-[#101F30] px-6 text-center">

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#102436]">

                  <Eye className="h-5 w-5 text-[#4b8784]" />

                </div>

                <p className="mt-4 text-[11px] font-semibold text-[#526a71]">
                  Explainability map unavailable
                </p>

                <p className="mt-1 max-w-[300px] text-[9px] leading-4 text-[#96a2a6]">
                  A Grad-CAM evidence map will appear when an image is uploaded and analyzed.
                </p>

              </div>
            )}

            {lesionSummary && (
              <div className="border-t border-white/10 p-4">
                <LesionViewer
                  originalUrl={quality?.original_path ? mediaUrl(quality.original_path) : null}
                  maskUrl={pred?.lesion_mask_path ? mediaUrl(pred.lesion_mask_path) : (pred?.gradcam_path ? mediaUrl(pred.gradcam_path) : null)}
                  lesionSummary={lesionSummary}
                />
              </div>
            )}

          </section>

          {/* WHY THIS DECISION */}
          {assurance.reasons?.length > 0 && (
            <section className="rounded-[24px] border border-white/10 bg-[#101F30] p-6 shadow-[0_10px_30px_rgba(38,69,80,0.04)]">

              <div className="flex items-center gap-2">

                <ShieldCheck className="h-4 w-4 text-[#3f7f7d]" />

                <h2 className="text-[13px] font-semibold text-[#F4F8FC]">
                  Why this assurance decision
                </h2>

              </div>

              <div className="mt-5 space-y-2.5">

                {assurance.reasons.map(
                  (
                    reason: string,
                    index: number
                  ) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-xl bg-[#f5f9f8] px-4 py-3"
                    >

                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4b8882]" />

                      <p className="text-[10px] leading-5 text-[#60767c]">
                        {reason}
                      </p>

                    </div>
                  )
                )}

              </div>

            </section>
          )}

          {/* RECOMMENDATION */}
          {displayRecommendation?.action && (
            <section className="rounded-[24px] border border-white/10 bg-[#f3f8f7] p-6">

              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#658489]">
                Recommended Clinical Pathway
              </p>

              <p className="mt-3 text-[14px] font-semibold text-[#F4F8FC]">
                {String(
                  displayRecommendation.clinical_pathway||
                    "Clinical Review"
                ).replaceAll("_", " ")}
              </p>

              <p className="mt-2 text-[10px] leading-5 text-[#6d8187]">
                {displayRecommendation.action}
              </p>

            </section>
          )}

        </div>

      </section>

      {/* EXISTING DOCTOR REVIEW */}
      {doctorReview && (
        <section className="rounded-[24px] border border-white/10 bg-[#101F30] p-6">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102436]">

              <Stethoscope className="h-4 w-4 text-[#3e7d7d]" />

            </div>

            <div>

              <p className="text-[13px] font-semibold text-[#F4F8FC]">
                Ophthalmologist review completed
              </p>

              <p className="mt-1 text-[9px] text-[#9AAFC1]">
                Clinical assessment stored separately from the screening model.
              </p>

            </div>

          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">

            <InfoBox
              label="Doctor Grade"
              value={
                doctorReview.doctor_grade != null
                  ? `Grade ${doctorReview.doctor_grade}`
                  : "—"
              }
            />

            <InfoBox
              label="AI Grade Accepted"
              value={
                doctorReview.ai_grade_accepted === true
                  ? "Yes"
                  : doctorReview.ai_grade_accepted === false
                  ? "No"
                  : "—"
              }
            />

            <InfoBox
              label="Grade Modified"
              value={
                doctorReview.ai_grade_modified
                  ? "Yes"
                  : "No"
              }
            />

          </div>

          {doctorReview.doctor_notes && (
            <div className="mt-4 rounded-xl bg-[#f6f9f8] p-4">

              <p className="text-[9px] font-semibold text-[#9AAFC1]">
                Clinical notes
              </p>

              <p className="mt-2 text-[10px] leading-5 text-[#566e75]">
                {doctorReview.doctor_notes}
              </p>

            </div>
          )}

        </section>
      )}

      {/* DOCTOR REVIEW FORM */}
      {!doctorReview &&
        pred && (
          <section className="rounded-[26px] border border-white/10 bg-[#101F30] p-6 shadow-[0_12px_34px_rgba(38,69,80,0.045)] lg:p-7">

            <div className="flex items-start gap-3">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#102436]">

                <Stethoscope className="h-5 w-5 text-[#397b7c]" />

              </div>

              <div>

                <h2 className="text-[15px] font-semibold text-[#F4F8FC]">
                  Ophthalmologist review
                </h2>

                <p className="mt-1 text-[10px] leading-5 text-[#849297]">
                  The clinician's assessment remains the authoritative record.
                </p>

              </div>

            </div>

            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2">

              <div>

                <label className="mb-3 block text-[10px] font-semibold text-[#536970]">
                  Clinical DR grade
                </label>

                <div className="grid grid-cols-5 gap-2">

                  {[0, 1, 2, 3, 4].map(
                    (grade) => (
                      <button
                        key={grade}
                        onClick={() =>
                          setDoctorGrade(
                            grade
                          )
                        }
                        className={cn(
                          "h-11 rounded-xl border text-[12px] font-bold transition",
                          doctorGrade ===
                            grade
                            ? cn(
                                DR_GRADE_BG[
                                  grade
                                ],
                                DR_GRADE_COLORS[
                                  grade
                                ]
                              )
                            : "border-white/10 bg-[#101F30] text-[#9AAFC1] hover:border-[#a9c8c6]"
                        )}
                      >
                        {grade}
                      </button>
                    )
                  )}

                </div>

                {doctorGrade !== null && (
                  <p className="mt-2 text-[10px] font-medium text-[#687d82]">
                    {
                      DR_GRADE_LABELS[
                        doctorGrade
                      ]
                    }
                  </p>
                )}

              </div>

              <div>

                <label className="mb-3 block text-[10px] font-semibold text-[#536970]">
                  Does clinical assessment agree with AI grade?
                </label>

                <div className="grid grid-cols-2 gap-2">

                  <button
                    onClick={() =>
                      setAiAccepted(true)
                    }
                    className={cn(
                      "h-11 rounded-xl border text-[11px] font-semibold transition",
                      aiAccepted
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 bg-[#101F30] text-[#9AAFC1]"
                    )}
                  >
                    Agree
                  </button>

                  <button
                    onClick={() =>
                      setAiAccepted(false)
                    }
                    className={cn(
                      "h-11 rounded-xl border text-[11px] font-semibold transition",
                      !aiAccepted
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        : "border-white/10 bg-[#101F30] text-[#9AAFC1]"
                    )}
                  >
                    Disagree
                  </button>

                </div>

              </div>

            </div>

            {/* Heatmap Usefulness */}
            <div className="mt-5">
              <label className="mb-2 block text-[10px] font-semibold text-[#536970]">
                Grad-CAM Heatmap Clinical Value
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["HIGHLY_USEFUL", "Highly Useful"],
                  ["MODERATELY_USEFUL", "Moderately Useful"],
                  ["MISLEADING", "Misleading"],
                  ["NOT_USEFUL", "Not Useful"],
                ].map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setHeatmapUsefulness(code)}
                    className={cn(
                      "h-9 rounded-xl border text-[10px] font-medium transition",
                      heatmapUsefulness === code
                        ? "border-[#3b7f83] bg-[#102436] text-[#28575a] font-semibold"
                        : "border-white/10 bg-[#101F30] text-[#9AAFC1] hover:border-[#a9c8c6]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Assessment Agreement */}
            <div className="mt-5">
              <label className="mb-2 block text-[10px] font-semibold text-[#536970]">
                Quality Gate Agreement
              </label>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#526a71]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="qualityAgreed"
                    checked={qualityAgreed === true}
                    onChange={() => setQualityAgreed(true)}
                    className="accent-[#3b7f83]"
                  />
                  <span>Agree with AI Quality ({quality?.is_gradable ? "Gradable" : "Recapture Required"})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="qualityAgreed"
                    checked={qualityAgreed === false}
                    onChange={() => setQualityAgreed(false)}
                    className="accent-[#ad504c]"
                  />
                  <span>Disagree with AI Quality Assessment</span>
                </label>
              </div>
            </div>

            {/* Disagreement Reasons (if AI Disagreed) */}
            {!aiAccepted && (
              <div className="mt-5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <p className="text-[11px] font-semibold text-amber-800 mb-2">
                  Clinical Rationale for AI Disagreement
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#526a71]">
                  {[
                    ["MISIDENTIFIED_VESSELS", "Retinal vessels misidentified as hemorrhages"],
                    ["ARTIFACT_CONFUSED_AS_LESION", "Lens artifact or dust confused as pathology"],
                    ["OVERLOOKED_PERIPHERAL_HEMORRHAGES", "Overlooked peripheral hemorrhages"],
                    ["SUBTLE_MICROANEURYSM_MISSED", "Subtle microaneurysms missed"],
                    ["MILD_EDEMA_UNNOTICED", "Macular edema / exudates unnoticed"],
                    ["CAMERA_BLUR_MISINTERPRETED", "Camera defocus blur misinterpreted"],
                  ].map(([reasonCode, label]) => {
                    const checked = disagreementReasons.includes(reasonCode)
                    return (
                      <label key={reasonCode} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDisagreementReasons([...disagreementReasons, reasonCode])
                            } else {
                              setDisagreementReasons(disagreementReasons.filter((r) => r !== reasonCode))
                            }
                          }}
                          className="rounded accent-[#3b7f83]"
                        />
                        <span className="text-[11px] text-slate-700">{label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-6">

              <label className="mb-2 block text-[10px] font-semibold text-[#536970]">
                Clinical notes
              </label>

              <textarea
                value={doctorNotes}
                onChange={(e) =>
                  setDoctorNotes(
                    e.target.value
                  )
                }
                rows={4}
                placeholder="Document clinical observations or referral recommendations..."
                className="w-full resize-none rounded-xl border border-white/10 bg-[#101F30] px-4 py-3 text-[11px] text-[#F4F8FC] outline-none transition placeholder:text-[#5A7184] focus:border-[#548c89] focus:bg-[#101F30] focus:ring-4 focus:ring-[#548c89]/10"
              />

            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">

              <button
                onClick={() =>
                  reviewMutation.mutate()
                }
                disabled={
                  doctorGrade === null ||
                  reviewMutation.isPending
                }
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#173f56] px-6 text-[11px] font-semibold text-white transition hover:bg-[#102f42] disabled:opacity-45"
              >

                {reviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}

                Submit clinical review

              </button>

              <button
                onClick={() =>
                  recaptureMutation.mutate()
                }
                disabled={
                  recaptureMutation.isPending
                }
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 text-[11px] font-semibold text-amber-400 transition hover:bg-amber-500/10"
              >

                {recaptureMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}

                Request recapture

              </button>

            </div>

          </section>
        )}

      {/* SMART REFERRAL & FOLLOW-UP CARD */}
      <section className="rounded-[26px] border border-white/10 bg-[#101F30] p-6 shadow-[0_12px_34px_rgba(38,69,80,0.045)] lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#102436]">
              <Send className="h-5 w-5 text-[#397b7c]" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#F4F8FC]">
                Smart Referral & Facility Follow-Up
              </h2>
              <p className="mt-1 text-[10px] leading-5 text-[#849297]">
                Connect rural screening patient to district hospital or ophthalmology centre
              </p>
            </div>
          </div>
          {referralData && (
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-[10px] font-mono font-semibold text-cyan-800">
              STATUS: {referralData.status}
            </span>
          )}
        </div>

        {referralSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{referralSuccessMsg}</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-[#536970]">
              Referred Healthcare Facility
            </label>
            <input
              type="text"
              value={referralFacility}
              onChange={(e) => setReferralFacility(e.target.value)}
              placeholder="e.g. Varanasi District Eye Hospital"
              className="w-full rounded-xl border border-white/10 bg-[#101F30] px-3.5 py-2.5 text-xs text-[#F4F8FC] outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-[#536970]">
              Referral Urgency Level
            </label>
            <select
              value={referralUrgency}
              onChange={(e) => setReferralUrgency(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#101F30] px-3.5 py-2.5 text-xs text-[#F4F8FC] outline-none"
            >
              <option value="CRITICAL">CRITICAL (&lt; 24-48 Hours)</option>
              <option value="HIGH">HIGH (Within 1-2 Weeks)</option>
              <option value="MEDIUM">MEDIUM (Within 1 Month)</option>
              <option value="LOW">LOW (Routine 6-12 Months)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-[#536970]">
              Appointment Date
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#101F30] px-3.5 py-2.5 text-xs text-[#F4F8FC] outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold text-[#536970]">
              Follow-Up Recall Date
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#101F30] px-3.5 py-2.5 text-xs text-[#F4F8FC] outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[10px] font-semibold text-[#536970]">
            Referral Clinical Notes
          </label>
          <textarea
            value={referralNotes}
            onChange={(e) => setReferralNotes(e.target.value)}
            rows={2}
            placeholder="Include patient contact, tele-consultation requests, or specialized examination notes..."
            className="w-full rounded-xl border border-white/10 bg-[#101F30] px-3.5 py-2 text-xs text-[#F4F8FC] outline-none"
          />
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => referralMutation.mutate()}
            disabled={referralMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-[#173f56] px-5 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-[#102f42] disabled:opacity-50"
          >
            {referralMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {referralData ? "Update Referral" : "Schedule Referral"}
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <section className="flex flex-col items-center justify-center gap-2 border-t border-white/10 pt-6 text-center">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-[#397b7c]" />
          <p className="text-[10px] font-semibold text-[#48636b]">
            DRISHTI-X — Explainable AI Screening Module
          </p>
        </div>
        <p className="max-w-[720px] text-[9px] leading-relaxed text-[#9AAFC1]">
          DRISHTI-X provides AI-assisted diabetic retinopathy screening support only. This result is not a definitive diagnosis and must be reviewed by a qualified eye-care professional. Model predictions and heatmaps may be incorrect. Unsuitable images may require recapture. Clinical decisions must not be based solely on this AI output.
        </p>
      </section>

    </div>
  )
}

function EvidenceStage({
  number,
  icon: Icon,
  title,
  status,
  complete,
}: {
  number: string
  icon: LucideIcon
  title: string
  status: string
  complete: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101F30] p-4">

      <div className="flex items-center justify-between">

        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            complete
              ? "bg-[#102436]"
              : "bg-[#102436]"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              complete
                ? "text-[#3e7f7e]"
                : "text-[#5A7184]"
            )}
          />
        </div>

        <span className="text-[8px] font-bold tracking-[0.15em] text-[#acb7ba]">
          {number}
        </span>

      </div>

      <p className="mt-4 text-[10px] font-semibold text-[#F4F8FC]">
        {title}
      </p>

      <p
        className={cn(
          "mt-1 truncate text-[8px] font-medium",
          complete
            ? "text-[#5e8383]"
            : "text-[#5A7184]"
        )}
      >
        {status}
      </p>

    </div>
  )
}

function LesionMetric({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#101F30] p-3 text-center">

      <p className="text-[18px] font-semibold text-[#F4F8FC]">
        {value}
      </p>

      <p className="mt-1 text-[8px] leading-3 text-[#9AAFC1]">
        {label}
      </p>

    </div>
  )
}

function InfoBox({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#101F30] p-4">

      <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#96a2a6]">
        {label}
      </p>

      <p className="mt-2 text-[11px] font-semibold text-[#3d5961]">
        {value}
      </p>

    </div>
  )
}