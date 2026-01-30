'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Save, Loader2, Volume2, VolumeX, PlayCircle, PauseCircle } from 'lucide-react'
import { Story } from '@/app/page'
import Image from 'next/image'

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

export default function StoryBook({ story, onReset }: StoryBookProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0])
  const [autoPlayMode, setAutoPlayMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayRef = useRef(false)
  const currentPageRef = useRef(0)

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
      // Small delay before starting to read the new page
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

  const readAloud = async () => {
    // If already reading, stop (and disable auto-play if it was on)
    if (isReading) {
      stopReading()
      setAutoPlayMode(false)
      return
    }

    const text = story.pages[currentPage].text
    if (!text || text.trim().length === 0) {
      // If in auto-play mode and no text, try next page
      if (autoPlayRef.current && currentPage < story.pages.length - 1) {
        setCurrentPage(prev => prev + 1)
      }
      return
    }

    setIsGeneratingVoice(true)

    try {
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

      // Get audio blob and create URL
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      // Create and play audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onplay = () => {
        setIsReading(true)
        setIsGeneratingVoice(false)
      }

      audio.onended = () => {
        setIsReading(false)
        URL.revokeObjectURL(audioUrl)

        // Auto-advance to next page if auto-play mode is on
        // Use currentPageRef.current to get the actual current page (not stale closure value)
        const pageNow = currentPageRef.current
        if (autoPlayRef.current && pageNow < story.pages.length - 1) {
          // Small delay before flipping page
          setTimeout(() => {
            if (autoPlayRef.current) {
              setCurrentPage(pageNow + 1)
            }
          }, 1000)
        } else if (autoPlayRef.current && pageNow === story.pages.length - 1) {
          // End of story - turn off auto-play
          setAutoPlayMode(false)
        }
      }

      audio.onerror = () => {
        setIsReading(false)
        setIsGeneratingVoice(false)
        URL.revokeObjectURL(audioUrl)
        // Stop auto-play on error
        setAutoPlayMode(false)
      }

      await audio.play()

    } catch (error) {
      console.error('TTS error:', error)
      setIsGeneratingVoice(false)
      setIsReading(false)
      setAutoPlayMode(false)
      alert('Failed to generate voice. Please try again.')
    }
  }

  // Start auto-play mode (reads entire story automatically)
  const startAutoPlay = () => {
    setAutoPlayMode(true)
    // Start from current page or beginning
    if (currentPage === story.pages.length - 1) {
      setCurrentPage(0)
    }
    // The useEffect will trigger reading when autoPlayMode changes
  }

  // Stop auto-play mode
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
    try {
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
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }
  }

  const handleSave = async () => {
    if (!session) {
      if (confirm('You need to sign in to save stories. Would you like to sign in now?')) {
        router.push('/auth/signin')
      }
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: story.title,
          pages: story.pages,
          coverImage: story.pages[0]?.imageUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save story')
      }

      alert('Story saved successfully! View it in your dashboard.')
    } catch (error: any) {
      console.error('Error saving story:', error)
      alert(error.message || 'Failed to save story. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
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


      {/* Book Pages - Side by side layout like Gemini */}
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
            {/* Story Title at top of text page */}
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {story.author || 'Young Author'}
              </h2>
              <div className="h-px bg-purple-200 w-16"></div>
            </div>

            {/* Story Text */}
            <div className="flex-1 flex items-center">
              <p className="text-base md:text-lg lg:text-xl text-gray-800 leading-relaxed font-serif">
                {story.pages[currentPage].text}
              </p>
            </div>

            {/* Page indicator at bottom */}
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

    </div>
  )
}
