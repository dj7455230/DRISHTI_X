"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Cpu,
  Layers,
  Activity,
  Eye,
  ShieldCheck,
  X,
  RefreshCw,
} from "lucide-react"
import { screeningsApi } from "@/lib/api"

interface StageItem {
  index: number
  stage: string
  name: string
  progress: number
}

interface JobStatusData {
  job_id: string | null
  screening_id: string
  status: string
  stage: string
  stage_index: number
  stage_name: string
  progress_percent: number
  engine: string
  elapsed_seconds: number
  is_completed: boolean
  is_failed: boolean
  error_message?: string
  all_stages: StageItem[]
}

interface LiveAnalysisModalProps {
  isOpen: boolean
  screeningId: string
  onClose: () => void
  onComplete?: () => void
}

export function LiveAnalysisModal({
  isOpen,
  screeningId,
  onClose,
  onComplete,
}: LiveAnalysisModalProps) {
  const [data, setData] = useState<JobStatusData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !screeningId) return

    let isSubscribed = true

    const fetchStatus = async () => {
      try {
        const res = await screeningsApi.jobStatus(screeningId)
        if (isSubscribed) {
          setData(res.data)
          setLoading(false)
          if (res.data.is_completed) {
            if (onComplete) onComplete()
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err?.response?.data?.message || "Failed to poll analysis job status.")
          setLoading(false)
        }
      }
    }

    fetchStatus()
    const timer = setInterval(() => {
      if (data?.is_completed || data?.is_failed) return
      fetchStatus()
    }, 1500)

    return () => {
      isSubscribed = false
      clearInterval(timer)
    }
  }, [isOpen, screeningId, data?.is_completed, data?.is_failed])

  if (!isOpen) return null

  const stages: StageItem[] = data?.all_stages || [
    { index: 1, stage: "IMAGE_UPLOADING", name: "Image Uploading", progress: 10 },
    { index: 2, stage: "IMAGE_VALIDATION", name: "Image Validation", progress: 20 },
    { index: 3, stage: "QUALITY_ASSESSMENT", name: "Optical Quality Gate", progress: 30 },
    { index: 4, stage: "PREPROCESSING", name: "Ben Graham CLAHE Prep", progress: 40 },
    { index: 5, stage: "MODEL_LOADING", name: "Neural Checkpoint Load", progress: 50 },
    { index: 6, stage: "CLASSIFICATION_INFERENCE", name: "EfficientNet Inference", progress: 60 },
    { index: 7, stage: "CONFIDENCE_CALIBRATION", name: "Temperature Scaling", progress: 70 },
    { index: 8, stage: "GRADCAM_GENERATION", name: "Grad-CAM Heatmap", progress: 80 },
    { index: 9, stage: "LESION_SEGMENTATION", name: "U-Net Lesion Segmentation", progress: 85 },
    { index: 10, stage: "CLINICAL_ASSURANCE", name: "Clinical Assurance Safety", progress: 95 },
    { index: 11, stage: "RESULT_READY", name: "Diagnostic Result Ready", progress: 100 },
  ]

  const currentIdx = data?.stage_index || 1
  const progressPercent = data?.progress_percent || 10.0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        className="w-full max-w-2xl bg-[#0B1726] border border-[#1E3A5F] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E3A5F] bg-[#101F30]/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-wide">
                Live Retinal Neural Pipeline
              </h3>
              <p className="text-xs text-slate-400">
                Screening Case ID: {screeningId.slice(0, 8)}... | Engine:{" "}
                <span className="text-[#39D9D0] font-mono">{data?.engine || "PYTHON_EFFICIENTNET"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Progress Bar & Summary */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-medium">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#39D9D0]" />
                Elapsed: {data?.elapsed_seconds ? `${data.elapsed_seconds.toFixed(1)}s` : "0.0s"}
              </span>
              <span className="text-[#39D9D0] font-mono font-bold text-sm">
                {progressPercent.toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
              <motion.div
                className="h-full bg-gradient-to-r from-[#39D9D0] via-[#7C8CFF] to-[#39D9D0]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* 11 Stages Timeline */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Diagnostic Execution Stages (1–11)
            </h4>
            <div className="space-y-2">
              {stages.map((st) => {
                const isPassed = currentIdx > st.index || data?.is_completed
                const isCurrent = currentIdx === st.index && !data?.is_completed && !data?.is_failed
                const isPending = currentIdx < st.index && !data?.is_completed

                return (
                  <div
                    key={st.stage}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs transition-all border ${
                      isCurrent
                        ? "bg-[#39D9D0]/10 border-[#39D9D0]/40 text-white font-medium"
                        : isPassed
                        ? "bg-slate-900/60 border-slate-800/80 text-slate-300"
                        : "bg-transparent border-transparent text-slate-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-5 text-center font-mono text-[11px] text-slate-400">
                        {st.index}.
                      </div>
                      <div className="flex items-center gap-2">
                        {isPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isCurrent ? (
                          <RefreshCw className="w-4 h-4 text-[#39D9D0] animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-600" />
                        )}
                        <span>{st.name}</span>
                      </div>
                    </div>
                    <div className="text-[11px] font-mono">
                      {isPassed ? (
                        <span className="text-emerald-400">DONE</span>
                      ) : isCurrent ? (
                        <span className="text-[#39D9D0] font-bold">RUNNING</span>
                      ) : (
                        <span className="text-slate-600">QUEUED</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Governance Notice */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#39D9D0] shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-200 font-medium">Deterministic Safety Engine:</span>{" "}
              AI predictions, Grad-CAM heatmaps, and lesion counts are assistive screening inputs.
              Autonomous diagnosis is disabled; all clinical recommendations must be validated by an
              ophthalmologist.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#1E3A5F] bg-[#101F30]/60">
          <div className="text-xs text-slate-400">
            Status:{" "}
            <span
              className={`font-semibold ${
                data?.is_completed
                  ? "text-emerald-400"
                  : data?.is_failed
                  ? "text-red-400"
                  : "text-[#39D9D0]"
              }`}
            >
              {data?.status || "INITIALIZING"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#101F30] border border-[#1E3A5F] hover:bg-[#1E3A5F] text-slate-200 transition-colors"
          >
            {data?.is_completed ? "View Complete Results" : "Run in Background"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
