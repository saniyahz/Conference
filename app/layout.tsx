import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/components/SessionProvider'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Little Story Bear",
  description: 'Create magical stories with your voice!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={`${outfit.className} bg-zinc-50 min-h-[100dvh] flex flex-col antialiased`}>
        <SessionProvider>
          <main className="flex-1">{children}</main>
          <footer className="text-center text-xs text-zinc-400 py-4 px-6">
            <p>
              All stories generated on this platform are works of fiction created with AI assistance.
              Characters, names, places, and events are entirely fictional. Any resemblance to actual persons or events is coincidental.
              We bear no responsibility for any content that may be perceived as offensive.
            </p>
            <p className="mt-1 text-zinc-300">
              &copy; {new Date().getFullYear()} Little Story Bear
            </p>
          </footer>
        </SessionProvider>
      </body>
    </html>
  )
}
