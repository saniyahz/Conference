'use client'

console.log('🚀🚀🚀 StoryBook.tsx LOADED - Version 3.0 - ' + new Date().toISOString())

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
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<string>('v2/en_speaker_6')

  // Bark TTS speaker presets - using actual Bark history_prompt values
  const aiVoices = [
    { id: 'v2/en_speaker_6', name: 'Warm Mother', description: 'Gentle female voice' },
    { id: 'v2/en_speaker_9', name: 'Friendly Narrator', description: 'Clear storytelling voice' },
    { id: 'v2/en_speaker_3', name: 'Calm Father', description: 'Deep male voice' },
    { id: 'v2/en_speaker_1', name: 'Cheerful Reader', description: 'Energetic voice' },
    { id: 'v2/en_speaker_5', name: 'Sweet Grandma', description: 'Elderly female voice' },
    { id: 'v2/en_speaker_0', name: 'Classic Storyteller', description: 'Traditional narrator' },
  ]

  useEffect(() => {
    console.log('✅ StoryBook v3.0 - High-Quality AI Voices - ' + new Date().toISOString())
    console.log('📚 Story pages:', story.pages.length)
    console.log('🖼️ Page image URLs (with types):', story.pages.map((p, i) => ({
      page: i+1,
      imageUrl: p.imageUrl,
      type: typeof p.imageUrl,
      isArray: Array.isArray(p.imageUrl)
    })))
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

  const speakText = async (text: string) => {
    setIsLoadingAudio(true)
    setIsSpeaking(false)

    try {
      // Use browser's Web Speech API (works offline, no external API needed)
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text)

        // Wait for voices to load
        let voices = window.speechSynthesis.getVoices()
        if (voices.length === 0) {
          await new Promise<void>((resolve) => {
            window.speechSynthesis.onvoiceschanged = () => {
              voices = window.speechSynthesis.getVoices()
              resolve()
            }
          })
        }

        // Try to find a good English voice
        const femaleVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
        const maleVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
        const anyEnglishVoice = voices.find(v => v.lang.startsWith('en'))

        // Map speaker presets to voice preferences
        if (selectedVoice === 'v2/en_speaker_3') {
          // Male voice
          utterance.voice = maleVoice || anyEnglishVoice || voices[0]
        } else {
          // Female voices (default)
          utterance.voice = femaleVoice || anyEnglishVoice || voices[0]
        }

        utterance.rate = 0.85  // Slightly slower for kids
        utterance.pitch = 1.1  // Slightly higher pitch for warmth

        utterance.onend = () => {
          setIsSpeaking(false)
          setIsLoadingAudio(false)
        }

        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event)
          setIsSpeaking(false)
          setIsLoadingAudio(false)
          alert('Failed to generate voice. Please try again.')
        }

        window.speechSynthesis.cancel() // Cancel any ongoing speech
        window.speechSynthesis.speak(utterance)
        setIsSpeaking(true)
        setIsLoadingAudio(false)
        return
      }

      throw new Error('Speech synthesis not supported')
    } catch (error) {
      console.error('Error generating speech:', error)
      setIsLoadingAudio(false)
      alert('Failed to generate voice. Your browser may not support text-to-speech.')
    }
  }

  const stopSpeaking = () => {
    // Stop browser speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    // Stop HTML audio if it was being used
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setIsSpeaking(false)
    setIsLoadingAudio(false)
  }

  const toggleSpeak = () => {
    if (isSpeaking || isLoadingAudio) {
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
        <div className="mt-3 space-y-1">
          <p className="text-lg text-purple-600 font-semibold">
            Written by: {story.author || 'Young Author'}
          </p>
          <p className="text-sm text-gray-500 italic">
            ✨ Enhanced by AI ✨
          </p>
        </div>
      </div>

      {/* AI Voice Selector */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-purple-200">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <label htmlFor="voice-select" className="font-bold text-gray-800 text-lg">
            🎭 Choose AI Narrator Voice:
          </label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="px-6 py-3 border-2 border-purple-300 rounded-lg bg-white focus:border-purple-500 focus:outline-none font-semibold text-gray-700 cursor-pointer hover:border-purple-400 transition-all"
          >
            {aiVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-center text-sm text-gray-600 mt-2 italic">
          High-quality AI voices powered by Replicate
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
        {/* AI Text-to-Speech */}
        <button
          onClick={toggleSpeak}
          disabled={isLoadingAudio}
          className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
            isSpeaking
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : isLoadingAudio
              ? 'bg-gray-400 text-white cursor-wait'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isLoadingAudio ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Voice...
            </>
          ) : isSpeaking ? (
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
