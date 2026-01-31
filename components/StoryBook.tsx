'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Volume2, VolumeX, Printer, Play, Pause, Loader2 } from 'lucide-react'
import { Story } from '@/app/page'
import Image from 'next/image'
import PrintingModal from './PrintingModal'

interface StoryBookProps {
  story: Story
  onReset: () => void
}

export default function StoryBook({ story, onReset }: StoryBookProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [isReading, setIsReading] = useState(false)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<string>('mama-beaver')
  const [isPrintingModalOpen, setIsPrintingModalOpen] = useState(false)

  // AI voices from Replicate
  const aiVoices = [
    { id: 'mama-beaver', name: 'Mama Beaver', description: "A warm, friendly, gentle female voice perfect for children's stories, speaking slowly and clearly with expression and enthusiasm" },
    { id: 'papa-bear', name: 'Papa Bear', description: "A deep, calm, reassuring male voice ideal for bedtime stories, speaking with gentle warmth and steady pacing" },
    { id: 'grandma-owl', name: 'Grandma Owl', description: "A sweet, elderly female voice with a tender, loving quality, ideal for soothing bedtime reading" },
    { id: 'storyteller-fox', name: 'Storyteller Fox', description: "An energetic, expressive voice with dramatic flair, perfect for exciting adventures and bringing characters to life" },
  ]

  // Stop reading when page changes (unless auto-playing)
  useEffect(() => {
    if (!isAutoPlaying) {
      stopReading()
    }
  }, [currentPage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReading()
    }
  }, [])

  const speakText = async (text: string) => {
    setIsLoadingAudio(true)
    setIsReading(false)

    try {
      // Get voice description
      const voice = aiVoices.find(v => v.id === selectedVoice)

      // Call API to generate speech
      const response = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voice?.description
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate speech')
      }

      const { audioUrl } = await response.json()

      // Create and play audio
      const audio = new Audio(audioUrl)

      audio.onended = () => {
        setIsReading(false)
        setCurrentAudio(null)

        // Auto-advance to next page if auto-playing
        if (isAutoPlaying && currentPage < story.pages.length - 1) {
          setCurrentPage(currentPage + 1)
        } else if (isAutoPlaying) {
          // Finished all pages
          setIsAutoPlaying(false)
        }
      }

      audio.onerror = () => {
        setIsReading(false)
        setCurrentAudio(null)
        setIsAutoPlaying(false)
        alert('Failed to play audio. Please try again.')
      }

      setCurrentAudio(audio)
      await audio.play()
      setIsReading(true)
      setIsLoadingAudio(false)
    } catch (error) {
      console.error('Error generating speech:', error)
      setIsLoadingAudio(false)
      setIsAutoPlaying(false)
      alert('Failed to generate voice. Please try again.')
    }
  }

  const stopReading = () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setIsReading(false)
    setIsLoadingAudio(false)
    setIsAutoPlaying(false)
  }

  const toggleSpeak = () => {
    if (isReading || isLoadingAudio) {
      stopReading()
    } else {
      speakText(story.pages[currentPage].text)
    }
  }

  const toggleAutoPlay = async () => {
    if (isAutoPlaying) {
      stopReading()
      setIsAutoPlaying(false)
    } else {
      setIsAutoPlaying(true)
      // Start reading current page
      await speakText(story.pages[currentPage].text)
    }
  }

  // Auto-play next page when it changes
  useEffect(() => {
    if (isAutoPlaying && !isReading && !isLoadingAudio) {
      speakText(story.pages[currentPage].text)
    }
  }, [currentPage, isAutoPlaying])

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

      {/* AI Voice Narrator Controls */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-purple-200">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          {/* Voice Selector */}
          <div className="flex items-center gap-3">
            <Volume2 className="w-6 h-6 text-purple-600" />
            <label htmlFor="voice-select" className="font-bold text-gray-800">
              Choose Narrator:
            </label>
            <select
              id="voice-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={isReading || isLoadingAudio}
              className="px-4 py-2 border-2 border-purple-300 rounded-lg bg-white focus:border-purple-500 focus:outline-none font-semibold text-gray-700 cursor-pointer hover:border-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          {/* Auto-Play Button */}
          <button
            onClick={toggleAutoPlay}
            disabled={isLoadingAudio}
            className={`px-6 py-2 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
              isAutoPlaying
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isAutoPlaying ? (
              <>
                <Pause className="w-5 h-5" />
                Stop Auto-Play
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Auto-Play Story
              </>
            )}
          </button>
        </div>
        <p className="text-center text-xs text-gray-600 mt-2 italic">
          ✨ High-quality AI narration ✨
        </p>
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
            onClick={toggleSpeak}
            disabled={isLoadingAudio}
            className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
              isReading
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : isLoadingAudio
                ? 'bg-gray-400 text-white cursor-wait'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isLoadingAudio ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Voice...
              </>
            ) : isReading ? (
              <>
                <VolumeX className="w-5 h-5" />
                Stop Reading
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                Read Aloud (AI)
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
        {/* Download PDF */}
        <button
          onClick={downloadPDF}
          className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Download className="w-5 h-5" />
          Download Book
        </button>

        {/* Print Book */}
        <button
          onClick={() => setIsPrintingModalOpen(true)}
          className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Printer className="w-5 h-5" />
          Print Book
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

      {/* Printing Modal */}
      <PrintingModal
        story={story}
        isOpen={isPrintingModalOpen}
        onClose={() => setIsPrintingModalOpen(false)}
      />
    </div>
  )
}
