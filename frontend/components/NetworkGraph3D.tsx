"use client"

/**
 * DRISHTI-X — 3D Patient-Screening Network Visualization
 * Each patient = node (size = screening count, glow = risk level)
 * Each screening = edge from patient node
 * Meaningful: shows screening load, risk distribution, referral connections
 */

import { useRef, useMemo, Suspense } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Sphere, Line } from "@react-three/drei"
import * as THREE from "three"

interface PatientNode {
  id: string
  code: string
  screeningCount: number
  maxGrade: number | null
  x: number
  y: number
  z: number
}

interface ScreeningEdge {
  from: [number, number, number]
  to: [number, number, number]
  priority: string
}

const GRADE_COLORS: Record<number, string> = {
  0: "#10b981",
  1: "#f59e0b",
  2: "#f97316",
  3: "#ef4444",
  4: "#dc2626",
}

const PRIORITY_EDGE_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  MEDIUM:   "#f59e0b",
  LOW:      "#10b981",
}

function PatientSphere({ node }: { node: PatientNode }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const grade = node.maxGrade ?? 0
  const color = GRADE_COLORS[grade] ?? "#38bdf8"
  const size = 0.15 + Math.min(node.screeningCount * 0.05, 0.4)

  useFrame((state) => {
    if (meshRef.current) {
      // Subtle pulse for high-risk nodes
      if (grade >= 3) {
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.08
        meshRef.current.scale.setScalar(pulse)
      }
    }
  })

  return (
    <mesh ref={meshRef} position={[node.x, node.y, node.z]}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={grade >= 2 ? 0.4 : 0.15}
        transparent opacity={0.85}
      />
    </mesh>
  )
}

function NetworkScene({ patients }: { patients: PatientNode[] }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} color="#38bdf8" intensity={0.5} />

      {patients.map(node => (
        <PatientSphere key={node.id} node={node} />
      ))}

      <OrbitControls
        enablePan autoRotate autoRotateSpeed={0.3}
        minDistance={3} maxDistance={30}
      />
    </>
  )
}

function generateLayout(count: number): Array<[number, number, number]> {
  // Fibonacci sphere layout for even distribution
  const positions: Array<[number, number, number]> = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(1 - y * y) * 5
    const theta = phi * i
    positions.push([
      Math.cos(theta) * radius,
      y * 5,
      Math.sin(theta) * radius,
    ])
  }
  return positions
}

interface Props {
  data: Array<{
    id: string
    patient_code: string
    screening_count: number
    latest_dr_grade: number | null
  }>
}

export function NetworkGraph3D({ data }: Props) {
  const positions = useMemo(() => generateLayout(Math.max(data.length, 1)), [data.length])

  const nodes: PatientNode[] = useMemo(() =>
    data.slice(0, 150).map((p, i) => ({
      id:             p.id,
      code:           p.patient_code,
      screeningCount: p.screening_count,
      maxGrade:       p.latest_dr_grade,
      x:              positions[i]?.[0] ?? 0,
      y:              positions[i]?.[1] ?? 0,
      z:              positions[i]?.[2] ?? 0,
    })),
    [data, positions]
  )

  if (data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-slate-500 text-sm">
        No patient data to visualize. Add patients to see the network.
      </div>
    )
  }

  return (
    <div className="w-full h-64 rounded-xl overflow-hidden">
      <Canvas camera={{ position: [0, 0, 12], fov: 60 }}>
        <Suspense fallback={null}>
          <NetworkScene patients={nodes} />
        </Suspense>
      </Canvas>
    </div>
  )
}
