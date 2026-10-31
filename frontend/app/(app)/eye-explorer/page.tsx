"use client"

import React, { useState } from "react"
import { Eye3DViewer, EYE_STRUCTURES, EyeStructure } from "@/components/Eye3DViewer"
import { motion } from "framer-motion"
import {
  Cuboid,
  Sparkles,
  Layers,
  Activity,
  ShieldAlert,
  ChevronRight,
  Info,
  Compass,
} from "lucide-react"

export default function EyeExplorerPage() {
  const [activeStructure, setActiveStructure] = useState<string | null>("retina")

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]">
              <Cuboid className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Interactive <span className="gradient-text-cyan">3D Eye Explorer</span>
            </h1>
          </div>
          <p className="text-xs text-[#9AAFC1] mt-1 max-w-2xl">
            Explore complete ocular anatomy from the anterior optical window to the posterior neurosensory retina, vascular arcades, optic disc, and foveal avascular zone.
          </p>
        </div>

        {/* Quick Badge */}
        <div className="flex items-center gap-2 self-start rounded-full bg-[#102436] border border-[#39D9D0]/20 px-3 py-1.5 text-xs text-[#39D9D0]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Real-time Procedural WebGL</span>
        </div>
      </div>

      {/* CLINICAL PROTOCOL NOTICE */}
      <div className="medical-banner rounded-xl p-3 text-xs text-[#9AAFC1] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-[#39D9D0] shrink-0" />
          <span>
            <strong>Anatomical Reference:</strong> This interactive 3D model illustrates ocular structures and their pathological significance in diabetic microvasculopathy. Real patient screenings are evaluated on fundus photographs in the <strong>Retinal Analysis Workspace</strong>.
          </span>
        </div>
      </div>

      {/* 3D INTERACTIVE EYE CANVAS */}
      <Eye3DViewer
        initialStructure={activeStructure}
        height="h-[600px]"
        showInspectionDrawer={true}
      />

      {/* QUICK STRUCTURE EXPLORATION CARDS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#9AAFC1] flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#39D9D0]" />
            Anatomical Structure Directory
          </h2>
          <span className="text-xs text-[#5A7184]">Select a structure to zoom in</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {EYE_STRUCTURES.map((struct: EyeStructure) => (
            <button
              key={struct.id}
              type="button"
              onClick={() => setActiveStructure(struct.id)}
              className={`glass-card glass-card-hover p-3.5 text-left rounded-xl border transition-all flex flex-col justify-between ${
                activeStructure === struct.id
                  ? "border-[#39D9D0] bg-[#102436] shadow-[0_0_15px_rgba(57,217,208,0.15)]"
                  : "border-white/5 hover:border-white/20"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-[#7C8CFF]">
                    {struct.category}
                  </span>
                  {activeStructure === struct.id && (
                    <span className="w-2 h-2 rounded-full bg-[#39D9D0] animate-pulse" />
                  )}
                </div>
                <h3 className="text-xs font-bold text-white mb-1">{struct.name}</h3>
                <p className="text-[11px] text-[#9AAFC1] line-clamp-2 leading-relaxed">
                  {struct.description}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-[#39D9D0]">
                <span>Inspect in 3D</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

