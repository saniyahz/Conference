'use client'

console.log('🔥🔥🔥 MAIN PAGE LOADED - Version 4.0 - ' + new Date().toISOString())

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import SpeechRecorder from '@/components/SpeechRecorder'
import StoryBook from '@/components/StoryBook'
import LoadingSpinner from '@/components/LoadingSpinner'
import { BookOpen, Sparkles, User, LogIn } from 'lucide-react'

export type StoryPage = {
  text: string
  imageUrl?: string
}

export type Story = {
  title: string
  pages: StoryPage[]
}

export default function Home() {
  const { data: session } = useSession()
  const [step, setStep] = useState<'record' | 'generating' | 'book'>('record')
  const [story, setStory] = useState<Story | null>(null)
  const [transcription, setTranscription] = useState<string>('')

  const handleTranscriptionComplete = async (text: string) => {
    setTranscription(text)
    setStep('generating')

    try {
      // Generate story from transcription
      const response = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate story')
      }

      const data = await response.json()
      setStory(data.story)
      setStep('book')
    } catch (error) {
      console.error('Error generating story:', error)
      alert('Failed to generate story. Please try again.')
      setStep('record')
    }
  }

  const handleReset = () => {
    setStep('record')
    setStory(null)
    setTranscription('')
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white rounded-2xl shadow-lg p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-purple-600" />
            <span className="text-xl font-bold text-purple-800">Kids Story Creator</span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/pricing"
              className="px-4 py-2 text-purple-600 hover:text-purple-700 font-semibold"
            >
              Pricing
            </Link>
            {session ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold flex items-center gap-2"
              >
                <User className="w-5 h-5" />
                Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold flex items-center gap-2"
              >
                <LogIn className="w-5 h-5" />
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-12 h-12 text-pink-500" />
            <h1 className="text-4xl md:text-5xl font-bold text-purple-800 font-kids">
              Create Magical Stories
            </h1>
            <Sparkles className="w-12 h-12 text-pink-500" />
          </div>
          <p className="text-lg text-gray-700">
            Tell us your story ideas and watch them come to life!
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-10">
          {step === 'record' && (
            <SpeechRecorder onComplete={handleTranscriptionComplete} />
          )}

          {step === 'generating' && (
            <LoadingSpinner message="Creating your magical story..." />
          )}

          {step === 'book' && story && (
            <StoryBook story={story} onReset={handleReset} />
          )}
        </div>
      </div>
    </main>
  )
}
