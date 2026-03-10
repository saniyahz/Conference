'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import SpeechRecorder, { AgeGroup, GenerationMode, StoryMode } from '@/components/SpeechRecorder'
import StoryBook from '@/components/StoryBook'
import LoadingSpinner from '@/components/LoadingSpinner'
import BeaverMascot from '@/components/BeaverMascot'
import { BookOpen } from 'lucide-react'
import { clientValidateContent } from '@/lib/blockedTerms'

export type StoryPage = {
  text: string
  imageUrl?: string
  videoUrl?: string   // Looping animation URL (mp4) for "Living Pictures" mode
}

export type Story = {
  title: string
  author: string
  pages: StoryPage[]
  originalPrompt?: string
  language?: string  // ISO 639-1 code from Whisper auto-detection (default: 'en')
}

export default function Home() {
  const [step, setStep] = useState<'record' | 'generating' | 'generating-images' | 'book'>('record')
  const [story, setStory] = useState<Story | null>(null)
  const [characterBible, setCharacterBible] = useState<any>(null)
  const [sceneCards, setSceneCards] = useState<any[]>([])
  const [transcription, setTranscription] = useState<string>('')
  const [loadingMessage, setLoadingMessage] = useState('Creating your magical story...')
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('3-5')
  const [selectedMode, setSelectedMode] = useState<GenerationMode>('storybook')
  const [selectedStoryMode, setSelectedStoryMode] = useState<StoryMode>('imagination')
  const [detectedLanguage, setDetectedLanguage] = useState<string>('en')
  const router = useRouter()

  const isGenerating = step === 'generating' || step === 'generating-images'

  // Warn on browser tab close / refresh while generating
  useEffect(() => {
    if (!isGenerating) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isGenerating])

  // Guarded navigation for in-app links
  const guardedNavigate = useCallback((href: string) => {
    if (isGenerating) {
      const confirmed = window.confirm(
        'Your story is still being created! If you leave now, you\'ll lose your progress. Are you sure?'
      )
      if (!confirmed) return
    }
    router.push(href)
  }, [isGenerating, router])

  const handleTranscriptionComplete = async (text: string, authorName: string, ageGroup: AgeGroup, mode: GenerationMode, storyMode: StoryMode = 'imagination', language: string = 'en') => {
    setTranscription(text)
    setSelectedAgeGroup(ageGroup)
    setSelectedMode(mode)
    setSelectedStoryMode(storyMode)
    setDetectedLanguage(language)

    // ─── CLIENT-SIDE CONTENT SAFETY ─────────────────────────────────
    // Advisory check — gives immediate feedback. Server enforces the real rules.
    // Uses comprehensive blocklist from lib/blockedTerms.ts (250+ terms across
    // sexual, violence, profanity, slurs, substance, religious categories).
    const blockedTerm = clientValidateContent(text, storyMode)
    if (blockedTerm) {
      console.warn(`[CLIENT SAFETY] Blocked term detected: "${blockedTerm}"`)
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
        body: JSON.stringify({ prompt: text, ageGroup, storyMode, language }),
      })

      if (!storyResponse.ok) {
        const errorData = await storyResponse.json()
        throw new Error(errorData.error || 'Failed to generate story')
      }

      const storyData = await storyResponse.json()

      // Step 2: Generate images + videos in ONE overlapping pipeline
      // Videos start generating as soon as each key-page image finishes,
      // so image and video generation run in parallel — much faster than sequential.
      setStep('generating-images')
      setLoadingMessage('Creating beautiful illustrations...')

      const imagesResponse = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // GPT now writes complete image prompts directly — no more scene cards or visual scenes
          imagePrompts: storyData.story?.pages?.map((p: any) => p.imagePrompt || '') || [],
          characterBible: storyData.characterBible,
          additionalCharacterBibles: storyData.additionalCharacterBibles,
          seed: storyData.seed,
          seeds: storyData.seeds,
          storyMode,
        }),
      })

      if (!imagesResponse.ok) {
        // If pipeline fails, continue with story but no images
        setStory({
          ...storyData.story,
          author: authorName,
          language,
        })
        setStep('book')
        return
      }

      const mediaData = await imagesResponse.json()

      // Debug: log received media URLs
      console.log(`[Frontend] Received ${mediaData.imageUrls?.length ?? 0} image URLs`)
      console.log(`[Frontend] Received ${mediaData.videoUrls?.filter(Boolean).length ?? 0} video URLs`)
      mediaData.imageUrls?.forEach((url: string, i: number) => {
        const hasVideo = mediaData.videoUrls?.[i] ? ' + VIDEO' : ''
        console.log(`[Frontend] Page ${i + 1}: ${url ? 'IMAGE' : 'EMPTY'}${hasVideo}`)
      })

      // Combine story with images and videos
      const storyWithImages = {
        ...storyData.story,
        author: authorName,
        language,
        pages: storyData.story.pages.map((page: any, index: number) => ({
          ...page,
          imageUrl: mediaData.imageUrls[index] || undefined,
          videoUrl: mediaData.videoUrls?.[index] || undefined,
        }))
      }

      // Debug: verify all pages have media set
      console.log(`[Frontend] Story pages with media:`)
      storyWithImages.pages.forEach((p: any, i: number) => {
        console.log(`[Frontend] Page ${i + 1} imageUrl: ${p.imageUrl ? 'SET' : 'MISSING'}, videoUrl: ${p.videoUrl ? 'SET' : 'MISSING'}`)
      })

      setStory(storyWithImages)
      setCharacterBible(storyData.characterBible || null)
      setSceneCards(storyData.sceneCards || [])

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
    <main className="min-h-[100dvh] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <nav className="flex justify-between items-center mb-8 bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-4">
          <div className="flex items-center gap-3">
            <BeaverMascot greeting="" isRecording={false} isProcessing={false} size="tiny" />
            <span className="text-xl font-semibold text-zinc-800 tracking-tight">My Story Bear</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => guardedNavigate('/about')}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 active:scale-[0.98]"
            >
              About
            </button>
            <button
              onClick={() => guardedNavigate('/pricing')}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 active:scale-[0.98]"
            >
              Pricing
            </button>
            <button
              onClick={() => guardedNavigate('/terms')}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 active:scale-[0.98]"
            >
              Terms
            </button>
            <button
              onClick={() => guardedNavigate('/dashboard')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium flex items-center gap-2 active:scale-[0.98]"
            >
              <BookOpen className="w-5 h-5" />
              My Library
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter leading-none text-zinc-900 mb-4">
            Create{' '}
            <span className="text-emerald-600">Magical</span>{' '}
            Stories
          </h1>
          <p className="text-lg text-zinc-500 max-w-md">
            Tell us your story ideas and watch them come to life as beautifully illustrated books.
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 md:p-10">
          {step === 'record' && (
            <SpeechRecorder onComplete={handleTranscriptionComplete} />
          )}

          {(step === 'generating' || step === 'generating-images') && (
            <LoadingSpinner
              message={loadingMessage}
              stage={step === 'generating' ? 'story' : 'images'}
              prompt={transcription}
            />
          )}

          {step === 'book' && story && (
            <StoryBook story={story} onReset={handleReset} characterBible={characterBible} sceneCards={sceneCards} storyMode={selectedStoryMode} />
          )}
        </div>
      </div>
    </main>
  )
}
