'use client'

console.log('🚀🚀🚀 SpeechRecorder.tsx LOADED - KIDS VOICE OPTIMIZED -' + new Date().toISOString())

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Volume2 } from 'lucide-react'

interface SpeechRecorderProps {
  onComplete: (text: string, authorName: string) => void
}

export default function SpeechRecorder({ onComplete }: SpeechRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [interimText, setInterimText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  const shouldBeRecordingRef = useRef(false) // Track if we want to keep recording

  useEffect(() => {
    console.log('✅ Speech Recorder SIMPLIFIED - Fast & Responsive')
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (!SpeechRecognition) {
        setIsSupported(false)
        return
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      // maxAlternatives = 1 (default) for SPEED

      recognition.onstart = () => {
        console.log('🎤 MICROPHONE READY - Start speaking now!')
        setIsStarting(false)
        setIsRecording(true)
      }

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
            console.log('✅ HEARD:', transcript)
          } else {
            interimTranscript += transcript
          }
        }

        if (finalTranscript) {
          setTranscription(prev => prev + finalTranscript)
          setInterimText('')
        } else {
          setInterimText(interimTranscript)
        }
      }

      recognition.onerror = (event: any) => {
        console.error('Speech error:', event.error)
        if (event.error === 'audio-capture') {
          alert('❌ Cannot access microphone! Please allow microphone access and try again.')
          shouldBeRecordingRef.current = false
          setIsRecording(false)
          setIsStarting(false)
        }
        // Ignore no-speech errors - we'll auto-restart anyway
        if (event.error === 'no-speech') {
          console.log('⚠️ No speech detected, but will keep listening...')
        }
      }

      recognition.onend = () => {
        console.log('🔄 Recognition ended')

        // Auto-restart if we should still be recording
        if (shouldBeRecordingRef.current) {
          console.log('🔁 Auto-restarting to continue listening...')
          setIsRecording(false) // Turn red off
          setIsStarting(true) // Show yellow "starting" state
          setTimeout(() => {
            if (shouldBeRecordingRef.current) {
              try {
                recognition.start()
                console.log('✅ Restarting...')
              } catch (e) {
                console.log('Already starting...')
                setIsStarting(false)
              }
            }
          }, 300) // Longer delay for more reliable restart
        } else {
          // User manually stopped
          setIsRecording(false)
          setIsStarting(false)
        }
      }

      recognitionRef.current = recognition

      // CLEANUP: Stop recognition when component unmounts
      return () => {
        console.log('🧹 Cleaning up SpeechRecorder - stopping recognition')
        shouldBeRecordingRef.current = false
        if (recognition) {
          try {
            recognition.stop()
            recognition.abort()
          } catch (e) {
            console.log('Recognition already stopped')
          }
        }
      }
    }
  }, [])

  const startRecording = () => {
    if (recognitionRef.current) {
      setInterimText('')
      setIsStarting(true) // Show "Starting..." state
      shouldBeRecordingRef.current = true // Enable auto-restart
      try {
        recognitionRef.current.start()
        console.log('🎤 Starting microphone...')
      } catch (e) {
        console.log('Already started')
        setIsStarting(false)
      }
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      shouldBeRecordingRef.current = false // Disable auto-restart
      setIsRecording(false)
      setIsStarting(false)
      try {
        recognitionRef.current.stop()
        console.log('🛑 STOPPED')
      } catch (e) {
        console.log('Already stopped')
      }
    }
  }

  const clearTranscription = () => {
    setTranscription('')
    setInterimText('')
  }

  const handleSubmit = () => {
    if (transcription.trim()) {
      onComplete(transcription.trim(), authorName.trim() || 'Young Author')
    }
  }

  if (!isSupported) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 mb-4 text-xl font-bold">
          ❌ Speech recognition not supported
        </p>
        <p className="text-gray-600 mb-4">
          Please use Google Chrome, Microsoft Edge, or Safari
        </p>
        <div className="max-w-md mx-auto">
          <textarea
            className="w-full p-4 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none"
            rows={6}
            placeholder="Type your story ideas here instead..."
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />
          <button
            onClick={handleSubmit}
            disabled={!transcription.trim()}
            className="mt-4 px-8 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            Create Story
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="bg-blue-100 border-2 border-blue-400 rounded-lg p-4 mb-4">
          <p className="text-lg font-bold text-blue-900">
            <Volume2 className="w-6 h-6 inline-block mr-2" />
            Speak LOUD and CLOSE to the microphone! You can pause between sentences - it keeps listening!
          </p>
        </div>

        <h2 className="text-3xl font-bold text-purple-800 mb-2">
          Tell Us Your Story
        </h2>
        <p className="text-gray-700 text-lg">
          Click the microphone and start speaking!
        </p>
      </div>

      {/* Recording Controls */}
      <div className="flex justify-center">
        <button
          onClick={(isRecording || isStarting) ? stopRecording : startRecording}
          disabled={isStarting}
          className={`p-8 rounded-full transition-all transform hover:scale-105 shadow-lg ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : isStarting
              ? 'bg-yellow-500 animate-pulse cursor-wait'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          {(isRecording || isStarting) ? (
            <MicOff className="w-16 h-16 text-white" />
          ) : (
            <Mic className="w-16 h-16 text-white" />
          )}
        </button>
      </div>

      <div className="text-center space-y-2">
        {isStarting && (
          <div className="space-y-3">
            <p className="text-xl font-bold text-yellow-600 animate-pulse">
              ⏳ Starting microphone... Please wait!
            </p>
          </div>
        )}

        {isRecording && (
          <div className="space-y-3">
            <p className="text-xl font-bold text-green-600 animate-pulse">
              🎤 Recording... Speak now!
            </p>
            {interimText && (
              <p className="text-gray-600 italic">
                Hearing: "{interimText}"
              </p>
            )}
          </div>
        )}

        {!isRecording && !isStarting && (
          <p className="text-gray-600 text-lg font-semibold">
            {transcription ? '✅ Got it! Click mic to add more or create story below' : 'Click the microphone to start'}
          </p>
        )}
      </div>

      {/* Transcription Display */}
      {(transcription || interimText) && (
        <div className="mt-6">
          <div className="bg-purple-50 p-6 rounded-xl border-2 border-purple-200">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-purple-800">Your Story Ideas:</h3>
              <button
                onClick={clearTranscription}
                className="text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">
              {transcription}
              {interimText && (
                <span className="text-gray-400 italic"> {interimText}</span>
              )}
            </p>
          </div>

          {/* Author Name Input */}
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

          <div className="flex justify-center mt-6">
            <button
              onClick={handleSubmit}
              className="px-8 py-4 bg-green-500 text-white rounded-full hover:bg-green-600 font-bold text-lg flex items-center gap-2 transform hover:scale-105 transition-all shadow-lg"
            >
              <Play className="w-6 h-6" />
              Create My Story!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
