"use client"

import React, { useState } from "react"
import Image from "next/image"
import {
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Check,
  AlertCircle,
  Eye,
  Sliders,
} from "lucide-react"
import { SafeImage } from "@/components/SafeImage"

interface LesionCandidateInfo {
  count?: number
  total_area_px?: number
  label?: string
  provenance?: string
}

interface LesionSummaryProps {
  microaneurysms?: LesionCandidateInfo
  hemorrhages?: LesionCandidateInfo
  hard_exudates?: LesionCandidateInfo
  lesion_evidence_score?: number
  provenance?: string
  disclaimer?: string
}

interface LesionViewerProps {
  originalUrl?: string | null
  maskUrl?: string | null
  lesionSummary?: LesionSummaryProps | null
}

export default function LesionViewer({
  originalUrl,
  maskUrl,
  lesionSummary,
}: LesionViewerProps) {
  const [opacity, setOpacity] = useState<number>(75)
  const [zoom, setZoom] = useState<number>(1)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Toggle individual lesion layer visibility
  const [showMicroaneurysms, setShowMicroaneurysms] = useState<boolean>(true)
  const [showHemorrhages, setShowHemorrhages] = useState<boolean>(true)
  const [showExudates, setShowExudates] = useState<boolean>(true)

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)))
  const handleZoomOut = () => setZoom((prev) => Math.max(1, +(prev - 0.25).toFixed(2)))
  const handleResetZoom = () => setZoom(1)

  const maCount = lesionSummary?.microaneurysms?.count ?? 0
  const hemCount = lesionSummary?.hemorrhages?.count ?? 0
  const exudateCount = lesionSummary?.hard_exudates?.count ?? 0
  const evidenceScore = lesionSummary?.lesion_evidence_score ?? 0
  const provenance = lesionSummary?.provenance || "UNET_SEGMENTATION"

  // Any layer turned off?
  const isAnyHidden = !showMicroaneurysms || !showHemorrhages || !showExudates

  return (
    <div
      className={`glass-card p-5 border border-white/10 rounded-xl space-y-4 transition-all duration-300 ${
        isFullscreen ? "fixed inset-4 z-50 overflow-y-auto bg-slate-950/95 shadow-2xl" : ""
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              Lesion-Level Segmentation & Evidence
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-cyan-300">
                {provenance === "UNET_SEGMENTATION" ? "U-Net Segmenter" : "CV Heuristic"}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Interactive lesion candidate masks (MA, Hemorrhages, Hard Exudates)
            </p>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-300 transition"
            title="Zoom Out"
            aria-label="Zoom out fundus image"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-300 min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-300 transition"
            title="Zoom In"
            aria-label="Zoom in fundus image"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition"
            title="Reset Zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 transition ml-2"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Layer Toggles & Opacity Slider */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/60 p-3 rounded-lg border border-white/5">
        {/* Layer Checkboxes */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mr-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" /> Layers:
          </span>
          {/* Microaneurysms */}
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMicroaneurysms}
              onChange={(e) => setShowMicroaneurysms(e.target.checked)}
              className="rounded bg-slate-800 border-emerald-500/40 text-emerald-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>Microaneurysms ({maCount})</span>
          </label>

          {/* Hemorrhages */}
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHemorrhages}
              onChange={(e) => setShowHemorrhages(e.target.checked)}
              className="rounded bg-slate-800 border-red-500/40 text-red-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span>Hemorrhages ({hemCount})</span>
          </label>

          {/* Hard Exudates */}
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showExudates}
              onChange={(e) => setShowExudates(e.target.checked)}
              className="rounded bg-slate-800 border-blue-500/40 text-blue-500 focus:ring-0"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            <span>Hard Exudates ({exudateCount})</span>
          </label>
        </div>

        {/* Mask Opacity Slider */}
        <div className="flex items-center gap-3 md:justify-end">
          <span className="text-xs text-slate-400 font-medium">Mask Opacity:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-32 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            aria-label="Lesion mask opacity slider"
          />
          <span className="text-xs font-mono text-emerald-400 min-w-[2.5rem] text-right">
            {opacity}%
          </span>
        </div>
      </div>

      {/* Main Image Comparison Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Original Retinal Fundus */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              Original Retinal Fundus
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Unmodified</span>
          </div>
          <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center">
            {originalUrl ? (
              <div
                className="relative w-full h-full transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
              >
                <SafeImage
                  src={originalUrl}
                  alt="Original fundus photograph"
                  className="w-full h-full object-contain"
                  fallbackTitle="Fundus Capture Unavailable"
                />
              </div>
            ) : (
              <div className="text-xs text-slate-500">Original image unavailable</div>
            )}
          </div>
        </div>

        {/* Right: Interactive Lesion Overlay */}
        <div className="flex flex-col space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Lesion Candidates Overlay
            </span>
            <span className="text-[10px] font-mono text-emerald-400/80">
              Evidence Score: {(evidenceScore * 100).toFixed(0)}%
            </span>
          </div>
          <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black/60 border border-emerald-500/20 flex items-center justify-center">
            {originalUrl ? (
              <div
                className="relative w-full h-full transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
              >
                {/* Base Fundus Image */}
                <SafeImage
                  src={originalUrl}
                  alt="Base fundus for lesion overlay"
                  className="w-full h-full object-contain"
                  fallbackTitle="Fundus Base Layer Unavailable"
                />

                {/* Lesion Mask Layer */}
                {maskUrl ? (
                  <SafeImage
                    src={maskUrl}
                    alt="Lesion segmentation overlay"
                    className="absolute inset-0 w-full h-full object-contain mix-blend-screen pointer-events-none transition-opacity duration-150"
                    style={{
                      opacity: opacity / 100,
                      filter: isAnyHidden
                        ? `hue-rotate(${
                            !showMicroaneurysms ? "90deg" : !showHemorrhages ? "180deg" : "0deg"
                          })`
                        : undefined,
                    }}
                    fallbackTitle="Lesion Mask Pending"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                    <span className="text-xs text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded">
                      Mask rendering from coordinates
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Lesion overlay unavailable</div>
            )}
          </div>
        </div>
      </div>

      {/* Lesion Candidate Statistics Table */}
      <div className="overflow-x-auto rounded-lg border border-white/5 bg-slate-900/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-slate-400 uppercase font-mono text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Lesion Type</th>
              <th className="py-2.5 px-3">Candidate Count</th>
              <th className="py-2.5 px-3">Total Area (px)</th>
              <th className="py-2.5 px-3">Detection Method</th>
              <th className="py-2.5 px-3">Clinical Significance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {/* Microaneurysms */}
            <tr>
              <td className="py-2 px-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span className="font-medium text-white">Microaneurysms (MA)</span>
              </td>
              <td className="py-2 px-3 font-mono font-semibold text-emerald-400">
                {maCount} candidate{maCount === 1 ? "" : "s"}
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.microaneurysms?.total_area_px ?? 0} px
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.microaneurysms?.provenance || provenance}
              </td>
              <td className="py-2 px-3 text-slate-400">
                Earliest detectable hallmark of non-proliferative DR (Mild NPDR)
              </td>
            </tr>

            {/* Hemorrhages */}
            <tr>
              <td className="py-2 px-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                <span className="font-medium text-white">Retinal Hemorrhages</span>
              </td>
              <td className="py-2 px-3 font-mono font-semibold text-red-400">
                {hemCount} candidate{hemCount === 1 ? "" : "s"}
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.hemorrhages?.total_area_px ?? 0} px
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.hemorrhages?.provenance || provenance}
              </td>
              <td className="py-2 px-3 text-slate-400">
                Indicates capillary rupture, progression to Moderate/Severe NPDR
              </td>
            </tr>

            {/* Hard Exudates */}
            <tr>
              <td className="py-2 px-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
                <span className="font-medium text-white">Hard Exudates</span>
              </td>
              <td className="py-2 px-3 font-mono font-semibold text-blue-400">
                {exudateCount} candidate{exudateCount === 1 ? "" : "s"}
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.hard_exudates?.total_area_px ?? 0} px
              </td>
              <td className="py-2 px-3 font-mono text-slate-400">
                {lesionSummary?.hard_exudates?.provenance || provenance}
              </td>
              <td className="py-2 px-3 text-slate-400">
                Lipid extravasation; proximity to fovea triggers macular edema risk
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mandatory Clinical Disclaimer Banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <span className="font-semibold">Notice on Candidate Annotations: </span>
          {lesionSummary?.disclaimer ||
            "Lesion candidates detected by segmentation algorithms represent potential pathological structures and must be validated by an ophthalmologist. Absence or presence of candidates does not replace complete stereoscopic fundus examination."}
        </div>
      </div>
    </div>
  )
}

