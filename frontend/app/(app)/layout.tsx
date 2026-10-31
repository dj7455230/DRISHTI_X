"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/store"
import { Sidebar } from "@/components/Sidebar"
import { DemoBanner } from "@/components/DemoBanner"
import { Menu, Eye } from "lucide-react"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("drishti_token") : null
    if (!isAuthenticated && !token) {
      router.replace("/login")
    } else {
      setIsReady(true)
    }
  }, [isAuthenticated, router])

  if (!isReady && typeof window !== "undefined" && !localStorage.getItem("drishti_token")) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#07111F] text-[#F4F8FC] selection:bg-[#39D9D0]/30 selection:text-[#39D9D0]">
      {/* Sidebar with mobile drawer support */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="min-h-screen lg:pl-[260px] flex flex-col">
        {/* Mobile Header Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-[#0B1726]/90 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#39D9D0]/10 border border-[#39D9D0]/30">
              <Eye className="h-4 w-4 text-[#39D9D0]" />
            </div>
            <span className="text-[13px] font-bold tracking-wider text-[#F4F8FC]">
              DRISHTI-X
            </span>
          </div>

          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#101F30] text-[#9AAFC1] hover:text-white"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Global Demo / Model Status Banner */}
        <DemoBanner />

        {/* Clinical Workspace Page Container */}
        <main className="flex-1 w-full bg-grid-pattern">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
