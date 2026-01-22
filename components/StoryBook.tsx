'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Volume2, VolumeX, RotateCcw, Save, Loader2 } from 'lucide-react'
import { Story } from '@/app/page'
import Image from 'next/image'

interface StoryBookProps {
  story: Story
  onReset: () => void
}

export default function StoryBook({ story, onReset }: StoryBookProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>('default')

  useEffect(() => {
    console.log('StoryBook v2.0 - Enhanced version with voice selector loaded')
    if (typeof window !== 'undefined') {
      setSpeechSupported('speechSynthesis' in window)

      // Load available voices
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices()
        setAvailableVoices(voices)

        // Auto-select a good default voice (prefer female for mother-like, English)
        const preferredVoice = voices.find(v =>
          v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Karen'))
        ) || voices.find(v => v.lang.startsWith('en'))

        if (preferredVoice) {
          setSelectedVoice(preferredVoice.name)
        }
      }

      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }, [])

  const nextPage = () => {
    if (currentPage < story.pages.length - 1) {
      stopSpeaking()
      setCurrentPage(currentPage + 1)
    }
  }

  const previousPage = () => {
    if (currentPage > 0) {
      stopSpeaking()
      setCurrentPage(currentPage - 1)
    }
  }

  const speakText = (text: string) => {
    if (!speechSupported) return

    const utterance = new SpeechSynthesisUtterance(text)

    // Find selected voice
    const voice = availableVoices.find(v => v.name === selectedVoice)
    if (voice) {
      utterance.voice = voice
    }

    // More natural settings
    utterance.rate = 0.85  // Slower, more story-telling pace
    utterance.pitch = 1.0  // Natural pitch
    utterance.volume = 1

    utterance.onend = () => {
      setIsSpeaking(false)
    }

    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  const stopSpeaking = () => {
    if (speechSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }

  const toggleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking()
    } else {
      speakText(story.pages[currentPage].text)
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
      {/* Title */}
      <div className="text-center border-b-2 border-purple-200 pb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-purple-800 font-kids">
          {story.title}
        </h1>
      </div>

      {/* Voice Selector */}
      {speechSupported && availableVoices.length > 0 && (
        <div className="flex items-center justify-center gap-3 bg-blue-50 p-4 rounded-lg">
          <label htmlFor="voice-select" className="font-semibold text-gray-700">
            📢 Narrator Voice:
          </label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="px-4 py-2 border-2 border-blue-300 rounded-lg bg-white focus:border-blue-500 focus:outline-none"
          >
            {availableVoices
              .filter(voice => voice.lang.startsWith('en'))
              .map((voice, index) => (
                <option key={index} value={voice.name}>
                  {voice.name} {voice.name.toLowerCase().includes('female') ? '(Mother-like)' : voice.name.toLowerCase().includes('male') ? '(Father-like)' : ''}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Book Pages */}
      <div className="relative bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl shadow-xl p-8 md:p-12 min-h-[500px] border-4 border-amber-200">
        {/* Page Number */}
        <div className="absolute top-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-full font-semibold">
          Page {currentPage + 1} of {story.pages.length}
        </div>

        {/* Page Content */}
        <div className="space-y-6">
          {/* Image */}
          {story.pages[currentPage].imageUrl && (
            <div className="flex justify-center">
              <div className="relative w-full max-w-md h-64 md:h-80 rounded-xl overflow-hidden shadow-lg border-4 border-white">
                <Image
                  src={story.pages[currentPage].imageUrl}
                  alt={`Page ${currentPage + 1} illustration`}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
          )}

          {/* Text */}
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl shadow-md">
            <p className="text-lg md:text-xl text-gray-800 leading-relaxed">
              {story.pages[currentPage].text}
            </p>
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
        {/* Text-to-Speech */}
        {speechSupported && (
          <button
            onClick={toggleSpeak}
            className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
              isSpeaking
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isSpeaking ? (
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
        )}

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
