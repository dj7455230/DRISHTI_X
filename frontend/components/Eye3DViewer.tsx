"use client"

import React, { useRef, useState, useMemo, Suspense, useEffect } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Html } from "@react-three/drei"
import * as THREE from "three"
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  Info,
  Layers,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

// ─── ANATOMICAL STRUCTURE DEFINITIONS ──────────────────────────────
export interface EyeStructure {
  id: string
  name: string
  category: "Anterior" | "Refractive" | "Posterior / Fundus" | "Structural"
  position: [number, number, number]
  cameraTarget: [number, number, number]
  cameraPosition: [number, number, number]
  description: string
  clinicalSignificance: string
  drRelevance: string
}

export const EYE_STRUCTURES: EyeStructure[] = [
  {
    id: "cornea",
    name: "Cornea",
    category: "Anterior",
    position: [0, 0, 2.05],
    cameraPosition: [0, 0, 4.2],
    cameraTarget: [0, 0, 1.8],
    description: "Transparent, dome-shaped anterior optical window providing ~70% of the eye's refractive power.",
    clinicalSignificance: "Must remain optically clear. Evaluated during slit-lamp exam and corneal biomechanics assessment.",
    drRelevance: "Diabetic neuropathy can reduce corneal sensation and predispose to neurotrophic keratitis and delayed epithelial healing.",
  },
  {
    id: "iris-pupil",
    name: "Iris & Pupil",
    category: "Anterior",
    position: [0, 0, 1.7],
    cameraPosition: [0, 0, 3.8],
    cameraTarget: [0, 0, 1.5],
    description: "Pigmented muscular diaphragm that contracts and dilates to modulate intraocular illumination.",
    clinicalSignificance: "Pupillary light reflex assessment; pharmacological dilation is crucial for complete fundus examinations.",
    drRelevance: "Rubeosis iridis (neovascularization of the iris) develops in severe proliferative DR, triggering devastating neovascular glaucoma.",
  },
  {
    id: "lens",
    name: "Crystalline Lens",
    category: "Refractive",
    position: [0, 0, 1.3],
    cameraPosition: [1.8, 0.5, 2.8],
    cameraTarget: [0, 0, 1.3],
    description: "Transparent, biconvex proteinaceous disc that changes curvature to achieve optical accommodation.",
    clinicalSignificance: "Focuses light onto the foveal cones; opacification causes cataract, scattering fundus screening light.",
    drRelevance: "Sorbitol accumulation via the polyol pathway accelerates nuclear, cortical, and posterior subcapsular diabetic cataracts.",
  },
  {
    id: "vitreous",
    name: "Vitreous Body",
    category: "Structural",
    position: [0, 0, 0],
    cameraPosition: [2.5, 1.2, 2.2],
    cameraTarget: [0, 0, 0],
    description: "Hydrophilic gel (99% water and type II collagen) maintaining the globe's spherical geometry.",
    clinicalSignificance: "Optically clear transit path for retinal illumination; posterior vitreous detachment (PVD) occurs with age.",
    drRelevance: "Fragile neovascular fronds in proliferative DR bleed into the vitreous (vitreous hemorrhage), obscuring the fundus.",
  },
  {
    id: "retina",
    name: "Retinal Surface",
    category: "Posterior / Fundus",
    position: [0, 0, -1.2],
    cameraPosition: [0, 0, -0.2],
    cameraTarget: [0, 0, -2.0],
    description: "Multi-layered neurosensory tunic containing 120M rod and 6M cone photoreceptors converting photons into nerve impulses.",
    clinicalSignificance: "Directly visible microvascular bed in the human body; primary target of digital fundus photography.",
    drRelevance: "Chronic hyperglycemia causes microvascular leakage, capillary dropout, cotton-wool spots, hemorrhages, and exudates.",
  },
  {
    id: "optic-disc",
    name: "Optic Disc (Nerve Head)",
    category: "Posterior / Fundus",
    position: [-0.65, 0.25, -1.9],
    cameraPosition: [-0.3, 0.15, -0.6],
    cameraTarget: [-0.65, 0.25, -1.9],
    description: "Pale yellowish-pink oval where 1.2 million retinal ganglion cell axons converge to form the optic nerve (CN II).",
    clinicalSignificance: "Physiological cup margin evaluated for glaucoma; emergence point of the central retinal artery and vein.",
    drRelevance: "Neovascularization of the disc (NVD) is a high-risk hallmark of Proliferative Diabetic Retinopathy (Grade 4 PDR).",
  },
  {
    id: "fovea",
    name: "Fovea Centralis (Macula)",
    category: "Posterior / Fundus",
    position: [0.65, -0.05, -1.92],
    cameraPosition: [0.2, 0, -0.6],
    cameraTarget: [0.65, -0.05, -1.92],
    description: "Avascular central depression of the macula lutea packed with cone photoreceptors for high-resolution 20/20 vision.",
    clinicalSignificance: "Provides acute central visual acuity, chromatic discernment, and reading vision.",
    drRelevance: "Diabetic Macular Edema (DME) — fluid extravasation and hard exudates inside 1 disc diameter — is the #1 cause of vision loss in DR.",
  },
  {
    id: "vasculature",
    name: "Retinal Microvascular Arcades",
    category: "Posterior / Fundus",
    position: [0, 0.6, -1.75],
    cameraPosition: [0, 0.3, -0.5],
    cameraTarget: [0, 0.2, -1.85],
    description: "Paired superior and inferior temporal and nasal arterioles and venules forming an end-arterial terminal arcade.",
    clinicalSignificance: "Directly assesses autoregulation, vessel calibre, arteriolar-to-venular ratio (AVR), and vascular tortuosity.",
    drRelevance: "Loss of vascular pericytes triggers microaneurysm outpouching, endothelial breakdown, venous beading, and IRMA.",
  },
  {
    id: "sclera",
    name: "Sclera",
    category: "Structural",
    position: [-1.8, 0, 0],
    cameraPosition: [-3.8, 1.2, 2.0],
    cameraTarget: [0, 0, 0],
    description: "Dense, collagenous fibrous outer shell providing mechanical integrity and anchoring the extraocular muscles.",
    clinicalSignificance: "Forms the protective envelope of the globe and withstands intraocular pressure.",
    drRelevance: "Serves as the structural backstop; microvascular shunts and trans-scleral laser photocoagulation target the retina through it.",
  },
]

// ─── CAMERA CONTROLLER WITH SMOOTH INTERPOLATION ───────────────────
function CameraController({
  targetPos,
  lookTarget,
  isInspectingRetina,
}: {
  targetPos: [number, number, number]
  lookTarget: [number, number, number]
  isInspectingRetina: boolean
}) {
  const { camera } = useThree()
  const currentLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0))

  useFrame((_, delta) => {
    // Interpolate camera position
    const desiredPos = new THREE.Vector3(...targetPos)
    camera.position.lerp(desiredPos, Math.min(1, delta * 3.2))

    // Interpolate camera lookAt
    const desiredLook = new THREE.Vector3(...lookTarget)
    currentLookAt.current.lerp(desiredLook, Math.min(1, delta * 3.5))
    camera.lookAt(currentLookAt.current)
  })

  return null
}

// ─── PROCEDURAL 3D ANATOMICAL EYE MESHES ─────────────────────────
function ScleraMesh({
  cutaway,
  isInspectingRetina,
  onSelect,
}: {
  cutaway: boolean
  isInspectingRetina: boolean
  onSelect: (id: string) => void
}) {
  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation()
        onSelect("sclera")
      }}
    >
      <sphereGeometry args={[2.0, 48, 48, 0, cutaway ? Math.PI * 1.35 : Math.PI * 2]} />
      <meshStandardMaterial
        color="#F8FAFC"
        roughness={0.25}
        metalness={0.08}
        side={THREE.DoubleSide}
        transparent={isInspectingRetina}
        opacity={isInspectingRetina ? 0.15 : cutaway ? 0.85 : 0.98}
      />
    </mesh>
  )
}

function CorneaMesh({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  return (
    <mesh
      position={[0, 0, 1.45]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect("cornea")
      }}
    >
      <sphereGeometry args={[1.1, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
      <meshPhysicalMaterial
        color="#D9F5FF"
        transmission={0.92}
        opacity={0.35}
        transparent
        roughness={0.05}
        ior={1.376}
        reflectivity={0.6}
        clearcoat={1}
        clearcoatRoughness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function IrisAndPupilMesh({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  // Procedural Iris disc with central aperture
  return (
    <group
      position={[0, 0, 1.42]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect("iris-pupil")
      }}
    >
      {/* Iris ring */}
      <mesh>
        <ringGeometry args={[0.38, 1.05, 48]} />
        <meshStandardMaterial
          color="#3B6E8C"
          roughness={0.4}
          metalness={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Iris radial striae detailing */}
      <mesh position={[0, 0, 0.005]}>
        <ringGeometry args={[0.38, 0.8, 36]} />
        <meshStandardMaterial
          color="#1F4D69"
          roughness={0.3}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Pupil central black void */}
      <mesh position={[0, 0, -0.01]}>
        <circleGeometry args={[0.38, 36]} />
        <meshBasicMaterial color="#020617" />
      </mesh>
    </group>
  )
}

function LensMesh({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  return (
    <mesh
      position={[0, 0, 1.15]}
      scale={[1, 1, 0.45]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect("lens")
      }}
    >
      <sphereGeometry args={[0.62, 32, 24]} />
      <meshPhysicalMaterial
        color="#F0FDFA"
        transmission={0.88}
        opacity={0.4}
        transparent
        roughness={0.08}
        ior={1.41}
      />
    </mesh>
  )
}

function VitreousMesh({
  isInspectingRetina,
  onSelect,
}: {
  isInspectingRetina: boolean
  onSelect: (id: string) => void
}) {
  return (
    <mesh
      position={[0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect("vitreous")
      }}
    >
      <sphereGeometry args={[1.88, 32, 32]} />
      <meshPhysicalMaterial
        color="#39D9D0"
        transmission={0.96}
        opacity={isInspectingRetina ? 0.04 : 0.12}
        transparent
        roughness={0.1}
        ior={1.336}
      />
    </mesh>
  )
}

function PosteriorRetinaMesh({
  isInspectingRetina,
  onSelect,
}: {
  isInspectingRetina: boolean
  onSelect: (id: string) => void
}) {
  return (
    <group>
      {/* Interior Retinal Hemispherical Shell */}
      <mesh
        position={[0, 0, 0]}
        rotation={[Math.PI, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect("retina")
        }}
      >
        <sphereGeometry args={[1.94, 48, 32, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
        <meshStandardMaterial
          color="#B84224"
          roughness={0.55}
          metalness={0.05}
          side={THREE.BackSide}
          emissive="#7A2210"
          emissiveIntensity={isInspectingRetina ? 0.35 : 0.15}
        />
      </mesh>

      {/* Optic Disc (Nasal side: -x, +y) */}
      <mesh
        position={[-0.65, 0.25, -1.91]}
        rotation={[0, 0.28, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect("optic-disc")
        }}
      >
        <circleGeometry args={[0.22, 32]} />
        <meshStandardMaterial
          color="#FDE047"
          emissive="#F59E0B"
          emissiveIntensity={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Physiological Cup inside Optic Disc */}
      <mesh position={[-0.65, 0.25, -1.915]}>
        <circleGeometry args={[0.09, 24]} />
        <meshBasicMaterial color="#FEF08A" />
      </mesh>

      {/* Fovea Centralis / Macula (Temporal side: +x, -y) */}
      <group
        position={[0.65, -0.05, -1.91]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect("fovea")
        }}
      >
        {/* Macular lutea ring */}
        <mesh>
          <circleGeometry args={[0.32, 32]} />
          <meshStandardMaterial
            color="#8A2612"
            emissive="#521307"
            emissiveIntensity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Foveola central dark pit */}
        <mesh position={[0, 0, -0.005]}>
          <circleGeometry args={[0.08, 24]} />
          <meshBasicMaterial color="#3D0B03" />
        </mesh>
      </group>
    </group>
  )
}

// ─── PROCEDURAL RETINAL VASCULATURE (VASCULAR ARCADES) ─────────────
function RetinalVasculatureMesh({
  highlight,
  onSelect,
}: {
  highlight: boolean
  onSelect: (id: string) => void
}) {
  // Generate smooth 3D spline curves branching from the Optic Disc across the posterior bowl
  const vesselCurves = useMemo(() => {
    const origin = new THREE.Vector3(-0.65, 0.25, -1.905)

    const curves: { points: THREE.Vector3[]; type: "artery" | "vein" }[] = [
      // Superior Temporal Artery (arches up and temporally over the macula)
      {
        points: [
          origin.clone(),
          new THREE.Vector3(-0.4, 0.8, -1.86),
          new THREE.Vector3(0.1, 1.1, -1.75),
          new THREE.Vector3(0.7, 0.95, -1.78),
          new THREE.Vector3(1.1, 0.65, -1.82),
        ],
        type: "artery",
      },
      // Superior Temporal Vein (runs parallel, slightly broader)
      {
        points: [
          origin.clone().add(new THREE.Vector3(0.04, -0.02, 0)),
          new THREE.Vector3(-0.35, 0.85, -1.85),
          new THREE.Vector3(0.15, 1.18, -1.73),
          new THREE.Vector3(0.75, 1.02, -1.76),
          new THREE.Vector3(1.15, 0.72, -1.8),
        ],
        type: "vein",
      },
      // Inferior Temporal Artery (arches down and temporally under the macula)
      {
        points: [
          origin.clone(),
          new THREE.Vector3(-0.35, -0.4, -1.87),
          new THREE.Vector3(0.15, -0.85, -1.77),
          new THREE.Vector3(0.75, -0.82, -1.79),
          new THREE.Vector3(1.15, -0.5, -1.83),
        ],
        type: "artery",
      },
      // Inferior Temporal Vein
      {
        points: [
          origin.clone().add(new THREE.Vector3(0.03, 0.02, 0)),
          new THREE.Vector3(-0.3, -0.45, -1.86),
          new THREE.Vector3(0.2, -0.92, -1.75),
          new THREE.Vector3(0.8, -0.88, -1.77),
          new THREE.Vector3(1.2, -0.55, -1.81),
        ],
        type: "vein",
      },
      // Superior Nasal Artery
      {
        points: [
          origin.clone(),
          new THREE.Vector3(-0.85, 0.75, -1.86),
          new THREE.Vector3(-1.15, 1.05, -1.77),
          new THREE.Vector3(-1.45, 0.85, -1.78),
        ],
        type: "artery",
      },
      // Superior Nasal Vein
      {
        points: [
          origin.clone().add(new THREE.Vector3(-0.02, -0.03, 0)),
          new THREE.Vector3(-0.9, 0.7, -1.85),
          new THREE.Vector3(-1.22, 0.98, -1.76),
        ],
        type: "vein",
      },
      // Inferior Nasal Artery & Vein
      {
        points: [
          origin.clone(),
          new THREE.Vector3(-0.9, -0.45, -1.86),
          new THREE.Vector3(-1.25, -0.8, -1.78),
        ],
        type: "artery",
      },
      {
        points: [
          origin.clone().add(new THREE.Vector3(-0.03, 0.02, 0)),
          new THREE.Vector3(-0.95, -0.5, -1.85),
          new THREE.Vector3(-1.3, -0.85, -1.77),
        ],
        type: "vein",
      },
    ]

    return curves.map((c) => {
      const curve = new THREE.CatmullRomCurve3(c.points)
      const geometry = new THREE.TubeGeometry(curve, 28, c.type === "artery" ? 0.025 : 0.038, 8, false)
      return { geometry, type: c.type }
    })
  }, [])

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        onSelect("vasculature")
      }}
    >
      {vesselCurves.map((v, idx) => (
        <mesh key={idx} geometry={v.geometry}>
          <meshStandardMaterial
            color={v.type === "artery" ? (highlight ? "#FF4A3D" : "#DC2626") : highlight ? "#9333EA" : "#7C2D12"}
            roughness={0.3}
            metalness={0.2}
            emissive={v.type === "artery" ? "#EF4444" : "#6B21A8"}
            emissiveIntensity={highlight ? 0.75 : 0.3}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── ANATOMICAL HOTSPOT MARKERS ────────────────────────────────────
function AnatomicalHotspot({
  structure,
  isSelected,
  onSelect,
}: {
  structure: EyeStructure
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <group position={structure.position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(structure.id)
        }}
      >
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={isSelected ? "#39D9D0" : "#7C8CFF"}
          emissive={isSelected ? "#39D9D0" : "#7C8CFF"}
          emissiveIntensity={0.8}
        />
      </mesh>

      <Html distanceFactor={6} center>
        <button
          type="button"
          onClick={() => onSelect(structure.id)}
          className={`flex items-center gap-1.5 px-2 py-0.8 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shadow-lg ${
            isSelected
              ? "bg-[#39D9D0] text-[#07111F] ring-2 ring-white font-bold scale-110"
              : "bg-[#0B1726]/90 text-[#F4F8FC] border border-white/20 hover:bg-[#101F30] hover:text-[#39D9D0]"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {structure.name}
        </button>
      </Html>
    </group>
  )
}

// ─── 3D SCENE MASTER ───────────────────────────────────────────────
function EyeScene({
  selectedId,
  onSelect,
  cutaway,
  showHotspots,
  vesselGlow,
  preset,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  cutaway: boolean
  showHotspots: boolean
  vesselGlow: boolean
  preset: "external" | "crossSection" | "retinaInspection" | "free"
}) {
  const isInspectingRetina = preset === "retinaInspection" || selectedId === "retina" || selectedId === "optic-disc" || selectedId === "fovea" || selectedId === "vasculature"

  // Determine target camera coordinates
  const { camPos, camTarget } = useMemo(() => {
    if (selectedId) {
      const struct = EYE_STRUCTURES.find((s) => s.id === selectedId)
      if (struct) {
        return { camPos: struct.cameraPosition, camTarget: struct.cameraTarget }
      }
    }

    if (preset === "retinaInspection") {
      return { camPos: [0.1, 0.05, -0.3] as [number, number, number], camTarget: [0, 0, -2.0] as [number, number, number] }
    }
    if (preset === "crossSection") {
      return { camPos: [4.2, 0.6, 2.2] as [number, number, number], camTarget: [0, 0, 0] as [number, number, number] }
    }
    return { camPos: [0, 0, 4.8] as [number, number, number], camTarget: [0, 0, 0] as [number, number, number] }
  }, [selectedId, preset])

  return (
    <>
      <CameraController targetPos={camPos} lookTarget={camTarget} isInspectingRetina={isInspectingRetina} />

      {/* Lighting Setup */}
      <ambientLight intensity={isInspectingRetina ? 0.7 : 0.45} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <directionalLight position={[-5, -4, -3]} intensity={0.6} color="#7C8CFF" />
      <pointLight position={[0, 0, 2.8]} intensity={1.2} color="#39D9D0" distance={6} />
      {isInspectingRetina && (
        <pointLight position={[0, 0, -0.6]} intensity={2.0} color="#FDBA74" distance={3.5} />
      )}

      {/* Anatomical Eye Components */}
      <group>
        <ScleraMesh cutaway={cutaway || preset === "crossSection"} isInspectingRetina={isInspectingRetina} onSelect={onSelect} />
        <CorneaMesh onSelect={onSelect} />
        <IrisAndPupilMesh onSelect={onSelect} />
        <LensMesh onSelect={onSelect} />
        <VitreousMesh isInspectingRetina={isInspectingRetina} onSelect={onSelect} />
        <PosteriorRetinaMesh isInspectingRetina={isInspectingRetina} onSelect={onSelect} />
        <RetinalVasculatureMesh highlight={vesselGlow} onSelect={onSelect} />

        {/* Hotspots */}
        {showHotspots &&
          EYE_STRUCTURES.map((s) => (
            <AnatomicalHotspot
              key={s.id}
              structure={s}
              isSelected={selectedId === s.id}
              onSelect={onSelect}
            />
          ))}
      </group>

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        dampingFactor={0.06}
        minDistance={0.5}
        maxDistance={12}
      />
    </>
  )
}

// ─── MAIN EXPORTED COMPONENT ──────────────────────────────────────
interface Eye3DViewerProps {
  initialStructure?: string | null
  height?: string
  showInspectionDrawer?: boolean
  className?: string
}

export function Eye3DViewer({
  initialStructure = null,
  height = "h-[540px]",
  showInspectionDrawer = true,
  className = "",
}: Eye3DViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialStructure)
  const [cutaway, setCutaway] = useState<boolean>(false)
  const [showHotspots, setShowHotspots] = useState<boolean>(true)
  const [vesselGlow, setVesselGlow] = useState<boolean>(true)
  const [preset, setPreset] = useState<"external" | "crossSection" | "retinaInspection" | "free">("external")
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [hasWebGL, setHasWebGL] = useState<boolean>(true)

  // Verify WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
      if (!gl) setHasWebGL(false)
    } catch (e) {
      setHasWebGL(false)
    }
  }, [])

  const selectedStructure = useMemo(
    () => EYE_STRUCTURES.find((s) => s.id === selectedId) || null,
    [selectedId]
  )

  const handlePresetChange = (newPreset: "external" | "crossSection" | "retinaInspection") => {
    setPreset(newPreset)
    if (newPreset === "retinaInspection") {
      setSelectedId("retina")
      setCutaway(true)
    } else if (newPreset === "crossSection") {
      setCutaway(true)
      setSelectedId("lens")
    } else {
      setCutaway(false)
      setSelectedId(null)
    }
  }

  const handleResetCamera = () => {
    setPreset("external")
    setSelectedId(null)
    setCutaway(false)
  }

  if (!hasWebGL) {
    return (
      <div className={`glass-card ${height} flex flex-col items-center justify-center p-8 text-center`}>
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="text-base font-bold text-white">WebGL Hardware Acceleration Unavailable</h3>
        <p className="text-sm text-[#9AAFC1] max-w-md mt-1">
          Your browser or display environment does not have WebGL enabled. 2D retinal fundus analysis and screening workflows remain fully functional.
        </p>
      </div>
    )
  }

  return (
    <div
      className={`relative glass-card border border-white/10 rounded-2xl overflow-hidden ${
        isFullscreen ? "fixed inset-2 z-50 h-[calc(100vh-16px)] bg-[#07111F]" : height
      } ${className}`}
    >
      {/* TOP FLOATING CONTROLS TOOLBAR */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Preset Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0B1726]/90 border border-white/10 shadow-lg backdrop-blur-md pointer-events-auto">
          <button
            type="button"
            onClick={() => handlePresetChange("external")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition ${
              preset === "external"
                ? "bg-[#39D9D0] text-[#07111F] shadow-[0_0_10px_rgba(57,217,208,0.3)]"
                : "text-[#9AAFC1] hover:text-white"
            }`}
          >
            External Eye
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("crossSection")}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition ${
              preset === "crossSection"
                ? "bg-[#39D9D0] text-[#07111F] shadow-[0_0_10px_rgba(57,217,208,0.3)]"
                : "text-[#9AAFC1] hover:text-white"
            }`}
          >
            Internal Cutaway
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("retinaInspection")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg transition ${
              preset === "retinaInspection"
                ? "bg-gradient-to-r from-[#39D9D0] to-[#7C8CFF] text-[#07111F] shadow-[0_0_15px_rgba(57,217,208,0.4)]"
                : "text-[#39D9D0] hover:bg-[#39D9D0]/10"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Retina Inspection Mode
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0B1726]/90 border border-white/10 shadow-lg backdrop-blur-md pointer-events-auto">
          <button
            type="button"
            onClick={() => setCutaway(!cutaway)}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 ${
              cutaway ? "bg-[#7C8CFF]/20 text-[#7C8CFF] border border-[#7C8CFF]/30 font-semibold" : "text-[#9AAFC1] hover:text-white"
            }`}
            title="Toggle cross-section cutaway"
          >
            <Layers className="w-3.5 h-3.5" />
            Cutaway
          </button>

          <button
            type="button"
            onClick={() => setShowHotspots(!showHotspots)}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 ${
              showHotspots ? "bg-[#39D9D0]/15 text-[#39D9D0] font-semibold" : "text-[#9AAFC1] hover:text-white"
            }`}
            title="Toggle anatomical hotspots"
          >
            Hotspots
          </button>

          <button
            type="button"
            onClick={() => setVesselGlow(!vesselGlow)}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 ${
              vesselGlow ? "bg-rose-500/15 text-rose-400 font-semibold" : "text-[#9AAFC1] hover:text-white"
            }`}
            title="Highlight vascular arcades"
          >
            Vessels
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={handleResetCamera}
            className="p-1.5 text-[#9AAFC1] hover:text-[#39D9D0] rounded-lg transition"
            title="Reset camera view"
            aria-label="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-[#9AAFC1] hover:text-[#39D9D0] rounded-lg transition"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen 3D Viewer"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 3D CANVAS VIEWPORT */}
      <div className="w-full h-full cursor-grab active:cursor-grabbing">
        <Canvas camera={{ position: [0, 0, 4.8], fov: 48 }} dpr={[1, 2]}>
          <Suspense fallback={null}>
            <EyeScene
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                setPreset("free")
              }}
              cutaway={cutaway}
              showHotspots={showHotspots}
              vesselGlow={vesselGlow}
              preset={preset}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* INFORMATIVE NOTICE ON ILLUSTRATIVE NATURE */}
      <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#07111F]/85 border border-white/5 text-[9px] text-[#9AAFC1] backdrop-blur-sm pointer-events-auto">
          <Info className="w-3 h-3 text-[#39D9D0]" />
          <span>Interactive 3D Anatomical Reference Model · Not Patient-Specific Imaging</span>
        </div>
      </div>

      {/* DETAILED ANATOMICAL INSPECTION DRAWER */}
      {showInspectionDrawer && selectedStructure && (
        <div className="absolute right-3 bottom-3 top-16 w-80 max-w-[calc(100%-24px)] z-20 overflow-y-auto rounded-xl bg-[#0B1726]/95 border border-[#39D9D0]/20 p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
            <div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-[#39D9D0]">
                {selectedStructure.category}
              </span>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                {selectedStructure.name}
              </h4>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-[#9AAFC1] hover:text-white p-1 rounded text-xs"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-3 text-xs leading-relaxed">
            <div>
              <p className="text-[10px] uppercase font-semibold text-[#5A7184]">Anatomy & Function</p>
              <p className="text-[#F4F8FC] mt-0.5">{selectedStructure.description}</p>
            </div>

            <div className="rounded-lg bg-[#101F30] p-2.5 border border-white/5">
              <p className="text-[10px] uppercase font-semibold text-[#7C8CFF] flex items-center gap-1">
                <Activity className="w-3 h-3" /> Clinical Significance
              </p>
              <p className="text-[#9AAFC1] mt-1 text-[11px]">{selectedStructure.clinicalSignificance}</p>
            </div>

            <div className="rounded-lg bg-[#102436] p-2.5 border border-[#39D9D0]/20">
              <p className="text-[10px] uppercase font-semibold text-[#39D9D0] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Diabetic Retinopathy Context
              </p>
              <p className="text-[#F4F8FC] mt-1 text-[11px]">{selectedStructure.drRelevance}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default Eye3DViewer
