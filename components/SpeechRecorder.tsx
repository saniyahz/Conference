'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Keyboard, Loader2, Square } from 'lucide-react'
import BeaverMascot from './BeaverMascot'

interface SpeechRecorderProps {
  onComplete: (text: string, authorName: string) => void
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
      onComplete(transcription.trim(), authorName.trim() || 'Young Author')
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
        <h2 className="text-3xl font-bold text-teal-700 mb-2">
          What story shall we create today?
        </h2>
        <p className="text-gray-600 text-lg mb-6">
          Press the microphone and tell me your idea!
        </p>
      </div>

      {/* Show typing option if voice isn't working */}
      {showTypeOption && !transcription && !isRecording && (
        <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4 text-center">
          <p className="text-teal-800 font-semibold mb-2">
            Having trouble? You can also type your story!
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowTypeOption(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Try Recording Again
            </button>
            <button
              onClick={() => {
                setShowTypeOption(false)
                setTranscription('')
              }}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-semibold flex items-center gap-2"
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
            className={`relative p-8 rounded-full transition-all shadow-xl border-4 border-white
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110'
                : isProcessing
                  ? 'bg-gray-400 cursor-wait'
                  : 'bg-teal-500 hover:bg-teal-600 hover:scale-110'
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
            <p className="mt-4 text-gray-500 text-sm">
              {isProcessing ? 'Processing...' : 'Tap to record'}
            </p>
          )}

          {/* Audio level indicator */}
          {isRecording && (
            <div className="w-48 mt-3">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 transition-all duration-100"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center">
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
        <div className="bg-gradient-to-r from-teal-50 to-green-50 border-2 border-teal-200 rounded-xl p-4 max-w-md mx-auto text-center">
          <p className="text-teal-700 font-semibold">
            Tell me about an adventure you'd like to read about!
          </p>
        </div>
      )}

      {/* Transcription Display & Manual Input */}
      <div className="mt-6">
        <div className="bg-teal-50 p-6 rounded-xl border-2 border-teal-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-teal-800">Your Story Ideas:</h3>
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
            className="w-full p-4 border-2 border-teal-300 rounded-xl focus:border-teal-500 focus:outline-none text-lg min-h-[120px] resize-none"
            placeholder="Your story ideas will appear here... You can also type directly!

Example: A brave little bunny who goes on an adventure to find a magical rainbow..."
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-2">
            Tip: You can record multiple times to add more ideas, or type directly!
          </p>
        </div>

        {/* Author Name Input */}
        {transcription && (
          <div className="mt-6 bg-yellow-50 p-6 rounded-xl border-2 border-yellow-200">
            <label htmlFor="authorName" className="block text-sm font-semibold text-yellow-800 mb-2">
              Your Name (Story Author):
            </label>
            <input
              id="authorName"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Enter your name here..."
              className="w-full px-4 py-3 border-2 border-yellow-300 rounded-lg focus:border-yellow-500 focus:outline-none text-gray-700"
              maxLength={50}
            />
            <p className="text-xs text-gray-500 mt-2">This will appear as the author on your story book!</p>
          </div>
        )}

        {/* Submit button */}
        {transcription && (
          <div className="flex justify-center mt-6">
            <button
              onClick={handleSubmit}
              disabled={!transcription.trim()}
              className="px-8 py-4 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold text-lg flex items-center gap-2 transform hover:scale-105 transition-all shadow-lg"
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
