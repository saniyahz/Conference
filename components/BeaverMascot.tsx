'use client'

interface BeaverMascotProps {
  greeting?: string
  isRecording?: boolean
  isProcessing?: boolean
  size?: 'small' | 'medium' | 'large'
}

export default function BeaverMascot({
  greeting = "Hi! Tell me your story idea!",
  isRecording = false,
  isProcessing = false,
  size = 'medium'
}: BeaverMascotProps) {
  const sizeClasses = {
    small: 'w-20 h-20',
    medium: 'w-32 h-32',
    large: 'w-40 h-40'
  }

  const svgSize = {
    small: { width: 80, height: 80 },
    medium: { width: 128, height: 128 },
    large: { width: 160, height: 160 }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Speech Bubble */}
      <div className="relative mb-2">
        <div className="bg-white border-3 border-teal-400 rounded-2xl px-4 py-2 shadow-lg relative">
          <p className="text-sm font-bold text-teal-700 whitespace-nowrap">
            {isProcessing ? "Hmm, let me think..." : isRecording ? "I'm listening!" : greeting}
          </p>
          {/* Speech bubble tail pointing down-left to beaver */}
          <div className="absolute -bottom-2 left-4">
            <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-teal-400"></div>
          </div>
        </div>
      </div>

      {/* Beaver SVG - Cute Side Character */}
      <div className={`${sizeClasses[size]} relative ${isRecording ? 'animate-bounce-slow' : ''}`}>
        <svg
          width={svgSize[size].width}
          height={svgSize[size].height}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-lg"
        >
          {/* Beaver Body */}
          <ellipse cx="50" cy="65" rx="30" ry="28" fill="#8B5A2B" />

          {/* Belly */}
          <ellipse cx="50" cy="68" rx="20" ry="18" fill="#D2A679" />

          {/* Beaver Head */}
          <circle cx="50" cy="35" r="25" fill="#8B5A2B" />

          {/* Face */}
          <ellipse cx="50" cy="40" rx="18" ry="16" fill="#D2A679" />

          {/* Left Ear */}
          <circle cx="30" cy="18" r="8" fill="#8B5A2B" />
          <circle cx="30" cy="18" r="5" fill="#D2A679" />

          {/* Right Ear */}
          <circle cx="70" cy="18" r="8" fill="#8B5A2B" />
          <circle cx="70" cy="18" r="5" fill="#D2A679" />

          {/* Left Eye */}
          <ellipse cx="42" cy="35" rx="6" ry="7" fill="white" />
          <circle cx="43" cy="36" r="4" fill="#2D1B0E" />
          <circle cx="44" cy="34" r="1.5" fill="white" />

          {/* Right Eye */}
          <ellipse cx="58" cy="35" rx="6" ry="7" fill="white" />
          <circle cx="57" cy="36" r="4" fill="#2D1B0E" />
          <circle cx="58" cy="34" r="1.5" fill="white" />

          {/* Nose */}
          <ellipse cx="50" cy="45" rx="6" ry="4" fill="#5D3A1A" />

          {/* Cheeks */}
          <ellipse cx="35" cy="42" rx="5" ry="3" fill="#E8A4A4" opacity="0.5" />
          <ellipse cx="65" cy="42" rx="5" ry="3" fill="#E8A4A4" opacity="0.5" />

          {/* Smile */}
          <path
            d="M 43 52 Q 50 58, 57 52"
            stroke="#5D3A1A"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Teeth */}
          <rect x="47" y="53" width="3" height="5" rx="1" fill="white" stroke="#DDD" strokeWidth="0.5" />
          <rect x="51" y="53" width="3" height="5" rx="1" fill="white" stroke="#DDD" strokeWidth="0.5" />

          {/* Tail */}
          <ellipse cx="50" cy="92" rx="15" ry="6" fill="#5D3A1A" />
        </svg>
      </div>

      {/* Name badge */}
      <div className="mt-1 bg-teal-500 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md">
        Benny
      </div>
    </div>
  )
}
