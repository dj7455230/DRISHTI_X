"use client"

import React, { useState } from "react"
import { Eye, AlertCircle, ImageIcon } from "lucide-react"
import { cn, resolveImageUrl } from "@/lib/utils"

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string
  fallbackTitle?: string
  fallbackSubtitle?: string
  containerClassName?: string
  showPlaceholderIcon?: boolean
}

/**
 * SafeImage provides production-grade image error containment:
 * - Automatically resolves backend API / upload URLs via resolveImageUrl()
 * - Gracefully catches 404s, CORS failures, or corrupted image streams
 * - Displays a sleek, professional medical placeholder instead of a broken browser icon
 * - Prevents layout shifts with proper container aspect ratios
 */
export function SafeImage({
  src,
  alt = "Clinical Retinal Asset",
  className,
  containerClassName,
  fallbackSrc,
  fallbackTitle = "Fundus Image Unavailable",
  fallbackSubtitle = "Visual capture or segmentation not yet generated",
  showPlaceholderIcon = true,
  onError,
  ...props
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const resolvedSrc = resolveImageUrl(typeof src === "string" ? src : undefined)

  if (!resolvedSrc || hasError) {
    if (fallbackSrc) {
      return (
        <img
          src={resolveImageUrl(fallbackSrc)}
          alt={alt}
          className={cn("w-full h-full object-cover", className)}
          onError={() => setHasError(true)}
          {...props}
        />
      )
    }

    return (
      <div
        className={cn(
          "w-full h-full min-h-[160px] flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900/80 border border-white/10 text-center select-none",
          containerClassName
        )}
      >
        {showPlaceholderIcon && (
          <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-2 text-cyan-400">
            <Eye className="w-5 h-5 opacity-80" />
          </div>
        )}
        <span className="text-xs font-semibold text-slate-300 block">{fallbackTitle}</span>
        <span className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] block leading-tight">
          {fallbackSubtitle}
        </span>
      </div>
    )
  }

  return (
    <div className={cn("relative overflow-hidden w-full h-full", containerClassName)}>
      <img
        src={resolvedSrc}
        alt={alt}
        className={cn(
          "transition-opacity duration-200",
          isLoading ? "opacity-0" : "opacity-100",
          className
        )}
        onLoad={() => setIsLoading(false)}
        onError={(e) => {
          setHasError(true)
          setIsLoading(false)
          onError?.(e)
        }}
        {...props}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

