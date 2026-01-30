'use client'

import { Mic, Square, Loader2 } from 'lucide-react'

interface BeaverMascotProps {
  isRecording?: boolean
  isProcessing?: boolean
  audioLevel?: number
  onMicClick?: () => void
  greeting?: string
  disabled?: boolean
}

export default function BeaverMascot({
  isRecording = false,
  isProcessing = false,
  audioLevel = 0,
  onMicClick,
  greeting = "Hi! Tell me your story idea!",
  disabled = false
}: BeaverMascotProps) {
  // Calculate bounce animation based on audio level
  const bounceAmount = isRecording ? Math.min(audioLevel / 10, 5) : 0

  return (
    <div className="relative flex flex-col items-center">
      {/* Speech Bubble */}
      <div className="relative mb-4 animate-bounce-slow">
        <div className="bg-white border-4 border-amber-400 rounded-2xl px-6 py-3 shadow-lg relative">
          <p className="text-lg font-bold text-amber-800 whitespace-nowrap">
            {isProcessing ? "Hmm, let me think..." : isRecording ? "I'm listening! Keep going!" : greeting}
          </p>
          {/* Speech bubble tail */}
          <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
            <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[16px] border-l-transparent border-r-transparent border-t-amber-400"></div>
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent border-t-white"></div>
          </div>
        </div>
      </div>

      {/* Beaver SVG */}
      <div
        className="relative transition-transform duration-100"
        style={{ transform: `translateY(${-bounceAmount}px)` }}
      >
        <svg
          width="280"
          height="320"
          viewBox="0 0 280 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-xl"
        >
          {/* Beaver Body */}
          <ellipse cx="140" cy="220" rx="100" ry="90" fill="#8B5A2B" />

          {/* Belly (lighter brown) */}
          <ellipse cx="140" cy="230" rx="70" ry="65" fill="#D2A679" />

          {/* Beaver Head */}
          <circle cx="140" cy="100" r="75" fill="#8B5A2B" />

          {/* Face (lighter area) */}
          <ellipse cx="140" cy="115" rx="55" ry="50" fill="#D2A679" />

          {/* Left Ear */}
          <circle cx="75" cy="50" r="20" fill="#8B5A2B" />
          <circle cx="75" cy="50" r="12" fill="#D2A679" />

          {/* Right Ear */}
          <circle cx="205" cy="50" r="20" fill="#8B5A2B" />
          <circle cx="205" cy="50" r="12" fill="#D2A679" />

          {/* Left Eye */}
          <ellipse cx="110" cy="90" rx="18" ry="22" fill="white" />
          <circle cx="113" cy="93" r="12" fill="#2D1B0E" />
          <circle cx="117" cy="88" r="4" fill="white" />

          {/* Right Eye */}
          <ellipse cx="170" cy="90" rx="18" ry="22" fill="white" />
          <circle cx="167" cy="93" r="12" fill="#2D1B0E" />
          <circle cx="171" cy="88" r="4" fill="white" />

          {/* Nose */}
          <ellipse cx="140" cy="125" rx="18" ry="14" fill="#5D3A1A" />
          <ellipse cx="140" cy="122" rx="8" ry="5" fill="#7D5A3A" />

          {/* Cheeks (rosy) */}
          <ellipse cx="85" cy="115" rx="15" ry="10" fill="#E8A4A4" opacity="0.6" />
          <ellipse cx="195" cy="115" rx="15" ry="10" fill="#E8A4A4" opacity="0.6" />

          {/* Mouth - Smiling */}
          <path
            d="M 115 145 Q 140 165, 165 145"
            stroke="#5D3A1A"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />

          {/* Beaver Teeth */}
          <rect x="130" y="148" width="10" height="15" rx="2" fill="white" stroke="#DDD" strokeWidth="1" />
          <rect x="141" y="148" width="10" height="15" rx="2" fill="white" stroke="#DDD" strokeWidth="1" />

          {/* Left Arm */}
          <ellipse cx="55" cy="200" rx="25" ry="35" fill="#8B5A2B" transform="rotate(-20 55 200)" />

          {/* Right Arm */}
          <ellipse cx="225" cy="200" rx="25" ry="35" fill="#8B5A2B" transform="rotate(20 225 200)" />

          {/* Left Foot */}
          <ellipse cx="90" cy="305" rx="30" ry="15" fill="#5D3A1A" />

          {/* Right Foot */}
          <ellipse cx="190" cy="305" rx="30" ry="15" fill="#5D3A1A" />

          {/* Tail (flat beaver tail) */}
          <ellipse cx="140" cy="300" rx="40" ry="20" fill="#5D3A1A" />
          <line x1="110" y1="300" x2="170" y2="300" stroke="#4A2A0A" strokeWidth="2" />
          <line x1="100" y1="295" x2="180" y2="295" stroke="#4A2A0A" strokeWidth="1" />
          <line x1="100" y1="305" x2="180" y2="305" stroke="#4A2A0A" strokeWidth="1" />
        </svg>

        {/* Microphone Button on Tummy - Positioned over the belly */}
        <button
          onClick={onMicClick}
          disabled={disabled}
          className={`absolute left-1/2 top-[58%] transform -translate-x-1/2 -translate-y-1/2
            p-5 rounded-full transition-all shadow-lg border-4 border-white
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse scale-110'
              : isProcessing
                ? 'bg-yellow-500 cursor-wait'
                : disabled
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 hover:scale-110'
            }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          ) : isRecording ? (
            <Square className="w-10 h-10 text-white" />
          ) : (
            <Mic className="w-10 h-10 text-white" />
          )}
        </button>

        {/* Recording ring animation */}
        {isRecording && (
          <>
            <div className="absolute left-1/2 top-[58%] transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-4 border-red-400 animate-ping opacity-75" />
            <div className="absolute left-1/2 top-[58%] transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-red-300 animate-pulse opacity-50" />
          </>
        )}
      </div>

      {/* Beaver name badge */}
      <div className="mt-2 bg-amber-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-md">
        Benny the Story Beaver
      </div>
    </div>
  )
}
