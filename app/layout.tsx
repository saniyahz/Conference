import type { Metadata } from 'next'
import './globals.css'
import SessionProvider from '@/components/SessionProvider'

export const metadata: Metadata = {
  title: 'Kids Story Creator',
  description: 'Create magical stories with your voice!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 min-h-screen">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
