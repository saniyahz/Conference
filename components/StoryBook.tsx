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
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [speechSupported, setSpeechSupported] = useState(true)

  useEffect(() => {
    console.log('✅ StoryBook v5.0 - IMPROVED Text-to-Speech - ' + new Date().toISOString())
    console.log('📚 Story pages:', story.pages.length)
    console.log('🖼️ Page image URLs (with types):', story.pages.map((p, i) => ({
      page: i+1,
      imageUrl: p.imageUrl,
      type: typeof p.imageUrl,
      isArray: Array.isArray(p.imageUrl)
    })))

    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
      console.error('❌ Speech synthesis not supported in this browser')
      setSpeechSupported(false)
      return
    }

    // Load available voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      console.log('🎤 Available voices:', voices.length, voices.map(v => v.name))

      if (voices.length > 0) {
        // Filter for English voices
        const englishVoices = voices.filter(v => v.lang.startsWith('en'))
        const voicesToUse = englishVoices.length > 0 ? englishVoices : voices
        setAvailableVoices(voicesToUse)

        // Set default voice (prefer female English voice)
        const defaultVoice =
          englishVoices.find(v => v.name.toLowerCase().includes('female')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('samantha')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('karen')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('zira')) ||
          englishVoices[0] ||
          voices[0]

        setSelectedVoice(defaultVoice)
        console.log('🎤 Selected default voice:', defaultVoice?.name, 'Lang:', defaultVoice?.lang)
      } else {
        console.warn('⚠️ No voices loaded yet, will retry...')
      }
    }

    // Force initial load - call getVoices to trigger loading
    console.log('🔄 Initial voice load attempt...')
    loadVoices()

    // Some browsers load voices asynchronously - set up listener
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        console.log('🔄 Voices changed event fired!')
        loadVoices()
      }
    }

    // Retry loading voices after a delay (Chrome/Edge sometimes need this)
    const retryTimer = setTimeout(() => {
      console.log('🔄 Retry loading voices after 500ms...')
      loadVoices()
    }, 500)

    return () => {
      clearTimeout(retryTimer)
      // Cleanup
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null
      }
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

  const speakText = async (text: string) => {
    if (!speechSupported) {
      alert('Text-to-speech is not supported in your browser. Please try using Chrome, Safari, or Edge.')
      return
    }

    setIsLoadingAudio(true)
    setIsSpeaking(false)

    try {
      console.log('🔊 Starting text-to-speech v3.0 - SUPER ROBUST...')
      console.log('📝 Text to speak (first 100 chars):', text.substring(0, 100))

      // CRITICAL FIX 1: Cancel any ongoing speech and wait for it to fully stop
      window.speechSynthesis.cancel()
      await new Promise(resolve => setTimeout(resolve, 300))

      // CRITICAL FIX 2: Multiple attempts to get voices with retries
      let voices: SpeechSynthesisVoice[] = []
      let attempts = 0
      const maxAttempts = 5

      while (voices.length === 0 && attempts < maxAttempts) {
        attempts++
        console.log(`🔄 Attempt ${attempts}/${maxAttempts} to load voices...`)
        voices = window.speechSynthesis.getVoices()

        if (voices.length === 0) {
          console.warn(`⚠️ No voices on attempt ${attempts}, waiting 200ms...`)
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }

      console.log('🎤 Total voices found:', voices.length)

      if (voices.length === 0) {
        console.error('❌ NO VOICES LOADED after multiple attempts!')
        alert('⚠️ Voice system not ready. Please:\n1. Wait a few seconds and try again\n2. Refresh the page\n3. Make sure you are using Chrome, Safari, or Edge')
        setIsLoadingAudio(false)
        return
      }

      // CRITICAL FIX 3: Better voice selection with fallbacks
      const englishVoices = voices.filter(v => v.lang && v.lang.startsWith('en'))
      console.log('🎤 English voices found:', englishVoices.length)

      let voiceToUse = selectedVoice

      // Always verify the selected voice is still available
      if (!voiceToUse || !voices.find(v => v.name === voiceToUse?.name)) {
        console.log('⚠️ Selecting best voice...')

        // Priority order: female voices, then popular voices, then any English voice
        voiceToUse =
          englishVoices.find(v => v.name.toLowerCase().includes('female')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('samantha')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('karen')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('zira')) ||
          englishVoices.find(v => v.name.toLowerCase().includes('victoria')) ||
          englishVoices.find(v => !v.localService) || // Prefer cloud voices
          englishVoices[0] ||
          voices[0]

        console.log('✅ Selected voice:', voiceToUse?.name, 'Lang:', voiceToUse?.lang)
        setSelectedVoice(voiceToUse)
        setAvailableVoices(englishVoices.length > 0 ? englishVoices : voices)
      }

      // CRITICAL FIX 4: Create utterance with extra care
      const utterance = new SpeechSynthesisUtterance(text)

      // Set voice and language
      if (voiceToUse) {
        utterance.voice = voiceToUse
        utterance.lang = voiceToUse.lang || 'en-US'
        console.log('✅ Voice configured:', voiceToUse.name, 'Lang:', utterance.lang)
      } else {
        utterance.lang = 'en-US'
        console.warn('⚠️ Using browser default voice with en-US')
      }

      // Configure speech parameters optimized for kids
      utterance.rate = 0.85   // Slower for better comprehension
      utterance.pitch = 1.15  // Higher pitch for warmth and friendliness
      utterance.volume = 1.0  // Full volume

      console.log('🔧 Utterance settings:', {
        voice: utterance.voice?.name || 'default',
        rate: utterance.rate,
        pitch: utterance.pitch,
        volume: utterance.volume,
        lang: utterance.lang,
        textLength: text.length
      })

      // CRITICAL FIX 5: Track if speech actually started
      let speechStarted = false
      let speechEnded = false

      // Event handlers
      utterance.onstart = () => {
        console.log('✅✅✅ Speech STARTED successfully!')
        speechStarted = true
        setIsSpeaking(true)
        setIsLoadingAudio(false)
      }

      utterance.onend = () => {
        console.log('✅ Speech ENDED normally')
        speechEnded = true
        setIsSpeaking(false)
        setIsLoadingAudio(false)
      }

      utterance.onerror = (event) => {
        console.error('❌❌❌ Speech synthesis ERROR:', event.error, event)
        speechEnded = true
        setIsSpeaking(false)
        setIsLoadingAudio(false)

        if (event.error === 'not-allowed') {
          alert('🔇 Speech was blocked. Please:\n1. Make sure audio/sound is enabled\n2. Try clicking the button again\n3. Check browser permissions')
        } else if (event.error === 'network') {
          alert('🌐 Network error. Try:\n1. Selecting a different voice (one marked as local/offline)\n2. Check your internet connection')
        } else if (event.error === 'canceled') {
          console.log('ℹ️ Speech was canceled (normal if you clicked stop)')
        } else {
          alert(`❌ Speech error: ${event.error}\n\nTroubleshooting:\n1. Try a different voice from the dropdown\n2. Refresh the page\n3. Use Chrome, Safari, or Edge browser`)
        }
      }

      // CRITICAL FIX 6: Speak the text (ensure synthesis is ready)
      console.log('🗣️ Calling speechSynthesis.speak()...')
      window.speechSynthesis.speak(utterance)
      console.log('✅ speak() called, waiting for speech to start...')

      // CRITICAL FIX 7: Better timeout with recovery
      const timeoutId = setTimeout(() => {
        if (!speechStarted && !speechEnded) {
          console.error('❌ TIMEOUT: Speech did not start within 5 seconds')

          const stillSpeaking = window.speechSynthesis.speaking
          const isPending = window.speechSynthesis.pending

          console.log('📊 Speech status:', {
            speaking: stillSpeaking,
            pending: isPending,
            started: speechStarted,
            ended: speechEnded
          })

          if (stillSpeaking || isPending) {
            // It's actually working but onstart didn't fire
            console.log('⚠️ Speech is running but onstart never fired - updating UI')
            setIsSpeaking(true)
            setIsLoadingAudio(false)
          } else {
            // It really failed
            console.error('❌ Speech truly failed to start')
            setIsLoadingAudio(false)
            setIsSpeaking(false)
            alert('⏱️ Speech timed out. Please:\n1. Try again (sometimes it works on second try)\n2. Select a different voice\n3. Refresh the page')
          }
        }
      }, 5000) // 5 second timeout instead of 3

      // Clean up timeout if speech starts successfully
      const originalOnStart = utterance.onstart
      utterance.onstart = (event) => {
        clearTimeout(timeoutId)
        if (originalOnStart) originalOnStart.call(utterance, event)
      }

    } catch (error) {
      console.error('❌ Fatal error in speakText:', error)
      setIsLoadingAudio(false)
      setIsSpeaking(false)
      alert('Failed to read aloud: ' + (error as Error).message + '\n\nPlease refresh the page and try again.')
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

      {/* Voice Selector */}
      {speechSupported && availableVoices.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-purple-200">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <label htmlFor="voice-select" className="font-bold text-gray-800 text-lg">
              🎭 Choose Narrator Voice:
            </label>
            <select
              id="voice-select"
              value={selectedVoice?.name || ''}
              onChange={(e) => {
                const voice = availableVoices.find(v => v.name === e.target.value)
                if (voice) {
                  setSelectedVoice(voice)
                  console.log('🎤 Voice changed to:', voice.name)
                }
              }}
              className="px-6 py-3 border-2 border-purple-300 rounded-lg bg-white focus:border-purple-500 focus:outline-none font-semibold text-gray-700 cursor-pointer hover:border-purple-400 transition-all"
            >
              {availableVoices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
          <p className="text-center text-sm text-gray-600 mt-2 italic">
            Using your device's built-in voices (works offline!)
          </p>
        </div>
      )}

      {!speechSupported && (
        <div className="bg-yellow-50 p-6 rounded-xl border-2 border-yellow-300">
          <p className="text-center text-yellow-800 font-semibold">
            ⚠️ Text-to-speech is not supported in your browser. Please use Chrome, Safari, or Edge for the read aloud feature.
          </p>
        </div>
      )}

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
        {/* Text-to-Speech */}
        <button
          onClick={toggleSpeak}
          disabled={isLoadingAudio || !speechSupported}
          className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 transition-all transform hover:scale-105 ${
            isSpeaking
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : isLoadingAudio
              ? 'bg-gray-400 text-white cursor-wait'
              : !speechSupported
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
          title={!speechSupported ? 'Text-to-speech not supported in this browser' : ''}
        >
          {isLoadingAudio ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading...
            </>
          ) : isSpeaking ? (
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
