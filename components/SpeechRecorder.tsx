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
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
            setIsListening(true) // Show listening indicator when words are recognized
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
        if (event.error === 'no-speech') {
          setIsListening(false)
        }
        if (event.error === 'aborted') {
          setIsRecording(false)
        }
      }

      recognition.onend = () => {
        setIsRecording(false)
        setIsListening(false)
        setInterimText('')
      }

      recognitionRef.current = recognition
    }
  }, [])

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscription('')
      recognitionRef.current.start()
      setIsRecording(true)
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
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
        <div className="bg-green-500 text-white font-bold py-2 px-4 rounded mb-4">
          ✅ VERSION 5.0 ENHANCED - WITH GREEN BARS
        </div>
        <h2 className="text-2xl font-bold text-purple-800 mb-2">
          Tell Us Your Story
        </h2>
        <p className="text-gray-600">
          Click the microphone and start speaking. Tell us about characters, adventures, or anything you can imagine!
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
          <div className="space-y-2">
            <p className={`font-semibold ${isListening ? 'text-green-600 animate-pulse' : 'text-orange-600'}`}>
              {isListening ? '🎤 Listening... I can hear you!' : '🎤 Ready to listen... Start speaking!'}
            </p>
            {isListening && (
              <div className="flex justify-center gap-1">
                <div className="w-2 h-8 bg-green-500 rounded animate-pulse" style={{animationDelay: '0ms'}}></div>
                <div className="w-2 h-12 bg-green-500 rounded animate-pulse" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-6 bg-green-500 rounded animate-pulse" style={{animationDelay: '300ms'}}></div>
                <div className="w-2 h-10 bg-green-500 rounded animate-pulse" style={{animationDelay: '450ms'}}></div>
                <div className="w-2 h-8 bg-green-500 rounded animate-pulse" style={{animationDelay: '600ms'}}></div>
              </div>
            )}
          </div>
        )}
        {!isRecording && (
          <p className="text-gray-600">
            {transcription ? '✅ Click the mic to add more' : '🎤 Click the mic to start'}
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
