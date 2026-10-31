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

  return null
}
