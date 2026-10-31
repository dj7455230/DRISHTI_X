"use client"

import React, { useState, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
// framer-motion imports removed

import { screeningsApi } from "@/lib/api"
import {
  formatDate,
  DR_GRADE_LABELS,
  formatConfidence,
} from "@/lib/utils"

import {
  Brain,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  Sliders,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  FileText,
  Stethoscope,
  Cuboid,
  Sparkles,
  Camera,
  Activity,
  ChevronDown,
  Columns,
  SplitSquareVertical,
  Check,
} from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function AnalysisWorkspaceContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedId = searchParams.get("id")

  // Fetch list of screenings with images
  const { data: screeningsList, isLoading: isListLoading } = useQuery({
    queryKey: ["screenings-list-analysis"],
    queryFn: () => screeningsApi.list({ limit: 30 }).then((r) => r.data),
  })

  // Determine active screening ID
  const activeScreeningId = useMemo(() => {
    if (requestedId) return requestedId
    if (screeningsList && screeningsList.length > 0) {
      // Find first analyzed or imaged screening
      const withImage = screeningsList.find(
        (s: any) => s.status === "ANALYZED" || s.status === "HUMAN_REVIEW_REQUIRED" || s.status === "COMPLETED"
      )
      return withImage ? withImage.id : screeningsList[0].id
    }
    return null
  }, [requestedId, screeningsList])

  // Fetch active screening details
  const {
    data: screening,
    isLoading: isScreeningLoading,
    error: screeningError,
  } = useQuery({
    queryKey: ["screening-detail", activeScreeningId],
    queryFn: () => screeningsApi.get(activeScreeningId).then((r) => r.data),
    enabled: !!activeScreeningId,
  })

  // State controls for canvas & visualization layers
  const [zoom, setZoom] = useState<number>(1)
  const [rotation, setRotation] = useState<number>(0)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Visualization View Mode
  const [viewMode, setViewMode] = useState<"overlay" | "split" | "compare">("overlay")
  const [sliderPosition, setSliderPosition] = useState<number>(50)

  // Layer Toggles
  const [showOriginal, setShowOriginal] = useState<boolean>(true)
  const [showGradCam, setShowGradCam] = useState<boolean>(true)
  const [gradCamOpacity, setGradCamOpacity] = useState<number>(65)
  const [showLesionMask, setShowLesionMask] = useState<boolean>(true)
  const [lesionMaskOpacity, setLesionMaskOpacity] = useState<number>(75)
  const [showEnhanced, setShowEnhanced] = useState<boolean>(false)

  // Individual Lesion Sub-layers
  const [showMicroaneurysms, setShowMicroaneurysms] = useState<boolean>(true)
  const [showHemorrhages, setShowHemorrhages] = useState<boolean>(true)
  const [showExudates, setShowExudates] = useState<boolean>(true)

  // Image URLs derived from screening
  const fundus = screening?.fundus_image
  const prediction = screening?.prediction
  const patient = screening?.patient

  const originalUrl = fundus?.original_path
    ? `${API_BASE}/${fundus.original_path}`
    : null
  const enhancedUrl = fundus?.enhanced_path
    ? `${API_BASE}/${fundus.enhanced_path}`
    : null
  const gradcamUrl = prediction?.gradcam_path
    ? `${API_BASE}/${prediction.gradcam_path}`
    : null
  const lesionMaskUrl = prediction?.lesion_mask_path
    ? `${API_BASE}/${prediction.lesion_mask_path}`
    : null

  const predictedGrade = prediction?.predicted_grade ?? null
  const gradeLabel = predictedGrade !== null ? DR_GRADE_LABELS[predictedGrade] : "Pending Analysis"
  const confidence = prediction?.confidence ?? null
  const lesionSummary = prediction?.lesion_summary ?? {}

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleResetCanvas = () => {
    setZoom(1)
    setRotation(0)
    setPan({ x: 0, y: 0 })
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }

  const handleScreeningChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value
    if (selected) {
      router.push(`/analysis?id=${selected}`)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* WORKSPACE HEADER & SCREENING SELECTOR */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Retinal Microvasculature <span className="gradient-text-cyan">Analysis Workspace</span>
              </h1>
              <p className="text-xs text-[#9AAFC1]">
                High-resolution fundus inspection, multi-layer AI evidence synthesis, and model attribution
              </p>
            </div>
          </div>
        </div>

        {/* Screening Selector Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={activeScreeningId || ""}
              onChange={handleScreeningChange}
              disabled={isListLoading}
              className="appearance-none pl-3 pr-9 py-2 rounded-xl bg-[#101F30] border border-white/10 text-xs font-medium text-[#F4F8FC] hover:border-[#39D9D0]/40 focus:outline-none focus:border-[#39D9D0] cursor-pointer"
            >
              {isListLoading ? (
                <option>Loading clinical cases...</option>
              ) : (screeningsList || []).length === 0 ? (
                <option>No screenings recorded</option>
              ) : (
                (screeningsList || []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.patient_code || "DX-CASE"} · {s.eye_side || "OD"} · {formatDate(s.created_at)}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-[#9AAFC1] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          <Link
            href="/screenings/new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#39D9D0] text-[#07111F] text-xs font-bold shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 transition active:scale-95"
          >
            New Screening
          </Link>
        </div>
      </div>

      {/* CLINICAL STATUS & EYE LATERALITY BANNER */}
      {screening && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Patient Info */}
          <div className="glass-card p-3 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#39D9D0]/10 text-[#39D9D0] font-mono text-xs font-bold">
              {patient?.patient_code?.slice(-4) || "PT"}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A7184] block">
                Patient Subject
              </span>
              <p className="text-xs font-bold text-white truncate">
                {patient?.name || patient?.patient_code || "Anonymous Patient"}
              </p>
              <p className="text-[10px] text-[#9AAFC1]">
                Age: {patient?.age ?? "—"} · {patient?.diabetes_type || "Type 2"}
              </p>
            </div>
          </div>

          {/* Eye Laterality */}
          <div className="glass-card p-3 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7C8CFF]/10 text-[#7C8CFF] font-mono text-xs font-bold">
              {screening.eye_side === "RIGHT" ? "OD" : "OS"}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A7184] block">
                Laterality Examined
              </span>
              <p className="text-xs font-bold text-white">
                {screening.eye_side === "RIGHT" ? "Oculus Dexter (Right Eye)" : "Oculus Sinister (Left Eye)"}
              </p>
              <p className="text-[10px] text-[#9AAFC1]">
                FOV: 45° Posterior Pole Centered
              </p>
            </div>
          </div>

          {/* DR Grade & Model Confidence */}
          <div className="glass-card p-3 rounded-xl border border-white/10 flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${
                predictedGrade !== null && predictedGrade >= 2
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              G{predictedGrade ?? "?"}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A7184] block">
                AI Classification
              </span>
              <p className="text-xs font-bold text-white truncate">
                {gradeLabel}
              </p>
              <p className="text-[10px] text-[#39D9D0]">
                Confidence: {formatConfidence(confidence)}
              </p>
            </div>
          </div>

          {/* Image Quality Gate Status */}
          <div className="glass-card p-3 rounded-xl border border-white/10 flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                fundus?.is_gradable
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              {fundus?.is_gradable ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A7184] block">
                Quality Gate
              </span>
              <p className="text-xs font-bold text-white">
                {fundus?.is_gradable ? "Gradable Fundus" : "Recapture Suggested"}
              </p>
              <p className="text-[10px] text-[#9AAFC1]">
                Focus Score: {fundus?.focus_score?.toFixed(0) ?? "80"}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE GRID: CANVAS + EVIDENCE SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: INTERACTIVE RETINAL IMAGE CANVAS */}
        <div className="lg:col-span-8 space-y-3">
          {/* Canvas Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-[#0B1726] border border-white/10">
            {/* View Mode Selector */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#07111F] border border-white/5">
              <button
                type="button"
                onClick={() => setViewMode("overlay")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  viewMode === "overlay"
                    ? "bg-[#39D9D0] text-[#07111F] shadow-[0_0_10px_rgba(57,217,208,0.3)]"
                    : "text-[#9AAFC1] hover:text-white"
                }`}
              >
                Multi-Layer Overlay
              </button>
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  viewMode === "split"
                    ? "bg-[#39D9D0] text-[#07111F] shadow-[0_0_10px_rgba(57,217,208,0.3)]"
                    : "text-[#9AAFC1] hover:text-white"
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                Side by Side
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compare")}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                  viewMode === "compare"
                    ? "bg-[#39D9D0] text-[#07111F] shadow-[0_0_10px_rgba(57,217,208,0.3)]"
                    : "text-[#9AAFC1] hover:text-white"
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                Curtain Slider
              </button>
            </div>

            {/* Canvas Zoom, Rotate, Reset Controls */}
            <div className="flex items-center gap-1 text-[#9AAFC1]">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))}
                disabled={zoom <= 1}
                className="p-1.5 hover:bg-white/5 hover:text-white disabled:opacity-40 rounded-lg transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-white min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                disabled={zoom >= 4}
                className="p-1.5 hover:bg-white/5 hover:text-white disabled:opacity-40 rounded-lg transition"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div className="w-px h-4 bg-white/10 mx-1" />

              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 hover:bg-white/5 hover:text-[#39D9D0] rounded-lg transition flex items-center gap-1 text-xs"
                title="Rotate image 90° clockwise"
              >
                <RotateCw className="w-4 h-4" />
                <span className="font-mono text-[10px]">{rotation}°</span>
              </button>

              <button
                type="button"
                onClick={handleResetCanvas}
                className="p-1.5 hover:bg-white/5 hover:text-[#39D9D0] rounded-lg transition"
                title="Reset zoom, rotation, and pan"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 hover:bg-white/5 hover:text-[#39D9D0] rounded-lg transition"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* VIEWPORT CANVAS */}
          <div
            className={`relative rounded-2xl border border-white/10 bg-[#040D1A] overflow-hidden flex items-center justify-center select-none ${
              isFullscreen ? "fixed inset-3 z-50 h-[calc(100vh-24px)] bg-[#040D1A]" : "h-[540px]"
            } ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {!originalUrl ? (
              <div className="text-center p-8 space-y-3">
                <Camera className="w-12 h-12 text-[#5A7184] mx-auto animate-pulse" />
                <h3 className="text-sm font-semibold text-white">No Fundus Image Available</h3>
                <p className="text-xs text-[#9AAFC1] max-w-sm">
                  Upload a high-resolution retinal fundus photograph to inspect microvasculature, lesion segmentation, and Grad-CAM attention.
                </p>
                <Link
                  href="/screenings/new"
                  className="inline-block mt-2 px-4 py-2 rounded-xl bg-[#39D9D0] text-[#07111F] text-xs font-bold"
                >
                  Initiate Screening
                </Link>
              </div>
            ) : viewMode === "split" ? (
              /* SIDE-BY-SIDE VIEW */
              <div className="grid grid-cols-2 w-full h-full divide-x divide-white/10">
                {/* Left: Original Fundus */}
                <div className="relative flex items-center justify-center p-2 overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                    Original Fundus
                  </div>
                  <img
                    src={originalUrl}
                    alt="Original Fundus"
                    className="max-h-full max-w-full object-contain pointer-events-none"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      transition: isDragging ? "none" : "transform 0.15s ease-out",
                    }}
                  />
                </div>

                {/* Right: AI Heatmap / Lesion Overlay */}
                <div className="relative flex items-center justify-center p-2 overflow-hidden">
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-[#39D9D0]">
                    AI Evidence Layer
                  </div>
                  <img
                    src={originalUrl}
                    alt="Base"
                    className="max-h-full max-w-full object-contain pointer-events-none opacity-40"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      transition: isDragging ? "none" : "transform 0.15s ease-out",
                    }}
                  />
                  {showGradCam && gradcamUrl && (
                    <img
                      src={gradcamUrl}
                      alt="Grad-CAM"
                      className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                      style={{
                        opacity: gradCamOpacity / 100,
                        transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      }}
                    />
                  )}
                  {showLesionMask && lesionMaskUrl && (
                    <img
                      src={lesionMaskUrl}
                      alt="Lesion Mask"
                      className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none mix-blend-screen"
                      style={{
                        opacity: lesionMaskOpacity / 100,
                        transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      }}
                    />
                  )}
                </div>
              </div>
            ) : viewMode === "compare" ? (
              /* CURTAIN / BEFORE-AFTER SLIDER */
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                {/* Background Layer: AI Composite */}
                <img
                  src={originalUrl}
                  alt="Original Base"
                  className="max-h-full max-w-full object-contain pointer-events-none opacity-50"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                  }}
                />
                {gradcamUrl && (
                  <img
                    src={gradcamUrl}
                    alt="Grad-CAM Composite"
                    className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                    style={{
                      opacity: 0.85,
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                    }}
                  />
                )}

                {/* Foreground Layer (Pure Fundus) clipped by slider */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${sliderPosition}%` }}
                >
                  <img
                    src={originalUrl}
                    alt="Pure Fundus"
                    className="w-full h-full object-contain pointer-events-none"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      width: "100%",
                      maxWidth: "none",
                    }}
                  />
                </div>

                {/* Slider divider line and thumb */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#39D9D0] shadow-[0_0_12px_#39D9D0] cursor-ew-resize z-20"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#39D9D0] text-[#07111F] flex items-center justify-center shadow-lg font-bold text-xs select-none">
                    ⇄
                  </div>
                </div>

                {/* Interactive Slider Input Overlay */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                  aria-label="Before/After comparison slider"
                />

                <div className="absolute bottom-3 left-4 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white pointer-events-none z-10">
                  Pure Fundus (Left)
                </div>
                <div className="absolute bottom-3 right-4 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-[#39D9D0] pointer-events-none z-10">
                  AI Overlay (Right)
                </div>
              </div>
            ) : (
              /* MULTI-LAYER COMPOSITE OVERLAY */
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                {/* Layer 1: Enhanced or Original Base Fundus */}
                {showOriginal && (
                  <img
                    src={showEnhanced && enhancedUrl ? enhancedUrl : originalUrl}
                    alt="Fundus Base Layer"
                    className="max-h-full max-w-full object-contain pointer-events-none"
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      transition: isDragging ? "none" : "transform 0.15s ease-out",
                    }}
                  />
                )}

                {/* Layer 2: Grad-CAM Activation Heatmap */}
                {showGradCam && gradcamUrl && (
                  <img
                    src={gradcamUrl}
                    alt="Grad-CAM Activation"
                    className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none"
                    style={{
                      opacity: gradCamOpacity / 100,
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      transition: isDragging ? "none" : "opacity 0.08s linear, transform 0.15s ease-out",
                    }}
                  />
                )}

                {/* Layer 3: U-Net Lesion Segmentation Overlay */}
                {showLesionMask && lesionMaskUrl && (
                  <img
                    src={lesionMaskUrl}
                    alt="Lesion Segmentation Overlay"
                    className="absolute inset-0 m-auto max-h-full max-w-full object-contain pointer-events-none mix-blend-screen"
                    style={{
                      opacity: lesionMaskOpacity / 100,
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${pan.x}px, ${pan.y}px)`,
                      transition: isDragging ? "none" : "opacity 0.08s linear, transform 0.15s ease-out",
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* LAYER CONTROLS DOCK */}
          <div className="p-4 rounded-xl bg-[#0B1726] border border-white/10 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#39D9D0]" />
                Independent AI Visualization Layers
              </span>
              <span className="text-[10px] text-[#5A7184] font-mono">
                {viewMode === "overlay" ? "Composite Mode" : "Comparison Mode"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              {/* Layer 1: Pure Fundus & Enhancement */}
              <div className="space-y-2 p-2.5 rounded-lg bg-[#101F30] border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOriginal}
                      onChange={(e) => setShowOriginal(e.target.checked)}
                      className="rounded bg-[#07111F] border-white/20 text-[#39D9D0] focus:ring-0"
                    />
                    Fundus Base
                  </label>
                  {enhancedUrl && (
                    <button
                      type="button"
                      onClick={() => setShowEnhanced(!showEnhanced)}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition ${
                        showEnhanced ? "bg-[#39D9D0] text-[#07111F] font-bold" : "bg-white/5 text-[#9AAFC1]"
                      }`}
                    >
                      {showEnhanced ? "CLAHE Active" : "CLAHE Off"}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#5A7184]">
                  True-color retinal photograph centered on posterior pole.
                </p>
              </div>

              {/* Layer 2: Grad-CAM Feature Attribution */}
              <div className="space-y-2 p-2.5 rounded-lg bg-[#101F30] border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#39D9D0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showGradCam}
                      onChange={(e) => setShowGradCam(e.target.checked)}
                      className="rounded bg-[#07111F] border-white/20 text-[#39D9D0] focus:ring-0"
                    />
                    Grad-CAM Heatmap
                  </label>
                  <span className="text-[10px] font-mono text-[#9AAFC1]">
                    {gradCamOpacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={gradCamOpacity}
                  onChange={(e) => setGradCamOpacity(Number(e.target.value))}
                  disabled={!showGradCam}
                  className="w-full accent-[#39D9D0] h-1.5 bg-[#07111F] rounded-lg cursor-pointer"
                  aria-label="Grad-CAM opacity slider"
                />
              </div>

              {/* Layer 3: Lesion Segmentation Mask */}
              <div className="space-y-2 p-2.5 rounded-lg bg-[#101F30] border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#7C8CFF] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLesionMask}
                      onChange={(e) => setShowLesionMask(e.target.checked)}
                      className="rounded bg-[#07111F] border-white/20 text-[#7C8CFF] focus:ring-0"
                    />
                    Lesion Masks
                  </label>
                  <span className="text-[10px] font-mono text-[#9AAFC1]">
                    {lesionMaskOpacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={lesionMaskOpacity}
                  onChange={(e) => setLesionMaskOpacity(Number(e.target.value))}
                  disabled={!showLesionMask}
                  className="w-full accent-[#7C8CFF] h-1.5 bg-[#07111F] rounded-lg cursor-pointer"
                  aria-label="Lesion mask opacity slider"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CLINICAL EVIDENCE, LESION BREAKDOWN, EXPLAINABLE AI */}
        <div className="lg:col-span-4 space-y-4">
          {/* LESION LEVEL DETECTION MATRIX */}
          <div className="glass-card p-4 rounded-xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                Detected Lesion Candidates
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#9AAFC1]">
                {lesionSummary?.provenance || "U-Net Segmenter"}
              </span>
            </div>

            <div className="space-y-2">
              {/* Microaneurysms */}
              <div className="p-2.5 rounded-lg bg-[#0B1726] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <div>
                    <p className="text-xs font-semibold text-white">Microaneurysms (MA)</p>
                    <p className="text-[9px] text-[#5A7184]">Early capillary micro-dilatations</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {lesionSummary?.microaneurysms?.count ?? 0}
                </span>
              </div>

              {/* Hemorrhages */}
              <div className="p-2.5 rounded-lg bg-[#0B1726] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                  <div>
                    <p className="text-xs font-semibold text-white">Retinal Hemorrhages</p>
                    <p className="text-[9px] text-[#5A7184]">Flame / dot-blot vascular leaks</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400">
                  {lesionSummary?.hemorrhages?.count ?? 0}
                </span>
              </div>

              {/* Hard Exudates */}
              <div className="p-2.5 rounded-lg bg-[#0B1726] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                  <div>
                    <p className="text-xs font-semibold text-white">Hard Exudates</p>
                    <p className="text-[9px] text-[#5A7184]">Lipid extravasation deposits</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {lesionSummary?.hard_exudates?.count ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* EXPLAINABLE AI ATTRIBUTION (GRAD-CAM TRUST PANEL) */}
          <div className="glass-card p-4 rounded-xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#39D9D0] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Grad-CAM Attention Map
              </span>
              <span className="text-[9px] font-mono text-[#5A7184]">
                backbone.features.8.0
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-[11px] text-[#9AAFC1] leading-relaxed">
                Visualizing neural attention gradients for target class <strong>Grade {predictedGrade ?? 0} ({gradeLabel})</strong>. Red regions represent high convolutional feature salience.
              </p>

              {/* Relative Activation Color Legend */}
              <div className="p-2 rounded-lg bg-[#0B1726] border border-white/5 space-y-1">
                <div className="flex justify-between text-[9px] text-[#5A7184]">
                  <span>0% (Low Attention)</span>
                  <span>100% (High Attention)</span>
                </div>
                <div
                  className="h-2.5 w-full rounded border border-white/20"
                  style={{
                    background:
                      "linear-gradient(to right, #000080, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000, #800000)",
                  }}
                />
              </div>

              <div className="flex items-start gap-1.5 pt-1 text-[9px] text-[#5A7184] leading-relaxed">
                <Info className="w-3.5 h-3.5 text-[#39D9D0] shrink-0 mt-0.5" />
                <span>
                  <strong>Clinical Notice:</strong> Grad-CAM highlights image regions influencing model classification. It is <em>not</em> a clinically validated lesion segmentation mask.
                </span>
              </div>
            </div>
          </div>

          {/* ACTION SHORTCUTS */}
          <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#5A7184] block mb-2">
              Clinical Actions
            </span>

            {screening?.id && (
              <a
                href={`/api/screenings/${screening.id}/report/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#102436] hover:bg-[#15273D] border border-[#39D9D0]/30 text-xs font-semibold text-[#39D9D0] transition"
              >
                <FileText className="w-3.5 h-3.5" />
                Download Diagnostic PDF Report
              </a>
            )}

            <Link
              href="/eye-explorer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#101F30] hover:bg-[#15273D] border border-[#7C8CFF]/30 text-xs font-semibold text-[#7C8CFF] transition"
            >
              <Cuboid className="w-3.5 h-3.5" />
              Correlate with 3D Eye Anatomy
            </Link>

            <Link
              href="/review"
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0B1726] hover:bg-[#101F30] border border-white/10 text-xs font-medium text-[#9AAFC1] transition"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              Doctor Feedback & Review Form
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AnalysisWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[500px] items-center justify-center text-xs text-[#39D9D0]">
          <Activity className="w-5 h-5 animate-spin mr-2" />
          Initializing Retinal Analysis Workspace...
        </div>
      }
    >
      <AnalysisWorkspaceContent />
    </Suspense>
  )
}
