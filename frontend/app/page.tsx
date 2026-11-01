"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/store"

export default function RootPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    router.replace(isAuthenticated ? "/dashboard" : "/login")
  }, [isAuthenticated, router])

  return (
    <div className="min-h-screen bg-[#07111F] flex flex-col items-center justify-center text-center p-6 text-white">
      <div className="w-10 h-10 border-2 border-[#39D9D0]/20 border-t-[#39D9D0] rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium text-slate-300">Initializing DRISHTI-X Platform...</p>
    </div>
  )
}
