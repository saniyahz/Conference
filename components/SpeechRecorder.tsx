'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2 } from 'lucide-react'

interface SpeechRecorderProps {
  onComplete: (text: string) => void
}

export default function SpeechRecorder({ onComplete }: SpeechRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
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

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        if (finalTranscript) {
          setTranscription(prev => prev + finalTranscript)
        }
      }

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
      }

      recognition.onend = () => {
        setIsRecording(false)
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
      onComplete(transcription.trim())
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

      <div className="text-center">
        {isRecording ? (
          <p className="text-red-600 font-semibold animate-pulse">
            Listening... Speak now!
          </p>
        ) : (
          <p className="text-gray-600">
            {transcription ? 'Click the mic to add more' : 'Click the mic to start'}
          </p>
        )}
      </div>

      {/* Transcription Display */}
      {transcription && (
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
            <p className="text-gray-700 whitespace-pre-wrap">{transcription}</p>
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
