import type { Metadata } from 'next'
import { Syne, Outfit } from 'next/font/google'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ranchadapp — Ingresá',
  description: 'Todo para tus ranchadas',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${syne.variable} ${outfit.variable}`}>
      {children}
    </div>
  )
}