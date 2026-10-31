import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "@/components/Providers"

export const metadata: Metadata = {
  title: "DRISHTI-X — Diabetic Retinopathy Screening",
  description:
    "Explainable AI for Diabetic Retinopathy Screening in Rural India. " +
    "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
