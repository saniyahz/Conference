'use client'

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
  author: string
  pages: StoryPage[]
  originalPrompt?: string
}

export default function Home() {
  const { data: session } = useSession()
  const [step, setStep] = useState<'record' | 'generating' | 'generating-images' | 'book'>('record')
  const [story, setStory] = useState<Story | null>(null)
  const [transcription, setTranscription] = useState<string>('')
  const [loadingMessage, setLoadingMessage] = useState('Creating your magical story...')

  const handleTranscriptionComplete = async (text: string, authorName: string) => {
    setTranscription(text)

    // Check for inappropriate content early
    const inappropriateWords = ['sex', 'sexy', 'nude', 'naked', 'porn', 'xxx', 'adult', 'erotic', 'nsfw']
    const lowerText = text.toLowerCase()
    const hasInappropriateContent = inappropriateWords.some(word => lowerText.includes(word))

    if (hasInappropriateContent) {
      alert('This story idea contains content that isn\'t appropriate for a children\'s story app. Please try a different, kid-friendly idea! Think of fun adventures with animals, magical creatures, or everyday heroes.')
      return
    }

    setStep('generating')
    setLoadingMessage('Creating your magical story...')

    try {
      // Step 1: Generate story text
      const storyResponse = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      })

      if (!storyResponse.ok) {
        const errorData = await storyResponse.json()
        throw new Error(errorData.error || 'Failed to generate story')
      }

      const storyData = await storyResponse.json()

      // Step 2: Generate images for the story
      setStep('generating-images')
      setLoadingMessage('Creating beautiful illustrations... (this takes 2-4 minutes)')

      const imagesResponse = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePrompts: storyData.imagePrompts }),
      })

      if (!imagesResponse.ok) {
        // If images fail, continue with story but no images
        setStory({
          ...storyData.story,
          author: authorName
        })
        setStep('book')
        return
      }

      const imagesData = await imagesResponse.json()

      // Step 3: Combine story with images
      const storyWithImages = {
        ...storyData.story,
        author: authorName,
        pages: storyData.story.pages.map((page: any, index: number) => ({
          ...page,
          imageUrl: imagesData.imageUrls[index] || undefined
        }))
      }

      setStory(storyWithImages)
      setStep('book')
    } catch (error: any) {
      console.error('Error generating story:', error)
      const errorMessage = error.message || 'Failed to generate story. Please try again.'
      alert(errorMessage)
      setStep('record')
    }
  }

  const handleReset = () => {
    setStep('record')
    setStory(null)
    setTranscription('')
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-sky-50 via-cyan-50 to-teal-50">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white/80 backdrop-blur-sm border-2 border-sky-200 rounded-2xl shadow-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🦫</span>
            <span className="text-xl font-bold text-sky-700">Benny's Story Time</span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/about"
              className="px-4 py-2 text-sky-600 hover:text-sky-800 font-semibold"
            >
              About Us
            </Link>
            <Link
              href="/pricing"
              className="px-4 py-2 text-sky-600 hover:text-sky-800 font-semibold"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-2"
            >
              <BookOpen className="w-5 h-5" />
              My Library
            </Link>
            {session ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 font-semibold flex items-center gap-2"
              >
                <User className="w-5 h-5" />
                {session.user?.name || 'Account'}
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 font-semibold flex items-center gap-2"
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
            <Sparkles className="w-10 h-10 text-sky-500" />
            <h1 className="text-4xl md:text-5xl font-bold text-sky-700 font-kids">
              Create Magical Stories
            </h1>
            <Sparkles className="w-10 h-10 text-sky-500" />
          </div>
          <p className="text-lg text-sky-600">
            Tell Benny your story ideas and watch them come to life!
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white/90 backdrop-blur-sm border-2 border-sky-100 rounded-3xl shadow-2xl p-6 md:p-10">
          {step === 'record' && (
            <SpeechRecorder onComplete={handleTranscriptionComplete} />
          )}

          {(step === 'generating' || step === 'generating-images') && (
            <LoadingSpinner
              message={loadingMessage}
              stage={step === 'generating' ? 'story' : 'images'}
            />
          )}

          {step === 'book' && story && (
            <StoryBook story={story} onReset={handleReset} />
          )}
        </div>
      </div>
    </main>
  )
}
