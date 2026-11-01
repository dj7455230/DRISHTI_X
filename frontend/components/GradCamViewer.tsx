"use client"

import React, { useState } from "react"
import {
  Eye,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Layers,
  Columns,
  AlertCircle,
  Loader2,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SafeImage } from "@/components/SafeImage"

interface GradCamViewerProps {
  originalImageUrl: string
  gradcamUrl?: string | null
  heatmapUrl?: string | null
  targetClass?: number | null
  targetClassLabel?: string | null
  targetLayer?: string | null
  isGenerating?: boolean
  error?: string | null
}

export function GradCamViewer({
  originalImageUrl,
  gradcamUrl,
  heatmapUrl,
  targetClass,
  targetClassLabel,
  targetLayer = "backbone.features.8.0",
  isGenerating = false,
  error = null,
}: GradCamViewerProps) {
  const [opacity, setOpacity] = useState<number>(50)
  const [zoom, setZoom] = useState<number>(1)
  const [viewMode, setViewMode] = useState<"side-by-side" | "blend" | "overlay-only">("side-by-side")
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, Number((prev + 0.25).toFixed(2))))
  const handleZoomOut = () => setZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))
  const handleResetZoom = () => setZoom(1)

  if (isGenerating) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0c242e] p-8 text-center text-white">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 shadow-lg">
          <Loader2 className="h-8 w-8 animate-spin text-[#38bdf8]" />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-white">
          Computing Grad-CAM Feature Attribution...
        </p>
        <p className="mt-1 max-w-[360px] text-[11px] leading-relaxed text-white/60">
          Capturing forward activations and backpropagating target class gradients through {targetLayer}.
        </p>
      </div>
    )
  }

  if (error || (!gradcamUrl && !originalImageUrl)) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0e2732] p-8 text-center text-white">
        <AlertCircle className="h-10 w-10 text-[#f59e0b]" />
        <p className="mt-3 text-[13px] font-semibold text-white">
          Grad-CAM Explanation Unavailable
        </p>
        <p className="mt-1 max-w-[380px] text-[11px] leading-relaxed text-white/60">
          {error || "An explanation map will be generated once model inference is executed on a valid fundus image."}
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-[#0a1e27] text-white shadow-xl transition-all",
        isFullscreen && "fixed inset-4 z-50 overflow-auto bg-[#07161d] p-4 shadow-2xl"
      )}
    >
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d2631] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#38bdf8]/15 text-[#38bdf8]">
            <Eye className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[11px] font-semibold tracking-wide text-white">
              Visual Explanation
            </span>
            <span className="ml-2 font-mono text-[9px] text-[#38bdf8]/80">
              Grad-CAM (CNN Feature Attribution)
            </span>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap items-center gap-3">
          {/* VIEW MODE SELECTOR */}
          <div className="flex items-center rounded-lg border border-white/10 bg-black/30 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("side-by-side")}
              aria-label="Side-by-side View"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition",
                viewMode === "side-by-side"
                  ? "bg-[#38bdf8] text-[#07161d] shadow-sm font-semibold"
                  : "text-white/70 hover:text-white"
              )}
            >
              <Columns className="h-3 w-3" />
              Side by Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode("blend")}
              aria-label="Interactive Blend View"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition",
                viewMode === "blend"
                  ? "bg-[#38bdf8] text-[#07161d] shadow-sm font-semibold"
                  : "text-white/70 hover:text-white"
              )}
            >
              <Sliders className="h-3 w-3" />
              Interactive Blend
            </button>
            <button
              type="button"
              onClick={() => setViewMode("overlay-only")}
              aria-label="Overlay Only View"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition",
                viewMode === "overlay-only"
                  ? "bg-[#38bdf8] text-[#07161d] shadow-sm font-semibold"
                  : "text-white/70 hover:text-white"
              )}
            >
              <Layers className="h-3 w-3" />
              Heatmap
            </button>
          </div>

          {/* ZOOM CONTROLS */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-1 py-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              aria-label="Zoom Out"
              className="rounded p-1 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[32px] text-center font-mono text-[10px] text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              aria-label="Zoom In"
              className="rounded p-1 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                aria-label="Reset Zoom"
                className="rounded p-1 text-white/50 transition hover:text-white"
                title="Reset Zoom"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* FULLSCREEN TOGGLE */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-white/70 transition hover:bg-white/10 hover:text-white"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* OPACITY SLIDER BAR (Always visible or in blend/side-by-side) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-[#091b23] px-5 py-2.5 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
            <Sliders className="h-3 w-3 text-[#38bdf8]" />
            Overlay Opacity:
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label="Grad-CAM Overlay Opacity"
              className="h-1.5 w-32 cursor-pointer appearance-none rounded-lg bg-white/20 accent-[#38bdf8] focus:outline-none focus:ring-1 focus:ring-[#38bdf8]"
            />
            <span className="min-w-[34px] font-mono text-[10px] font-semibold text-[#38bdf8]">
              {opacity}%
            </span>
          </div>
        </div>

        {/* METADATA CHIPS */}
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {targetClass !== null && targetClass !== undefined && (
            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-white/80">
              Explaining: <strong className="text-[#38bdf8]">Grade {targetClass}</strong>{" "}
              {targetClassLabel && `(${targetClassLabel})`}
            </span>
          )}
          {targetLayer && (
            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[9px] text-white/60">
              Layer: {targetLayer}
            </span>
          )}
        </div>
      </div>

      {/* IMAGE DISPLAY CANVAS */}
      <div className="relative overflow-hidden bg-[#051117] p-5">
        {viewMode === "side-by-side" && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* LEFT: ORIGINAL FUNDUS */}
            <div className="flex flex-col items-center">
              <div className="mb-2 flex w-full items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                  Original Retinal Fundus
                </span>
                <span className="text-[9px] text-white/40">Reference image</span>
              </div>
              <div className="relative flex aspect-square w-full max-w-[480px] items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/40">
                <SafeImage
                  src={originalImageUrl}
                  alt="Original Retinal Fundus"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: "transform 0.15s ease-out",
                  }}
                  className="max-h-full max-w-full select-none object-contain"
                  fallbackTitle="Retinal Fundus Unavailable"
                />
              </div>
              <p className="mt-2 text-center text-[9px] text-white/50">
                Unmodified fundus photograph as captured
              </p>
            </div>

            {/* RIGHT: GRAD-CAM OVERLAY WITH OPACITY */}
            <div className="flex flex-col items-center">
              <div className="mb-2 flex w-full items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#38bdf8]">
                  Grad-CAM Heatmap Overlay
                </span>
                <span className="font-mono text-[9px] text-[#38bdf8]/70">
                  Blend: {opacity}%
                </span>
              </div>
              <div className="relative flex aspect-square w-full max-w-[480px] items-center justify-center overflow-hidden rounded-xl border border-[#38bdf8]/30 bg-black/40">
                {/* Base original image */}
                <SafeImage
                  src={originalImageUrl}
                  alt="Original fundus base"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: "transform 0.15s ease-out",
                  }}
                  className="max-h-full max-w-full select-none object-contain"
                  fallbackTitle="Fundus Base Layer Unavailable"
                />
                {/* Heatmap overlay image blended on top via dynamic opacity */}
                {gradcamUrl && (
                  <SafeImage
                    src={gradcamUrl}
                    alt="Grad-CAM Heatmap Overlay"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "center center",
                      opacity: opacity / 100,
                      transition: "opacity 0.1s linear, transform 0.15s ease-out",
                    }}
                    className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
                    fallbackTitle="Heatmap Overlay Pending"
                  />
                )}
              </div>
              <p className="mt-2 text-center text-[9px] text-[#38bdf8]/70">
                Relative model activation superimposed on retinal structures
              </p>
            </div>
          </div>
        )}

        {viewMode === "blend" && (
          <div className="mx-auto flex max-w-[560px] flex-col items-center">
            <div className="mb-2 flex w-full items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#38bdf8]">
                Interactive Blended View
              </span>
              <span className="font-mono text-[9px] text-[#38bdf8]/80">
                Heatmap Opacity: {opacity}%
              </span>
            </div>
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-black/50">
              <SafeImage
                src={originalImageUrl}
                alt="Original Fundus base"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }}
                className="max-h-full max-w-full select-none object-contain"
                fallbackTitle="Original Fundus Unavailable"
              />
              {gradcamUrl && (
                <SafeImage
                  src={gradcamUrl}
                  alt="Grad-CAM Overlay"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    opacity: opacity / 100,
                    transition: "opacity 0.08s linear, transform 0.15s ease-out",
                  }}
                  className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
                  fallbackTitle="Overlay Map Unavailable"
                />
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-white/60">
              Use the opacity slider above to smoothly cross-fade between the pure fundus photograph and the model activation map.
            </p>
          </div>
        )}

        {viewMode === "overlay-only" && (
          <div className="mx-auto flex max-w-[560px] flex-col items-center">
            <div className="mb-2 flex w-full items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#38bdf8]">
                Grad-CAM Heatmap
              </span>
              <span className="font-mono text-[9px] text-white/50">
                Raw activation colormap (JET)
              </span>
            </div>
            <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-black/50">
              <SafeImage
                src={heatmapUrl || gradcamUrl || originalImageUrl}
                alt="Grad-CAM Heatmap"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }}
                className="max-h-full max-w-full select-none object-contain"
                fallbackTitle="Heatmap Visualization Unavailable"
              />
            </div>
            <p className="mt-2 text-center text-[10px] text-white/60">
              Direct class activation map showing gradient-weighted feature intensities.
            </p>
          </div>
        )}

        {/* RELATIVE MODEL ACTIVATION COLOR LEGEND */}
        <div className="mt-6 rounded-xl border border-white/10 bg-[#091e27] p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8]">
                Relative Model Activation Legend
              </p>
              <p className="text-[9px] text-white/60">
                Gradient indicates feature attribution strength for the predicted class.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-medium text-white/50">Min (0%)</span>
              <div
                className="h-3 w-44 rounded border border-white/20 shadow-inner"
                style={{
                  background: "linear-gradient(to right, #000080, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000, #800000)",
                }}
                aria-label="Color gradient from dark blue (low activation) to red (high activation)"
              />
              <span className="text-[8px] font-bold text-[#ef4444]">Max (100%)</span>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-1.5 border-t border-white/5 pt-2 text-[8px] leading-relaxed text-white/50">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#38bdf8]" />
            <span>
              <strong>Clinical Notice:</strong> Grad-CAM highlights image regions influencing model classification. It does <em>not</em> represent a validated lesion segmentation mask and does <em>not</em> prove the existence of specific microaneurysms, hemorrhages, or exudates.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

