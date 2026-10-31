"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { ShieldCheck, AlertTriangle, Cpu } from "lucide-react"

export function DemoBanner() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health").then((r) => r.data),
    staleTime: 60_000,
  })

  const isDemo = health?.demo_mode ?? true
  const status = health?.model_status ?? "CHECKING"
  const unetStatus = health?.unet_status ?? "NOT_TRAINED"

  const modelReady = status === "TRAINED" || status === "VALIDATED"

  return (
    <div className="border-b border-white/5 bg-[#0B1726]/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-[42px] max-w-[1600px] flex-col justify-between gap-2 px-4 py-2 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        {/* Left Status Indicator */}
        <div className="flex items-center gap-3">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-lg ${
              modelReady
                ? "bg-[#39D9D0]/10 border border-[#39D9D0]/30 text-[#39D9D0]"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
            }`}
          >
            {modelReady ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <Cpu className="h-3.5 w-3.5" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="font-semibold text-[#F4F8FC]">
              {modelReady ? "Verified Clinical Inference Active" : "Prototype Diagnostic Mode"}
            </span>
            <span className="text-white/20">•</span>
            <span className="text-[#9AAFC1]">
              DR Classifier: <strong className={modelReady ? "text-[#39D9D0]" : "text-amber-400"}>{status}</strong>
              {" · "}
              U-Net Segmenter: <strong className="text-[#7C8CFF]">{unetStatus}</strong>
            </span>
          </div>
        </div>

        {/* Right Mandatory Medical Notice */}
        <div className="flex items-center gap-2 text-[10px] text-[#9AAFC1]">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
          <span>
            AI-Assisted Retinal Screening Prototype · Ophthalmologist Examination Required
          </span>
        </div>
      </div>
    </div>
  )
}
export default DemoBanner
