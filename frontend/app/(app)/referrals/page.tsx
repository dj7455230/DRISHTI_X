"use client"

import React, { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { referralsApi, dashboardApi } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import {
  Send,
  AlertTriangle,
  ChevronRight,
  Calendar,
  Building2,
  Clock,
  CheckCircle2,
  FileText,
  Filter,
  RefreshCw,
  X,
  Loader2,
  PhoneCall,
} from "lucide-react"
import Link from "next/link"
import { cn, formatDate, PRIORITY_COLORS } from "@/lib/utils"

const PRIORITY_BG: Record<string, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/5",
  HIGH: "border-orange-500/40 bg-orange-500/5",
  MEDIUM: "border-yellow-500/40 bg-yellow-500/5",
  LOW: "border-white/10 bg-white/5",
}

const STATUS_BADGES: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  REFERRED: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  APPOINTMENT_SCHEDULED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  FOLLOW_UP_SCHEDULED: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  CLOSED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-slate-500/10 text-slate-400 border-slate-500/30",
}

export default function ReferralsPage() {
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL")
  const [selectedUrgency, setSelectedUrgency] = useState<string>("ALL")

  // Modal state for updating a referral
  const [editingReferral, setEditingReferral] = useState<any>(null)
  const [editStatus, setEditStatus] = useState<string>("")
  const [editFacility, setEditFacility] = useState<string>("")
  const [editAppointmentDate, setEditAppointmentDate] = useState<string>("")
  const [editFollowUpDate, setEditFollowUpDate] = useState<string>("")
  const [editClinicalNotes, setEditClinicalNotes] = useState<string>("")
  const [editOutcomeNotes, setEditOutcomeNotes] = useState<string>("")

  // Fetch referrals
  const { data: referrals, isLoading, refetch } = useQuery({
    queryKey: ["referrals-list", selectedStatus, selectedUrgency],
    queryFn: () =>
      referralsApi
        .list({
          status: selectedStatus === "ALL" ? undefined : selectedStatus,
          urgency: selectedUrgency === "ALL" ? undefined : selectedUrgency,
          limit: 100,
        })
        .then((r) => r.data)
        .catch(() => []),
    refetchInterval: 15_000,
  })

  // Update referral mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => referralsApi.update(editingReferral.id, data),
    onSuccess: async () => {
      setEditingReferral(null)
      await queryClient.invalidateQueries({ queryKey: ["referrals-list"] })
    },
  })

  const openEditModal = (ref: any) => {
    setEditingReferral(ref)
    setEditStatus(ref.status || "PENDING_REVIEW")
    setEditFacility(ref.referred_facility || "")
    setEditAppointmentDate(
      ref.appointment_date ? new Date(ref.appointment_date).toISOString().slice(0, 16) : ""
    )
    setEditFollowUpDate(
      ref.follow_up_date ? new Date(ref.follow_up_date).toISOString().slice(0, 10) : ""
    )
    setEditClinicalNotes(ref.clinical_notes || "")
    setEditOutcomeNotes(ref.outcome_notes || "")
  }

  const handleSaveUpdate = () => {
    if (!editingReferral) return
    updateMutation.mutate({
      status: editStatus,
      referred_facility: editFacility || undefined,
      appointment_date: editAppointmentDate ? new Date(editAppointmentDate).toISOString() : undefined,
      follow_up_date: editFollowUpDate ? new Date(editFollowUpDate).toISOString() : undefined,
      clinical_notes: editClinicalNotes || undefined,
      outcome_notes: editOutcomeNotes || undefined,
    })
  }

  const allItems = referrals ?? []
  const criticalCount = allItems.filter((r: any) => r.urgency === "CRITICAL").length
  const scheduledCount = allItems.filter((r: any) => r.status === "APPOINTMENT_SCHEDULED").length
  const closedCount = allItems.filter((r: any) => r.status === "CLOSED").length

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Send className="w-6 h-6 text-cyan-400" />
            Smart Referral & <span className="gradient-text">Follow-Up System</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Tracking patient referral pathways from rural screening camps to district ophthalmology centers.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition border border-white/10"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card p-4 border border-white/10 text-center">
          <p className="text-xs text-slate-400 mb-1">Total Referrals</p>
          <p className="text-3xl font-bold text-white">{allItems.length}</p>
        </div>
        <div className="glass-card p-4 border border-red-500/30 bg-red-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">Critical Triage</p>
          <p className="text-3xl font-bold text-red-400">{criticalCount}</p>
        </div>
        <div className="glass-card p-4 border border-blue-500/30 bg-blue-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">Appointments Set</p>
          <p className="text-3xl font-bold text-blue-400">{scheduledCount}</p>
        </div>
        <div className="glass-card p-4 border border-emerald-500/30 bg-emerald-500/5 text-center">
          <p className="text-xs text-slate-400 mb-1">Closed / Resolved</p>
          <p className="text-3xl font-bold text-emerald-400">{closedCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["ALL", "All"],
            ["PENDING_REVIEW", "Pending Review"],
            ["REFERRED", "Referred"],
            ["APPOINTMENT_SCHEDULED", "Scheduled"],
            ["FOLLOW_UP_SCHEDULED", "Follow-Up"],
            ["CLOSED", "Closed"],
          ].map(([statusKey, label]) => (
            <button
              key={statusKey}
              onClick={() => setSelectedStatus(statusKey)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                selectedStatus === statusKey
                  ? "bg-cyan-500 text-slate-950 font-semibold shadow"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Urgency Filter Dropdown */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter className="w-3.5 h-3.5" />
          <span>Urgency:</span>
          <select
            value={selectedUrgency}
            onChange={(e) => setSelectedUrgency(e.target.value)}
            className="bg-slate-900 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white outline-none"
          >
            <option value="ALL">All Levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Referrals List */}
      {isLoading ? (
        <div className="text-cyan-400 animate-pulse py-12 text-center">Loading referral records...</div>
      ) : allItems.length === 0 ? (
        <div className="glass-card p-12 text-center border border-white/10">
          <Send className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No referral cases found</p>
          <p className="text-xs text-slate-500 mt-1">
            Cases marked as referable will appear here for appointment booking and clinical tracking.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {allItems.map((item: any) => (
            <div
              key={item.id}
              className={cn(
                "glass-card p-5 border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-cyan-500/30",
                PRIORITY_BG[item.urgency] || "border-white/10"
              )}
            >
              {/* Left Column: Urgency & Basic Info */}
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border",
                    PRIORITY_COLORS[item.urgency] || "text-slate-400",
                    item.urgency === "CRITICAL"
                      ? "bg-red-500/15 border-red-500/30"
                      : item.urgency === "HIGH"
                      ? "bg-orange-500/15 border-orange-500/30"
                      : "bg-white/5 border-white/10"
                  )}
                >
                  {item.urgency?.slice(0, 4)}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-white font-medium">
                      Screening #{item.screening_id?.slice(0, 8)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-mono px-2 py-0.5 rounded-full border",
                        STATUS_BADGES[item.status] || "bg-white/5 text-slate-400"
                      )}
                    >
                      {item.status?.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                      {item.referred_facility || "Unassigned Facility"}
                    </span>
                    {item.appointment_date && (
                      <span className="flex items-center gap-1.5 text-cyan-300">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        Appt: {new Date(item.appointment_date).toLocaleDateString()}
                      </span>
                    )}
                    {item.follow_up_date && (
                      <span className="flex items-center gap-1.5 text-purple-300">
                        <Clock className="w-3.5 h-3.5 text-purple-400" />
                        Follow-up: {new Date(item.follow_up_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {item.clinical_notes && (
                    <p className="text-xs text-slate-300 italic line-clamp-1 mt-1">
                      &quot;{item.clinical_notes}&quot;
                    </p>
                  )}
                  {item.outcome_notes && (
                    <p className="text-xs text-emerald-400 line-clamp-1 mt-0.5">
                      ✓ Outcome: {item.outcome_notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition border border-white/10"
                >
                  Manage Referral
                </button>
                <Link
                  href={`/screenings/${item.screening_id}`}
                  className="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition"
                  title="View Screening Evidence"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Referral Modal */}
      {editingReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Update Referral Workflow</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Screening ID: {editingReferral.screening_id}
                </p>
              </div>
              <button
                onClick={() => setEditingReferral(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Referral Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                >
                  <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                  <option value="REFERRED">REFERRED</option>
                  <option value="APPOINTMENT_SCHEDULED">APPOINTMENT_SCHEDULED</option>
                  <option value="FOLLOW_UP_SCHEDULED">FOLLOW_UP_SCHEDULED</option>
                  <option value="CLOSED">CLOSED (Resolved/Completed)</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Destination Facility</label>
                <input
                  type="text"
                  value={editFacility}
                  onChange={(e) => setEditFacility(e.target.value)}
                  placeholder="e.g. Varanasi District Eye Hospital"
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Appointment Date & Time</label>
                  <input
                    type="datetime-local"
                    value={editAppointmentDate}
                    onChange={(e) => setEditAppointmentDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Follow-Up Recall Date</label>
                  <input
                    type="date"
                    value={editFollowUpDate}
                    onChange={(e) => setEditFollowUpDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Clinical Instructions</label>
                <textarea
                  value={editClinicalNotes}
                  onChange={(e) => setEditClinicalNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none resize-none"
                  placeholder="Clinical referral notes..."
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Outcome & Treatment Notes</label>
                <textarea
                  value={editOutcomeNotes}
                  onChange={(e) => setEditOutcomeNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-white outline-none resize-none"
                  placeholder="Document treatment received, laser photocoagulation, anti-VEGF, or follow-up schedule..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingReferral(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUpdate}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinical Disclaimer */}
      <p className="text-xs text-slate-600 text-center">
        AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS —
        Referral priority is a clinical triage aid designed to accelerate access in rural India.
      </p>
    </div>
  )
}
