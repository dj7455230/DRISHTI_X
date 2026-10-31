"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useAuthStore, useNetworkStore } from "@/lib/store"
import OfflineSyncModal from "@/components/OfflineSyncModal"

import {
  LayoutDashboard,
  Users,
  Scan,
  Brain,
  Stethoscope,
  Send,
  FlaskConical,
  Satellite,
  ClipboardList,
  Settings,
  LogOut,
  Eye,
  Wifi,
  WifiOff,
  Plus,
  ChevronRight,
  ShieldCheck,
  Cuboid,
  FileText,
  X,
} from "lucide-react"

const clinicalNavigation = [
  {
    href: "/dashboard",
    label: "Command Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/analysis",
    label: "Retinal Analysis",
    icon: Brain,
  },
  {
    href: "/eye-explorer",
    label: "3D Eye Explorer",
    icon: Cuboid,
    highlight: true,
  },
  {
    href: "/patients",
    label: "Patient Directory",
    icon: Users,
  },
  {
    href: "/screenings",
    label: "Screenings Archive",
    icon: Scan,
  },
]

const specialistNavigation = [
  {
    href: "/review",
    label: "Clinical Review",
    icon: Stethoscope,
  },
  {
    href: "/referrals",
    label: "Referral Queue",
    icon: Send,
  },
  {
    href: "/telemedicine",
    label: "Telemedicine",
    icon: Satellite,
  },
]

const systemNavigation = [
  {
    href: "/reports",
    label: "Diagnostic Reports",
    icon: FileText,
  },
  {
    href: "/model-lab",
    label: "Model Validation",
    icon: FlaskConical,
  },
  {
    href: "/audit",
    label: "Audit Trail",
    icon: ClipboardList,
  },
  {
    href: "/settings",
    label: "System Settings",
    icon: Settings,
  },
]

type NavigationItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}

function NavigationGroup({
  title,
  items,
  pathname,
  onItemClick,
}: {
  title: string
  items: NavigationItem[]
  pathname: string
  onItemClick?: () => void
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5A7184]">
        {title}
      </p>

      <div className="space-y-1">
        {items.map(({ href, label, icon: Icon, highlight }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"))

          return (
            <Link
              key={href}
              href={href}
              onClick={onItemClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200",
                active
                  ? "bg-[#102436] text-[#39D9D0] border border-[#39D9D0]/20 shadow-[0_0_15px_rgba(57,217,208,0.1)]"
                  : "text-[#9AAFC1] hover:bg-[#101F30] hover:text-[#F4F8FC] border border-transparent"
              )}
            >
              {active && (
                <span className="absolute -left-3 h-5 w-[3px] rounded-r-full bg-[#39D9D0] shadow-[0_0_8px_#39D9D0]" />
              )}

              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-[#39D9D0]/10 text-[#39D9D0]"
                    : highlight
                    ? "bg-[#7C8CFF]/15 text-[#7C8CFF] group-hover:bg-[#7C8CFF]/25"
                    : "text-[#657F95] group-hover:bg-white/5 group-hover:text-[#F4F8FC]"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              <span className="flex-1 truncate">{label}</span>

              {highlight && !active && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#7C8CFF]/20 text-[#7C8CFF] font-semibold">
                  3D
                </span>
              )}

              {active && (
                <ChevronRight className="h-3.5 w-3.5 text-[#39D9D0]/70" />
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)

  const { user, logout } = useAuthStore()
  const { isOnline, pendingSyncCount } = useNetworkStore()

  const initials =
    user?.full_name
      ?.split(" ")
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "DX"

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1726] border-r border-white/10 text-[#F4F8FC]">
      {/* Brand Header */}
      <div className="px-5 pb-4 pt-5 border-b border-white/5 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#102436] to-[#07111F] border border-[#39D9D0]/30 shadow-[0_0_15px_rgba(57,217,208,0.2)]">
            <Eye className="h-5 w-5 text-[#39D9D0] group-hover:scale-105 transition-transform" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B1726] bg-[#39D9D0] shadow-[0_0_6px_#39D9D0]" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold tracking-[0.14em] text-[#F4F8FC]">
                DRISHTI-X
              </span>
              <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-[#39D9D0]/15 text-[#39D9D0] font-bold">
                AI
              </span>
            </div>
            <p className="text-[9px] font-medium tracking-[0.08em] text-[#5A7184] truncate">
              Retinal Diagnostics
            </p>
          </div>
        </Link>

        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="p-1 rounded-lg text-[#9AAFC1] hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Clinical Badge / Protocol Info */}
      <div className="mx-4 my-3.5 rounded-xl border border-white/5 bg-[#101F30]/80 p-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#39D9D0]/10 border border-[#39D9D0]/20">
            <ShieldCheck className="h-3.5 w-3.5 text-[#39D9D0]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-[#F4F8FC]">
              Clinical Screening Core
            </p>
            <p className="text-[9px] leading-3.5 text-[#9AAFC1] truncate">
              EfficientNet-B0 · U-Net · Grad-CAM
            </p>
          </div>
        </div>
      </div>

      {/* Primary CTA: New Screening */}
      <div className="px-4 pb-3">
        <Link
          href="/screenings/new"
          onClick={onMobileClose}
          className="group flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] text-[12px] font-bold text-[#07111F] shadow-[0_4px_16px_rgba(57,217,208,0.25)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New Screening</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 stroke-[2.5]" />
        </Link>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <NavigationGroup
          title="Clinical Workspace"
          items={clinicalNavigation}
          pathname={pathname}
          onItemClick={onMobileClose}
        />

        <NavigationGroup
          title="Specialist Care"
          items={specialistNavigation}
          pathname={pathname}
          onItemClick={onMobileClose}
        />

        <NavigationGroup
          title="System & Validation"
          items={systemNavigation}
          pathname={pathname}
          onItemClick={onMobileClose}
        />
      </nav>

      {/* Connectivity & Offline Sync Status */}
      <div className="mx-4 mb-3 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => setIsSyncModalOpen(true)}
          className="w-full flex items-center justify-between text-left p-2 rounded-xl bg-[#101F30]/60 hover:bg-[#101F30] border border-white/5 transition"
          title="Manage rural offline queue & synchronization"
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                isOnline ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
              )}
            >
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-[#F4F8FC]">
                {isOnline ? "Online Node" : "Offline Mode"}
              </p>
              <p className="text-[9px] text-[#5A7184]">Rural Sync Engine</p>
            </div>
          </div>

          {pendingSyncCount > 0 ? (
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[9px] font-semibold text-amber-300 animate-pulse">
              {pendingSyncCount} pending
            </span>
          ) : (
            <span className="text-[9px] font-medium text-[#5A7184]">Active</span>
          )}
        </button>
      </div>

      <OfflineSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />

      {/* User Profile Footer */}
      <div className="border-t border-white/10 bg-[#07111F] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#39D9D0]/10 border border-[#39D9D0]/20 text-[11px] font-bold text-[#39D9D0]">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-[#F4F8FC]">
              {user?.full_name || "Clinical Practitioner"}
            </p>
            <p className="truncate text-[9px] font-mono uppercase tracking-[0.06em] text-[#5A7184]">
              {user?.role?.replaceAll("_", " ") || "OPHTHALMOLOGIST"}
            </p>
          </div>

          <button
            onClick={logout}
            title="Sign out of DRISHTI-X"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9AAFC1] hover:bg-rose-500/15 hover:text-rose-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop & Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <div className="fixed inset-y-0 left-0 w-[270px] shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
export default Sidebar
