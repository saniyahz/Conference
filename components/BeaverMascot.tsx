'use client'

interface BeaverMascotProps {
  greeting?: string
  isRecording?: boolean
  isProcessing?: boolean
  size?: 'tiny' | 'small' | 'medium' | 'large'
}

export default function BeaverMascot({
  greeting = "Hi! Tell me your story idea!",
  isRecording = false,
  isProcessing = false,
  size = 'medium'
}: BeaverMascotProps) {
  const sizeClasses = {
    tiny: 'w-10 h-10',
    small: 'w-24 h-24',
    medium: 'w-36 h-36',
    large: 'w-44 h-44'
  }

  const svgSize = {
    tiny: { width: 40, height: 40 },
    small: { width: 96, height: 96 },
    medium: { width: 144, height: 144 },
    large: { width: 176, height: 176 }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Speech Bubble — hidden for tiny */}
      {size !== 'tiny' && (
        <div className="relative mb-2">
          <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] relative">
            <p className="text-sm font-semibold text-zinc-700 whitespace-nowrap">
              {isProcessing ? "Hmm, let me think..." : isRecording ? "I'm listening!" : greeting}
            </p>
            {/* Speech bubble tail */}
            <div className="absolute -bottom-2 left-6">
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-zinc-200"></div>
            </div>
          </div>
        </div>
      )}

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

          {/* Glasses - cute round frames */}
          <g>
            {/* Left lens frame */}
            <circle cx="38" cy="35" r="8" fill="none" stroke="#4A3728" strokeWidth="2" />
            {/* Right lens frame */}
            <circle cx="52" cy="35" r="8" fill="none" stroke="#4A3728" strokeWidth="2" />
            {/* Bridge connecting lenses */}
            <path d="M 46 35 L 44 35" stroke="#4A3728" strokeWidth="2" strokeLinecap="round" />
            {/* Left temple arm */}
            <path d="M 30 35 L 24 30" stroke="#4A3728" strokeWidth="2" strokeLinecap="round" />
            {/* Right temple arm */}
            <path d="M 60 35 L 66 30" stroke="#4A3728" strokeWidth="2" strokeLinecap="round" />
            {/* Lens shine effect - left */}
            <ellipse cx="35" cy="33" rx="2" ry="1" fill="white" opacity="0.4" />
            {/* Lens shine effect - right */}
            <ellipse cx="49" cy="33" rx="2" ry="1" fill="white" opacity="0.4" />
          </g>

          {/* Left Eye - friendly look behind glasses */}
          <ellipse cx="38" cy="35" rx="5" ry="6" fill="white" />
          <circle cx="39" cy="36" r="3.5" fill="#2D1B0E" />
          <circle cx="40" cy="34" r="1.2" fill="white" />

          {/* Right Eye - looking towards mic behind glasses */}
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

          {/* Right Arm/Paw - holding cricket bat */}
          <g className={isRecording ? '' : 'animate-point-gesture'}>
            {/* Upper arm */}
            <ellipse cx="68" cy="55" rx="9" ry="6" fill="#8B5A2B" transform="rotate(-20 68 55)" />
            {/* Paw gripping bat */}
            <ellipse cx="78" cy="50" rx="7" ry="5" fill="#8B5A2B" transform="rotate(-25 78 50)" />
            <ellipse cx="79" cy="51" rx="3.5" ry="2.5" fill="#D2A679" />

            {/* Cricket Bat */}
            <g transform="rotate(-25 78 50)">
              {/* Bat handle - wrapped grip */}
              <rect x="75" y="35" width="4" height="18" rx="1" fill="#3D2817" />
              {/* Handle grip wrapping */}
              <rect x="75" y="37" width="4" height="2" fill="#5D4A3A" />
              <rect x="75" y="41" width="4" height="2" fill="#5D4A3A" />
              <rect x="75" y="45" width="4" height="2" fill="#5D4A3A" />
              <rect x="75" y="49" width="4" height="2" fill="#5D4A3A" />

              {/* Bat blade - willow wood color */}
              <rect x="73" y="15" width="8" height="22" rx="2" fill="#E8DCC8" />
              {/* Bat blade detail - wood grain */}
              <line x1="75" y1="17" x2="75" y2="35" stroke="#D4C4A8" strokeWidth="0.5" />
              <line x1="77" y1="17" x2="77" y2="35" stroke="#D4C4A8" strokeWidth="0.5" />
              <line x1="79" y1="17" x2="79" y2="35" stroke="#D4C4A8" strokeWidth="0.5" />
              {/* Bat toe (bottom edge) */}
              <rect x="73" y="15" width="8" height="3" rx="1" fill="#D4C4A8" />
              {/* Red ball mark on bat */}
              <circle cx="77" cy="22" r="2" fill="#CC4444" opacity="0.3" />
            </g>
          </g>

          {/* Tail */}
          <ellipse cx="20" cy="85" rx="14" ry="5" fill="#5D3A1A" transform="rotate(-15 20 85)" />

          {/* Little sparkle near cricket bat when not recording */}
          {!isRecording && (
            <g className="animate-twinkle">
              <circle cx="95" cy="8" r="2" fill="#FFD700" />
              <circle cx="100" cy="12" r="1.5" fill="#FFD700" />
              <circle cx="92" cy="15" r="1" fill="#FFD700" />
            </g>
          )}
        </svg>
      </div>

      {/* Name badge — hidden for tiny */}
      {size !== 'tiny' && (
        <div className="mt-1 bg-emerald-600 text-white px-3 py-0.5 rounded-full font-bold text-xs shadow-md">
          Little Bear
        </div>
      )}
    </div>
  )
}
