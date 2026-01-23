'use client'

console.log('🚀🚀🚀 SpeechRecorder.tsx LOADED - KIDS VOICE OPTIMIZED -' + new Date().toISOString())

import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Play, Trash2, Volume2 } from 'lucide-react'

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
  const isRecordingRef = useRef(false) // Track recording state for closures

  useEffect(() => {
    console.log('✅ Speech Recorder KIDS OPTIMIZED - Loaded')
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
      recognition.maxAlternatives = 5 // Maximum alternatives for kids' pronunciation

      recognition.onstart = () => {
        console.log('🎤 MICROPHONE ON - Listening for KIDS!')
        setIsListening(true)
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
        console.log('⚠️ Speech error:', event.error)

        // CRITICAL: Ignore no-speech errors for kids!
        if (event.error === 'no-speech') {
          console.log('No speech detected - will keep trying for kids')
          // Don't do anything - just let it restart automatically
          return
        }

        if (event.error === 'audio-capture') {
          alert('❌ Cannot access microphone! Please:\n1. Allow microphone access\n2. Make sure no other app is using the mic\n3. Try refreshing the page')
          setIsRecording(false)
          isRecordingRef.current = false
        }
      }

      recognition.onend = () => {
        console.log('🔄 Recognition ended')

        // Auto-restart if still recording (using ref for current value)
        if (isRecordingRef.current) {
          console.log('🔁 AUTO-RESTARTING for kids...')
          setTimeout(() => {
            if (isRecordingRef.current) {
              try {
                recognition.start()
                console.log('✅ Restarted successfully')
              } catch (e) {
                console.log('Already starting...')
              }
            }
          }, 100) // Very short delay
        } else {
          setIsListening(false)
        }
      }

      recognitionRef.current = recognition
    }
  }, [])

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscription('')
      setInterimText('')
      isRecordingRef.current = true
      setIsRecording(true)

      try {
        recognitionRef.current.start()
        console.log('🎤 STARTED - Optimized for KIDS')
      } catch (e) {
        console.log('Already started')
      }
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      isRecordingRef.current = false
      setIsRecording(false)

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
        <div className="bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 text-white font-extrabold py-4 px-6 rounded-lg mb-4 shadow-lg animate-pulse">
          <Volume2 className="w-8 h-8 inline-block mr-2" />
          KIDS: SPEAK LOUD & CLOSE TO THE MIC!
          <Volume2 className="w-8 h-8 inline-block ml-2" />
        </div>

        <div className="bg-blue-100 border-4 border-blue-500 rounded-lg p-6 mb-4">
          <h3 className="text-2xl font-bold text-blue-900 mb-3">📢 IMPORTANT for Parents/Kids:</h3>
          <ul className="text-left text-lg space-y-2 max-w-2xl mx-auto">
            <li className="flex items-start gap-2">
              <span className="text-2xl">🔊</span>
              <span><strong>Speak 2-3X LOUDER</strong> than normal!</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-2xl">📱</span>
              <span><strong>Hold device CLOSE</strong> to your mouth (6 inches away)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-2xl">🐢</span>
              <span><strong>Speak SLOWLY</strong> and clearly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-2xl">✅</span>
              <span><strong>Watch the green bars</strong> - they show the mic is working!</span>
            </li>
          </ul>
        </div>

        <h2 className="text-3xl font-bold text-purple-800 mb-2">
          Tell Us Your Story
        </h2>
        <p className="text-gray-700 text-lg">
          Click the microphone and start telling your story idea!
        </p>
      </div>

      {/* Recording Controls */}
      <div className="flex justify-center">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-10 rounded-full transition-all transform hover:scale-105 shadow-2xl ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 animate-pulse'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
          }`}
        >
          {isRecording ? (
            <MicOff className="w-20 h-20 text-white" />
          ) : (
            <Mic className="w-20 h-20 text-white" />
          )}
        </button>
      </div>

      <div className="text-center space-y-3">
        {isRecording && (
          <div className="space-y-4">
            <div className="bg-green-100 border-4 border-green-500 rounded-lg p-4">
              <p className="text-2xl font-extrabold text-green-700 animate-pulse">
                🎤 MICROPHONE IS ON! SPEAK NOW!
              </p>
            </div>

            {/* Always show animated green bars */}
            <div className="flex justify-center gap-2 bg-gray-900 p-6 rounded-xl">
              <div className="w-4 h-16 bg-green-500 rounded animate-bounce" style={{animationDelay: '0ms', animationDuration: '0.6s'}}></div>
              <div className="w-4 h-20 bg-green-400 rounded animate-bounce" style={{animationDelay: '100ms', animationDuration: '0.5s'}}></div>
              <div className="w-4 h-12 bg-green-500 rounded animate-bounce" style={{animationDelay: '200ms', animationDuration: '0.7s'}}></div>
              <div className="w-4 h-24 bg-green-400 rounded animate-bounce" style={{animationDelay: '300ms', animationDuration: '0.4s'}}></div>
              <div className="w-4 h-16 bg-green-500 rounded animate-bounce" style={{animationDelay: '400ms', animationDuration: '0.6s'}}></div>
              <div className="w-4 h-20 bg-green-400 rounded animate-bounce" style={{animationDelay: '500ms', animationDuration: '0.5s'}}></div>
              <div className="w-4 h-12 bg-green-500 rounded animate-bounce" style={{animationDelay: '600ms', animationDuration: '0.7s'}}></div>
            </div>

            {interimText && (
              <div className="bg-yellow-100 border-2 border-yellow-500 rounded-lg p-3">
                <p className="text-lg font-semibold text-yellow-900">
                  👂 Hearing: "{interimText}"
                </p>
              </div>
            )}

            {!interimText && (
              <p className="text-lg text-gray-600 font-semibold">
                Listening... Speak LOUD and CLOSE to the microphone!
              </p>
            )}
          </div>
        )}

        {!isRecording && (
          <p className="text-gray-700 text-xl font-bold">
            {transcription ? '✅ Got it! Click mic to add more, or create story below' : '👆 Click the BIG microphone to start!'}
          </p>
        )}
      </div>

      {/* Transcription Display */}
      {(transcription || interimText) && (
        <div className="mt-6">
          <div className="bg-purple-50 p-6 rounded-xl border-4 border-purple-300">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-purple-900 text-xl">Your Story Ideas:</h3>
              <button
                onClick={clearTranscription}
                className="text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold"
              >
                <Trash2 className="w-5 h-5" />
                Clear
              </button>
            </div>
            <p className="text-gray-800 text-lg whitespace-pre-wrap">
              {transcription}
              {interimText && (
                <span className="text-gray-500 italic"> {interimText}</span>
              )}
            </p>
          </div>

          {/* Author Name Input */}
          <div className="mt-6 bg-blue-50 p-6 rounded-xl border-4 border-blue-300">
            <label htmlFor="authorName" className="block text-lg font-bold text-blue-900 mb-2">
              📝 Your Name (Story Author):
            </label>
            <input
              id="authorName"
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Enter your name here..."
              className="w-full px-4 py-3 border-2 border-blue-400 rounded-lg focus:border-blue-600 focus:outline-none text-gray-800 text-lg"
              maxLength={50}
            />
            <p className="text-sm text-gray-600 mt-2">This will appear as the author on your story book!</p>
          </div>

          <div className="flex justify-center mt-6">
            <button
              onClick={handleSubmit}
              className="px-10 py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full hover:from-green-600 hover:to-emerald-700 font-extrabold text-2xl flex items-center gap-3 transform hover:scale-105 transition-all shadow-2xl"
            >
              <Play className="w-8 h-8" />
              Create My Story!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
