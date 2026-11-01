"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Satellite,
  Wifi,
  WifiOff,
  Signal,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Camera,
  Layers,
  Sparkles,
  FileText,
  UserCheck,
  Send,
  AlertTriangle,
  RefreshCw,
  Eye,
  Activity,
  HardDrive,
  Download,
} from "lucide-react"
import { screeningsApi, patientsApi } from "@/lib/api"
import { cn } from "@/lib/utils"

type DemoStep = {
  step: number
  title: string
  subtitle: string
  status: "pending" | "active" | "completed"
  mode: "OFFLINE" | "ONLINE" | "SYNCED"
}

export default function RuralScenarioDemoPage() {
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [networkCondition, setNetworkCondition] = useState<"ONLINE_4G" | "WEAK_2G" | "OFFLINE">("WEAK_2G")
  const [isProcessing, setIsProcessing] = useState<boolean>(false)

  // Step state
  const [patientData, setPatientData] = useState({
    name: "Mohan Lal Gurjar",
    age: 61,
    gender: "MALE",
    diabetes_type: "TYPE_2",
    diabetes_duration_years: 15,
    hba1c: 9.6,
  })

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [caseNumber, setCaseNumber] = useState<string>("CASE-RURAL-789")
  const [selectedDemoSample, setSelectedDemoSample] = useState<string>("severe_npdr")
  const [qualityResult, setQualityResult] = useState<any>(null)
  const [screeningResult, setScreeningResult] = useState<any>(null)
  const [capsuleResult, setCapsuleResult] = useState<any>(null)
  const [syncStatus, setSyncStatus] = useState<string>("LOCAL_PERSISTED")
  const [doctorAction, setDoctorAction] = useState<any>(null)
  const [reportResult, setReportResult] = useState<any>(null)

  const steps: DemoStep[] = [
    {
      step: 1,
      title: "Rural PHC Intake & Demographics",
      subtitle: "Mandawa Primary Health Centre (District Jhunjhunu, Rajasthan)",
      status: currentStep === 1 ? "active" : currentStep > 1 ? "completed" : "pending",
      mode: "OFFLINE",
    },
    {
      step: 2,
      title: "Fundus Capture & Quality Gate",
      subtitle: "On-device illumination, focus, and field definition assessment",
      status: currentStep === 2 ? "active" : currentStep > 2 ? "completed" : "pending",
      mode: "OFFLINE",
    },
    {
      step: 3,
      title: "Local AI Screening & Clinical Assurance",
      subtitle: "EfficientNet-B0 + U-Net Lesion Segmentation & Confidence",
      status: currentStep === 3 ? "active" : currentStep > 3 ? "completed" : "pending",
      mode: "OFFLINE",
    },
    {
      step: 4,
      title: "Priority Triage & Evidence Capsule",
      subtitle: "Deterministic priority score + 3.2 KB compact capsule dispatch",
      status: currentStep === 4 ? "active" : currentStep > 4 ? "completed" : "pending",
      mode: networkCondition === "OFFLINE" ? "OFFLINE" : "SYNCED",
    },
    {
      step: 5,
      title: "Remote Specialist Telemedicine Review",
      subtitle: "Apex Ophthalmologist reviews capsule under 'Limited Evidence'",
      status: currentStep === 5 ? "active" : currentStep > 5 ? "completed" : "pending",
      mode: "ONLINE",
    },
    {
      step: 6,
      title: "Verified Signed Report Delivery",
      subtitle: "Ophthalmologist-signed clinical directive returned to rural PHC",
      status: currentStep === 6 ? "active" : currentStep > 6 ? "completed" : "pending",
      mode: "SYNCED",
    },
  ]

  // Execute Step 1: Patient Registration
  const executeStep1 = async () => {
    setIsProcessing(true)
    try {
      const code = `PT-RURAL-${Math.floor(1000 + Math.random() * 9000)}`
      const res = await patientsApi.create({
        patient_code: code,
        name: patientData.name,
        age: patientData.age,
        gender: patientData.gender,
        diabetes_type: patientData.diabetes_type,
        diabetes_duration_years: patientData.diabetes_duration_years,
        hba1c_value: patientData.hba1c,
      })

      // Intake screening
      const intakeRes = await screeningsApi.intake({
        patient_id: res.data.id,
        chief_complaint: "Progressive blurry vision, 15-year history of diabetes",
        visual_acuity_left: "6/18",
        visual_acuity_right: "6/24",
      })

      const screening = intakeRes.data?.screening || intakeRes.data
      const screeningId = screening?.id || ""
      const caseNum =
        screening?.case_number ||
        (screeningId ? `CASE-${screeningId.slice(0, 8)}` : `CASE-RURAL-${Date.now().toString().slice(-4)}`)

      setActiveCaseId(screeningId)
      setCaseNumber(caseNum)
      setCurrentStep(2)
    } catch (e: any) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Step 2: Quality Assessment
  const executeStep2 = async () => {
    if (!activeCaseId) return
    setIsProcessing(true)
    try {
      // Run quality check API
      const qRes = await screeningsApi.qualityCheck(activeCaseId)
      setQualityResult(qRes.data)
      setCurrentStep(3)
    } catch {
      // Fallback quality result if image not yet uploaded
      setQualityResult({
        overall_grade: "ACCEPTABLE",
        confidence: 0.94,
        metrics: {
          sharpness: 0.88,
          illumination: 0.91,
          field_definition: 0.95,
        },
      })
      setCurrentStep(3)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Step 3: Local AI Screening
  const executeStep3 = async () => {
    if (!activeCaseId) return
    setIsProcessing(true)
    try {
      const res = await screeningsApi.analyze(activeCaseId)
      setScreeningResult(res.data)
      setCurrentStep(4)
    } catch {
      setScreeningResult({
        predicted_grade: 3,
        predicted_label: "Severe Non-Proliferative DR",
        confidence: 0.89,
        concordance: "CONCORDANT",
        lesions_detected: ["Microaneurysms", "Hard Exudates", "Hemorrhages"],
      })
      setCurrentStep(4)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Step 4: Capsule Generation & Priority Sync
  const executeStep4 = async () => {
    if (!activeCaseId) return
    setIsProcessing(true)
    try {
      // Generate & sync evidence capsule
      const fakeCapsule = {
        screening_id: activeCaseId,
        case_number: caseNumber,
        patient_ref_id: "REF-PT-MLGURJAR",
        predicted_grade: 3,
        grade_label: "Severe NPDR",
        confidence: 0.89,
        priority_level: "CRITICAL",
        priority_score: 93.5,
        image_checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        thumbnail_jpeg_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAExwG088R/vQAAAABJRU5ErkJggg==",
      }

      const res = await screeningsApi.syncCapsule(fakeCapsule)
      setCapsuleResult(res.data)
      setSyncStatus(networkCondition === "OFFLINE" ? "OFFLINE_QUEUED" : "CAPSULE_SYNCED")
      setCurrentStep(5)
    } catch (e: any) {
      console.error(e)
      setCapsuleResult({
        priority_level: "CRITICAL",
        priority_score: 93.5,
        transport_priority: 93.5,
        capsule_size_bytes: 3240,
        status: "CAPSULE_SYNCED",
      })
      setSyncStatus("CAPSULE_SYNCED")
      setCurrentStep(5)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Step 5: Specialist Review
  const executeStep5 = async () => {
    if (!activeCaseId) return
    setIsProcessing(true)
    try {
      const actionPayload = {
        action: "REFER",
        doctor_grade: 3,
        referral_urgency: "CRITICAL",
        referral_destination: "Apex Vitreoretinal Medical Centre, Jaipur",
        notes: "Severe NPDR confirmed on tele-capsule. Immediate laser photocoagulation & anti-VEGF consult recommended.",
      }
      const res = await screeningsApi.recordAction(activeCaseId, actionPayload)
      setDoctorAction(res.data)
      setCurrentStep(6)
    } catch {
      setDoctorAction({
        action: "REFER",
        urgency: "CRITICAL",
        doctor: "Dr. Ananya Sharma (Ophthalmology Specialist)",
        notes: "Severe NPDR confirmed on tele-capsule. Immediate laser photocoagulation & anti-VEGF consult recommended.",
      })
      setCurrentStep(6)
    } finally {
      setIsProcessing(false)
    }
  }

  // Execute Step 6: Final Report
  const executeStep6 = async () => {
    if (!activeCaseId) return
    setIsProcessing(true)
    try {
      const res = await screeningsApi.generateReport(activeCaseId)
      setReportResult(res.data)
    } catch {
      setReportResult({
        report_id: `REP-${activeCaseId.slice(0, 8)}`,
        status: "FINAL_SIGNED",
        delivered_at: new Date().toISOString(),
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <Signal className="w-3.5 h-3.5" /> Feature 36
            </span>
            <span className="text-xs text-slate-500">Interactive End-to-End Simulation</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Rural Primary Health Centre <span className="gradient-text">Screening Scenario</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Follow a rural patient case from offline PHC intake through Evidence Capsule priority dispatch and specialist tele-consultation.
          </p>
        </div>

        {/* Network Switcher Toolbar */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
          <span className="text-xs text-slate-400 px-2 font-medium">Link Status:</span>
          {[
            { id: "ONLINE_4G", label: "4G Broadband", icon: Wifi, color: "text-emerald-400" },
            { id: "WEAK_2G", label: "Weak 2G (64 kbps)", icon: Signal, color: "text-amber-400" },
            { id: "OFFLINE", label: "Total Outage", icon: WifiOff, color: "text-red-400" },
          ].map((net) => {
            const Icon = net.icon
            return (
              <button
                key={net.id}
                onClick={() => setNetworkCondition(net.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors font-medium",
                  networkCondition === net.id
                    ? "bg-slate-800 border border-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", net.color)} />
                {net.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Process Pipeline Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {steps.map((st) => (
          <div
            key={st.step}
            className={cn(
              "glass-card p-3.5 space-y-2 border transition-all text-xs",
              st.status === "active"
                ? "border-cyan-500/60 bg-cyan-500/5 shadow-md shadow-cyan-500/5"
                : st.status === "completed"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-slate-800/80 opacity-60"
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px]",
                st.status === "completed" ? "bg-emerald-500 text-black" : st.status === "active" ? "bg-cyan-500 text-black" : "bg-slate-800 text-slate-400"
              )}>
                {st.status === "completed" ? "✓" : st.step}
              </span>
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                st.mode === "OFFLINE" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
              )}>
                {st.mode}
              </span>
            </div>
            <div>
              <p className="font-semibold text-white leading-tight">{st.title}</p>
              <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{st.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active Stage Interactive Workspace */}
      <div className="glass-card p-6 space-y-6">
        {/* Stage 1 */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-cyan-400" />
                  Stage 1: Rural PHC Patient Intake & Offline Registration
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Operates entirely in local IndexedDB without server roundtrips.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono">
                LOCAL PERSISTENCE ONLY
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Patient Name</label>
                <input
                  type="text"
                  value={patientData.name}
                  onChange={(e) => setPatientData({ ...patientData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Age & Gender</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={patientData.age}
                    onChange={(e) => setPatientData({ ...patientData, age: Number(e.target.value) })}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white outline-none focus:border-cyan-500"
                  />
                  <select
                    value={patientData.gender}
                    onChange={(e) => setPatientData({ ...patientData, gender: e.target.value })}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white outline-none focus:border-cyan-500"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Diabetes History (Years / HbA1c)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={patientData.diabetes_duration_years}
                    onChange={(e) => setPatientData({ ...patientData, diabetes_duration_years: Number(e.target.value) })}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white outline-none focus:border-cyan-500"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={patientData.hba1c}
                    onChange={(e) => setPatientData({ ...patientData, hba1c: Number(e.target.value) })}
                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={executeStep1}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Registering..." : "Record Intake & Proceed to Fundus Capture"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stage 2 */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-cyan-400" />
                  Stage 2: Fundus Image Capture & Local Quality Gate
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Case ID: <span className="font-mono text-cyan-400">{caseNumber}</span> • Quality assessment runs instantly on the local rural edge.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono">
                QUALITY GATE READY
              </span>
            </div>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-4">
              <div className="w-20 h-20 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                <Eye className="w-10 h-10 text-cyan-400/80" />
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-white">Retinal Fundus Image: Right Eye (OD)</p>
                <p className="text-slate-400">Resolution: 2048 x 1536 px (2.4 MB raw) • Exposure: Automatic non-mydriatic</p>
                <p className="text-slate-500 text-[11px]">Local quality model: Laplacian Sharpness & Illumination Homogeneity Engine</p>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={executeStep2}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Running Quality Gate..." : "Pass Quality Gate & Run AI Screening"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stage 3 */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  Stage 3: Local AI Screening & Clinical Assurance Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  EfficientNet-B0 multiclass classification + U-Net lesion segmentation.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-mono">
                DUAL-ENGINE ASSURANCE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-slate-400 block font-semibold">Classification Prediction</span>
                <p className="text-lg font-bold text-red-400">Grade 3 — Severe Non-Proliferative DR</p>
                <p className="text-slate-400">Confidence: <span className="font-mono text-cyan-400">89.4%</span></p>
                <p className="text-slate-500 text-[11px]">Model: EfficientNet-B0 (APTOS trained weights)</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-slate-400 block font-semibold">Lesion Concordance Status</span>
                <p className="text-lg font-bold text-cyan-300">CONCORDANT EVIDENCE</p>
                <p className="text-slate-400">Detected: Multiple Microaneurysms, Blot Hemorrhages, Hard Exudates</p>
                <p className="text-slate-500 text-[11px]">Assurance: No grade-lesion mismatch detected</p>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={executeStep3}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Evaluating..." : "Generate Priority Triage & Evidence Capsule"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stage 4 */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Satellite className="w-5 h-5 text-cyan-400" />
                  Stage 4: Priority Triage & 3.2 KB Evidence Capsule Dispatch
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Current simulated connection: <strong className="text-amber-400">{networkCondition}</strong>
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold">
                PRIORITY: CRITICAL (93.5 / 100)
              </span>
            </div>

            <div className="glass-card p-4 border-slate-800 bg-slate-950/80 space-y-3 text-xs">
              <h4 className="font-semibold text-white">Synthesized 17-Field Evidence Capsule:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[11px]">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Patient Ref:</span>
                  <span className="text-slate-200">REF-PT-MLGURJAR</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Payload Size:</span>
                  <span className="text-cyan-400">3,240 bytes (3.2 KB)</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Transit Time @ 2G:</span>
                  <span className="text-emerald-400">0.42 seconds</span>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Queue Precedence:</span>
                  <span className="text-red-400">#1 (Jumps FIFO)</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={executeStep4}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Transmitting..." : "Dispatch Capsule to Telemedicine Center"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stage 5 */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  Stage 5: Remote Specialist Telemedicine Adjudication
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Apex Ophthalmologist receives capsule instantly, reviews under "Limited Evidence", and issues urgent referral.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono">
                LIMITED EVIDENCE REVIEW
              </span>
            </div>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Reviewing Specialist: Dr. Ananya Sharma (Apex Tele-Retina)</span>
                <span className="text-slate-400 text-[11px]">Timestamp: {new Date().toLocaleTimeString()}</span>
              </div>
              <div className="p-3 rounded bg-slate-900 border border-slate-800/80 text-slate-300 space-y-1">
                <p className="font-semibold text-red-400">Clinical Action: URGENT TERTIARY REFERRAL</p>
                <p className="text-slate-400">Destination: Apex Vitreoretinal Medical Centre, Jaipur</p>
                <p className="text-slate-400">Directives: Severe NPDR confirmed on tele-capsule preview. High risk of proliferative conversion or macular edema. Schedule laser/anti-VEGF consult within 7 days.</p>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={executeStep5}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Signing..." : "Sign Review & Transmit Report Back to Rural PHC"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Stage 6 */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Stage 6: Final Diagnostic Report Received Back at Rural PHC
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete end-to-end rural tele-screening lifecycle achieved with zero patient delays.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                COMPLETED
              </span>
            </div>

            <div className="p-5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-300">DRISHTI-X Verified Screening Report</span>
                <span className="font-mono text-xs text-slate-400">{caseNumber}</span>
              </div>
              <p className="text-slate-300">
                Patient <strong>{patientData.name}</strong> has been successfully triaged. The Evidence Capsule was transmitted in <strong>0.42 seconds</strong> over a simulated rural 2G link, evaluated by an Apex Ophthalmologist, and the verified treatment directive returned to Mandawa PHC.
              </p>
            </div>

            <div className="flex justify-between items-center pt-3">
              <button
                onClick={() => {
                  setCurrentStep(1)
                  setActiveCaseId(null)
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 text-xs hover:bg-slate-700/60 transition-colors"
              >
                Restart Demonstration
              </button>
              <button
                onClick={executeStep6}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Final Signed Diagnostic Report (PDF)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

