import type { ReactNode } from 'react'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './globals.css'
import { Providers } from '@/components/providers'

export const metadata = {
  title: 'GasScope — Ethereum gas intelligence',
  description: 'Execution base fee, block demand, and evidence-backed gas attribution for Ethereum.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
