'use client'

import { useState, useEffect } from 'react'
import { Loader2, Sparkles, BookOpen, Palette, Clock } from 'lucide-react'

interface LoadingSpinnerProps {
  message?: string
  stage?: 'story' | 'images'
}

const FUN_FACTS = [
  "Did you know? Beavers can hold their breath for 15 minutes! 🦫",
  "Fun fact: A group of flamingos is called a 'flamboyance'! 🦩",
  "Amazing: Octopuses have three hearts! 🐙",
  "Cool: Butterflies taste with their feet! 🦋",
  "Wow: Elephants are the only animals that can't jump! 🐘",
  "Neat: A snail can sleep for three years! 🐌",
  "Awesome: Dolphins sleep with one eye open! 🐬",
  "Wild: Koalas sleep up to 22 hours a day! 🐨",
]

export default function LoadingSpinner({ message = 'Loading...', stage = 'story' }: LoadingSpinnerProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [funFact, setFunFact] = useState('')

  useEffect(() => {
    // Pick a random fun fact
    setFunFact(FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)])

    // Start timer
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Change fun fact every 15 seconds
  useEffect(() => {
    if (elapsedTime > 0 && elapsedTime % 15 === 0) {
      setFunFact(FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)])
    }
  }, [elapsedTime])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Estimated times
  const estimatedTime = stage === 'story' ? '15-30 seconds' : '1-2 minutes'
  const stageIcon = stage === 'story' ? <BookOpen className="w-6 h-6" /> : <Palette className="w-6 h-6" />

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Main spinner */}
      <div className="relative">
        <Loader2 className="w-24 h-24 text-purple-600 animate-spin" />
        <Sparkles className="w-10 h-10 text-pink-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Message */}
      <p className="mt-6 text-2xl font-bold text-purple-800 animate-pulse text-center">
        {message}
      </p>

      {/* Progress indicator */}
      <div className="mt-6 bg-white rounded-xl p-4 shadow-lg border-2 border-purple-200 max-w-md w-full">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-purple-700">
            {stageIcon}
            <span className="font-medium">
              {stage === 'story' ? 'Writing your story...' : 'Creating illustrations...'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-4 h-4" />
            <span>{formatTime(elapsedTime)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-purple-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
            style={{
              width: stage === 'story'
                ? `${Math.min(elapsedTime * 4, 95)}%`
                : `${Math.min(elapsedTime * 1.5, 95)}%`
            }}
          />
        </div>

        {/* Time estimate */}
        <p className="mt-2 text-xs text-gray-500 text-center">
          ⏱️ Estimated time: {estimatedTime}
        </p>
      </div>

      {/* Bouncing dots */}
      <div className="mt-6 flex gap-2">
        <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
        <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
      </div>

      {/* Fun fact */}
      <div className="mt-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 max-w-md">
        <p className="text-amber-800 text-center font-medium">
          🌟 While you wait...
        </p>
        <p className="text-amber-700 text-center mt-1 text-sm">
          {funFact}
        </p>
      </div>
    </div>
  )
}
