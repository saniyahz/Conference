'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Volume2, Keyboard } from 'lucide-react'

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
  const [showTypeOption, setShowTypeOption] = useState(false)
  const [noSpeechCount, setNoSpeechCount] = useState(0)
  const recognitionRef = useRef<any>(null)
  const shouldBeRecordingRef = useRef(false)

  useEffect(() => {
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
      recognition.maxAlternatives = 3 // Get more alternatives for kids' voices

      recognition.onstart = () => {
        setIsStarting(false)
        setIsRecording(true)
        setNoSpeechCount(0)
      }

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          // Try all alternatives for better recognition
          const result = event.results[i]
          const transcript = result[0].transcript

          if (result.isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        if (finalTranscript) {
          setTranscription(prev => prev + finalTranscript)
          setInterimText('')
          setNoSpeechCount(0) // Reset no-speech counter on successful capture
        } else {
          setInterimText(interimTranscript)
        }
      }

      recognition.onerror = (event: any) => {
        console.log('Speech event:', event.error)

        if (event.error === 'audio-capture') {
          alert('❌ Cannot access microphone! Please allow microphone access and try again.')
          shouldBeRecordingRef.current = false
          setIsRecording(false)
          setIsStarting(false)
        } else if (event.error === 'no-speech') {
          // Don't stop - just count and show typing option after multiple failures
          setNoSpeechCount(prev => {
            const newCount = prev + 1
            if (newCount >= 2) {
              setShowTypeOption(true)
            }
            return newCount
          })
          // Keep listening - don't stop!
        }
        // Ignore other errors and keep trying
      }

      recognition.onend = () => {
        // Auto-restart if we should still be recording
        if (shouldBeRecordingRef.current) {
          setIsRecording(false)
          setIsStarting(true)
          setTimeout(() => {
            if (shouldBeRecordingRef.current) {
              try {
                recognition.start()
              } catch (e) {
                setIsStarting(false)
              }
            }
          }, 200) // Faster restart
        } else {
          setIsRecording(false)
          setIsStarting(false)
        }
      }

      recognitionRef.current = recognition

      return () => {
        shouldBeRecordingRef.current = false
        if (recognition) {
          try {
            recognition.stop()
            recognition.abort()
          } catch (e) {}
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
      } catch (e) {
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
      } catch (e) {
        // Already stopped
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
        <div className="text-4xl mb-4">⌨️ 🦫</div>
        <h2 className="text-2xl font-bold text-purple-800 mb-2">
          Type Your Story Idea!
        </h2>
        <p className="text-gray-600 mb-4">
          Tell us what adventure you want to go on...
        </p>
        <div className="max-w-lg mx-auto">
          <textarea
            className="w-full p-4 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg"
            rows={5}
            placeholder="Example: A brave little bunny who goes on an adventure to find a magical rainbow..."
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />

          {/* Author name */}
          <div className="mt-4">
            <label className="block text-sm font-semibold text-purple-800 mb-2">
              📝 Your Name:
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg focus:border-purple-500 focus:outline-none"
              maxLength={50}
            />
          </div>

          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={() => setIsSupported(true)}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 font-semibold flex items-center gap-2"
            >
              <Mic className="w-5 h-5" />
              Try Voice Again
            </button>
            <button
              onClick={handleSubmit}
              disabled={!transcription.trim()}
              className="px-8 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Create My Story!
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        {/* Kid-friendly tips */}
        <div className="bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-400 rounded-xl p-4 mb-4">
          <p className="text-xl font-bold text-blue-900 mb-2">
            🎤 Tips for Kids:
          </p>
          <ul className="text-left text-blue-800 space-y-1 max-w-md mx-auto">
            <li>📢 Speak <strong>LOUD</strong> like you're talking to grandma!</li>
            <li>📱 Hold the device <strong>CLOSE</strong> to your mouth</li>
            <li>🐢 Speak <strong>SLOWLY</strong> and clearly</li>
            <li>🤫 Make sure it's <strong>QUIET</strong> around you</li>
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
      {showTypeOption && !transcription && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-center">
          <p className="text-amber-800 font-semibold mb-2">
            🎤 Having trouble with the microphone?
          </p>
          <button
            onClick={() => setIsSupported(false)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold flex items-center gap-2 mx-auto"
          >
            <Keyboard className="w-5 h-5" />
            Type Your Story Instead
          </button>
        </div>
      )}

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
