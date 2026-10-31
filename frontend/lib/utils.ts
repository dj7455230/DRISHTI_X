import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DR_GRADE_LABELS: Record<number, string> = {
  0: "No DR",
  1: "Mild NPDR",
  2: "Moderate NPDR",
  3: "Severe NPDR",
  4: "Proliferative DR",
}

export const DR_GRADE_COLORS: Record<number, string> = {
  0: "text-emerald-400",
  1: "text-yellow-400",
  2: "text-orange-400",
  3: "text-red-400",
  4: "text-red-600",
}

export const DR_GRADE_BG: Record<number, string> = {
  0: "bg-emerald-500/20 border-emerald-500/40",
  1: "bg-yellow-500/20 border-yellow-500/40",
  2: "bg-orange-500/20 border-orange-500/40",
  3: "bg-red-500/20 border-red-500/40",
  4: "bg-red-700/20 border-red-700/40",
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-emerald-400",
  MEDIUM: "text-yellow-400",
  HIGH: "text-orange-400",
  CRITICAL: "text-red-400",
}

export const ASSURANCE_COLORS: Record<string, string> = {
  VALIDATED: "text-emerald-400",
  HUMAN_REVIEW_REQUIRED: "text-yellow-400",
  RECAPTURE_REQUIRED: "text-red-400",
}

export function formatConfidence(conf: number | null | undefined): string {
  if (conf === null || conf === undefined) return "N/A"
  return `${(conf * 100).toFixed(1)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
