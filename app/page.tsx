'use client'

import { useState } from 'react'
import SpeechRecorder from '@/components/SpeechRecorder'
import StoryBook from '@/components/StoryBook'
import LoadingSpinner from '@/components/LoadingSpinner'
import { BookOpen, Sparkles } from 'lucide-react'

export type StoryPage = {
  text: string
  imageUrl?: string
}

export type Story = {
  title: string
  author: string
  pages: StoryPage[]
}

export default function Home() {
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
      setLoadingMessage('Creating beautiful illustrations... (this may take 1-2 minutes)')

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
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white rounded-2xl shadow-lg p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-purple-600" />
            <span className="text-xl font-bold text-purple-800">Kids Story Creator</span>
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

          {(step === 'generating' || step === 'generating-images') && (
            <LoadingSpinner message={loadingMessage} />
          )}

          {step === 'book' && story && (
            <StoryBook story={story} onReset={handleReset} />
          )}
        </div>
      </div>
    </main>
  )
}
