"use client"

import React, { useRef, useState, useMemo, Suspense, useEffect, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Html, ContactShadows, Environment } from "@react-three/drei"
import * as THREE from "three"
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  Info,
  Sparkles,
  AlertCircle,
  Activity,
  Orbit,
  Eye,
  Layers,
} from "lucide-react"
import { RETINAL_DISEASES, type RetinalDisease, type DiseaseLesion } from "@/lib/retinal-diseases"

// ─── LESION COLOR MAP ────────────────────────────────────────────
const LESION_COLORS: Record<DiseaseLesion["type"], string> = {
  microaneurysm: "#FF4444",
  hemorrhage: "#8B1A1A",
  hardExudate: "#FCD34D",
  cottonWoolSpot: "#F8FAFC",
  neovascularization: "#FF5252",
  edema: "#A78BFA",
  venousBeading: "#92400E",
  IRMA: "#DC2626",
}

const LESION_LABELS: Record<DiseaseLesion["type"], string> = {
  microaneurysm: "Microaneurysm",
  hemorrhage: "Hemorrhage",
  hardExudate: "Hard Exudate",
  cottonWoolSpot: "Cotton-Wool Spot",
  neovascularization: "Neovascularization",
  edema: "Edema / Swelling",
  venousBeading: "Venous Beading",
  IRMA: "IRMA",
}

// ─── CAMERA CONTROLLER with Auto-Rotate ──────────────────────────
function CameraController({
  targetPos,
  lookTarget,
  autoRotate,
}: {
  targetPos: [number, number, number]
  lookTarget: [number, number, number]
  autoRotate: boolean
}) {
  const { camera } = useThree()
  const currentLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -2.0))
  const angleRef = useRef(0)

  useFrame((_, delta) => {
    const desiredPos = new THREE.Vector3(...targetPos)
    if (autoRotate) {
      angleRef.current += delta * 0.25
      const r = 0.35
      desiredPos.x = targetPos[0] + Math.cos(angleRef.current) * r
      desiredPos.y = targetPos[1] + Math.sin(angleRef.current * 0.7) * 0.15
    }
    camera.position.lerp(desiredPos, Math.min(1, delta * 2.5))
    const desiredLook = new THREE.Vector3(...lookTarget)
    currentLookAt.current.lerp(desiredLook, Math.min(1, delta * 3.0))
    camera.lookAt(currentLookAt.current)
  })

  return null
}

// ─── PROCEDURAL RETINAL TEXTURE (noise-based) ─────────────────────
function useRetinalTexture() {
  return useMemo(() => {
    const size = 512
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!

    // Base retinal color gradient (orange-red fundus)
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, "#C2410C")
    grad.addColorStop(0.3, "#B83A1E")
    grad.addColorStop(0.6, "#9A2F15")
    grad.addColorStop(0.85, "#7A2210")
    grad.addColorStop(1, "#5C1A0B")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    // Add fine vascular pattern noise
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = Math.random() * 2 + 0.5
      const alpha = Math.random() * 0.08
      ctx.fillStyle = `rgba(220, 38, 38, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Add subtle pigment variation
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = Math.random() * 15 + 5
      const alpha = Math.random() * 0.04
      ctx.fillStyle = `rgba(120, 40, 20, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Nerve fiber layer sheen (fine radial lines from disc)
    ctx.strokeStyle = "rgba(252, 211, 77, 0.015)"
    ctx.lineWidth = 0.5
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(size * 0.35, size * 0.45)
      ctx.lineTo(size * 0.35 + Math.cos(angle) * size * 0.4, size * 0.45 + Math.sin(angle) * size * 0.4)
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

// ─── PROCEDURAL BUMP/ROUGHNESS MAP ────────────────────────────────
function useRoughnessTexture() {
  return useMemo(() => {
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!

    ctx.fillStyle = "#888"
    ctx.fillRect(0, 0, size, size)

    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = Math.random() * 4 + 1
      const v = Math.random() * 80 + 100
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    return texture
  }, [])
}

// ─── RETINAL BOWL (High-Quality Posterior Hemisphere) ────────────
function RetinalBowl({ accentColor }: { accentColor: string }) {
  const retinalTexture = useRetinalTexture()
  const roughnessTex = useRoughnessTexture()

  // Vertex displacement for organic retinal surface
  const displacementMap = useMemo(() => {
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!
    const imgData = ctx.createImageData(size, size)
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor(Math.random() * 20)
      imgData.data[i * 4] = v
      imgData.data[i * 4 + 1] = v
      imgData.data[i * 4 + 2] = v
      imgData.data[i * 4 + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)
    return new THREE.CanvasTexture(canvas)
  }, [])

  return (
    <group>
      {/* ── Choroidal layer (dark vascular bed behind retina) ── */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[1.97, 128, 96, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
        <meshStandardMaterial
          color="#3D0B03"
          roughness={0.9}
          metalness={0.0}
          side={THREE.BackSide}
          emissive="#1A0501"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* ── RPE + Photoreceptor layer (dark pigment) ── */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[1.955, 128, 96, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
        <meshStandardMaterial
          color="#5C1A0B"
          roughness={0.7}
          metalness={0.0}
          side={THREE.BackSide}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* ── Main retinal surface with procedural texture ── */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[1.94, 128, 96, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
        <meshPhysicalMaterial
          map={retinalTexture}
          roughnessMap={roughnessTex}
          displacementMap={displacementMap}
          displacementScale={0.015}
          color="#B84224"
          roughness={0.45}
          metalness={0.05}
          side={THREE.BackSide}
          emissive="#7A2210"
          emissiveIntensity={0.2}
          clearcoat={0.15}
          clearcoatRoughness={0.7}
        />
      </mesh>

      {/* ── Optic Disc with rim ── */}
      <group position={[-0.65, 0.25, -1.91]} rotation={[0, 0.28, 0]}>
        {/* Disc rim (slightly raised pink-orange ring) */}
        <mesh>
          <ringGeometry args={[0.18, 0.24, 64]} />
          <meshStandardMaterial
            color="#F9A8D4"
            emissive="#EC4899"
            emissiveIntensity={0.2}
            side={THREE.DoubleSide}
            roughness={0.5}
          />
        </mesh>
        {/* Disc center (yellow-pink) */}
        <mesh>
          <circleGeometry args={[0.2, 48]} />
          <meshPhysicalMaterial
            color="#FDE047"
            emissive="#F59E0B"
            emissiveIntensity={0.45}
            side={THREE.DoubleSide}
            roughness={0.3}
            clearcoat={0.5}
          />
        </mesh>
        {/* Physiological cup (inner depression) */}
        <mesh position={[0, 0, -0.008]}>
          <circleGeometry args={[0.09, 32]} />
          <meshStandardMaterial
            color="#FEF08A"
            emissive="#FDE047"
            emissiveIntensity={0.3}
          />
        </mesh>
        {/* Central vessel origins */}
        <mesh position={[0, 0, 0.005]}>
          <ringGeometry args={[0.03, 0.06, 16]} />
          <meshBasicMaterial color="#8B0000" />
        </mesh>
      </group>

      {/* ── Fovea / Macula with avascular zone ── */}
      <group position={[0.65, -0.05, -1.91]}>
        {/* Macula lutea (darker pigmented area) */}
        <mesh>
          <circleGeometry args={[0.34, 48]} />
          <meshPhysicalMaterial
            color="#8A2612"
            emissive="#521307"
            emissiveIntensity={0.35}
            side={THREE.DoubleSide}
            roughness={0.6}
          />
        </mesh>
        {/* Macular pigment ring (xanthophyll) */}
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[0.12, 0.3, 48]} />
          <meshStandardMaterial
            color="#A16207"
            transparent
            opacity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Foveola central dark pit */}
        <mesh position={[0, 0, -0.005]}>
          <circleGeometry args={[0.08, 32]} />
          <meshPhysicalMaterial
            color="#3D0B03"
            emissive="#1A0501"
            emissiveIntensity={0.3}
            roughness={0.9}
          />
        </mesh>
        {/* Foveal light reflex (highlight) */}
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial color="#FCD34D" transparent opacity={0.4} />
        </mesh>
      </group>

      {/* ── Accent glow ring ── */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI, 0, 0]}>
        <ringGeometry args={[1.93, 1.965, 128]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ─── RETINAL VASCULATURE (Detailed arterial + venous arcades) ────
function RetinalVasculature() {
  const vesselData = useMemo(() => {
    const origin = new THREE.Vector3(-0.65, 0.25, -1.905)
    const curveData: { points: THREE.Vector3[]; radius: number; type: "artery" | "vein" }[] = [
      // ── Superior Temporal Artery ──
      { points: [origin, new THREE.Vector3(-0.45, 0.6, -1.88), new THREE.Vector3(-0.1, 0.95, -1.79), new THREE.Vector3(0.3, 1.05, -1.77), new THREE.Vector3(0.7, 0.9, -1.79), new THREE.Vector3(1.0, 0.65, -1.82), new THREE.Vector3(1.15, 0.35, -1.84)], radius: 0.022, type: "artery" },
      // ── Superior Temporal Vein ──
      { points: [origin.clone().add(new THREE.Vector3(0.03, -0.02, 0)), new THREE.Vector3(-0.4, 0.65, -1.86), new THREE.Vector3(-0.02, 1.05, -1.76), new THREE.Vector3(0.4, 1.12, -1.74), new THREE.Vector3(0.78, 0.98, -1.76), new THREE.Vector3(1.08, 0.7, -1.8), new THREE.Vector3(1.22, 0.4, -1.82)], radius: 0.035, type: "vein" },
      // ── Inferior Temporal Artery ──
      { points: [origin, new THREE.Vector3(-0.4, -0.3, -1.88), new THREE.Vector3(-0.05, -0.7, -1.79), new THREE.Vector3(0.3, -0.85, -1.77), new THREE.Vector3(0.7, -0.78, -1.79), new THREE.Vector3(1.05, -0.55, -1.82), new THREE.Vector3(1.2, -0.25, -1.84)], radius: 0.022, type: "artery" },
      // ── Inferior Temporal Vein ──
      { points: [origin.clone().add(new THREE.Vector3(0.02, 0.03, 0)), new THREE.Vector3(-0.35, -0.35, -1.86), new THREE.Vector3(0.0, -0.78, -1.75), new THREE.Vector3(0.38, -0.92, -1.74), new THREE.Vector3(0.75, -0.85, -1.76), new THREE.Vector3(1.1, -0.6, -1.8), new THREE.Vector3(1.25, -0.3, -1.82)], radius: 0.035, type: "vein" },
      // ── Superior Nasal Artery ──
      { points: [origin, new THREE.Vector3(-0.85, 0.65, -1.87), new THREE.Vector3(-1.1, 0.9, -1.8), new THREE.Vector3(-1.3, 0.85, -1.78), new THREE.Vector3(-1.45, 0.6, -1.8)], radius: 0.02, type: "artery" },
      // ── Superior Nasal Vein ──
      { points: [origin.clone().add(new THREE.Vector3(-0.02, -0.02, 0)), new THREE.Vector3(-0.9, 0.7, -1.85), new THREE.Vector3(-1.18, 0.95, -1.78), new THREE.Vector3(-1.4, 0.9, -1.76)], radius: 0.03, type: "vein" },
      // ── Inferior Nasal Artery ──
      { points: [origin, new THREE.Vector3(-0.9, -0.35, -1.86), new THREE.Vector3(-1.15, -0.65, -1.79), new THREE.Vector3(-1.35, -0.7, -1.78)], radius: 0.02, type: "artery" },
      // ── Inferior Nasal Vein ──
      { points: [origin.clone().add(new THREE.Vector3(-0.03, 0.02, 0)), new THREE.Vector3(-0.95, -0.4, -1.85), new THREE.Vector3(-1.22, -0.72, -1.77), new THREE.Vector3(-1.4, -0.78, -1.76)], radius: 0.03, type: "vein" },
      // ── Macular Arcade (small vessels around fovea) ──
      { points: [new THREE.Vector3(0.1, 0.4, -1.85), new THREE.Vector3(0.35, 0.2, -1.87), new THREE.Vector3(0.55, 0.05, -1.88), new THREE.Vector3(0.65, -0.05, -1.91)], radius: 0.012, type: "artery" },
      { points: [new THREE.Vector3(0.1, -0.4, -1.85), new THREE.Vector3(0.35, -0.25, -1.87), new THREE.Vector3(0.55, -0.12, -1.88), new THREE.Vector3(0.65, -0.05, -1.91)], radius: 0.012, type: "artery" },
    ]

    return curveData.map((c) => {
      const curve = new THREE.CatmullRomCurve3(c.points)
      const geometry = new THREE.TubeGeometry(curve, 64, c.radius, 12, false)
      return { geometry, type: c.type, radius: c.radius }
    })
  }, [])

  return (
    <group>
      {vesselData.map((v, idx) => (
        <mesh key={idx} geometry={v.geometry}>
          <meshPhysicalMaterial
            color={v.type === "artery" ? "#DC2626" : "#7C2D12"}
            roughness={0.35}
            metalness={0.15}
            emissive={v.type === "artery" ? "#EF4444" : "#6B21A8"}
            emissiveIntensity={v.type === "artery" ? 0.2 : 0.15}
            clearcoat={0.3}
            clearcoatRoughness={0.4}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── LESION MARKERS (High Quality) ───────────────────────────────
function LesionMarker({
  lesion,
  index,
  pulse,
}: {
  lesion: DiseaseLesion
  index: number
  pulse: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const color = lesion.color || LESION_COLORS[lesion.type]

  useFrame((state) => {
    if (meshRef.current && pulse) {
      const t = state.clock.elapsedTime
      // Heartbeat-like rhythm: quick pulse, then rest
      const beat = Math.pow(Math.sin(t * 1.2 + index * 0.3), 16) * 0.25 + 1
      meshRef.current.scale.setScalar(beat)
    }
    if (groupRef.current && lesion.type === "neovascularization" && pulse) {
      const t = state.clock.elapsedTime
      groupRef.current.rotation.z = t * 0.3 + index
    }
  })

  // ── Neovascularization: vessel fronds growing outward ──
  if (lesion.type === "neovascularization") {
    const frondCount = 8
    return (
      <group ref={groupRef} position={lesion.position}>
        {/* Central blob */}
        <mesh ref={meshRef}>
          <sphereGeometry args={[lesion.radius * 0.6, 24, 24]} />
          <meshPhysicalMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.2}
            roughness={0.2}
            metalness={0.3}
            transmission={0.1}
            transparent
            opacity={0.9}
          />
        </mesh>
        {/* Vessel fronds */}
        {Array.from({ length: frondCount }).map((_, i) => {
          const angle = (i / frondCount) * Math.PI * 2
          const length = lesion.radius * (1.2 + Math.random() * 0.6)
          const r = lesion.radius * 0.4
          const midX = Math.cos(angle) * r
          const midY = Math.sin(angle) * r
          const endX = Math.cos(angle) * length
          const endY = Math.sin(angle) * length
          return (
            <group key={i}>
              {/* Frond stem */}
              <mesh
                position={[midX * 1.5, midY * 1.5, 0.01]}
                rotation={[0, 0, angle]}
              >
                <cylinderGeometry args={[lesion.radius * 0.08, lesion.radius * 0.15, length * 0.7, 8]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.9}
                  roughness={0.3}
                  transparent
                  opacity={0.75}
                />
              </mesh>
              {/* Frond tip bud */}
              <mesh position={[endX, endY, 0.015]}>
                <sphereGeometry args={[lesion.radius * 0.1, 12, 12]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={1.0}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            </group>
          )
        })}
        {/* Glow halo */}
        <mesh>
          <sphereGeometry args={[lesion.radius * 1.8, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} />
        </mesh>
        <Html distanceFactor={8} center>
          <div className="px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap bg-red-500/90 text-white shadow-lg pointer-events-none border border-red-300/30">
            {LESION_LABELS[lesion.type]}
          </div>
        </Html>
      </group>
    )
  }

  // ── Edema: translucent swelling with internal scattering ──
  if (lesion.type === "edema") {
    return (
      <group position={lesion.position}>
        {/* Outer translucent membrane */}
        <mesh ref={meshRef}>
          <sphereGeometry args={[lesion.radius, 32, 32]} />
          <meshPhysicalMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.25}
            transmission={0.75}
            opacity={0.3}
            transparent
            roughness={0.05}
            ior={1.33}
            thickness={0.5}
            iridescence={0.3}
            iridescenceIOR={1.3}
          />
        </mesh>
        {/* Inner fluid core */}
        <mesh scale={0.6}>
          <sphereGeometry args={[lesion.radius, 20, 20]} />
          <meshStandardMaterial
            color="#C4B5FD"
            emissive="#8B5CF6"
            emissiveIntensity={0.15}
            transparent
            opacity={0.2}
          />
        </mesh>
      </group>
    )
  }

  // ── Cotton-Wool Spot: fluffy, irregular white patch ──
  if (lesion.type === "cottonWoolSpot") {
    return (
      <group position={lesion.position}>
        {/* Main fluffy body */}
        <mesh ref={meshRef}>
          <sphereGeometry args={[lesion.radius, 20, 20]} />
          <meshPhysicalMaterial
            color="#F8FAFC"
            emissive="#E2E8F0"
            emissiveIntensity={0.35}
            roughness={0.95}
            metalness={0.0}
            transparent
            opacity={0.8}
            sheen={1}
            sheenColor="#FFFFFF"
            sheenRoughness={0.5}
          />
        </mesh>
        {/* Irregular edge blobs */}
        {Array.from({ length: 4 }).map((_, i) => {
          const angle = (i / 4) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * lesion.radius * 0.6, Math.sin(angle) * lesion.radius * 0.6, 0.005]}
            >
              <sphereGeometry args={[lesion.radius * 0.5, 12, 12]} />
              <meshStandardMaterial
                color="#F1F5F9"
                emissive="#E2E8F0"
                emissiveIntensity={0.2}
                roughness={0.9}
                transparent
                opacity={0.5}
              />
            </mesh>
          )
        })}
      </group>
    )
  }

  // ── Hard Exudate: crystalline yellow-white lipid deposit ──
  if (lesion.type === "hardExudate") {
    return (
      <mesh ref={meshRef} position={lesion.position}>
        <sphereGeometry args={[lesion.radius, 20, 20]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.25}
          metalness={0.3}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          transparent
          opacity={0.95}
          sheen={0.5}
          sheenColor="#FEF3C7"
        />
      </mesh>
    )
  }

  // ── Hemorrhage: dark red blood pool with depth ──
  if (lesion.type === "hemorrhage") {
    return (
      <group position={lesion.position}>
        {/* Dark core */}
        <mesh ref={meshRef}>
          <sphereGeometry args={[lesion.radius, 24, 24]} />
          <meshPhysicalMaterial
            color={color}
            emissive="#450A0A"
            emissiveIntensity={0.4}
            roughness={0.2}
            metalness={0.4}
            transparent
            opacity={0.92}
            transmission={0.1}
          />
        </mesh>
        {/* Surrounding lighter blood ring */}
        <mesh scale={1.3}>
          <sphereGeometry args={[lesion.radius, 16, 16]} />
          <meshStandardMaterial
            color="#DC2626"
            emissive="#991B1B"
            emissiveIntensity={0.2}
            transparent
            opacity={0.15}
          />
        </mesh>
      </group>
    )
  }

  // ── Venous Beading: irregular bulges along vessel ──
  if (lesion.type === "venousBeading") {
    return (
      <group position={lesion.position} rotation={[0, 0, index * 0.7]}>
        {/* Bead sequence */}
        {Array.from({ length: 4 }).map((_, i) => (
          <mesh key={i} position={[(i - 1.5) * lesion.radius * 0.8, 0, 0]}>
            <sphereGeometry args={[lesion.radius * (0.6 + (i % 2) * 0.3), 16, 16]} />
            <meshPhysicalMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.5}
              roughness={0.3}
              metalness={0.2}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
      </group>
    )
  }

  // ── IRMA: tangled shunt vessels ──
  if (lesion.type === "IRMA") {
    return (
      <group position={lesion.position}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[lesion.radius * 0.5, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.8} />
        </mesh>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i / 6) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(angle) * lesion.radius * 0.7, Math.sin(angle) * lesion.radius * 0.7, 0.01]} rotation={[0, 0, angle + Math.PI / 2]}>
              <torusGeometry args={[lesion.radius * 0.3, lesion.radius * 0.08, 8, 12, Math.PI * 0.6]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.3} transparent opacity={0.6} />
            </mesh>
          )
        })}
      </group>
    )
  }

  // ── Microaneurysm: small red dot ──
  return (
    <group position={lesion.position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[lesion.radius, 20, 20]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          roughness={0.2}
          metalness={0.2}
          clearcoat={0.5}
          clearcoatRoughness={0.3}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* Subtle glow */}
      <mesh scale={1.5}>
        <sphereGeometry args={[lesion.radius, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.06} />
      </mesh>
    </group>
  )
}

// ─── FLOATING DUST PARTICLES (atmospheric depth) ──────────────────
function DustParticles() {
  const points = useMemo(() => {
    const count = 80
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4
      positions[i * 3 + 2] = -1 + (Math.random() - 0.5) * 2
    }
    return positions
  }, [])

  const ref = useRef<THREE.Points>(null)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.02
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={points.length / 3} array={points} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.008} color="#39D9D0" transparent opacity={0.3} sizeAttenuation />
    </points>
  )
}

// ─── LEGEND ITEM ─────────────────────────────────────────────────
function LegendDot({ color }: { color: string }) {
  return <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />
}

// ─── 3D SCENE ────────────────────────────────────────────────────
function DiseaseScene({
  disease,
  pulse,
  autoRotate,
}: {
  disease: RetinalDisease
  pulse: boolean
  autoRotate: boolean
}) {
  const camPos: [number, number, number] = [0.1, 0.05, -0.3]
  const camTarget: [number, number, number] = [0, 0, -2.0]

  return (
    <>
      <CameraController targetPos={camPos} lookTarget={camTarget} autoRotate={autoRotate} />

      {/* ── Three-point lighting setup ── */}
      <ambientLight intensity={0.35} />
      {/* Key light */}
      <directionalLight position={[3, 4, 3]} intensity={1.2} castShadow />
      {/* Fill light (cool) */}
      <directionalLight position={[-4, -2, 2]} intensity={0.4} color="#7C8CFF" />
      {/* Rim/back light */}
      <directionalLight position={[0, 0, -4]} intensity={0.5} color={disease.accentColor} />
      {/* Internal retinal illumination (warm) */}
      <pointLight position={[0, 0, -0.5]} intensity={2.5} color="#FDBA74" distance={3.5} decay={2} />
      {/* Accent glow */}
      <pointLight position={[0, 0, 1.5]} intensity={0.6} color={disease.accentColor} distance={5} />
      {/* Optic disc spotlight */}
      <pointLight position={[-0.65, 0.25, -1.8]} intensity={0.8} color="#FDE047" distance={1.5} />
      {/* Fovea spotlight */}
      <pointLight position={[0.65, -0.05, -1.8]} intensity={0.5} color="#8A2612" distance={1.2} />

      {/* Atmospheric fog for depth */}
      <fog attach="fog" args={["#07111F", 3, 8]} />

      {/* Retinal bowl and vasculature */}
      <RetinalBowl accentColor={disease.accentColor} />
      <RetinalVasculature />

      {/* Dust particles */}
      <DustParticles />

      {/* Disease lesions */}
      {disease.lesions.map((lesion, idx) => (
        <LesionMarker key={idx} lesion={lesion} index={idx} pulse={pulse} />
      ))}

      {/* Contact shadows for grounding */}
      <ContactShadows
        position={[0, -2.1, -1]}
        opacity={0.15}
        scale={6}
        blur={3}
        far={4}
        color="#000000"
      />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        dampingFactor={0.05}
        minDistance={0.4}
        maxDistance={6}
        autoRotateSpeed={0}
      />
    </>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
interface RetinalDisease3DViewerProps {
  disease: RetinalDisease
  height?: string
  className?: string
}

export function RetinalDisease3DViewer({
  disease,
  height = "h-[480px]",
  className = "",
}: RetinalDisease3DViewerProps) {
  const [pulse, setPulse] = useState<boolean>(true)
  const [autoRotate, setAutoRotate] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [hasWebGL, setHasWebGL] = useState<boolean>(true)
  const [showLayers, setShowLayers] = useState<boolean>(true)

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
      if (!gl) setHasWebGL(false)
    } catch {
      setHasWebGL(false)
    }
  }, [])

  if (!hasWebGL) {
    return (
      <div className={`glass-card ${height} flex flex-col items-center justify-center p-8 text-center`}>
        <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="text-base font-bold text-white">WebGL Hardware Acceleration Unavailable</h3>
        <p className="text-sm text-[#9AAFC1] max-w-md mt-1">
          Your browser does not have WebGL enabled. Disease descriptions remain available below.
        </p>
      </div>
    )
  }

  const legendItems = useMemo(() => {
    const seen = new Set<string>()
    const items: { type: DiseaseLesion["type"]; color: string }[] = []
    for (const l of disease.lesions) {
      if (!seen.has(l.type)) {
        seen.add(l.type)
        items.push({ type: l.type, color: LESION_COLORS[l.type] })
      }
    }
    return items
  }, [disease])

  return (
    <div
      className={`relative glass-card border border-white/10 rounded-2xl overflow-hidden ${
        isFullscreen ? "fixed inset-2 z-50 h-[calc(100vh-16px)] bg-[#07111F]" : height
      } ${className}`}
    >
      {/* TOP CONTROLS */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Disease title badge */}
        <div className="flex items-center gap-2 p-1.5 px-3 rounded-xl bg-[#0B1726]/90 border border-white/10 shadow-lg backdrop-blur-md pointer-events-auto">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: disease.accentColor, boxShadow: `0 0 10px ${disease.accentColor}` }} />
          <span className="text-xs font-bold text-white">{disease.shortName}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#9AAFC1]">
            {disease.lesions.length} lesions
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0B1726]/90 border border-white/10 shadow-lg backdrop-blur-md pointer-events-auto">
          <button
            type="button"
            onClick={() => setPulse(!pulse)}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 ${
              pulse ? "bg-[#39D9D0]/15 text-[#39D9D0] font-semibold" : "text-[#9AAFC1] hover:text-white"
            }`}
            title="Toggle lesion pulse animation"
          >
            <Activity className="w-3.5 h-3.5" />
            Pulse
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-2 py-1 text-[11px] rounded-lg transition flex items-center gap-1 ${
              autoRotate ? "bg-[#7C8CFF]/15 text-[#7C8CFF] font-semibold" : "text-[#9AAFC1] hover:text-white"
            }`}
            title="Toggle auto-rotation"
          >
            <Orbit className="w-3.5 h-3.5" />
            Orbit
          </button>
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-[#9AAFC1] hover:text-[#39D9D0] rounded-lg transition"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* LEGEND */}
      {legendItems.length > 0 && (
        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2 p-2.5 rounded-xl bg-[#0B1726]/90 border border-white/10 shadow-lg backdrop-blur-md max-w-[calc(100%-24px)]">
          {legendItems.map((item) => (
            <div key={item.type} className="flex items-center gap-1.5 text-[10px] text-[#F4F8FC]">
              <LegendDot color={item.color} />
              <span>{LESION_LABELS[item.type]}</span>
            </div>
          ))}
        </div>
      )}

      {/* 3D CANVAS — High Quality */}
      <div className="w-full h-full cursor-grab active:cursor-grabbing">
        <Canvas
          camera={{ position: [0.1, 0.05, -0.3], fov: 48 }}
          dpr={[1, 2.5]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
          }}
          shadows
        >
          <color attach="background" args={["#07111F"]} />
          <Suspense fallback={null}>
            <DiseaseScene disease={disease} pulse={pulse} autoRotate={autoRotate} />
          </Suspense>
        </Canvas>
      </div>

      {/* Illustrative notice */}
      <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#07111F]/85 border border-white/5 text-[9px] text-[#9AAFC1] backdrop-blur-sm">
          <Info className="w-3 h-3 text-[#39D9D0]" />
          <span>3D Disease Model · Illustrative</span>
        </div>
      </div>
    </div>
  )
}

export default RetinalDisease3DViewer
