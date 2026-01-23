'use client'

console.log('🚀🚀🚀 SpeechRecorder.tsx LOADED - Version 3.0 - ' + new Date().toISOString())

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2 } from 'lucide-react'

interface SpeechRecorderProps {
  onComplete: (text: string, authorName: string) => void
}

export default function SpeechRecorder({ onComplete }: SpeechRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [interimText, setInterimText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    console.log('✅ SpeechRecorder v2.0 ENHANCED - Loaded at ' + new Date().toISOString())
    // Check if browser supports Speech Recognition
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
      recognition.maxAlternatives = 3 // More alternatives for better kid voice recognition

      // Auto-restart flag to keep listening for kids (they pause a lot!)
      let shouldRestart = false

      recognition.onstart = () => {
        setIsListening(true)
        console.log('🎤 Microphone started - listening for kids voices!')
      }

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
            setIsListening(true) // Show listening indicator when words are recognized
            console.log('✅ Got speech:', transcript)
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
        console.error('Speech recognition error:', event.error)

        // DON'T stop on no-speech - kids voices are quiet!
        if (event.error === 'no-speech') {
          console.log('⚠️ No speech detected - but keeping microphone on for kids!')
          setIsListening(true) // Keep showing as listening
          // Don't stop - let it keep trying
        } else if (event.error === 'aborted') {
          setIsRecording(false)
          shouldRestart = false
        } else {
          // Other errors - try to restart
          console.log('🔄 Error occurred, will restart listening...')
        }
      }

      recognition.onend = () => {
        console.log('🔄 Recognition ended')
        // Auto-restart if still recording (kids pause between words!)
        if (shouldRestart && isRecording) {
          console.log('🔁 Auto-restarting for kids...')
          setTimeout(() => {
            try {
              recognition.start()
            } catch (e) {
              console.log('Already restarting...')
            }
          }, 100)
        } else {
          setIsRecording(false)
          setIsListening(false)
          setInterimText('')
        }
      }

      // Store restart flag reference
      recognition.shouldRestart = () => shouldRestart
      recognition.setShouldRestart = (value: boolean) => { shouldRestart = value }

      recognitionRef.current = recognition
    }
  }, [])

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscription('')
      setInterimText('')
      // Enable auto-restart for kids who pause
      recognitionRef.current.setShouldRestart(true)
      try {
        recognitionRef.current.start()
        setIsRecording(true)
        console.log('🎤 Started recording - optimized for kids voices!')
      } catch (e) {
        console.log('Recognition already started')
      }
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      // Disable auto-restart
      recognitionRef.current.setShouldRestart(false)
      recognitionRef.current.stop()
      setIsRecording(false)
      console.log('🛑 Stopped recording')
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

  if (!isSupported) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 mb-4">
          Sorry! Your browser doesn't support speech recognition.
        </p>
        <p className="text-gray-600 mb-4">
          Please try using Google Chrome, Microsoft Edge, or Safari.
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
        <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold py-3 px-6 rounded-lg mb-4 shadow-lg">
          🎤 OPTIMIZED FOR KIDS' VOICES! Speak clearly and the mic will hear you! 🎤
        </div>
        <h2 className="text-2xl font-bold text-purple-800 mb-2">
          Tell Us Your Story
        </h2>
        <p className="text-gray-600 text-lg">
          <strong>Kids:</strong> Click the microphone, speak clearly, and watch the green bars!
          Tell us about characters, adventures, or anything you can imagine!
        </p>
        <p className="text-sm text-blue-600 mt-2">
          💡 Tip: Speak a bit louder and slower so the microphone can hear you better!
        </p>
      </div>

      {/* Recording Controls */}
      <div className="flex justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-8 rounded-full transition-all transform hover:scale-105 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          {isRecording ? (
            <MicOff className="w-16 h-16 text-white" />
          ) : (
            <Mic className="w-16 h-16 text-white" />
          )}
        </button>
      </div>

      <div className="text-center space-y-2">
        {isRecording && (
          <div className="space-y-3">
            <p className={`text-xl font-bold ${isListening ? 'text-green-600 animate-pulse' : 'text-blue-600'}`}>
              {isListening ? '✅ HEARING YOU! Keep talking!' : '👂 LISTENING... Speak now!'}
            </p>
            {/* Always show green bars when recording to give kids confidence */}
            <div className="flex justify-center gap-1 bg-gray-100 p-4 rounded-lg">
              <div className="w-3 h-12 bg-green-500 rounded animate-pulse" style={{animationDelay: '0ms', animationDuration: '0.8s'}}></div>
              <div className="w-3 h-16 bg-green-400 rounded animate-pulse" style={{animationDelay: '100ms', animationDuration: '0.7s'}}></div>
              <div className="w-3 h-10 bg-green-500 rounded animate-pulse" style={{animationDelay: '200ms', animationDuration: '0.9s'}}></div>
              <div className="w-3 h-14 bg-green-400 rounded animate-pulse" style={{animationDelay: '300ms', animationDuration: '0.6s'}}></div>
              <div className="w-3 h-12 bg-green-500 rounded animate-pulse" style={{animationDelay: '400ms', animationDuration: '0.8s'}}></div>
              <div className="w-3 h-16 bg-green-400 rounded animate-pulse" style={{animationDelay: '500ms', animationDuration: '0.7s'}}></div>
              <div className="w-3 h-10 bg-green-500 rounded animate-pulse" style={{animationDelay: '600ms', animationDuration: '0.9s'}}></div>
            </div>
            <p className="text-sm text-gray-600 italic">
              {interimText ? `Hearing: "${interimText}"` : 'Microphone is ON and listening for your voice...'}
            </p>
          </div>
        )}
        {!isRecording && (
          <p className="text-gray-600 text-lg font-semibold">
            {transcription ? '✅ Great! Click the mic to add more or create your story below' : '🎤 Click the big microphone to start recording'}
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
                <span className="text-gray-400 italic">{interimText}</span>
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
