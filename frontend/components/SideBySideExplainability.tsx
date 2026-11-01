"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Flame,
  Eye,
  Crosshair,
  Sliders,
  Check,
  AlertCircle,
  Split,
  EyeOff,
} from "lucide-react"
import { SafeImage } from "@/components/SafeImage"

interface SideBySideProps {
  originalUrl?: string | null
  gradcamHeatmapUrl?: string | null
  gradcamOverlayUrl?: string | null
  lesionMaskUrl?: string | null
  lesionOverlayUrl?: string | null
  targetClass?: number | null
  targetClassLabel?: string | null
  activationScore?: number | null
  targetLayer?: string | null
  lesionSummary?: {
    microaneurysms?: { count: number; total_area_px: number; retinal_coverage_pct?: number }
    hemorrhages?: { count: number; total_area_px: number; retinal_coverage_pct?: number }
    hard_exudates?: { count: number; total_area_px: number; retinal_coverage_pct?: number }
    supported_classes?: string[]
    unsupported_classes?: string[]
  } | null
}

export default function SideBySideExplainability({
  originalUrl,
  gradcamHeatmapUrl,
  gradcamOverlayUrl,
  lesionMaskUrl,
  lesionOverlayUrl,
  targetClass,
  targetClassLabel,
  activationScore,
  targetLayer = "backbone.features.8.0",
  lesionSummary,
}: SideBySideProps) {
  // Navigation & Zoom State (Synchronized across all viewports)
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // Display toggles
  const [viewMode, setViewMode] = useState<"three_panel" | "blend_overlay">("three_panel")
  const [opacity, setOpacity] = useState<number>(70)
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)

  // Lesion class visibility toggles
  const [showMA, setShowMA] = useState<boolean>(true)
  const [showHE, setShowHE] = useState<boolean>(true)
  const [showEX, setShowEX] = useState<boolean>(true)

  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(3.5, +(z + 0.25).toFixed(2)))
  const handleZoomOut = () => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Pan handlers (drag across any viewport)
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: +(e.clientX - dragStart.x).toFixed(1),
        y: +(e.clientY - dragStart.y).toFixed(1),
      })
    }
    // Update normalized crosshair position
    const rect = e.currentTarget.getBoundingClientRect()
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setMousePos({ x: xPct, y: yPct })
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => {
    setIsDragging(false)
    setMousePos(null)
  }

  const maCount = lesionSummary?.microaneurysms?.count ?? 0
  const heCount = lesionSummary?.hemorrhages?.count ?? 0
  const exCount = lesionSummary?.hard_exudates?.count ?? 0

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-white/10 bg-[#0B1726] p-5 shadow-2xl transition-all duration-300 ${
        isFullscreen ? "fixed inset-3 z-50 overflow-y-auto bg-[#07111F]/98" : ""
      }`}
    >
      {/* Workspace Header & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Split className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-white tracking-wide">
              Synchronized Multi-Panel Explainability Workspace
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Feature 14: Lockstep 3-panel inspection (Original Retina, Grad-CAM Saliency, U-Net Lesion Overlays) with synchronized coordinates.
          </p>
        </div>

        {/* View Mode & Utility Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-white/10 bg-[#101F30] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("three_panel")}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                viewMode === "three_panel"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              3-Panel Synchronous
            </button>
            <button
              type="button"
              onClick={() => setViewMode("blend_overlay")}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                viewMode === "blend_overlay"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Blended Overlay
            </button>
          </div>

          {/* Crosshair toggle */}
          <button
            type="button"
            onClick={() => setShowCrosshair(!showCrosshair)}
            title="Toggle Synchronized Cursor Reticle"
            className={`p-2 rounded-lg border transition ${
              showCrosshair
                ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300"
                : "border-white/10 bg-[#101F30] text-slate-400 hover:text-white"
            }`}
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101F30] p-1">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-40"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-teal-400 min-w-[36px] text-center">
              {zoom}x
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= 3.5}
              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-40"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="p-1 ml-1 rounded text-slate-400 hover:text-white"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg border border-white/10 bg-[#101F30] text-slate-400 hover:text-white transition"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Layer Toggles & Opacity Slider */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-[#101F30] border border-white/5 text-xs">
        {/* Lesion Classes Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            Lesion Layers:
          </span>

          {/* Microaneurysms */}
          <button
            type="button"
            onClick={() => setShowMA(!showMA)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium transition ${
              showMA
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-500 line-through"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF00] shadow-[0_0_8px_#00FF00]" />
            MA ({maCount})
          </button>

          {/* Haemorrhages */}
          <button
            type="button"
            onClick={() => setShowHE(!showHE)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium transition ${
              showHE
                ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                : "bg-white/5 border-white/10 text-slate-500 line-through"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF1E50] shadow-[0_0_8px_#FF1E50]" />
            HE ({heCount})
          </button>

          {/* Hard Exudates */}
          <button
            type="button"
            onClick={() => setShowEX(!showEX)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium transition ${
              showEX
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : "bg-white/5 border-white/10 text-slate-500 line-through"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] shadow-[0_0_8px_#FFD700]" />
            EX ({exCount})
          </button>

          {/* Soft Exudates (Unannotated / Unsupported Badge) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/5 bg-slate-900/60 text-slate-500 text-[11px] cursor-not-allowed">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            Soft Exudates (Not Trained)
          </div>
        </div>

        {/* Opacity Slider */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Overlay Opacity:</span>
          <input
            type="range"
            min={10}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-24 accent-teal-400 cursor-pointer"
          />
          <span className="font-mono text-teal-300 w-8 text-right">{opacity}%</span>
        </div>
      </div>

      {/* Main Viewports */}
      {viewMode === "three_panel" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Panel 1: Original Fundus Retina */}
          <div className="flex flex-col rounded-xl border border-white/10 bg-[#07111F] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#101F30]/80 border-b border-white/5 text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-teal-400" />
                1. Original Fundus Retina
              </span>
              <span className="text-[10px] text-slate-400 font-mono">RGB Native</span>
            </div>
            <div
              className="relative aspect-square w-full overflow-hidden bg-black/60 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {originalUrl ? (
                <div
                  className="w-full h-full transition-transform duration-75"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={originalUrl}
                    alt="Original Fundus"
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  No Fundus Image Available
                </div>
              )}

              {/* Synchronized Crosshair Marker */}
              {showCrosshair && mousePos && (
                <div
                  className="pointer-events-none absolute w-6 h-6 border-2 border-teal-400/80 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#2dd4bf]"
                  style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
                >
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-teal-300" />
                  <div className="absolute top-0 left-1/2 w-[1px] h-full bg-teal-300" />
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 bg-[#07111F] text-[10px] text-slate-500 border-t border-white/5 flex justify-between">
              <span>Unmodified clinical capture</span>
              <span>FOV Verified</span>
            </div>
          </div>

          {/* Panel 2: EfficientNet-B0 Grad-CAM Heatmap */}
          <div className="flex flex-col rounded-xl border border-white/10 bg-[#07111F] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#101F30]/80 border-b border-white/5 text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                2. Grad-CAM Saliency
              </span>
              <span className="text-[10px] text-amber-400/90 font-mono">
                {targetLayer}
              </span>
            </div>
            <div
              className="relative aspect-square w-full overflow-hidden bg-black/60 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {originalUrl ? (
                <div
                  className="w-full h-full relative transition-transform duration-75"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={originalUrl}
                    alt="Fundus Background"
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                  {gradcamHeatmapUrl && (
                    <img
                      src={gradcamHeatmapUrl}
                      alt="Grad-CAM Heatmap"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen"
                      style={{ opacity: opacity / 100 }}
                      draggable={false}
                    />
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Grad-CAM Unavailable
                </div>
              )}

              {/* Synchronized Crosshair Marker */}
              {showCrosshair && mousePos && (
                <div
                  className="pointer-events-none absolute w-6 h-6 border-2 border-amber-400/80 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#f59e0b]"
                  style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
                >
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-amber-300" />
                  <div className="absolute top-0 left-1/2 w-[1px] h-full bg-amber-300" />
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 bg-[#07111F] text-[10px] text-slate-500 border-t border-white/5 flex justify-between">
              <span>Class: {targetClassLabel || `Grade ${targetClass}`}</span>
              <span>Activation: {activationScore != null ? `${(activationScore * 100).toFixed(1)}%` : "N/A"}</span>
            </div>
          </div>

          {/* Panel 3: U-Net Lesion Evidence Map */}
          <div className="flex flex-col rounded-xl border border-white/10 bg-[#07111F] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#101F30]/80 border-b border-white/5 text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                3. U-Net Lesion Segmentation
              </span>
              <span className="text-[10px] text-cyan-400/90 font-mono">
                IDRiD U-Net (512px)
              </span>
            </div>
            <div
              className="relative aspect-square w-full overflow-hidden bg-black/60 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {originalUrl ? (
                <div
                  className="w-full h-full relative transition-transform duration-75"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={originalUrl}
                    alt="Fundus Background"
                    className="w-full h-full object-contain pointer-events-none"
                    draggable={false}
                  />
                  {lesionMaskUrl && (
                    <img
                      src={lesionMaskUrl}
                      alt="Lesion Segmentation Mask"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ opacity: opacity / 100 }}
                      draggable={false}
                    />
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Lesion Mask Unavailable
                </div>
              )}

              {/* Synchronized Crosshair Marker */}
              {showCrosshair && mousePos && (
                <div
                  className="pointer-events-none absolute w-6 h-6 border-2 border-cyan-400/80 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#06b6d4]"
                  style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
                >
                  <div className="absolute top-1/2 left-0 w-full h-[1px] bg-cyan-300" />
                  <div className="absolute top-0 left-1/2 w-[1px] h-full bg-cyan-300" />
                </div>
              )}
            </div>
            <div className="px-3 py-1.5 bg-[#07111F] text-[10px] text-slate-500 border-t border-white/5 flex justify-between">
              <span>Total Lesions: {maCount + heCount + exCount}</span>
              <span>P ≥ 0.40 Thresholded</span>
            </div>
          </div>
        </div>
      ) : (
        /* Blended Overlay Mode: Single High-Resolution Viewport */
        <div className="relative aspect-[16/9] w-full rounded-xl border border-white/10 bg-black/70 overflow-hidden cursor-grab active:cursor-grabbing">
          <div
            className="w-full h-full relative transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {originalUrl && (
              <SafeImage
                src={originalUrl}
                alt="Original Fundus"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
                fallbackTitle="Original Fundus Unavailable"
              />
            )}
            {gradcamHeatmapUrl && (
              <SafeImage
                src={gradcamHeatmapUrl}
                alt="Grad-CAM Heatmap"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none mix-blend-screen"
                style={{ opacity: (opacity / 100) * 0.6 }}
                draggable={false}
                fallbackTitle="Heatmap Unavailable"
              />
            )}
            {lesionMaskUrl && (
              <SafeImage
                src={lesionMaskUrl}
                alt="Lesion Segmentation Mask"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ opacity: opacity / 100 }}
                draggable={false}
                fallbackTitle="Lesion Mask Unavailable"
              />
            )}
          </div>
        </div>
      )}

      {/* Quantitative Connected-Component Summary Table */}
      {lesionSummary && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-[#101F30]/60">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#101F30] text-[11px] text-slate-400 uppercase tracking-wider border-b border-white/5">
              <tr>
                <th className="px-4 py-2.5">Lesion Class</th>
                <th className="px-4 py-2.5">Candidate Count</th>
                <th className="px-4 py-2.5">Area (Pixels)</th>
                <th className="px-4 py-2.5">Retinal Coverage</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              <tr>
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00FF00]" />
                  <span className="text-white font-sans">Microaneurysms (MA)</span>
                </td>
                <td className="px-4 py-2 font-semibold text-emerald-400">{maCount}</td>
                <td className="px-4 py-2">{lesionSummary.microaneurysms?.total_area_px?.toFixed(0) || 0} px</td>
                <td className="px-4 py-2">{lesionSummary.microaneurysms?.retinal_coverage_pct?.toFixed(2) || "0.00"}%</td>
                <td className="px-4 py-2 text-emerald-400 font-sans">Verified IDRiD U-Net</td>
              </tr>
              <tr>
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF1E50]" />
                  <span className="text-white font-sans">Haemorrhages (HE)</span>
                </td>
                <td className="px-4 py-2 font-semibold text-rose-400">{heCount}</td>
                <td className="px-4 py-2">{lesionSummary.hemorrhages?.total_area_px?.toFixed(0) || 0} px</td>
                <td className="px-4 py-2">{lesionSummary.hemorrhages?.retinal_coverage_pct?.toFixed(2) || "0.00"}%</td>
                <td className="px-4 py-2 text-rose-400 font-sans">Verified IDRiD U-Net</td>
              </tr>
              <tr>
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700]" />
                  <span className="text-white font-sans">Hard Exudates (EX)</span>
                </td>
                <td className="px-4 py-2 font-semibold text-amber-400">{exCount}</td>
                <td className="px-4 py-2">{lesionSummary.hard_exudates?.total_area_px?.toFixed(0) || 0} px</td>
                <td className="px-4 py-2">{lesionSummary.hard_exudates?.retinal_coverage_pct?.toFixed(2) || "0.00"}%</td>
                <td className="px-4 py-2 text-amber-400 font-sans">Verified IDRiD U-Net</td>
              </tr>
              <tr className="bg-slate-900/40 text-slate-500 font-sans">
                <td className="px-4 py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                  <span>Soft Exudates (Cotton Wool Spots)</span>
                </td>
                <td className="px-4 py-2 italic font-mono">—</td>
                <td className="px-4 py-2 italic font-mono">—</td>
                <td className="px-4 py-2 italic font-mono">—</td>
                <td className="px-4 py-2 text-slate-500 italic">Excluded (Training groundtruth incomplete)</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Clinical Safety & Regulatory Notice */}
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2 text-[11px] text-amber-300/80">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <p>
          <strong className="text-amber-300">Explainability Notice:</strong> Saliency heatmaps and pixel-level segmentations represent algorithmic mathematical attributions. They are designed for clinician cognitive assistance and must not replace definitive slit-lamp or fundoscopic examination by a licensed ophthalmologist.
        </p>
      </div>
    </div>
  )
}

