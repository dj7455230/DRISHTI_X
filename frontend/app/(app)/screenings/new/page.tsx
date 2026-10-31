"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { screeningsApi, patientsApi, api } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Brain,
  FileImage,
  UserRound,
  ShieldCheck,
  Camera,
  Activity,
  Stethoscope,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  RefreshCcw,
  ImageIcon,
  LockKeyhole,
  WifiOff,
  Search,
  Plus,
  Save,
  Trash2,
  Calendar,
  FileText,
  AlertTriangle,
  Download,
  Share2,
  Layers,
  Sparkles,
  HelpCircle,
  Info,
} from "lucide-react"
import { cn, DR_GRADE_COLORS, DR_GRADE_LABELS, DR_GRADE_BG, formatConfidence, formatDate } from "@/lib/utils"
import { useAuthStore, useNetworkStore } from "@/lib/store"
import { enqueue } from "@/lib/offlineQueue"
import { GradCamViewer } from "@/components/GradCamViewer"
import LesionViewer from "@/components/LesionViewer"

// ─── Step Definition ────────────────────────────────────────────────────────
type StepKey = "patient" | "medical" | "symptoms" | "upload" | "review" | "results"

interface StepItem {
  key: StepKey
  index: number
  label: string
  sublabel: string
}

const WORKFLOW_STEPS: StepItem[] = [
  { key: "patient", index: 1, label: "Patient", sublabel: "Identity & Demographics" },
  { key: "medical", index: 2, label: "Medical History", sublabel: "Diabetes & Glycemic Profile" },
  { key: "symptoms", index: 3, label: "Symptoms & Context", sublabel: "Eye History & Purpose" },
  { key: "upload", index: 4, label: "Fundus Imaging", sublabel: "Capture & Quality Gate" },
  { key: "review", index: 5, label: "Case Review", sublabel: "Verify & Quality Summary" },
  { key: "results", index: 6, label: "AI Screening", sublabel: "Evidence & Assurance" },
]

// ─── Visual Symptoms Options ────────────────────────────────────────────────
const SYMPTOM_OPTIONS = [
  { id: "NONE_REPORTED", label: "None reported (Asymptomatic)" },
  { id: "BLURRED_VISION", label: "Blurred vision" },
  { id: "FLOATERS", label: "Floaters or spots" },
  { id: "REDUCED_VISION", label: "Reduced visual acuity" },
  { id: "NIGHT_VISION_DIFFICULTY", label: "Difficulty seeing at night" },
  { id: "DISTORTED_VISION", label: "Distorted vision (Metamorphopsia)" },
  { id: "EYE_PAIN", label: "Eye pain or redness" },
  { id: "OTHER", label: "Other symptoms" },
  { id: "NOT_DOCUMENTED", label: "Not documented" },
]

// ─── Previous Eye Treatment Options ─────────────────────────────────────────
const TREATMENT_OPTIONS = [
  { id: "NONE", label: "No prior eye treatment" },
  { id: "LASER_PHOTOCOAGULATION", label: "Laser photocoagulation" },
  { id: "ANTI_VEGF_INJECTION", label: "Anti-VEGF injections" },
  { id: "VITRECTOMY", label: "Vitrectomy surgery" },
  { id: "CATARACT_SURGERY", label: "Cataract surgery" },
  { id: "OTHER", label: "Other ocular surgery" },
]

// ─── Relevant Eye Conditions ────────────────────────────────────────────────
const EYE_CONDITION_OPTIONS = [
  { id: "NONE", label: "None known" },
  { id: "CATARACT", label: "Cataract" },
  { id: "GLAUCOMA", label: "Glaucoma" },
  { id: "AGE_RELATED_MACULAR_DEGENERATION", label: "Macular Degeneration (AMD)" },
  { id: "HIGH_MYOPIA", label: "High myopia" },
  { id: "HYPERTENSIVE_RETINOPATHY", label: "Hypertensive retinopathy" },
  { id: "OTHER", label: "Other" },
]

function formatApiError(error: any, fallback: string): string {
  // 1. Client-side JavaScript Runtime / TypeError
  if (error instanceof TypeError || (error instanceof Error && !("response" in error) && (error as any).name !== "AxiosError")) {
    console.error("[Clinical Intake Diagnostic] Client Runtime Exception:", error.name, error.message)
    return `Client processing error: ${error.message}. Please verify entered values and retry.`
  }

  // 2. Network / Offline / Timeout
  if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
    console.warn("[Clinical Intake Diagnostic] Request Timeout: backend connection timed out.")
    return "Server connection timed out (30s). Please check network connectivity and retry."
  }
  if (error?.message === "Network Error" || (!error?.response && error?.request)) {
    console.warn("[Clinical Intake Diagnostic] Network unreachable at configured API URL.")
    return "Backend service unavailable. Please ensure the DRISHTI-X backend server is running on http://localhost:8000."
  }

  // 3. HTTP Response Status Handling
  const status = error?.response?.status
  const data = error?.response?.data

  // Safe developer diagnostic log (Correlation ID, HTTP status, endpoint; no PHI or credentials)
  const correlationId = error?.response?.headers?.["x-request-id"] || `err_${Date.now()}`
  console.error("[Clinical Intake Diagnostic]", {
    correlationId,
    endpoint: error?.config?.url,
    method: error?.config?.method?.toUpperCase(),
    status,
    statusText: error?.response?.statusText,
  })

  // 401 Unauthorized
  if (status === 401) {
    return "Authentication required or session expired. Please log in again to register screenings."
  }

  // 403 Forbidden
  if (status === 403) {
    return "Access denied. Your role or facility account is not authorized to register screening cases."
  }

  // 404 Not Found
  if (status === 404) {
    if (typeof data?.detail === "string") return data.detail
    return "Referenced patient or screening resource not found in database."
  }

  // 422 Unprocessable Entity (Validation)
  if (status === 422) {
    const detail = data?.detail
    if (Array.isArray(detail) && detail.length > 0) {
      const fieldErrors = detail.map((err: any) => {
        const fieldName = Array.isArray(err?.loc) ? err.loc.filter((l: any) => l !== "body").join(".") : "field"
        const msg = err?.msg || "Invalid format"
        return `${fieldName}: ${msg}`
      })
      return `Invalid or incomplete required information — ${fieldErrors.join("; ")}`
    }
    if (typeof detail === "string") return `Validation error: ${detail}`
    return "Invalid or incomplete clinical screening fields. Please verify required values."
  }

  // 500 Database / Internal Server Error
  if (status === 500) {
    if (typeof data?.detail === "string" && data.detail.length > 0) {
      return `Database operation failed: ${data.detail}`
    }
    return "Database operation failed. The screening record could not be committed. Please retry safely."
  }

  // Generic data detail or message
  if (typeof data?.detail === "string") return data.detail
  if (typeof data?.message === "string") return data.message
  if (typeof data === "string" && data.trim()) return data

  return fallback
}

function NewScreeningForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryPatientId = searchParams.get("patient_id")

  const currentUser = useAuthStore((s) => s.user)
  const isOnline = useNetworkStore((s) => s.isOnline)
  const setPendingSync = useNetworkStore((s) => s.setPendingSync)

  // Step state
  const [currentStep, setCurrentStep] = useState<StepKey>("patient")
  const [patientMode, setPatientMode] = useState<"new" | "existing">(queryPatientId ? "existing" : "new")
  const [existingSearch, setExistingSearch] = useState("")

  // Form State
  const [formData, setFormData] = useState({
    // Patient Identity
    patientId: "",
    patientCode: "",
    name: "",
    isAnonymous: false,
    dob: "",
    age: "",
    gender: "PREFER_NOT_TO_SAY",
    contactNumber: "",
    address: "",
    district: currentUser?.facility_location || "Varanasi",
    state: "Uttar Pradesh",
    facilityCode: currentUser?.facility_name || "Rural Screening Centre",

    // Medical & Diabetes History
    diabetesType: "TYPE_2",
    diabetesDuration: "",
    diabetesDurationUnknown: false,
    diabetesTreatment: "ORAL",
    hba1cValue: "",
    hba1cUnit: "%",
    hba1cDate: "",
    bloodGlucoseValue: "",
    bloodGlucoseUnit: "mg/dL",
    bloodGlucoseType: "RANDOM",
    pregnancyStatus: "NOT_APPLICABLE",

    // Symptoms & Eye Context
    visualSymptoms: [] as string[],
    symptomOnset: "",
    historyOfDr: "NONE_KNOWN",
    lastRetinalExamDate: "",
    previousEyeTreatment: [] as string[],
    relevantEyeConditions: [] as string[],
    screeningPurpose: "ROUTINE_DR_SCREENING",
    referralSource: "SELF_REFERRAL",
    facilityName: currentUser?.facility_name || "Primary Health Centre",
    operatorName: currentUser?.full_name || currentUser?.email || "Community Health Worker",
    clinicalNotes: "",

    // Retinal Imaging
    eyeSide: "RIGHT" as "LEFT" | "RIGHT" | "BOTH",
  })

  // Workflow identifiers & artifacts
  const [activeScreeningId, setActiveScreeningId] = useState<string>("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [qualityData, setQualityData] = useState<any>(null)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [error, setError] = useState<string>("")
  const [offlineSuccess, setOfflineSuccess] = useState<boolean>(false)
  const [isDraftSaved, setIsDraftSaved] = useState<boolean>(false)

  // Acquisition mode & camera simulation state
  const [acquisitionMode, setAcquisitionMode] = useState<"upload" | "camera">("upload")
  const [selectedCamera, setSelectedCamera] = useState<string>("forus_3nethra")
  const [cameraStatus, setCameraStatus] = useState<"idle" | "initializing" | "ready" | "capturing">("idle")
  const [overrideUngradable, setOverrideUngradable] = useState<boolean>(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState<boolean>(false)

  // Pre-load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem("drishti_screening_draft")
      if (savedDraft && !queryPatientId) {
        const parsed = JSON.parse(savedDraft)
        if (parsed.formData) {
          setFormData((prev) => ({
            ...prev,
            ...parsed.formData,
            name: parsed.formData.name || "",
            contactNumber: parsed.formData.contactNumber || "",
            address: parsed.formData.address || "",
            symptomOnset: parsed.formData.symptomOnset || "",
            clinicalNotes: parsed.formData.clinicalNotes || "",
            visualSymptoms: Array.isArray(parsed.formData.visualSymptoms) ? parsed.formData.visualSymptoms : [],
            previousEyeTreatment: Array.isArray(parsed.formData.previousEyeTreatment) ? parsed.formData.previousEyeTreatment : [],
            relevantEyeConditions: Array.isArray(parsed.formData.relevantEyeConditions) ? parsed.formData.relevantEyeConditions : [],
          }))
          if (parsed.activeScreeningId) setActiveScreeningId(parsed.activeScreeningId)
          if (parsed.currentStep && parsed.currentStep !== "results") {
            setCurrentStep(parsed.currentStep)
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse local draft", e)
    }
  }, [queryPatientId])

  // If query parameter patient_id is present, load patient directly
  const { data: existingPatientData } = useQuery({
    queryKey: ["patient-preload", queryPatientId],
    queryFn: () => patientsApi.get(queryPatientId!).then((r) => r.data),
    enabled: Boolean(queryPatientId),
  })

  useEffect(() => {
    if (existingPatientData) {
      setPatientMode("existing")
      setFormData((prev) => ({
        ...prev,
        patientId: existingPatientData.id,
        patientCode: existingPatientData.patient_code,
        name: existingPatientData.name || "",
        age: existingPatientData.age ? String(existingPatientData.age) : "",
        gender: existingPatientData.gender || "PREFER_NOT_TO_SAY",
        isAnonymous: existingPatientData.is_anonymous || false,
        diabetesDuration: existingPatientData.diabetes_duration_years
          ? String(existingPatientData.diabetes_duration_years)
          : "",
        diabetesType: existingPatientData.diabetes_type || "TYPE_2",
        diabetesTreatment: existingPatientData.diabetes_treatment || "ORAL",
        hba1cValue: existingPatientData.hba1c_value ? String(existingPatientData.hba1c_value) : "",
        district: existingPatientData.district || prev.district,
        state: existingPatientData.state || prev.state,
      }))
    }
  }, [existingPatientData])

  // Existing patients search list
  const { data: existingPatientsList, isLoading: isPatientsLoading } = useQuery({
    queryKey: ["existing-patients", existingSearch],
    queryFn: () => patientsApi.list({ search: existingSearch, limit: 10 }).then((r) => r.data),
    enabled: patientMode === "existing" && isOnline,
  })

  // Automatic Age Calculation from Date of Birth
  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dobStr = e.target.value
    setFormData((prev) => {
      let calculatedAge = prev.age
      if (dobStr) {
        const birthDate = new Date(dobStr)
        const today = new Date()
        let calculated = today.getFullYear() - birthDate.getFullYear()
        const m = today.getMonth() - birthDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculated--
        }
        if (calculated >= 0 && calculated <= 125) {
          calculatedAge = String(calculated)
        }
      }
      return { ...prev, dob: dobStr, age: calculatedAge }
    })
  }

  // Toggle visual symptoms
  const toggleSymptom = (id: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.visualSymptoms) ? prev.visualSymptoms : []
      if (id === "NONE_REPORTED" || id === "NOT_DOCUMENTED") {
        return { ...prev, visualSymptoms: [id] }
      }
      const filtered = current.filter((s) => s !== "NONE_REPORTED" && s !== "NOT_DOCUMENTED")
      const exists = filtered.includes(id)
      const next = exists ? filtered.filter((s) => s !== id) : [...filtered, id]
      return { ...prev, visualSymptoms: next.length === 0 ? ["NONE_REPORTED"] : next }
    })
  }

  // Toggle eye treatments
  const toggleTreatment = (id: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.previousEyeTreatment) ? prev.previousEyeTreatment : []
      if (id === "NONE") return { ...prev, previousEyeTreatment: ["NONE"] }
      const filtered = current.filter((t) => t !== "NONE")
      const exists = filtered.includes(id)
      const next = exists ? filtered.filter((t) => t !== id) : [...filtered, id]
      return { ...prev, previousEyeTreatment: next.length === 0 ? ["NONE"] : next }
    })
  }

  // Toggle eye conditions
  const toggleCondition = (id: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.relevantEyeConditions) ? prev.relevantEyeConditions : []
      if (id === "NONE") return { ...prev, relevantEyeConditions: ["NONE"] }
      const filtered = current.filter((c) => c !== "NONE")
      const exists = filtered.includes(id)
      const next = exists ? filtered.filter((c) => c !== id) : [...filtered, id]
      return { ...prev, relevantEyeConditions: next.length === 0 ? ["NONE"] : next }
    })
  }

  // Save Local Draft
  const saveDraft = () => {
    try {
      localStorage.setItem(
        "drishti_screening_draft",
        JSON.stringify({
          formData,
          activeScreeningId,
          currentStep,
          updatedAt: new Date().toISOString(),
        })
      )
      setIsDraftSaved(true)
      setTimeout(() => setIsDraftSaved(false), 2500)
    } catch (e) {
      console.warn("Unable to save local draft", e)
    }
  }

  // Clear Draft
  const clearDraft = () => {
    if (confirm("Clear entered patient information and restart screening?")) {
      localStorage.removeItem("drishti_screening_draft")
      window.location.href = "/screenings/new"
    }
  }

  // 1. Create or Update Patient & Screening Mutation
  const registerPatientAndScreeningMutation = useMutation({
    mutationFn: async () => {
      // Build safe patient payload with explicit null-safety on all inputs
      const patientPayload = {
        name: formData.isAnonymous ? null : (formData.name ? formData.name.trim() : null) || null,
        age: formData.age !== "" && !Number.isNaN(Number(formData.age)) ? Number(formData.age) : null,
        date_of_birth: formData.dob || null,
        gender: formData.gender,
        contact_number: formData.isAnonymous ? null : (formData.contactNumber ? formData.contactNumber.trim() : null) || null,
        address: formData.isAnonymous ? null : (formData.address ? formData.address.trim() : null) || null,
        is_anonymous: Boolean(formData.isAnonymous),
        diabetes_type: formData.diabetesType,
        diabetes_duration_years: formData.diabetesDurationUnknown
          ? null
          : (formData.diabetesDuration !== "" && !Number.isNaN(Number(formData.diabetesDuration)) ? Number(formData.diabetesDuration) : null),
        diabetes_treatment: formData.diabetesTreatment,
        hba1c_value: formData.hba1cValue !== "" && !Number.isNaN(Number(formData.hba1cValue)) ? Number(formData.hba1cValue) : null,
        hba1c_unit: formData.hba1cUnit || "%",
        hba1c_date: formData.hba1cDate || null,
        blood_glucose_value: formData.bloodGlucoseValue !== "" && !Number.isNaN(Number(formData.bloodGlucoseValue)) ? Number(formData.bloodGlucoseValue) : null,
        blood_glucose_unit: formData.bloodGlucoseUnit || "mg/dL",
        blood_glucose_type: formData.bloodGlucoseType || "RANDOM",
        history_of_dr: formData.historyOfDr,
        last_retinal_exam_date: formData.lastRetinalExamDate || null,
        previous_eye_treatment: Array.isArray(formData.previousEyeTreatment) && formData.previousEyeTreatment.length > 0
          ? formData.previousEyeTreatment.join(", ")
          : null,
        relevant_eye_conditions: Array.isArray(formData.relevantEyeConditions) && formData.relevantEyeConditions.length > 0
          ? formData.relevantEyeConditions.join(", ")
          : null,
        visual_symptoms: Array.isArray(formData.visualSymptoms) ? formData.visualSymptoms : [],
        symptom_onset: formData.symptomOnset ? formData.symptomOnset.trim() : null,
        pregnancy_status: formData.gender === "FEMALE" ? formData.pregnancyStatus : null,
        facility_code: formData.facilityCode || currentUser?.facility_name || "Rural Screening Centre",
        district: formData.district || currentUser?.facility_location || "Varanasi",
        state: formData.state || "Uttar Pradesh",
        notes: formData.clinicalNotes ? formData.clinicalNotes.trim() : null,
      }

      // Safe update if active screening already exists (user went back to review/edit)
      if (activeScreeningId) {
        if (patientMode === "new" && formData.patientId) {
          try {
            await patientsApi.update(formData.patientId, patientPayload)
          } catch (patUpdateErr) {
            console.warn("[Screening Intake] Patient update note:", patUpdateErr)
          }
        }
        const screeningUpdatePayload = {
          eye_side: formData.eyeSide,
          screening_purpose: formData.screeningPurpose,
          screening_notes: formData.clinicalNotes ? formData.clinicalNotes.trim() : null,
          referral_source: formData.referralSource,
          facility_name: formData.facilityName || currentUser?.facility_name || "Primary Health Centre",
          operator_name: formData.operatorName || currentUser?.full_name || currentUser?.email || "Community Health Worker",
        }
        const scrRes = await screeningsApi.update(activeScreeningId, screeningUpdatePayload)
        return { patientId: formData.patientId, screening: scrRes.data }
      }

      // Fresh initialization: Attempt atomic intake in single database transaction
      try {
        const intakePayload = {
          patient_id: patientMode === "existing" ? (formData.patientId || null) : null,
          patient: patientMode === "new" ? patientPayload : null,
          eye_side: formData.eyeSide,
          screening_purpose: formData.screeningPurpose,
          screening_notes: formData.clinicalNotes ? formData.clinicalNotes.trim() : null,
          referral_source: formData.referralSource,
          facility_name: formData.facilityName || currentUser?.facility_name || "Primary Health Centre",
          operator_name: formData.operatorName || currentUser?.full_name || currentUser?.email || "Community Health Worker",
        }
        const intakeRes = await screeningsApi.intake(intakePayload)
        const intakeData = intakeRes.data
        setFormData((prev) => ({
          ...prev,
          patientId: intakeData.patient.id,
          patientCode: intakeData.patient.patient_code,
        }))
        return { patientId: intakeData.patient.id, screening: intakeData.screening }
      } catch (intakeErr: any) {
        // Fallback to separate endpoints only if intake route is not yet deployed (404)
        if (intakeErr?.response?.status === 404) {
          console.warn("[Screening Intake] Atomic endpoint not found, falling back to separate endpoints.")
          let resolvedPatientId = formData.patientId
          if (patientMode === "new" || !resolvedPatientId) {
            const patientRes = await patientsApi.create(patientPayload)
            resolvedPatientId = patientRes.data.id
            setFormData((prev) => ({
              ...prev,
              patientId: patientRes.data.id,
              patientCode: patientRes.data.patient_code,
            }))
          }
          const screeningPayload = {
            patient_id: resolvedPatientId,
            eye_side: formData.eyeSide,
            screening_purpose: formData.screeningPurpose,
            screening_notes: formData.clinicalNotes ? formData.clinicalNotes.trim() : null,
            referral_source: formData.referralSource,
            facility_name: formData.facilityName || currentUser?.facility_name || "Primary Health Centre",
            operator_name: formData.operatorName || currentUser?.full_name || currentUser?.email || "Community Health Worker",
          }
          const screeningRes = await screeningsApi.create(screeningPayload)
          return { patientId: resolvedPatientId, screening: screeningRes.data }
        }
        throw intakeErr
      }
    },
    onSuccess: ({ patientId, screening }) => {
      setActiveScreeningId(screening.id)
      setError("")
      setCurrentStep("upload")
      saveDraft()
    },
    onError: (e: any) => {
      setError(formatApiError(e, "Screening initialization failed; retry safely."))
    },
  })

  // 2. Upload Image Mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeScreeningId) throw new Error("Screening ID is missing.")
      return screeningsApi.uploadImage(activeScreeningId, file)
    },
    onSuccess: async () => {
      setError("")
      try {
        // Automatically run instant quality gate check upon successful image upload
        const qcRes = await screeningsApi.qualityCheck(activeScreeningId)
        setQualityData(qcRes.data)
        const isUngradable =
          qcRes.data.quality_category === "Poor" ||
          qcRes.data.quality_status === "UNGRADABLE" ||
          qcRes.data.is_gradable === false
        if (!isUngradable || overrideUngradable) {
          setCurrentStep("review")
        }
      } catch (qcErr) {
        console.warn("Quality check notification:", qcErr)
        setCurrentStep("review")
      }
      saveDraft()
    },
    onError: (e: any) => {
      setError(formatApiError(e, "Retinal fundus image upload failed. Please verify format and size."))
    },
  })

  // Demonstration Dataset Sample Loader (Feature 3)
  const handleLoadDemoSample = async (sampleKey: string) => {
    setIsLoadingDemo(true)
    setError("")
    try {
      const response = await screeningsApi.getDemoSampleBlob(sampleKey)
      const blob = response.data
      const filename =
        sampleKey === "aptos_sample_1"
          ? "APTOS_000c1434d8d7.png"
          : sampleKey === "idrid_sample_1"
          ? "IDRiD_001.jpg"
          : "Messidor2_20051020_43808.png"
      const file = new File([blob], filename, { type: blob.type || "image/jpeg" })
      handleFileSelect(file)
    } catch (e: any) {
      setError(formatApiError(e, "Failed to load demonstration dataset sample."))
    } finally {
      setIsLoadingDemo(false)
    }
  }

  // Camera Capture Simulation (Feature 4)
  const handleSimulateCameraCapture = async () => {
    setCameraStatus("capturing")
    setError("")
    try {
      const sampleKey =
        selectedCamera === "forus_3nethra"
          ? "idrid_sample_1"
          : selectedCamera === "remidio_fop"
          ? "aptos_sample_1"
          : "messidor2_sample_1"
      await handleLoadDemoSample(sampleKey)
      setCameraStatus("ready")
    } catch (e: any) {
      setCameraStatus("ready")
      setError(formatApiError(e, "Camera acquisition simulation failed."))
    }
  }

  // 3. Analyze Screening Mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!activeScreeningId) throw new Error("No screening ID to analyze.")
      return screeningsApi.analyze(activeScreeningId)
    },
    onSuccess: (res) => {
      setAnalysisResult(res.data)
      setCurrentStep("results")
      setError("")
      localStorage.removeItem("drishti_screening_draft")
    },
    onError: (e: any) => {
      setError(formatApiError(e, "Screening inference could not be completed."))
    },
  })

  // File select handler
  const handleFileSelect = useCallback((file: File) => {
    // Validate file format and size
    const validTypes = ["image/jpeg", "image/png", "image/bmp", "image/tiff"]
    if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|bmp|tiff|tif)$/i)) {
      setError("Unsupported image format. Please upload JPEG, PNG, TIFF, or BMP fundus images.")
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File exceeds 20MB limit. Please provide an optimized fundus image.")
      return
    }

    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
    setError("")
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  // Validation before proceeding from Step 1
  const validatePatientStep = () => {
    if (patientMode === "existing") {
      if (!formData.patientId) {
        setError("Please select an existing patient from the list, or switch to 'Register New Patient'.")
        return false
      }
      return true
    }

    if (!formData.isAnonymous && !formData.name.trim()) {
      setError("Patient Full Name is required. If this is a rural walk-in, enable 'Anonymous Walk-in Patient'.")
      return false
    }

    const numericAge = Number(formData.age)
    if (!formData.age || Number.isNaN(numericAge) || numericAge < 1 || numericAge > 125) {
      setError("Please provide a valid patient age between 1 and 125 years (or select Date of Birth).")
      return false
    }

    setError("")
    return true
  }

  // Handle Offline Screening Save
  const handleOfflineSave = async () => {
    if (!imagePreview) {
      setError("Please capture or select a fundus photograph before saving for offline synchronization.")
      return
    }
    const caseId = `offline_camp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    await enqueue({
      id: caseId,
      type: "OFFLINE_SCREENING",
      payload: {
        client_case_id: caseId,
        patient_name: formData.name,
        patient_age: Number(formData.age) || 50,
        gender: formData.gender,
        diabetes_type: formData.diabetesType,
        diabetes_duration: formData.diabetesDuration,
        diabetes_treatment: formData.diabetesTreatment,
        hba1c_value: formData.hba1cValue,
        blood_glucose_value: formData.bloodGlucoseValue,
        visual_symptoms: formData.visualSymptoms,
        eye_side: formData.eyeSide,
        district: formData.district,
        state: formData.state,
        image_base64: imagePreview,
        captured_at: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    })
    setOfflineSuccess(true)
    setPendingSync(useNetworkStore.getState().pendingSyncCount + 1)
  }

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 pb-16 px-3 sm:px-6">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col justify-between gap-4 border-b border-[#dce7e7] pb-5 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#eaf4f3] px-2.5 py-1 text-[11px] font-semibold text-[#285e63]">
              <Eye className="h-3.5 w-3.5 text-[#3b7f83]" />
              Clinical Screening Intake
            </span>
            <span className="text-[11px] font-medium text-[#7a888c]">· DRISHTI-X AI Assisted</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#142e3b] sm:text-3xl">
            Diabetic Retinopathy Screening
          </h1>
          <p className="mt-1 text-xs text-[#68787f] sm:text-sm">
            Complete clinical data collection, fundus image quality verification, and AI-assisted retinopathy grading.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={saveDraft}
            className="flex items-center gap-1.5 rounded-xl border border-[#d2dede] bg-white px-3.5 py-2 text-xs font-semibold text-[#324f5a] shadow-sm transition hover:bg-[#f6f9f9]"
          >
            <Save className="h-3.5 w-3.5 text-[#3b7f83]" />
            {isDraftSaved ? "Draft Saved!" : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={clearDraft}
            className="flex items-center gap-1.5 rounded-xl border border-[#ebdada] bg-[#fffbfb] px-3.5 py-2 text-xs font-semibold text-[#a34a4a] shadow-sm transition hover:bg-[#fff2f2]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </section>

      {/* ── WORKFLOW STEPPER PROGRESS INDICATOR ──────────────────────────── */}
      <nav aria-label="Screening workflow steps" className="rounded-2xl border border-[#dce7e7] bg-white p-3.5 shadow-sm">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {WORKFLOW_STEPS.map((s, idx) => {
            const currentIdx = WORKFLOW_STEPS.findIndex((x) => x.key === currentStep)
            const isCompleted = idx < currentIdx
            const isCurrent = s.key === currentStep

            return (
              <li
                key={s.key}
                onClick={() => {
                  if (idx <= currentIdx) setCurrentStep(s.key)
                }}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2.5 rounded-xl p-2.5 transition",
                  isCurrent
                    ? "bg-[#173f56] text-white shadow-sm"
                    : isCompleted
                    ? "bg-[#f2f8f7] text-[#295459] hover:bg-[#e8f3f1]"
                    : "text-[#8d9c9f] hover:bg-slate-50"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isCurrent
                      ? "bg-white text-[#173f56]"
                      : isCompleted
                      ? "bg-[#3b7f83] text-white"
                      : "border border-[#cfdbdb] bg-white text-[#8d9c9f]"
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : s.index}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xs font-bold leading-tight">{s.label}</p>
                  <p
                    className={cn(
                      "truncate text-[10px]",
                      isCurrent ? "text-white/75" : "text-[#88979b]"
                    )}
                  >
                    {s.sublabel}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* ── RURAL OFFLINE MODE BANNER ───────────────────────────────────── */}
      {!isOnline && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-xs text-amber-950">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-800">Rural Offline Camp Mode Active</p>
            <p className="text-[11px] leading-relaxed text-amber-700">
              No internet connection detected. You can record patient details and fundus photographs safely on this device.
              Cases are securely preserved in local encrypted storage and will synchronize automatically when connectivity is restored.
            </p>
          </div>
        </div>
      )}

      {/* ── ERROR ALERT ──────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-2xl border border-[#ebc6c6] bg-[#fff5f5] px-4 py-3 text-xs text-[#a14545]"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button type="button" onClick={() => setError("")} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── STEP CONTENT AREA ────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: PATIENT IDENTIFICATION & DEMOGRAPHICS                    */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "patient" && (
          <motion.div
            key="step-patient"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]"
          >
            <div className="space-y-6 rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf4f3]">
                    <UserRound className="h-5 w-5 text-[#3b7f83]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#142e3b]">Patient Demographics</h2>
                    <p className="text-xs text-[#738388]">Register a new individual or link to an existing clinical record.</p>
                  </div>
                </div>

                {/* Patient Mode Toggle */}
                <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      setPatientMode("new")
                      setFormData((p) => ({ ...p, patientId: "" }))
                    }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 transition",
                      patientMode === "new" ? "bg-white text-[#142e3b] shadow-sm" : "hover:text-slate-900"
                    )}
                  >
                    Register New
                  </button>
                  <button
                    type="button"
                    onClick={() => setPatientMode("existing")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 transition",
                      patientMode === "existing" ? "bg-white text-[#142e3b] shadow-sm" : "hover:text-slate-900"
                    )}
                  >
                    Select Existing
                  </button>
                </div>
              </div>

              {/* Mode: Existing Patient Picker */}
              {patientMode === "existing" ? (
                <div className="space-y-4">
                  <label className="block text-xs font-semibold text-[#29424c]">
                    Search Existing Patient Database
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={existingSearch}
                      onChange={(e) => setExistingSearch(e.target.value)}
                      placeholder="Search by Patient Code, Name, District, or Contact..."
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:bg-white focus:ring-4 focus:ring-[#3b7f83]/10"
                    />
                  </div>

                  {isPatientsLoading ? (
                    <div className="flex items-center justify-center p-6 text-xs text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#3b7f83]" /> Loading patient records...
                    </div>
                  ) : existingPatientsList && existingPatientsList.length > 0 ? (
                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                      {existingPatientsList.map((pt: any) => {
                        const isSelected = formData.patientId === pt.id
                        return (
                          <div
                            key={pt.id}
                            onClick={() => {
                              setFormData((p) => ({
                                ...p,
                                patientId: pt.id,
                                patientCode: pt.patient_code,
                                name: pt.name || "",
                                age: pt.age ? String(pt.age) : "",
                                gender: pt.gender || "PREFER_NOT_TO_SAY",
                                isAnonymous: pt.is_anonymous || false,
                                district: pt.district || p.district,
                                state: pt.state || p.state,
                                diabetesType: pt.diabetes_type || p.diabetesType,
                                diabetesDuration: pt.diabetes_duration_years ? String(pt.diabetes_duration_years) : p.diabetesDuration,
                              }))
                              setError("")
                            }}
                            className={cn(
                              "flex cursor-pointer items-center justify-between rounded-xl border p-3.5 text-xs transition",
                              isSelected
                                ? "border-[#3b7f83] bg-[#eaf4f3]/60 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                            )}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#142e3b]">{pt.patient_code}</span>
                                {pt.name && <span className="font-semibold text-slate-700">· {pt.name}</span>}
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {[pt.age && `${pt.age} yrs`, pt.gender, pt.district, pt.state].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="text-right">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#3b7f83] px-2.5 py-0.5 text-[10px] font-bold text-white">
                                  <CheckCircle2 className="h-3 w-3" /> Selected
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-[#3b7f83]">Select →</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      No patients found matching your search. Try adjusting the query or click &apos;Register New&apos;.
                    </div>
                  )}
                </div>
              ) : (
                /* Mode: Register New Patient Form */
                <div className="space-y-5">
                  {/* Anonymous / Rural Walk-in Toggle */}
                  <div className="flex items-center justify-between rounded-2xl border border-[#dbe8e6] bg-[#f8fbfa] p-4">
                    <div>
                      <p className="text-xs font-bold text-[#142e3b]">Anonymous / Rural Community Walk-in</p>
                      <p className="text-[11px] text-[#708186]">
                        De-identifies the patient record. Generates a unique case token without requiring full name or phone.
                      </p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={formData.isAnonymous}
                        onChange={(e) => setFormData((p) => ({ ...p, isAnonymous: e.target.checked }))}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#3b7f83] peer-checked:after:translate-x-full peer-focus:outline-none" />
                    </label>
                  </div>

                  {/* Patient Name (if not anonymous) */}
                  {!formData.isAnonymous && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Ramesh Kumar Patel"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                      />
                    </div>
                  )}

                  {/* DOB and Age Row */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                        Date of Birth <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="date"
                          value={formData.dob}
                          onChange={handleDobChange}
                          max={new Date().toISOString().split("T")[0]}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                        Patient Age (Years) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="125"
                        value={formData.age}
                        onChange={(e) => setFormData((p) => ({ ...p, age: e.target.value }))}
                        placeholder="e.g. 52"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                      />
                    </div>
                  </div>

                  {/* Gender / Sex */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                      Sex / Gender <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { id: "MALE", label: "Male" },
                        { id: "FEMALE", label: "Female" },
                        { id: "OTHER", label: "Other" },
                        { id: "PREFER_NOT_TO_SAY", label: "Not Specified" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFormData((p) => ({ ...p, gender: item.id }))}
                          className={cn(
                            "rounded-xl border py-2.5 text-center text-xs font-semibold transition",
                            formData.gender === item.id
                              ? "border-[#3b7f83] bg-[#eaf4f3] text-[#1b5055]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Contact Number and Village / Address (Optional) */}
                  {!formData.isAnonymous && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                          Contact Phone <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                        </label>
                        <input
                          type="tel"
                          value={formData.contactNumber}
                          onChange={(e) => setFormData((p) => ({ ...p, contactNumber: e.target.value }))}
                          placeholder="+91 98765 43210"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                          Village / Locality <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.address}
                          onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                          placeholder="e.g. Sarnath, Block Cholapur"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                        />
                      </div>
                    </div>
                  )}

                  {/* District & State */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">District</label>
                      <input
                        type="text"
                        value={formData.district}
                        onChange={(e) => setFormData((p) => ({ ...p, district: e.target.value }))}
                        placeholder="Varanasi"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">State</label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData((p) => ({ ...p, state: e.target.value }))}
                        placeholder="Uttar Pradesh"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Action */}
              <div className="flex items-center justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (validatePatientStep()) {
                      setCurrentStep("medical")
                    }
                  }}
                  className="flex items-center gap-2 rounded-xl bg-[#173f56] px-6 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#102f42]"
                >
                  Continue to Medical History
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Context Sidebar */}
            <aside className="space-y-4">
              <div className="rounded-3xl border border-[#dce7e7] bg-[#f8fbfb] p-6 text-xs text-[#324f5a]">
                <div className="flex items-center gap-2 font-bold text-[#1b5055]">
                  <ShieldCheck className="h-4 w-4 text-[#3b7f83]" />
                  Rural Health Camp Protocol
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#687b80]">
                  DRISHTI-X generates privacy-preserving patient codes (`DX-YYYYMM-XXXXXX`) for all encounters.
                  Personal identifiers remain local to your authorized health centre.
                </p>
                <div className="mt-4 rounded-2xl bg-white p-3.5 border border-[#e1eded]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#3b7f83]">Active Screening Facility</p>
                  <p className="mt-1 font-semibold text-[#142e3b]">{formData.facilityName || "Primary Health Centre"}</p>
                  <p className="text-[11px] text-slate-500">Operator: {formData.operatorName}</p>
                </div>
              </div>
            </aside>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: MEDICAL & DIABETES CLINICAL HISTORY                      */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "medical" && (
          <motion.div
            key="step-medical"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]"
          >
            <div className="space-y-6 rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf4f3]">
                  <Activity className="h-5 w-5 text-[#3b7f83]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#142e3b]">Diabetes & Glycemic Profile</h2>
                  <p className="text-xs text-[#738388]">Document diabetes duration, current medication regimen, and lab values.</p>
                </div>
              </div>

              {/* Diabetes Type */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#29424c]">
                  Known Diabetes Diagnosis Status
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { id: "TYPE_2", label: "Type 2 Diabetes" },
                    { id: "TYPE_1", label: "Type 1 Diabetes" },
                    { id: "GESTATIONAL", label: "Gestational" },
                    { id: "OTHER", label: "Other Etiology" },
                    { id: "UNKNOWN", label: "Unknown" },
                    { id: "NOT_DOCUMENTED", label: "Not Documented" },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, diabetesType: d.id }))}
                      className={cn(
                        "rounded-xl border p-3 text-left text-xs font-semibold transition",
                        formData.diabetesType === d.id
                          ? "border-[#3b7f83] bg-[#eaf4f3] text-[#1b5055]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration of Diabetes */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                    Duration of Diabetes (Years)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="80"
                    disabled={formData.diabetesDurationUnknown}
                    value={formData.diabetesDuration}
                    onChange={(e) => setFormData((p) => ({ ...p, diabetesDuration: e.target.value }))}
                    placeholder="e.g. 8"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.diabetesDurationUnknown}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          diabetesDurationUnknown: e.target.checked,
                          diabetesDuration: e.target.checked ? "" : p.diabetesDuration,
                        }))
                      }
                      className="rounded border-slate-300 text-[#3b7f83] focus:ring-[#3b7f83]"
                    />
                    Duration unknown or unrecorded
                  </label>
                </div>

                {/* Treatment Regimen */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                    Current Diabetes Treatment
                  </label>
                  <select
                    value={formData.diabetesTreatment}
                    onChange={(e) => setFormData((p) => ({ ...p, diabetesTreatment: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                  >
                    <option value="ORAL">Oral Medication Only (Metformin/Sulfonylureas)</option>
                    <option value="INSULIN">Insulin Therapy Only</option>
                    <option value="BOTH">Both Insulin & Oral Medication</option>
                    <option value="LIFESTYLE">Diet / Lifestyle Management Only</option>
                    <option value="OTHER">Other / Ayurvedic / Herbal</option>
                    <option value="UNKNOWN">Unknown / Not Documented</option>
                  </select>
                </div>
              </div>

              {/* Lab Values (Optional) */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                <p className="text-xs font-bold text-[#142e3b] flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-[#3b7f83]" />
                  Recent Glycemic Lab Biomarkers (Optional)
                </p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* HbA1c */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">Latest HbA1c Value</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="3"
                        max="25"
                        value={formData.hba1cValue}
                        onChange={(e) => setFormData((p) => ({ ...p, hba1cValue: e.target.value }))}
                        placeholder="e.g. 7.8"
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#3b7f83]"
                      />
                      <select
                        value={formData.hba1cUnit}
                        onChange={(e) => setFormData((p) => ({ ...p, hba1cUnit: e.target.value }))}
                        className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                      >
                        <option value="%">%</option>
                        <option value="mmol/mol">mmol/mol</option>
                      </select>
                    </div>
                  </div>

                  {/* Blood Glucose */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-700">Blood Glucose Level</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="20"
                        max="800"
                        value={formData.bloodGlucoseValue}
                        onChange={(e) => setFormData((p) => ({ ...p, bloodGlucoseValue: e.target.value }))}
                        placeholder="e.g. 165"
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#3b7f83]"
                      />
                      <select
                        value={formData.bloodGlucoseType}
                        onChange={(e) => setFormData((p) => ({ ...p, bloodGlucoseType: e.target.value }))}
                        className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-2 text-xs"
                      >
                        <option value="RANDOM">Random</option>
                        <option value="FASTING">Fasting</option>
                        <option value="POST_PRANDIAL">Post-Prandial</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pregnancy Status (if female) */}
              {formData.gender === "FEMALE" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">Pregnancy Status</label>
                  <select
                    value={formData.pregnancyStatus}
                    onChange={(e) => setFormData((p) => ({ ...p, pregnancyStatus: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83]"
                  >
                    <option value="NOT_PREGNANT">Not Pregnant</option>
                    <option value="FIRST_TRIMESTER">Pregnant — 1st Trimester</option>
                    <option value="SECOND_TRIMESTER">Pregnant — 2nd Trimester</option>
                    <option value="THIRD_TRIMESTER">Pregnant — 3rd Trimester</option>
                    <option value="NOT_APPLICABLE">Not Applicable / Unknown</option>
                  </select>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep("patient")}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back to Patient
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep("symptoms")}
                  className="flex items-center gap-2 rounded-xl bg-[#173f56] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#102f42]"
                >
                  Continue to Symptoms & Context
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-[#dce7e7] bg-[#f8fbfb] p-6 text-xs text-[#324f5a]">
                <p className="font-bold text-[#1b5055]">Clinical Relevance of Duration</p>
                <p className="mt-2 text-[11px] leading-relaxed text-[#687b80]">
                  Diabetic retinopathy risk increases significantly after 5–10 years of diabetes duration and with
                  sub-optimal glycemic control (HbA1c &gt; 8.0%).
                </p>
              </div>
            </aside>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: SYMPTOMS & PREVIOUS EYE CONTEXT                          */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "symptoms" && (
          <motion.div
            key="step-symptoms"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]"
          >
            <div className="space-y-6 rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf4f3]">
                  <Eye className="h-5 w-5 text-[#3b7f83]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#142e3b]">Ocular Symptoms & Screening Context</h2>
                  <p className="text-xs text-[#738388]">Capture visual complaints, prior ocular therapies, and purpose of assessment.</p>
                </div>
              </div>

              {/* Current Visual Symptoms (Multi-select) */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#29424c]">
                  Reported Visual Symptoms <span className="text-[10px] text-slate-400">(Select all that apply)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {SYMPTOM_OPTIONS.map((sym) => {
                    const isChecked = formData.visualSymptoms.includes(sym.id)
                    return (
                      <button
                        key={sym.id}
                        type="button"
                        onClick={() => toggleSymptom(sym.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-medium transition",
                          isChecked
                            ? "border-[#3b7f83] bg-[#eaf4f3] text-[#1b5055] font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {isChecked && <CheckCircle2 className="mr-1.5 inline-block h-3.5 w-3.5 text-[#3b7f83]" />}
                        {sym.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Known DR History & Previous Treatments */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">Known Prior Retinopathy</label>
                  <select
                    value={formData.historyOfDr}
                    onChange={(e) => setFormData((p) => ({ ...p, historyOfDr: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83]"
                  >
                    <option value="NONE_KNOWN">No Previous DR / First Screening</option>
                    <option value="MILD_NPDR">Mild NPDR Previously Diagnosed</option>
                    <option value="MODERATE_NPDR">Moderate NPDR</option>
                    <option value="SEVERE_NPDR">Severe NPDR</option>
                    <option value="PROLIFERATIVE_DR">Proliferative DR (PDR)</option>
                    <option value="PRIOR_LASER">History of Laser Treatment</option>
                    <option value="UNKNOWN">Unknown / Not Documented</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">Screening Purpose</label>
                  <select
                    value={formData.screeningPurpose}
                    onChange={(e) => setFormData((p) => ({ ...p, screeningPurpose: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83]"
                  >
                    <option value="ROUTINE_DR_SCREENING">Routine Annual Screening</option>
                    <option value="SYMPTOMATIC_VISION_CHECK">Symptomatic Visual Disturbance</option>
                    <option value="PHYSICIAN_REFERRAL">Physician / Diabetologist Referral</option>
                    <option value="FOLLOW_UP_REVIEW">Post-Treatment Follow-up Review</option>
                    <option value="OTHER">Community Camp Screening</option>
                  </select>
                </div>
              </div>

              {/* Previous Eye Treatments (Multi-select) */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#29424c]">Prior Ocular Treatments</label>
                <div className="flex flex-wrap gap-2">
                  {TREATMENT_OPTIONS.map((t) => {
                    const isChecked = formData.previousEyeTreatment.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTreatment(t.id)}
                        className={cn(
                          "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                          isChecked
                            ? "border-[#3b7f83] bg-[#eaf4f3] text-[#1b5055] font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Relevant Eye Conditions */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#29424c]">Co-existing Ocular Conditions</label>
                <div className="flex flex-wrap gap-2">
                  {EYE_CONDITION_OPTIONS.map((c) => {
                    const isChecked = formData.relevantEyeConditions.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCondition(c.id)}
                        className={cn(
                          "rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                          isChecked
                            ? "border-[#3b7f83] bg-[#eaf4f3] text-[#1b5055] font-semibold"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#29424c]">
                  Clinical Notes & Encounter Observations <span className="text-[10px] text-slate-400">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.clinicalNotes}
                  onChange={(e) => setFormData((p) => ({ ...p, clinicalNotes: e.target.value }))}
                  placeholder="Note any visual complaints, glasses usage, or rural camp context..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs font-medium text-slate-800 outline-none focus:border-[#3b7f83] focus:ring-4 focus:ring-[#3b7f83]/10"
                />
              </div>

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep("medical")}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back to History
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Pre-validate required patient parameters before network mutation
                    if (patientMode === "new") {
                      if (!formData.isAnonymous && !(formData.name && formData.name.trim())) {
                        setError("Patient Full Name is required. If this is a rural walk-in, enable 'Anonymous Walk-in Patient' on Step 1.")
                        return
                      }
                      const numericAge = Number(formData.age)
                      if (!formData.age || Number.isNaN(numericAge) || numericAge < 1 || numericAge > 125) {
                        setError("Please provide a valid patient age between 1 and 125 years on Step 1.")
                        return
                      }
                    } else if (patientMode === "existing") {
                      if (!formData.patientId) {
                        setError("Please select an existing patient from Step 1, or switch to 'Register New Patient'.")
                        return
                      }
                    }
                    setError("")
                    registerPatientAndScreeningMutation.mutate()
                  }}
                  disabled={registerPatientAndScreeningMutation.isPending}
                  className="flex items-center gap-2 rounded-xl bg-[#173f56] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#102f42] disabled:opacity-50"
                >
                  {registerPatientAndScreeningMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Initializing Case...
                    </>
                  ) : (
                    <>
                      Save & Proceed to Retinal Imaging
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-[#dce7e7] bg-[#f8fbfb] p-6 text-xs text-[#324f5a]">
                <p className="font-bold text-[#1b5055]">Why Early Symptoms Matter</p>
                <p className="mt-2 text-[11px] leading-relaxed text-[#687b80]">
                  Diabetic retinopathy is often completely asymptomatic until proliferative or macular edema stages.
                  Capturing mild blurring or floaters assists the ophthalmologist in prioritizing follow-up triage.
                </p>
              </div>
            </aside>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 4: RETINAL IMAGE UPLOAD & QUALITY GATE                      */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "upload" && (
          <motion.div
            key="step-upload"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]"
          >
            <div className="space-y-6 rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf4f3]">
                    <FileImage className="h-5 w-5 text-[#3b7f83]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#142e3b]">Fundus Photograph Upload</h2>
                    <p className="text-xs text-[#738388]">Select examined eye and upload high-resolution 45°/50° retinal fundus photograph.</p>
                  </div>
                </div>

                {/* Eye Selection Selector */}
                <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs font-bold text-slate-700">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, eyeSide: "LEFT" }))}
                    className={cn(
                      "rounded-lg px-3 py-1.5 transition",
                      formData.eyeSide === "LEFT" ? "bg-[#173f56] text-white shadow-sm" : "hover:text-slate-900"
                    )}
                  >
                    OS · Left Eye
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, eyeSide: "RIGHT" }))}
                    className={cn(
                      "rounded-lg px-3 py-1.5 transition",
                      formData.eyeSide === "RIGHT" ? "bg-[#173f56] text-white shadow-sm" : "hover:text-slate-900"
                    )}
                  >
                    OD · Right Eye
                  </button>
                </div>
              </div>

              {/* Acquisition Mode Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-2 border border-slate-200">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAcquisitionMode("upload")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                      acquisitionMode === "upload"
                        ? "bg-[#173f56] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload from Device
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcquisitionMode("camera")}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition",
                      acquisitionMode === "camera"
                        ? "bg-[#173f56] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Camera className="h-3.5 w-3.5 text-[#39D9D0]" />
                    Capture from Fundus Camera
                    <span className="rounded bg-[#39D9D0]/20 px-1.5 py-0.2 text-[9px] font-mono text-[#006e68]">
                      Simulated
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Prototype Datasets:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isLoadingDemo}
                      onClick={() => handleLoadDemoSample("aptos_sample_1")}
                      title="APTOS 2019 Blindness Detection (Grade 2 Moderate DR)"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#3b7f83] hover:text-[#3b7f83] transition disabled:opacity-50"
                    >
                      APTOS 2019
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingDemo}
                      onClick={() => handleLoadDemoSample("idrid_sample_1")}
                      title="IDRiD Indian Diabetic Retinopathy (Grade 3 Severe DR)"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#3b7f83] hover:text-[#3b7f83] transition disabled:opacity-50"
                    >
                      IDRiD
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingDemo}
                      onClick={() => handleLoadDemoSample("messidor2_sample_1")}
                      title="Messidor-2 External Validation (Grade 0 No DR)"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-[#3b7f83] hover:text-[#3b7f83] transition disabled:opacity-50"
                    >
                      Messidor-2
                    </button>
                  </div>
                </div>
              </div>

              {isLoadingDemo && (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-50/70 p-3 text-xs text-cyan-800 border border-cyan-200">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                  Loading authenticated prototype dataset fundus photograph...
                </div>
              )}

              {/* Mode A: Upload Dropzone */}
              {acquisitionMode === "upload" && (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => document.getElementById("retina-file-input")?.click()}
                  className={cn(
                    "group relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition",
                    imagePreview
                      ? "border-[#3b7f83] bg-[#f8fbfb]"
                      : "border-slate-300 bg-slate-50/50 hover:border-[#3b7f83] hover:bg-[#f8fbfb]"
                  )}
                >
                  <input
                    id="retina-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/tiff,image/bmp"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                  />

                  {imagePreview ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative overflow-hidden rounded-full border-4 border-white shadow-md">
                        <img
                          src={imagePreview}
                          alt="Retinal Preview"
                          className="h-44 w-44 object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#142e3b]">
                          {imageFile?.name || "Fundus Image Selected"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {imageFile ? `${(imageFile.size / (1024 * 1024)).toFixed(2)} MB · ${formData.eyeSide === "LEFT" ? "OS (Left Eye)" : "OD (Right Eye)"}` : "Click or drop to replace image"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200 group-hover:scale-105 transition">
                        <Upload className="h-6 w-6 text-[#3b7f83]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Click to browse or drag & drop fundus photograph
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Supports JPEG, PNG, TIFF, BMP (up to 20MB)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode B: Fundus Camera Integration Placeholder */}
              {acquisitionMode === "camera" && (
                <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-[#39D9D0]" />
                        <h3 className="text-sm font-bold text-white">
                          Fundus Camera Acquisition Interface
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Simulated direct camera link for clinical demonstration
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-400 font-medium">Device:</label>
                      <select
                        value={selectedCamera}
                        onChange={(e) => setSelectedCamera(e.target.value)}
                        className="rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#39D9D0]"
                      >
                        <option value="forus_3nethra">Forus 3nethra classic (45° Non-Mydriatic)</option>
                        <option value="remidio_fop">Remidio Fundus on Phone (NM-10 Handheld)</option>
                        <option value="topcon_nw400">Topcon NW400 (Robotic Fundus Camera)</option>
                        <option value="canon_cr2">Canon CR-2 AF (Digital Retinal Camera)</option>
                      </select>
                    </div>
                  </div>

                  {/* Camera Viewfinder Viewport */}
                  <div className="relative flex flex-col items-center justify-center rounded-2xl bg-black/60 border border-white/10 p-6 min-h-[220px]">
                    {imagePreview ? (
                      <div className="relative flex flex-col items-center gap-3">
                        <div className="relative overflow-hidden rounded-full border-4 border-[#39D9D0]/60 shadow-[0_0_25px_rgba(57,217,208,0.3)]">
                          <img
                            src={imagePreview}
                            alt="Camera Viewfinder Retinal Capture"
                            className="h-44 w-44 object-cover"
                          />
                          {/* Reticle Overlay */}
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center border-2 border-dashed border-[#39D9D0]/40 rounded-full">
                            <div className="h-2 w-2 rounded-full bg-[#39D9D0]/80" />
                          </div>
                        </div>
                        <div className="text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-[10px] font-mono text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 className="h-3 w-3" /> Acquisition Captured ({formData.eyeSide === "LEFT" ? "OS" : "OD"})
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center space-y-3">
                        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-white/20">
                          <Camera className="h-8 w-8 text-[#39D9D0]" />
                          <div className="absolute inset-0 rounded-full border border-[#39D9D0]/30 animate-ping" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">
                            Optical Retinal Viewfinder Ready
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-[320px]">
                            Align patient pupil with fixation target. Verify 45° field centering on macula and optic nerve head.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Camera Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <p className="text-[10px] text-slate-400 max-w-[380px] leading-relaxed">
                      <span className="font-semibold text-slate-300">Notice:</span> Camera interface simulated for prototype demonstration. Direct hardware integration via DICOM / USB capture is a planned production feature.
                    </p>

                    <div className="flex items-center gap-2">
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null)
                            setImagePreview(null)
                            setQualityData(null)
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Retake
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={cameraStatus === "capturing"}
                        onClick={handleSimulateCameraCapture}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#39D9D0] to-[#2BA8A1] px-4 py-2 text-xs font-bold text-[#07111F] shadow-[0_0_15px_rgba(57,217,208,0.25)] hover:brightness-110 active:scale-[0.98] transition disabled:opacity-50"
                      >
                        {cameraStatus === "capturing" ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Acquiring Exposure...
                          </>
                        ) : (
                          <>
                            <Camera className="h-3.5 w-3.5" />
                            {imagePreview ? "Re-Acquire Image" : "Trigger Camera Capture"}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced Quality Gate Assessment Card (Features 7 & 8) */}
              {qualityData && (
                <div
                  className={cn(
                    "rounded-3xl border p-5 text-xs space-y-4 transition shadow-sm",
                    qualityData.quality_category === "Poor" || qualityData.quality_status === "UNGRADABLE" || !qualityData.is_gradable
                      ? "border-rose-300 bg-rose-50/70 text-rose-950"
                      : qualityData.quality_category === "Borderline" || qualityData.quality_status === "BORDERLINE"
                      ? "border-amber-300 bg-amber-50/70 text-amber-950"
                      : "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        className={cn(
                          "h-5 w-5",
                          qualityData.quality_category === "Poor" || !qualityData.is_gradable
                            ? "text-rose-600"
                            : qualityData.quality_category === "Borderline"
                            ? "text-amber-600"
                            : "text-emerald-600"
                        )}
                      />
                      <div>
                        <h4 className="font-bold text-sm">
                          Automated Image Quality Assessment
                        </h4>
                        <p className="text-[11px] opacity-80">
                          Pre-inference quality assurance gate
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-black font-mono tracking-wider border shadow-sm",
                          qualityData.quality_category === "Poor" || !qualityData.is_gradable
                            ? "bg-rose-600 text-white border-rose-700"
                            : qualityData.quality_category === "Borderline"
                            ? "bg-amber-500 text-white border-amber-600"
                            : "bg-emerald-600 text-white border-emerald-700"
                        )}
                      >
                        {qualityData.quality_category?.toUpperCase() || (qualityData.is_gradable ? "GOOD" : "POOR")}
                      </span>
                    </div>
                  </div>

                  {/* 4 Core Quality Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="rounded-xl bg-white/80 p-2.5 border border-black/5">
                      <span className="text-[10px] font-semibold text-slate-500 block">Focus / Sharpness</span>
                      <span className="text-sm font-bold text-slate-800">
                        {typeof qualityData.blur_score === "number" ? qualityData.blur_score.toFixed(1) : qualityData.quality?.blur_score?.toFixed(1) || "N/A"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-black/5">
                      <span className="text-[10px] font-semibold text-slate-500 block">Illumination</span>
                      <span className="text-sm font-bold text-slate-800">
                        {typeof qualityData.illumination_score === "number" ? qualityData.illumination_score.toFixed(1) : qualityData.quality?.illumination_score?.toFixed(1) || "N/A"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-black/5">
                      <span className="text-[10px] font-semibold text-slate-500 block">Contrast</span>
                      <span className="text-sm font-bold text-slate-800">
                        {typeof qualityData.contrast_score === "number" ? qualityData.contrast_score.toFixed(1) : qualityData.quality?.contrast_score?.toFixed(1) || "N/A"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/80 p-2.5 border border-black/5">
                      <span className="text-[10px] font-semibold text-slate-500 block">FOV Centering</span>
                      <span className="text-sm font-bold text-slate-800">
                        {typeof qualityData.fov_score === "number" ? qualityData.fov_score.toFixed(1) : qualityData.quality?.fov_score?.toFixed(1) || "N/A"}
                      </span>
                    </div>
                  </div>

                  {/* Smart Recapture Guidance (Detected Issues) */}
                  {Array.isArray(qualityData.detected_issues) && qualityData.detected_issues.length > 0 && (
                    <div className="rounded-2xl bg-white/90 p-3.5 border border-black/5 space-y-2">
                      <p className="font-bold text-xs flex items-center gap-1.5 text-slate-800">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Smart Recapture Guidance & Corrective Steps
                      </p>
                      <div className="space-y-2">
                        {qualityData.detected_issues.map((issue: any, idx: number) => (
                          <div key={idx} className="rounded-xl bg-slate-50 p-2.5 text-[11px] border border-slate-100">
                            <p className="font-bold text-slate-900">{issue.title}</p>
                            <p className="text-slate-600 mt-0.5">{issue.reason}</p>
                            {issue.recommendation && (
                              <p className="text-[#006e68] font-medium mt-1">
                                Action: {issue.recommendation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quality Ungradable Gating & Recapture Action */}
                  {(qualityData.quality_category === "Poor" || qualityData.quality_status === "UNGRADABLE" || !qualityData.is_gradable) && (
                    <div className="rounded-2xl border border-rose-300 bg-rose-100/70 p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-rose-900 text-xs">
                            Screening Safety Gate: Image Quality is Ungradable
                          </p>
                          <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                            Retinal landmarks are obscured. Automated DR classification requires a gradable image with sharp vascular resolution to prevent false negatives.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null)
                            setImagePreview(null)
                            setQualityData(null)
                          }}
                          className="shrink-0 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-700 transition"
                        >
                          Recapture Image
                        </button>
                      </div>

                      <div className="border-t border-rose-200 pt-2 flex items-center gap-2">
                        <input
                          id="override-ungradable"
                          type="checkbox"
                          checked={overrideUngradable}
                          onChange={(e) => setOverrideUngradable(e.target.checked)}
                          className="rounded border-rose-400 text-rose-600 focus:ring-rose-500 h-4 w-4"
                        />
                        <label htmlFor="override-ungradable" className="text-[11px] font-semibold text-rose-900 cursor-pointer">
                          Acknowledge ungradable quality warning and proceed anyway (Clinical Override)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep("symptoms")}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Back to Symptoms
                </button>

                <button
                  type="button"
                  disabled={
                    !imageFile ||
                    uploadImageMutation.isPending ||
                    (qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable)
                  }
                  onClick={() => {
                    if (imageFile) {
                      uploadImageMutation.mutate(imageFile)
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50",
                    qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[#173f56] hover:bg-[#102f42]"
                  )}
                >
                  {uploadImageMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Uploading & Checking Quality...
                    </>
                  ) : qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable ? (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      Recapture Required (Ungradable)
                    </>
                  ) : (
                    <>
                      Confirm Image & Proceed to Review
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-[#dce7e7] bg-[#f8fbfb] p-6 text-xs text-[#324f5a]">
                <p className="font-bold text-[#1b5055]">Quality Gate Check Criteria</p>
                <ul className="mt-3 space-y-2 text-[11px] text-[#687b80]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Focus sharpness on retinal micro-vessels
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Even illumination across the posterior pole
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Macula & Optic Disc fully centered in field
                  </li>
                </ul>
              </div>
            </aside>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 5: CASE REVIEW & CONFIRMATION                               */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "review" && (
          <motion.div
            key="step-review"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-6"
          >
            <div className="rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf4f3]">
                  <FileText className="h-5 w-5 text-[#3b7f83]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#142e3b]">Case Review & Pre-Analysis Verification</h2>
                  <p className="text-xs text-[#738388]">Review all captured patient demographics, diabetes indicators, and fundus photograph before inference.</p>
                </div>
              </div>

              {/* Review Cards Grid */}
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Patient Summary */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b7f83]">Patient Identity</span>
                    <button type="button" onClick={() => setCurrentStep("patient")} className="text-[10px] font-semibold text-[#173f56] underline">
                      Edit
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#142e3b]">{formData.isAnonymous ? "Anonymous Patient" : formData.name || "De-identified"}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{formData.patientCode || "Auto-assigned code"}</p>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200/60 pt-2">
                    <p><span className="text-slate-400">Age / Sex:</span> {formData.age} years / {formData.gender}</p>
                    <p><span className="text-slate-400">Locality:</span> {formData.district}, {formData.state}</p>
                    {formData.contactNumber && !formData.isAnonymous && <p><span className="text-slate-400">Contact:</span> {formData.contactNumber}</p>}
                  </div>
                </div>

                {/* Medical Profile */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b7f83]">Diabetes Profile</span>
                    <button type="button" onClick={() => setCurrentStep("medical")} className="text-[10px] font-semibold text-[#173f56] underline">
                      Edit
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#142e3b]">{formData.diabetesType.replace("_", " ")}</p>
                    <p className="text-xs text-slate-500">
                      Duration: {formData.diabetesDurationUnknown ? "Unknown" : `${formData.diabetesDuration || 0} yrs`}
                    </p>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200/60 pt-2">
                    <p><span className="text-slate-400">Treatment:</span> {formData.diabetesTreatment}</p>
                    <p><span className="text-slate-400">HbA1c:</span> {formData.hba1cValue ? `${formData.hba1cValue} ${formData.hba1cUnit}` : "Not recorded"}</p>
                    <p><span className="text-slate-400">Blood Glucose:</span> {formData.bloodGlucoseValue ? `${formData.bloodGlucoseValue} ${formData.bloodGlucoseUnit}` : "Not recorded"}</p>
                  </div>
                </div>

                {/* Imaging & Symptoms */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#3b7f83]">Ocular Evidence</span>
                    <button type="button" onClick={() => setCurrentStep("upload")} className="text-[10px] font-semibold text-[#173f56] underline">
                      Edit
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {imagePreview && (
                      <img src={imagePreview} alt="Preview" className="h-12 w-12 rounded-full object-cover border" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-[#142e3b]">
                        {formData.eyeSide === "LEFT" ? "OS · Left Eye" : "OD · Right Eye"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {qualityData ? `Quality: ${qualityData.quality_status || "Evaluated"}` : "Quality pending"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 border-t border-slate-200/60 pt-2">
                    <p><span className="text-slate-400">Purpose:</span> {formData.screeningPurpose.replace(/_/g, " ")}</p>
                    <p><span className="text-slate-400">Symptoms:</span> {formData.visualSymptoms.join(", ") || "None reported"}</p>
                  </div>
                </div>
              </div>

              {/* Execute Analysis Action */}
              <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-[#173f56] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Brain className="h-5 w-5 text-[#38bdf8]" />
                    Ready for AI Retinopathy Screening
                  </h3>
                  <p className="mt-1 text-xs text-white/70">
                    Runs the trained neural network, computes feature attribution Grad-CAM, and validates against lesion evidence.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep("upload")}
                    className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={
                      analyzeMutation.isPending ||
                      (qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable)
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold shadow-lg transition disabled:opacity-50",
                      qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable
                        ? "bg-rose-600 text-white cursor-not-allowed hover:bg-rose-700"
                        : "bg-[#38bdf8] text-[#0c242e] hover:bg-[#7dd3fc]"
                    )}
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Analyzing Retinal Image...
                      </>
                    ) : qualityData && (qualityData.quality_category === "Poor" || !qualityData.is_gradable) && !overrideUngradable ? (
                      <>
                        <AlertTriangle className="h-4 w-4" /> Classification Blocked (Quality Ungradable)
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> Run AI Screening Analysis
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 6: AI SCREENING RESULTS & CLINICAL EXPLAINABILITY           */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {currentStep === "results" && analysisResult && (
          <motion.div
            key="step-results"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-6"
          >
            {/* Main Result Card */}
            <div className="rounded-3xl border border-[#dce7e7] bg-white p-6 shadow-sm sm:p-8 space-y-8">
              {/* Top Banner with Grade */}
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Case #{activeScreeningId.slice(0, 8)} · {formData.eyeSide === "LEFT" ? "OS (Left Eye)" : "OD (Right Eye)"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                        analysisResult.is_referable
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      )}
                    >
                      {analysisResult.is_referable ? "REFERABLE RETINOPATHY" : "NON-REFERABLE"}
                    </span>
                  </div>

                  <h2 className="mt-2 text-2xl font-black text-[#142e3b] sm:text-3xl">
                    {analysisResult.grade_label || DR_GRADE_LABELS[analysisResult.predicted_grade] || "Prediction Complete"}
                  </h2>
                  <p className="mt-1 text-xs text-[#68787f]">
                    Model Confidence:{" "}
                    <span className="font-bold text-[#1b5055]">
                      {analysisResult.confidence ? `${(analysisResult.confidence * 100).toFixed(1)}%` : "N/A"}
                    </span>
                    {" · "}
                    Assurance Decision:{" "}
                    <span className="font-semibold text-slate-700">{analysisResult.assurance_decision || "VALIDATED"}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/screenings/${activeScreeningId}/report/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 text-[#3b7f83]" />
                    Export PDF Report
                  </a>
                  <button
                    type="button"
                    onClick={() => router.push(`/screenings/${activeScreeningId}`)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#173f56] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#102f42]"
                  >
                    Full Clinical Workspace
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Grad-CAM Heatmap Explainability Viewer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#142e3b] flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#3b7f83]" />
                      Grad-CAM Visual Feature Attribution
                    </h3>
                    <p className="text-xs text-slate-500">
                      Highlights morphological regions in the retinal fundus photograph that influenced the AI prediction.
                    </p>
                  </div>
                </div>

                <GradCamViewer
                  originalImageUrl={imagePreview || `/uploads/${activeScreeningId}/original.jpg`}
                  gradcamUrl={analysisResult.gradcam_path ? `/uploads/${activeScreeningId}/gradcam.jpg` : null}
                  heatmapUrl={analysisResult.gradcam_path ? `/uploads/${activeScreeningId}/heatmap.jpg` : null}
                  targetClass={analysisResult.predicted_grade}
                  targetClassLabel={analysisResult.grade_label}
                  targetLayer="backbone.features.8.0"
                />
              </div>

              {/* Lesion Evidence Viewer */}
              {analysisResult.lesion_summary && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-[#142e3b] flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#3b7f83]" />
                    Lesion Segmentation Evidence
                  </h3>
                  <LesionViewer
                    originalUrl={imagePreview || `/uploads/${activeScreeningId}/original.jpg`}
                    maskUrl={analysisResult.lesion_mask_path ? `/uploads/${activeScreeningId}/lesion_mask.jpg` : null}
                    lesionSummary={{
                      microaneurysms: { count: analysisResult.lesion_summary.microaneurysm_count },
                      hemorrhages: { count: analysisResult.lesion_summary.hemorrhage_count },
                      hard_exudates: { count: analysisResult.lesion_summary.exudate_count },
                      lesion_evidence_score: analysisResult.lesion_summary.lesion_evidence_score,
                      provenance: analysisResult.lesion_summary.provenance,
                    }}
                  />
                </div>
              )}

              {/* Class Probabilities Distribution */}
              {analysisResult.probabilities && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                  <p className="text-xs font-bold text-slate-800">Model Probability Distribution Across All DR Grades</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
                    {[0, 1, 2, 3, 4].map((grade) => {
                      const prob = Number(analysisResult.probabilities[grade] ?? 0)
                      const isTop = grade === analysisResult.predicted_grade
                      return (
                        <div
                          key={grade}
                          className={cn(
                            "rounded-xl border p-3 text-center transition",
                            isTop ? "border-[#3b7f83] bg-white shadow-sm" : "border-slate-200 bg-white/60"
                          )}
                        >
                          <p className="text-[10px] font-bold text-slate-500">Grade {grade}</p>
                          <p className="text-xs font-bold text-slate-800 truncate">{DR_GRADE_LABELS[grade]}</p>
                          <p className="mt-1 font-mono text-sm font-bold text-[#173f56]">{(prob * 100).toFixed(1)}%</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Clinical Assurance & Calibration Banner (Feature 10) */}
              <div className="rounded-2xl border border-cyan-500/20 bg-[#07111F] p-4 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#39D9D0]" />
                    <span className="font-bold text-white">Temperature-Calibrated Prediction Confidence</span>
                  </div>
                  <span className="rounded-full bg-[#39D9D0]/10 px-2.5 py-0.5 text-[10px] font-mono text-[#39D9D0] border border-[#39D9D0]/30">
                    CALIBRATED (T = 1.1638)
                  </span>
                </div>
                <p className="text-[11px] text-[#9AAFC1] leading-relaxed">
                  Raw neural network logits have undergone post-hoc temperature scaling fitted on held-out validation data to ensure predicted probabilities reflect true empirical clinical accuracy.
                </p>
                <div className="border-t border-white/10 pt-2 flex items-center gap-2 text-[10px] font-mono text-amber-300">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>AI-ASSISTED SCREENING PROTOTYPE · NOT A SUBSTITUTE FOR AN OPHTHALMOLOGIST&apos;S DIAGNOSIS</span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    // Switch eye side and start second screening for same patient
                    setFormData((p) => ({
                      ...p,
                      eyeSide: p.eyeSide === "RIGHT" ? "LEFT" : "RIGHT",
                    }))
                    setImageFile(null)
                    setImagePreview(null)
                    setQualityData(null)
                    setAnalysisResult(null)
                    setCurrentStep("upload")
                  }}
                  className="rounded-xl border border-[#3b7f83] px-5 py-2.5 text-xs font-bold text-[#3b7f83] hover:bg-[#eaf4f3]"
                >
                  Screen Opposite Eye ({formData.eyeSide === "RIGHT" ? "Left Eye OS" : "Right Eye OD"})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("drishti_screening_draft")
                    window.location.href = "/screenings/new"
                  }}
                  className="rounded-xl bg-[#173f56] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#102f42]"
                >
                  Start New Patient Screening
                </button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default function NewScreeningPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[450px] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#3b7f83]" />
          <p className="text-xs font-semibold text-slate-500">Loading screening intake...</p>
        </div>
      }
    >
      <NewScreeningForm />
    </Suspense>
  )
}
