'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Loader2, Volume2, VolumeX, PlayCircle, PauseCircle } from 'lucide-react'
import { Story } from '@/app/page'
// NOTE: Using plain <img> instead of next/image to avoid fill-mode re-render bugs
// where pages 2-10 images fail to display despite valid URLs

interface StoryBookProps {
  story: Story
  onReset: () => void
}

// Real AI Voice options using OpenAI TTS
const VOICE_OPTIONS = [
  { id: 'mama_beaver', name: 'Mama Beaver', description: 'Warm & nurturing' },
  { id: 'papa_beaver', name: 'Papa Beaver', description: 'Deep & comforting' },
  { id: 'storyteller', name: 'Storyteller', description: 'British & expressive' },
  { id: 'friendly', name: 'Friendly Guide', description: 'Soft & gentle' },
]

export default function StoryBook({ story, onReset }: StoryBookProps) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const [isReading, setIsReading] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0])
  const [autoPlayMode, setAutoPlayMode] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayRef = useRef(false)
  const currentPageRef = useRef(0)
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const preloadingRef = useRef<Set<string>>(new Set())

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

  // Pre-load ALL audio pages when story loads
  useEffect(() => {
    if (story.pages.length > 0) {
      const preloadAllPages = async () => {
        for (let i = 0; i < story.pages.length; i++) {
          setTimeout(() => {
            preloadAudio(i, selectedVoice.id)
          }, i * 500)
        }
      }
      preloadAllPages()
    }
  }, [story.pages.length, selectedVoice.id])

  // Pre-load audio for a specific page
  const preloadAudio = async (pageIndex: number, voiceId: string) => {
    const cacheKey = `${pageIndex}-${voiceId}`

    if (audioCacheRef.current.has(cacheKey) || preloadingRef.current.has(cacheKey)) {
      return
    }

    const text = story.pages[pageIndex]?.text
    if (!text || text.trim().length === 0) return

    preloadingRef.current.add(cacheKey)

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
      }
    } catch (error) {
      console.error('Preload error:', error)
    } finally {
      preloadingRef.current.delete(cacheKey)
    }
  }

  // Pre-load next few pages when auto-play starts
  const preloadUpcomingPages = (startPage: number, voiceId: string) => {
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
    // If already reading, stop
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
    }

    audio.onended = () => {
      setIsReading(false)

      const pageNow = currentPageRef.current
      if (autoPlayRef.current && pageNow < story.pages.length - 1) {
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

  return (
    <div className="space-y-6">
      {/* Voice Selector & Auto-Play */}
      <div className="flex flex-wrap items-center justify-center gap-4 bg-gradient-to-r from-teal-50 to-green-50 rounded-xl p-4 border-2 border-teal-200">
        <label className="font-semibold text-teal-800">Choose Narrator:</label>
        <select
          value={selectedVoice.id}
          onChange={(e) => {
            const voice = VOICE_OPTIONS.find(v => v.id === e.target.value)
            if (voice) setSelectedVoice(voice)
          }}
          disabled={autoPlayMode}
          className="px-4 py-2 rounded-lg border-2 border-teal-300 bg-white text-teal-800 font-medium focus:border-teal-500 focus:outline-none disabled:opacity-50"
        >
          {VOICE_OPTIONS.map(voice => (
            <option key={voice.id} value={voice.id}>{voice.name}</option>
          ))}
        </select>
        <span className="text-xs text-teal-600 italic">{selectedVoice.description}</span>

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
            Auto-playing story... Pages will turn automatically!
          </p>
        </div>
      )}

      {/* Title */}
      <div className="text-center border-b-2 border-teal-200 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-teal-700 font-kids">
          {story.title}
        </h1>
        <div className="mt-3 space-y-1">
          <p className="text-lg text-teal-600 font-semibold">
            Written by: {story.author || 'Young Author'}
          </p>
        </div>
      </div>

      {/* Book Pages */}
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-gray-200" style={{ minHeight: '600px' }}>
        {/* Page Number */}
        <div className="absolute top-4 right-4 bg-teal-600 text-white px-4 py-2 rounded-full font-semibold z-10">
          {currentPage + 1}/{story.pages.length}
        </div>

        {/* Side-by-side Page Content */}
        <div className="grid md:grid-cols-2 h-full">
          {/* Left Side - Image */}
          <div className="relative min-h-[400px] md:min-h-[600px] bg-gradient-to-br from-teal-50 to-green-50">
            {story.pages[currentPage].imageUrl ? (
              <img
                key={currentPage}
                src={story.pages[currentPage].imageUrl}
                alt={`Page ${currentPage + 1} illustration`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  console.error(`[StoryBook] Image failed to load for page ${currentPage + 1}:`, story.pages[currentPage].imageUrl)
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 italic">No illustration available</p>
              </div>
            )}
          </div>

          {/* Right Side - Text */}
          <div className="flex flex-col justify-center p-8 md:p-12 bg-gradient-to-br from-yellow-50/30 to-orange-50/30">
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {story.author || 'Young Author'}
              </h2>
              <div className="h-px bg-teal-200 w-16"></div>
            </div>

            <div className="flex-1 flex items-center">
              <p className="text-base md:text-lg lg:text-xl text-gray-800 leading-relaxed font-serif">
                {story.pages[currentPage].text}
              </p>
            </div>

            <div className="mt-6 text-center">
              <div className="inline-block h-px bg-teal-200 w-24"></div>
              <div className="text-sm text-gray-400 mt-2">{currentPage + 1}</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={previousPage}
            disabled={currentPage === 0}
            className="p-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-110"
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
                ? 'bg-teal-500 text-white'
                : 'bg-teal-500 hover:bg-teal-600 text-white'
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
                Read Aloud
              </>
            )}
          </button>

          <button
            onClick={nextPage}
            disabled={currentPage === story.pages.length - 1}
            className="p-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all transform hover:scale-110"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap justify-center gap-4">
        {/* Download PDF */}
        <button
          onClick={downloadPDF}
          className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Download className="w-5 h-5" />
          Download Book
        </button>

        {/* Create New Story */}
        <button
          onClick={onReset}
          className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <RotateCcw className="w-5 h-5" />
          New Story
        </button>
      </div>
    </div>
  )
}
