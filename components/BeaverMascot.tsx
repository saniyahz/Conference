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
    small: 'w-24 h-24',
    medium: 'w-36 h-36',
    large: 'w-44 h-44'
  }

  const svgSize = {
    small: { width: 96, height: 96 },
    medium: { width: 144, height: 144 },
    large: { width: 176, height: 176 }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Speech Bubble */}
      <div className="relative mb-2">
        <div className="bg-white border-2 border-teal-400 rounded-2xl px-4 py-2 shadow-lg relative">
          <p className="text-sm font-bold text-teal-700 whitespace-nowrap">
            {isProcessing ? "Hmm, let me think..." : isRecording ? "I'm listening!" : greeting}
          </p>
          {/* Speech bubble tail */}
          <div className="absolute -bottom-2 left-6">
            <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-teal-400"></div>
          </div>
        </div>
      </div>

      {/* Beaver SVG - Friendly character pointing right */}
      <div className={`${sizeClasses[size]} relative ${isRecording ? 'animate-gentle-sway' : 'animate-soft-breathe'}`}>
        <svg
          width={svgSize[size].width}
          height={svgSize[size].height}
          viewBox="0 0 120 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-lg"
        >
          {/* Beaver Body - slightly tilted for friendly pose */}
          <ellipse cx="45" cy="65" rx="28" ry="26" fill="#8B5A2B" />

          {/* Belly */}
          <ellipse cx="45" cy="68" rx="18" ry="16" fill="#D2A679" />

          {/* Beaver Head - tilted slightly */}
          <circle cx="45" cy="35" r="24" fill="#8B5A2B" />

          {/* Face */}
          <ellipse cx="45" cy="40" rx="17" ry="15" fill="#D2A679" />

          {/* Left Ear */}
          <circle cx="26" cy="18" r="7" fill="#8B5A2B" />
          <circle cx="26" cy="18" r="4" fill="#D2A679" />

          {/* Right Ear */}
          <circle cx="64" cy="18" r="7" fill="#8B5A2B" />
          <circle cx="64" cy="18" r="4" fill="#D2A679" />

          {/* Left Eye - friendly half-closed happy look */}
          <ellipse cx="38" cy="35" rx="5" ry="6" fill="white" />
          <circle cx="39" cy="36" r="3.5" fill="#2D1B0E" />
          <circle cx="40" cy="34" r="1.2" fill="white" />

          {/* Right Eye - looking towards mic */}
          <ellipse cx="52" cy="35" rx="5" ry="6" fill="white" />
          <circle cx="54" cy="36" r="3.5" fill="#2D1B0E" />
          <circle cx="55" cy="34" r="1.2" fill="white" />

          {/* Nose */}
          <ellipse cx="45" cy="44" rx="5" ry="3.5" fill="#5D3A1A" />

          {/* Rosy Cheeks - extra friendly */}
          <ellipse cx="32" cy="42" rx="4" ry="2.5" fill="#F5A9A9" opacity="0.6" />
          <ellipse cx="58" cy="42" rx="4" ry="2.5" fill="#F5A9A9" opacity="0.6" />

          {/* Big friendly smile */}
          <path
            d="M 38 50 Q 45 57, 52 50"
            stroke="#5D3A1A"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />

          {/* Cute buck teeth */}
          <rect x="42" y="51" width="3" height="4" rx="1" fill="white" stroke="#EEE" strokeWidth="0.5" />
          <rect x="46" y="51" width="3" height="4" rx="1" fill="white" stroke="#EEE" strokeWidth="0.5" />

          {/* Left Arm/Paw - resting */}
          <ellipse cx="22" cy="60" rx="8" ry="6" fill="#8B5A2B" />
          <ellipse cx="20" cy="62" rx="4" ry="3" fill="#D2A679" />

          {/* Right Arm/Paw - POINTING towards microphone! */}
          <g className={isRecording ? '' : 'animate-point-gesture'}>
            {/* Upper arm */}
            <ellipse cx="72" cy="52" rx="10" ry="7" fill="#8B5A2B" transform="rotate(-30 72 52)" />
            {/* Paw pointing right */}
            <ellipse cx="88" cy="45" rx="8" ry="6" fill="#8B5A2B" transform="rotate(-15 88 45)" />
            <ellipse cx="90" cy="46" rx="4" ry="3" fill="#D2A679" />
            {/* Pointing finger detail */}
            <ellipse cx="98" cy="44" rx="5" ry="3" fill="#8B5A2B" transform="rotate(-10 98 44)" />
          </g>

          {/* Tail */}
          <ellipse cx="20" cy="85" rx="14" ry="5" fill="#5D3A1A" transform="rotate(-15 20 85)" />

          {/* Little sparkle near pointing paw when not recording */}
          {!isRecording && (
            <g className="animate-twinkle">
              <circle cx="105" cy="40" r="2" fill="#FFD700" />
              <circle cx="108" cy="35" r="1.5" fill="#FFD700" />
              <circle cx="102" cy="33" r="1" fill="#FFD700" />
            </g>
          )}
        </svg>
      </div>

      {/* Name badge */}
      <div className="mt-1 bg-teal-500 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md">
        Benny
      </div>
    </div>
  )
}
