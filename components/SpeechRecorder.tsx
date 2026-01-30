'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Keyboard, Loader2, Square } from 'lucide-react'

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
          autoGainControl: true, // Important for kids' varying volumes
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
      mediaRecorder.start(1000) // Collect data every second
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
        alert('❌ Microphone access denied! Please allow microphone access and try again.')
      } else {
        alert('❌ Could not access microphone. Please check your device settings.')
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

      // Check if recording is too short (less than 0.5 seconds)
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
        // No speech detected
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        {/* Kid-friendly tips */}
        <div className="bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-400 rounded-xl p-4 mb-4">
          <p className="text-xl font-bold text-blue-900 mb-2">
            🎤 Recording Tips:
          </p>
          <ul className="text-left text-blue-800 space-y-1 max-w-md mx-auto">
            <li>📱 Hold the device <strong>CLOSE</strong> to your mouth</li>
            <li>🔊 Speak at your normal voice - we'll understand you!</li>
            <li>⏱️ Record for at least <strong>5 seconds</strong></li>
            <li>🔴 Press the <strong>STOP</strong> button when done</li>
          </ul>
        </div>

        <h2 className="text-3xl font-bold text-purple-800 mb-2">
          🦫 Tell Us Your Story!
        </h2>
        <p className="text-gray-700 text-lg">
          What adventure do you want to go on today?
        </p>
      </div>

      {/* Show typing option if voice isn't working */}
      {showTypeOption && !transcription && !isRecording && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
          <p className="text-amber-800 font-semibold mb-2">
            🎤 Having trouble? You can also type your story!
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
                // Switch to typing mode
                setShowTypeOption(false)
                setTranscription('') // Clear and show textarea
              }}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold flex items-center gap-2"
            >
              <Keyboard className="w-5 h-5" />
              Type Instead
            </button>
          </div>
        </div>
      )}

      {/* Recording Controls */}
      <div className="flex flex-col items-center gap-4">
        {/* Mic warmup indicator */}
        {isMicWarmingUp && (
          <div className="bg-amber-100 border-2 border-amber-400 rounded-xl p-4 animate-pulse text-center max-w-md">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
              <span className="text-amber-800 font-bold text-lg">Preparing microphone...</span>
            </div>
            <p className="text-amber-700">
              Hold on! The mic takes a moment to warm up. You'll be able to record in just a few seconds!
            </p>
          </div>
        )}

        {/* Audio level indicator when recording */}
        {isRecording && (
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-red-600 font-bold animate-pulse flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                Recording: {formatTime(recordingTime)}
              </span>
              <span className="text-gray-500 text-sm">Sound level</span>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 transition-all duration-100"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">
              {audioLevel > 30 ? '🎤 Great! We can hear you!' : '🔇 Speak louder or move closer'}
            </p>
          </div>
        )}

        {/* Main record button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing || isMicWarmingUp}
          className={`p-8 rounded-full transition-all transform hover:scale-105 shadow-lg ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : isTranscribing || isMicWarmingUp
              ? 'bg-yellow-500 cursor-wait'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          {isTranscribing || isMicWarmingUp ? (
            <Loader2 className="w-16 h-16 text-white animate-spin" />
          ) : isRecording ? (
            <Square className="w-16 h-16 text-white" />
          ) : (
            <Mic className="w-16 h-16 text-white" />
          )}
        </button>

        {/* Status text */}
        <div className="text-center">
          {isMicWarmingUp ? (
            <p className="text-xl font-bold text-amber-600 animate-pulse">
              🎤 Warming up microphone... Please wait!
            </p>
          ) : isTranscribing ? (
            <p className="text-xl font-bold text-yellow-600 animate-pulse">
              ✨ Understanding your voice... Please wait!
            </p>
          ) : isRecording ? (
            <p className="text-xl font-bold text-red-600">
              🔴 Recording... Press the square to stop!
            </p>
          ) : (
            <p className="text-gray-600 text-lg font-semibold">
              {transcription ? '✅ Got it! Record more or create your story!' : 'Tap the microphone to start recording'}
            </p>
          )}
        </div>
      </div>

      {/* Transcription Display & Manual Input */}
      <div className="mt-6">
        <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-purple-800">Your Story Ideas:</h3>
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

          {/* Editable textarea - kids can type OR edit their recording */}
          <textarea
            className="w-full p-4 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg min-h-[120px] resize-none"
            placeholder="Your story ideas will appear here... You can also type directly! ✨

Example: A brave little bunny who goes on an adventure to find a magical rainbow..."
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-2">
            💡 Tip: You can record multiple times to add more ideas, or type directly!
          </p>
        </div>

        {/* Author Name Input */}
        {transcription && (
          <div className="mt-6 bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
            <label htmlFor="authorName" className="block text-sm font-semibold text-blue-800 mb-2">
              📝 Your Name (Story Author):
            </label>
            <input
              id="authorName"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Enter your name here..."
              className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-700"
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
              className="px-8 py-4 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold text-lg flex items-center gap-2 transform hover:scale-105 transition-all shadow-lg"
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
