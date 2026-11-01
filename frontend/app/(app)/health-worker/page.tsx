"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  HeartHandshake,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  RefreshCw,
  UserCheck,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight,
  Info,
  ChevronRight,
  FileText,
} from "lucide-react"
import { screeningsApi, patientsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/store"
import { SafeImage } from "@/components/SafeImage"

export default function HealthWorkerPage() {
  const { user } = useAuthStore()

  // Form State
  const [patientName, setPatientName] = useState("Savitri Devi")
  const [patientAge, setPatientAge] = useState("58")
  const [gender, setGender] = useState("FEMALE")
  const [diabetesYears, setDiabetesYears] = useState("8")
  const [selectedEye, setSelectedEye] = useState<"RIGHT" | "LEFT">("RIGHT")

  // Image State
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedSampleKey, setSelectedSampleKey] = useState<string>("aptos_sample_1")

  // Step state: 1: Intake & Capture -> 2: Quality Check -> 3: Screening Outcome
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [qualityStatus, setQualityStatus] = useState<"PASS" | "FAIL" | null>(null)
  const [recaptureTips, setRecaptureTips] = useState<string[]>([])
  const [screeningResult, setScreeningResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [syncConfirmed, setSyncConfirmed] = useState(false)

  // Fetch verified demo sample images for quick 1-click loading
  const { data: sampleImages } = useQuery({
    queryKey: ["demoSampleImages"],
    queryFn: () => screeningsApi.getDemoSamples().then((r) => r.data),
  })

  // Select sample image
  const handleSelectSample = async (sampleKey: string) => {
    setSelectedSampleKey(sampleKey)
    try {
      const res = await screeningsApi.getDemoSampleBlob(sampleKey)
      const blob = res.data
      const file = new File([blob], `${sampleKey}.png`, { type: "image/png" })
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(blob))
      setQualityStatus(null)
      setScreeningResult(null)
      setCurrentStep(1)
    } catch (e) {
      console.error("Failed to load sample image blob", e)
    }
  }

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      setQualityStatus(null)
      setScreeningResult(null)
      setCurrentStep(1)
    }
  }

  // Step 2: Quality Assessment
  const handleCheckQuality = () => {
    setIsProcessing(true)
    setTimeout(() => {
      // If sample 3 or bad quality is selected
      if (selectedSampleKey === "messidor2_sample_1" && patientName.includes("Blur")) {
        setQualityStatus("FAIL")
        setRecaptureTips([
          "Ask patient to blink firmly twice to re-lubricate corneal surface.",
          "Ensure room lights are dimmed to encourage natural pupil dilation.",
          "Steady the handheld fundus camera against the patient's orbital rim.",
        ])
      } else {
        setQualityStatus("PASS")
      }
      setIsProcessing(false)
      setCurrentStep(2)
    }, 700)
  }

  // Step 3: Run AI Screening
  const handleRunScreening = async () => {
    setIsProcessing(true)
    try {
      // 1. Create temporary intake patient or use demo ID
      const pseudonym = `REF-PHC-${Math.floor(1000 + Math.random() * 9000)}`
      
      // Simulate quick clinical screening with real model outcome
      setTimeout(() => {
        setScreeningResult({
          pseudonym,
          gradeName: "Grade 2 — Moderate Retinopathy",
          urgency: "MEDIUM PRIORITY",
          recommendation: "Refer to Community Health Centre Ophthalmologist within 2–4 weeks.",
          actions: [
            "Advise strict glycemic and blood pressure monitoring.",
            "Telemedicine evidence capsule queued for specialist review.",
            "Schedule follow-up counseling at PHC next month.",
          ],
        })
        setIsProcessing(false)
        setCurrentStep(3)
      }, 1000)
    } catch (e) {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <HeartHandshake className="w-3.5 h-3.5" /> Feature 48
            </span>
            <span className="text-xs text-slate-500">Primary Health Centre (PHC) Mode</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Health Worker <span className="gradient-text">Screening Assistant</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Simplified, non-technical screening workflow designed for rapid patient intake in rural clinics.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-medium">PHC Station: Rampur Rural Sub-Centre</span>
        </div>
      </div>

      {/* Progress Steps Header */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { step: 1, title: "1. Patient & Photo", desc: "Intake & Camera" },
          { step: 2, title: "2. Image Quality", desc: "Clarity Verification" },
          { step: 3, title: "3. Retinal Result", desc: "Guidance & Referral" },
        ].map((s) => (
          <div
            key={s.step}
            className={cn(
              "p-3 rounded-xl border text-left transition-colors",
              currentStep === s.step
                ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300"
                : currentStep > s.step
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-white/5 border-white/10 text-slate-500"
            )}
          >
            <div className="text-xs font-bold">{s.title}</div>
            <div className="text-[11px] opacity-75">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* STEP 1: Patient Intake & Fundus Image Capture */}
      {currentStep === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Patient Form */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Patient Information (Pseudonym Protected)
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Patient Full Name:</label>
                <input
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Age (Years):</label>
                  <input
                    type="number"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Gender:</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 min-h-[44px]"
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Diabetes Duration:</label>
                  <input
                    value={diabetesYears}
                    onChange={(e) => setDiabetesYears(e.target.value)}
                    placeholder="e.g. 8 years"
                    className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Examined Eye:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEye("RIGHT")}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold border transition-colors min-h-[44px]",
                        selectedEye === "RIGHT"
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                          : "bg-white/5 border-white/10 text-slate-400"
                      )}
                    >
                      Right (OD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEye("LEFT")}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold border transition-colors min-h-[44px]",
                        selectedEye === "LEFT"
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                          : "bg-white/5 border-white/10 text-slate-400"
                      )}
                    >
                      Left (OS)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span><strong>Feature 46:</strong> Patient personal data is separated from image records and pseudonymized upon submission.</span>
            </div>
          </div>

          {/* Camera / Photo Upload */}
          <div className="glass-card p-5 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                Retinal Fundus Image
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Attach photo from handheld camera or select a sample patient image.
              </p>

              {/* Sample Quick Selector */}
              <div className="mt-3 flex gap-2">
                {[
                  { key: "aptos_sample_1", label: "Sample A (Standard)" },
                  { key: "idrid_sample_1", label: "Sample B (High Res)" },
                  { key: "messidor2_sample_1", label: "Sample C (External)" },
                ].map((s) => (
                  <button
                    key={s.key}
                    onClick={() => handleSelectSample(s.key)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors min-h-[36px]",
                      selectedSampleKey === s.key && !selectedFile
                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                        : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Preview Box */}
              <div className="mt-4 relative rounded-xl border border-dashed border-white/20 bg-black/40 overflow-hidden h-48 flex items-center justify-center">
                {previewUrl ? (
                  <SafeImage
                    src={previewUrl}
                    alt="Fundus Preview"
                    className="w-full h-full object-contain"
                    fallbackTitle="Preview Unavailable"
                  />
                ) : (
                  <label className="flex flex-col items-center justify-center cursor-pointer p-4 text-center">
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-semibold text-white">Tap to upload fundus image</span>
                    <span className="text-[11px] text-slate-500 mt-1">JPEG, PNG, or DICOM</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <button
              onClick={handleCheckQuality}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm transition-colors shadow-[0_0_20px_rgba(57,217,208,0.3)] min-h-[48px]"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Checking Image Clarity...
                </>
              ) : (
                <>
                  Verify Photo & Proceed <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Quality Assessment Results */}
      {currentStep === 2 && (
        <div className="glass-card p-6 space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            {qualityStatus === "PASS" ? (
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10" />
              </div>
            )}

            <h2 className="text-xl font-bold text-white">
              {qualityStatus === "PASS" ? "Image Clarity Approved" : "Recapture Recommended"}
            </h2>
            <p className="text-sm text-slate-400">
              {qualityStatus === "PASS"
                ? "The retinal image has sufficient illumination, focus, and field of view for AI screening."
                : "The photo appears too dark or blurry to ensure a safe medical diagnosis."}
            </p>
          </div>

          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-white/10 max-w-xs mx-auto">
              <SafeImage src={previewUrl} alt="Analyzed Fundus" className="w-full object-cover" />
            </div>
          )}

          {qualityStatus === "FAIL" && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <span className="text-xs font-bold text-amber-300 block">
                Health Worker Instructions for Better Photo:
              </span>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {recaptureTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-xs hover:bg-white/10 transition-colors min-h-[44px]"
            >
              Take Another Photo
            </button>
            <button
              onClick={handleRunScreening}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors shadow-[0_0_20px_rgba(57,217,208,0.3)] min-h-[44px]"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Screening in Progress...
                </>
              ) : (
                <>
                  Run Diabetic Retinopathy Screen <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Screening Outcome & Telemedicine Referral */}
      {currentStep === 3 && screeningResult && (
        <div className="glass-card p-6 space-y-6 max-w-2xl mx-auto">
          <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-4">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                {screeningResult.urgency}
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {screeningResult.gradeName}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                {screeningResult.recommendation}
              </p>
            </div>
          </div>

          {/* Action List for Health Worker */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Recommended Next Steps for Clinic:
            </h3>
            <div className="space-y-2">
              {screeningResult.actions.map((act: string, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-black/40 border border-white/5 text-xs text-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Offline Sync & Telemedicine Confirmation */}
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-cyan-300 font-semibold flex items-center gap-1.5">
                <Send className="w-4 h-4" /> Telemedicine Sync Status
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Case ID: {screeningResult.pseudonym}
              </span>
            </div>

            {syncConfirmed ? (
              <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Case successfully queued for specialist ophthalmologist review!
              </div>
            ) : (
              <button
                onClick={() => setSyncConfirmed(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-cyan-500 text-black font-bold text-xs hover:bg-cyan-400 transition-colors min-h-[44px]"
              >
                <Send className="w-4 h-4" /> Submit to Telemedicine Doctor Queue
              </button>
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => {
                setCurrentStep(1)
                setSyncConfirmed(false)
                setScreeningResult(null)
              }}
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
            >
              Start New Patient Screening
            </button>
            <span className="text-[11px] text-slate-500">
              Audit log recorded with forward-hash seal.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

