'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Save, Loader2, Volume2, VolumeX, PlayCircle, PauseCircle, Lock, LogIn } from 'lucide-react'
import { Story } from '@/app/page'
import Image from 'next/image'
import { PLANS, PlanType, canDownload, canPlayAudio, canSaveToLibrary } from '@/lib/subscription'

interface StoryBookProps {
  story: Story
  onReset: () => void
}

// Real AI Voice options using OpenAI TTS
const VOICE_OPTIONS = [
  { id: 'mama_beaver', name: '🦫 Mama Beaver', description: 'Warm & nurturing' },
  { id: 'papa_beaver', name: '🦫 Papa Beaver', description: 'Deep & comforting' },
  { id: 'storyteller', name: '📖 Storyteller', description: 'British & expressive' },
  { id: 'friendly', name: '✨ Friendly Guide', description: 'Soft & gentle' },
]

type UsageData = {
  storiesCreatedThisMonth: number
  downloadsThisMonth: number
  audioPlaysThisMonth: number
}

export default function StoryBook({ story, onReset }: StoryBookProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0])
  const [autoPlayMode, setAutoPlayMode] = useState(false)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [loginPromptAction, setLoginPromptAction] = useState<'download' | 'audio' | 'save' | null>(null)
  const [preloadStatus, setPreloadStatus] = useState<string>('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayRef = useRef(false)
  const currentPageRef = useRef(0)
  const audioCacheRef = useRef<Map<string, string>>(new Map()) // Cache: "pageIndex-voiceId" -> audioUrl
  const preloadingRef = useRef<Set<string>>(new Set()) // Track which pages are being preloaded

  // Fetch usage data when logged in
  useEffect(() => {
    if (session) {
      fetchUsage()
    }
  }, [session])

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/usage')
      const data = await response.json()
      setUsage(data.usage)
    } catch (error) {
      console.error('Error fetching usage:', error)
    }
  }

  // Keep refs in sync with state
  useEffect(() => {
    autoPlayRef.current = autoPlayMode
  }, [autoPlayMode])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // Stop reading when page changes manually (but not during auto-play)
  useEffect(() => {
    if (!autoPlayRef.current) {
      stopReading()
    }
  }, [currentPage])

  // Auto-start reading when auto-play mode starts a new page
  useEffect(() => {
    if (autoPlayMode && !isReading && !isGeneratingVoice && currentPage < story.pages.length) {
      const timer = setTimeout(() => {
        if (autoPlayRef.current) {
          readAloud()
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentPage, autoPlayMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReading()
      setAutoPlayMode(false)
    }
  }, [])

  // Pre-load ALL audio pages when story loads (if user is logged in)
  useEffect(() => {
    if (session && story.pages.length > 0) {
      // Start pre-loading all pages in sequence with slight delays to not overwhelm the server
      const preloadAllPages = async () => {
        for (let i = 0; i < story.pages.length; i++) {
          // Don't await - let them load in parallel but staggered
          setTimeout(() => {
            preloadAudio(i, selectedVoice.id)
          }, i * 500) // Stagger by 500ms each
        }
      }
      preloadAllPages()
    }
  }, [session, story.pages.length, selectedVoice.id])

  const getPlanType = (): PlanType => {
    return (session?.user?.subscription?.plan as PlanType) || 'free'
  }

  const checkCanDownload = (): boolean => {
    if (!session) return false
    const plan = getPlanType()
    return canDownload(plan, usage?.downloadsThisMonth || 0)
  }

  const checkCanPlayAudio = (): boolean => {
    if (!session) return false
    const plan = getPlanType()
    return canPlayAudio(plan, usage?.audioPlaysThisMonth || 0)
  }

  const promptLogin = (action: 'download' | 'audio' | 'save') => {
    setLoginPromptAction(action)
    setShowLoginPrompt(true)
  }

  const handleLoginRedirect = () => {
    setShowLoginPrompt(false)
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent(window.location.pathname))
  }

  const handleUpgradeRedirect = () => {
    setShowLoginPrompt(false)
    router.push('/pricing')
  }

  // Pre-load audio for a specific page
  const preloadAudio = async (pageIndex: number, voiceId: string) => {
    const cacheKey = `${pageIndex}-${voiceId}`

    // Skip if already cached or currently preloading
    if (audioCacheRef.current.has(cacheKey) || preloadingRef.current.has(cacheKey)) {
      return
    }

    const text = story.pages[pageIndex]?.text
    if (!text || text.trim().length === 0) return

    preloadingRef.current.add(cacheKey)
    setPreloadStatus(`Pre-loading page ${pageIndex + 1}...`)

    try {
      const response = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceId }),
      })

      if (response.ok) {
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        audioCacheRef.current.set(cacheKey, audioUrl)
        setPreloadStatus('')
      }
    } catch (error) {
      console.error('Preload error:', error)
    } finally {
      preloadingRef.current.delete(cacheKey)
    }
  }

  // Pre-load next few pages when auto-play starts
  const preloadUpcomingPages = (startPage: number, voiceId: string) => {
    // Preload next 2 pages
    for (let i = 1; i <= 2; i++) {
      const nextPage = startPage + i
      if (nextPage < story.pages.length) {
        preloadAudio(nextPage, voiceId)
      }
    }
  }

  // Cleanup audio cache on unmount or voice change
  useEffect(() => {
    return () => {
      // Revoke all cached audio URLs
      audioCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      audioCacheRef.current.clear()
    }
  }, [])

  // Clear cache when voice changes
  useEffect(() => {
    audioCacheRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    audioCacheRef.current.clear()
  }, [selectedVoice])

  const readAloud = async () => {
    // Check if user is logged in
    if (!session) {
      promptLogin('audio')
      return
    }

    // Check usage limits
    if (!checkCanPlayAudio()) {
      alert('You have reached your audio play limit for this month. Please upgrade your plan for unlimited audio.')
      router.push('/pricing')
      return
    }

    // If already reading, stop (and disable auto-play if it was on)
    if (isReading) {
      stopReading()
      setAutoPlayMode(false)
      return
    }

    const text = story.pages[currentPage].text
    if (!text || text.trim().length === 0) {
      if (autoPlayRef.current && currentPage < story.pages.length - 1) {
        setCurrentPage(prev => prev + 1)
      }
      return
    }

    const cacheKey = `${currentPage}-${selectedVoice.id}`
    let audioUrl = audioCacheRef.current.get(cacheKey)

    // If not cached, generate it
    if (!audioUrl) {
      setIsGeneratingVoice(true)

      try {
        // Track audio play usage
        await fetch('/api/usage/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: null }),
        })

        // Call OpenAI TTS API
        const response = await fetch('/api/generate-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            voice: selectedVoice.id,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to generate voice')
        }

        const audioBlob = await response.blob()
        audioUrl = URL.createObjectURL(audioBlob)

        // Cache it for future use
        audioCacheRef.current.set(cacheKey, audioUrl)
      } catch (error) {
        console.error('TTS error:', error)
        setIsGeneratingVoice(false)
        setIsReading(false)
        setAutoPlayMode(false)
        alert('Failed to generate voice. Please try again.')
        return
      }
    }

    // Start preloading next pages
    preloadUpcomingPages(currentPage, selectedVoice.id)

    // Play the audio
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onplay = () => {
      setIsReading(true)
      setIsGeneratingVoice(false)
      fetchUsage() // Refresh usage data
    }

    audio.onended = () => {
      setIsReading(false)
      // Don't revoke URL - keep it cached for replay

      const pageNow = currentPageRef.current
      if (autoPlayRef.current && pageNow < story.pages.length - 1) {
        // Shorter delay since next audio is pre-loaded
        setTimeout(() => {
          if (autoPlayRef.current) {
            setCurrentPage(pageNow + 1)
          }
        }, 500)
      } else if (autoPlayRef.current && pageNow === story.pages.length - 1) {
        setAutoPlayMode(false)
      }
    }

    audio.onerror = () => {
      setIsReading(false)
      setIsGeneratingVoice(false)
      setAutoPlayMode(false)
    }

    try {
      await audio.play()
    } catch (error) {
      console.error('Audio play error:', error)
      setIsGeneratingVoice(false)
      setIsReading(false)
      setAutoPlayMode(false)
    }
  }

  const startAutoPlay = () => {
    if (!session) {
      promptLogin('audio')
      return
    }

    if (!checkCanPlayAudio()) {
      alert('You have reached your audio play limit for this month. Please upgrade your plan for unlimited audio.')
      router.push('/pricing')
      return
    }

    // Pre-load first few pages immediately
    const startPage = currentPage === story.pages.length - 1 ? 0 : currentPage
    preloadAudio(startPage, selectedVoice.id)
    preloadUpcomingPages(startPage, selectedVoice.id)

    setAutoPlayMode(true)
    if (currentPage === story.pages.length - 1) {
      setCurrentPage(0)
    }
  }

  const stopAutoPlay = () => {
    setAutoPlayMode(false)
    stopReading()
  }

  const stopReading = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsReading(false)
    setIsGeneratingVoice(false)
  }

  const nextPage = () => {
    if (currentPage < story.pages.length - 1) {
      setCurrentPage(currentPage + 1)
    }
  }

  const previousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  const downloadPDF = async () => {
    // Check if user is logged in
    if (!session) {
      promptLogin('download')
      return
    }

    // Check usage limits
    if (!checkCanDownload()) {
      alert('You have reached your download limit for this month. Please upgrade your plan for unlimited downloads.')
      router.push('/pricing')
      return
    }

    try {
      // Track download usage first
      await fetch('/api/usage/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: null }),
      })

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      // Refresh usage data
      fetchUsage()
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }
  }

  const handleSave = async () => {
    if (!session) {
      promptLogin('save')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: story.title,
          author: story.author,
          originalPrompt: story.originalPrompt,
          pages: story.pages,
          coverImage: story.pages[0]?.imageUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error?.includes('library limit')) {
          alert('You have reached your library limit. Please upgrade your plan to save more stories.')
          router.push('/pricing')
        } else {
          throw new Error(data.error || 'Failed to save story')
        }
        return
      }

      alert('Story saved successfully! View it in your library.')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error saving story:', error)
      alert(error.message || 'Failed to save story. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const getActionText = () => {
    switch (loginPromptAction) {
      case 'download':
        return 'download stories as PDF'
      case 'audio':
        return 'listen to stories read aloud'
      case 'save':
        return 'save stories to your library'
      default:
        return 'use this feature'
    }
  }

  return (
    <div className="space-y-6">
      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-purple-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Sign In Required
            </h3>
            <p className="text-gray-600 mb-6">
              Create a free account to {getActionText()}. It only takes a moment!
            </p>
            <div className="space-y-3">
              <button
                onClick={handleLoginRedirect}
                className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold flex items-center justify-center gap-2"
              >
                <LogIn className="w-5 h-5" />
                Sign In / Sign Up
              </button>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="w-full py-3 border-2 border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-semibold"
              >
                Maybe Later
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Free accounts include 1 story, 1 download, and 3 audio plays per month.
            </p>
          </div>
        </div>
      )}

      {/* Voice Selector & Auto-Play */}
      <div className="flex flex-wrap items-center justify-center gap-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border-2 border-amber-200">
        <span className="text-2xl">🎙️</span>
        <label className="font-semibold text-amber-800">Choose Narrator:</label>
        <select
          value={selectedVoice.id}
          onChange={(e) => {
            const voice = VOICE_OPTIONS.find(v => v.id === e.target.value)
            if (voice) setSelectedVoice(voice)
          }}
          disabled={autoPlayMode}
          className="px-4 py-2 rounded-lg border-2 border-amber-300 bg-white text-amber-800 font-medium focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
          {VOICE_OPTIONS.map(voice => (
            <option key={voice.id} value={voice.id}>{voice.name}</option>
          ))}
        </select>
        <span className="text-xs text-amber-600 italic">{selectedVoice.description}</span>

        {/* Auto-Play Button */}
        <button
          onClick={autoPlayMode ? stopAutoPlay : startAutoPlay}
          disabled={isGeneratingVoice}
          className={`px-4 py-2 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
            autoPlayMode
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {autoPlayMode ? (
            <>
              <PauseCircle className="w-5 h-5" />
              Stop Auto-Play
            </>
          ) : (
            <>
              <PlayCircle className="w-5 h-5" />
              Auto-Play Story
              {!session && <Lock className="w-4 h-4" />}
            </>
          )}
        </button>
      </div>

      {/* Auto-Play indicator */}
      {autoPlayMode && (
        <div className="bg-green-100 border-2 border-green-300 rounded-xl p-3 text-center animate-pulse">
          <p className="text-green-700 font-semibold">
            🎵 Auto-playing story... Pages will turn automatically! 📖
          </p>
        </div>
      )}

      {/* Title */}
      <div className="text-center border-b-2 border-purple-200 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-purple-800 font-kids">
          {story.title}
        </h1>
        <div className="mt-3 space-y-1">
          <p className="text-lg text-purple-600 font-semibold">
            Written by: {story.author || 'Young Author'}
          </p>
          <p className="text-sm text-gray-500 italic">
            ✨ Enhanced by AI ✨
          </p>
        </div>
      </div>


      {/* Book Pages - Side by side layout */}
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-gray-200" style={{ minHeight: '600px' }}>
        {/* Page Number */}
        <div className="absolute top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-full font-semibold z-10">
          {currentPage + 1}/{story.pages.length}
        </div>

        {/* Side-by-side Page Content - Image Left, Text Right */}
        <div className="grid md:grid-cols-2 h-full">
          {/* Left Side - Image */}
          <div className="relative min-h-[400px] md:min-h-[600px] bg-gradient-to-br from-purple-50 to-pink-50">
            {story.pages[currentPage].imageUrl ? (
              <Image
                src={story.pages[currentPage].imageUrl}
                alt={`Page ${currentPage + 1} illustration`}
                fill
                className="object-cover"
                unoptimized
                priority
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 italic">Loading illustration...</p>
              </div>
            )}
          </div>

          {/* Right Side - Text */}
          <div className="flex flex-col justify-center p-8 md:p-12 bg-gradient-to-br from-yellow-50/30 to-orange-50/30">
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {story.author || 'Young Author'}
              </h2>
              <div className="h-px bg-purple-200 w-16"></div>
            </div>

            <div className="flex-1 flex items-center">
              <p className="text-base md:text-lg lg:text-xl text-gray-800 leading-relaxed font-serif">
                {story.pages[currentPage].text}
              </p>
            </div>

            <div className="mt-6 text-center">
              <div className="inline-block h-px bg-purple-200 w-24"></div>
              <div className="text-sm text-gray-400 mt-2">{currentPage + 1}</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={previousPage}
            disabled={currentPage === 0}
            className="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-110"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Read Aloud Button */}
          <button
            onClick={readAloud}
            disabled={isGeneratingVoice}
            className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 disabled:opacity-70 disabled:cursor-wait ${
              isReading
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : isGeneratingVoice
                ? 'bg-amber-500 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {isGeneratingVoice ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Voice...
              </>
            ) : isReading ? (
              <>
                <VolumeX className="w-5 h-5" />
                Stop Reading
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                🦫 Read Aloud
                {!session && <Lock className="w-4 h-4 ml-1" />}
              </>
            )}
          </button>

          <button
            onClick={nextPage}
            disabled={currentPage === story.pages.length - 1}
            className="p-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-110"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap justify-center gap-4">
        {/* Save Story */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 disabled:bg-gray-400"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Story
              {!session && <Lock className="w-4 h-4 ml-1" />}
            </>
          )}
        </button>

        {/* Download PDF */}
        <button
          onClick={downloadPDF}
          className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Download className="w-5 h-5" />
          Download Book
          {!session && <Lock className="w-4 h-4 ml-1" />}
        </button>

        {/* Create New Story */}
        <button
          onClick={onReset}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <RotateCcw className="w-5 h-5" />
          New Story
        </button>
      </div>

      {/* Usage Info for logged-in users */}
      {session && usage && (
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-600">
            This month: {usage.downloadsThisMonth} downloads • {usage.audioPlaysThisMonth} audio plays
            {' '}
            <button
              onClick={() => router.push('/pricing')}
              className="text-purple-600 hover:underline font-medium"
            >
              Upgrade for unlimited
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
