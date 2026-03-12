'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Keyboard, Loader2, Square, Check } from 'lucide-react'
import BeaverMascot from './BeaverMascot'

export type AgeGroup = '3-5' | '6-8' | '9-12'
export type GenerationMode = 'storybook' | 'movie'
export type StoryMode = 'imagination' | 'history'

interface SpeechRecorderProps {
  onComplete: (text: string, authorName: string, ageGroup: AgeGroup, mode: GenerationMode, storyMode: StoryMode, detectedLanguage: string) => void
}

export default function SpeechRecorder({ onComplete }: SpeechRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [showTypeOption, setShowTypeOption] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [isMicWarmingUp, setIsMicWarmingUp] = useState(false)
  const [ageGroup, setAgeGroup] = useState<AgeGroup>('3-5')
  const [storyMode, setStoryMode] = useState<StoryMode>('imagination')
  const [detectedLanguage, setDetectedLanguage] = useState<string>('en')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
      if (timerRef.current) clearInterval(timerRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  const startRecording = async () => {
    try {
      // Show warmup indicator first
      setIsMicWarmingUp(true)

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      })

      streamRef.current = stream

      // Set up audio level monitoring
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Monitor audio levels
      const checkAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          setAudioLevel(Math.min(100, average * 2))
        }
        if (isRecording) {
          animationRef.current = requestAnimationFrame(checkAudioLevel)
        }
      }

      // Create MediaRecorder with best format for Whisper
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      })

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop monitoring
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
        setAudioLevel(0)

        // Process the recording
        if (audioChunksRef.current.length > 0) {
          await transcribeAudio()
        }
      }

      // Start recording
      mediaRecorder.start(1000)
      setIsMicWarmingUp(false)
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

      // Start audio level monitoring
      checkAudioLevel()

    } catch (error: any) {
      console.error('Error starting recording:', error)
      setIsMicWarmingUp(false)
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Microphone access denied! Please allow microphone access and try again.')
      } else {
        alert('Could not access microphone. Please check your device settings.')
      }
      setShowTypeOption(true)
    }
  }

  const stopRecording = () => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Stop animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    setIsRecording(false)
    setAudioLevel(0)
  }

  const transcribeAudio = async () => {
    if (audioChunksRef.current.length === 0) return

    setIsTranscribing(true)

    try {
      // Create audio blob
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })

      // Check if recording is too short
      if (audioBlob.size < 5000) {
        setShowTypeOption(true)
        setIsTranscribing(false)
        return
      }

      // Create form data
      const formData = new FormData()
      const extension = mimeType.includes('webm') ? 'webm' : 'mp4'
      formData.append('audio', audioBlob, `recording.${extension}`)

      // Send to Whisper API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const data = await response.json()

      // Capture detected language from Whisper auto-detection
      if (data.detectedLanguage) {
        setDetectedLanguage(data.detectedLanguage)
      }

      if (data.text && data.text.trim()) {
        setTranscription(prev => {
          const newText = prev ? `${prev} ${data.text.trim()}` : data.text.trim()
          return newText
        })
      } else {
        setShowTypeOption(true)
      }

    } catch (error) {
      console.error('Transcription error:', error)
      setShowTypeOption(true)
    } finally {
      setIsTranscribing(false)
      audioChunksRef.current = []
    }
  }

  const clearTranscription = () => {
    setTranscription('')
  }

  const handleSubmit = () => {
    if (transcription.trim()) {
      onComplete(transcription.trim(), authorName.trim() || 'Young Author', ageGroup, 'storybook', storyMode, detectedLanguage)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get beaver greeting based on state
  const getBeaverGreeting = () => {
    if (isMicWarmingUp) return "Getting ready..."
    if (isTranscribing) return "Let me think..."
    if (isRecording) return "I'm listening!"
    if (transcription) return "Great idea!"
    return "Tell me a story!"
  }

  const isProcessing = isTranscribing || isMicWarmingUp

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-zinc-800 mb-2 tracking-tight">
          What story shall we create today?
        </h2>
        <p className="text-zinc-500 text-lg mb-6">
          Press the microphone and tell me your idea!
        </p>
      </div>

      {/* Show typing option if voice isn't working */}
      {showTypeOption && !transcription && !isRecording && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-center">
          <p className="text-zinc-700 font-semibold mb-2">
            Having trouble? You can also type your story!
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowTypeOption(false)}
              className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-300 font-medium active:scale-[0.98]"
            >
              Try Recording Again
            </button>
            <button
              onClick={() => {
                setShowTypeOption(false)
                setTranscription('')
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium flex items-center gap-2 active:scale-[0.98]"
            >
              <Keyboard className="w-5 h-5" />
              Type Instead
            </button>
          </div>
        </div>
      )}

      {/* Main Recording Area - Beaver on side, mic centered */}
      <div className="flex items-center justify-center gap-8 py-6">
        {/* Beaver Mascot on the left side */}
        <div className="hidden md:block">
          <BeaverMascot
            greeting={getBeaverGreeting()}
            isRecording={isRecording}
            isProcessing={isProcessing}
            size="medium"
          />
        </div>

        {/* Centered Microphone Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative p-8 rounded-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border-4 border-white active:scale-[0.98]
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110'
                : isProcessing
                  ? 'bg-zinc-400 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
              }`}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isProcessing ? (
              <Loader2 className="w-14 h-14 text-white animate-spin" />
            ) : isRecording ? (
              <Square className="w-14 h-14 text-white" />
            ) : (
              <Mic className="w-14 h-14 text-white" />
            )}

            {/* Recording ring animation */}
            {isRecording && (
              <>
                <div className="absolute inset-0 rounded-full border-4 border-red-400 animate-ping opacity-75" />
                <div className="absolute -inset-2 rounded-full border-2 border-red-300 animate-pulse opacity-50" />
              </>
            )}
          </button>

          {/* Recording status */}
          {isRecording ? (
            <div className="mt-4 text-center">
              <span className="text-red-600 font-bold animate-pulse flex items-center gap-2 justify-center">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                Recording: {formatTime(recordingTime)}
              </span>
            </div>
          ) : (
            <p className="mt-4 text-zinc-400 text-sm">
              {isProcessing ? 'Processing...' : 'Tap to record'}
            </p>
          )}

          {/* Audio level indicator */}
          {isRecording && (
            <div className="w-48 mt-3">
              <div className="h-3 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1 text-center">
                {audioLevel > 30 ? 'Great! I can hear you!' : 'Speak a bit louder'}
              </p>
            </div>
          )}
        </div>

        {/* Beaver on right side for mobile - smaller */}
        <div className="md:hidden">
          <BeaverMascot
            greeting={getBeaverGreeting()}
            isRecording={isRecording}
            isProcessing={isProcessing}
            size="small"
          />
        </div>
      </div>

      {/* Tips - shown when not recording */}
      {!isRecording && !transcription && (
        <p className="text-zinc-400 text-sm text-center max-w-sm mx-auto">
          Speak your idea, then review and edit before creating.
        </p>
      )}

      {/* Transcription Display & Manual Input */}
      <div className="mt-6">
        <div className="bg-zinc-50 p-6 rounded-xl border border-zinc-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-zinc-700">Your Story Ideas:</h3>
            {transcription && (
              <button
                onClick={clearTranscription}
                className="text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {/* Editable textarea */}
          <textarea
            className="w-full p-4 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-lg min-h-[120px] resize-none bg-white"
            placeholder="Your story will appear here after recording — or just type it!"
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />
          <p className="text-xs text-zinc-400 mt-2">
            Edit freely before creating your story.
          </p>
        </div>

        {/* Author Name Input */}
        {transcription && (
          <div className="mt-6 flex flex-col gap-2">
            <label htmlFor="authorName" className="text-sm font-medium text-zinc-700">
              Your Name (Story Author)
            </label>
            <input
              id="authorName"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Enter your name here..."
              className="w-full px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-zinc-700 bg-white"
              maxLength={50}
            />
            <p className="text-xs text-zinc-400">This will appear as the author on your story book!</p>
          </div>
        )}

        {/* Age Group Selector */}
        {transcription && (
          <div className="mt-6">
            <label className="text-sm font-medium text-zinc-700 mb-3 block">
              Child's Age Group
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: '3-5' as AgeGroup, emoji: '🐣', label: 'Little Ones', sub: 'Ages 3-5' },
                { value: '6-8' as AgeGroup, emoji: '🌟', label: 'Growing Up', sub: 'Ages 6-8' },
                { value: '9-12' as AgeGroup, emoji: '🚀', label: 'Big Kids', sub: 'Ages 9-12' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAgeGroup(opt.value)}
                  className={`relative p-4 rounded-xl border-2 text-center transition-all active:scale-[0.98] ${
                    ageGroup === opt.value
                      ? 'border-emerald-500 bg-emerald-50 shadow-md'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {ageGroup === opt.value && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                  <div className="text-2xl mb-1">{opt.emoji}</div>
                  <div className={`text-sm font-semibold ${ageGroup === opt.value ? 'text-emerald-700' : 'text-zinc-700'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-zinc-400">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}


        {/* Story Mode Selector */}
        {transcription && (
          <div className="mt-6">
            <label className="text-sm font-medium text-zinc-700 mb-3 block">
              Story Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'imagination' as StoryMode, emoji: '✨', label: 'Imagination', sub: 'Creative & magical' },
                { value: 'history' as StoryMode, emoji: '📜', label: 'History', sub: 'Real events as stories' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStoryMode(opt.value)}
                  className={`relative p-4 rounded-xl border-2 text-center transition-all active:scale-[0.98] ${
                    storyMode === opt.value
                      ? 'border-emerald-500 bg-emerald-50 shadow-md'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  {storyMode === opt.value && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                  <div className="text-2xl mb-1">{opt.emoji}</div>
                  <div className={`text-sm font-semibold ${storyMode === opt.value ? 'text-emerald-700' : 'text-zinc-700'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-zinc-400">{opt.sub}</div>
                </button>
              ))}
            </div>
            {storyMode === 'history' && (
              <p className="text-xs text-amber-600 mt-2">
                History mode creates age-appropriate stories based on real events, places, and people.
              </p>
            )}
          </div>
        )}

        {/* Submit button */}
        {transcription && (
          <div className="flex justify-center mt-6">
            <button
              onClick={handleSubmit}
              disabled={!transcription.trim()}
              className="px-8 py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-zinc-300 disabled:cursor-not-allowed font-semibold text-lg flex items-center gap-2 active:scale-[0.98] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]"
            >
              <Play className="w-6 h-6" />
              Create My Story!
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
