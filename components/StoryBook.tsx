'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, RotateCcw, Loader2, Volume2, VolumeX, PlayCircle, PauseCircle, Film } from 'lucide-react'
import { Story } from '@/app/page'
import { generateMovie } from '@/lib/movieGenerator'
// NOTE: Using plain <img> instead of next/image to avoid fill-mode re-render bugs
// where pages 2-10 images fail to display despite valid URLs

interface StoryBookProps {
  story: Story
  onReset: () => void
  characterBible?: any
  sceneCards?: any[]
  storyMode?: string
}

// Real AI Voice options using OpenAI TTS
const VOICE_OPTIONS = [
  { id: 'mama_beaver', name: 'Mama Beaver', description: 'Warm & nurturing' },
  { id: 'papa_beaver', name: 'Papa Beaver', description: 'Deep & comforting' },
  { id: 'storyteller', name: 'Storyteller', description: 'British & expressive' },
  { id: 'friendly', name: 'Friendly Guide', description: 'Soft & gentle' },
]

// ── Page-flip sound synthesiser (Web Audio API) ─────────────────────
// A soft, realistic paper page-turn — the satisfying, gentle sound of
// flipping a real storybook page. Think ASMR paper sounds, not a whoosh.
//
// Four delicate layers:
//   1. Paper crinkle — very quiet high-frequency texture (paper fibers bending)
//   2. Soft brush — mid-frequency sweep as the page glides through air
//   3. Page release — tiny "fft" as the page separates from the stack
//   4. Landing pat — the barely-audible thud of paper settling on paper
//
// Total duration ~350ms. Extremely quiet — the kind of sound you hear
// in a silent library. Designed to be addictive and satisfying.
function playPageFlipSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime
    const totalDur = 0.35  // 350ms — natural page flip speed

    // Master gain — overall volume very low for that intimate ASMR quality
    const master = ctx.createGain()
    master.gain.value = 0.18
    master.connect(ctx.destination)

    // ── Layer 1: Paper crinkle — delicate high-frequency texture ──
    // Very short bursts of filtered noise that sound like paper fibers
    // crinkling as the page bends. Narrow bandpass at 4-7kHz range.
    const crinkleDur = 0.25
    const crinkleSamples = Math.floor(ctx.sampleRate * crinkleDur)
    const crinkleBuf = ctx.createBuffer(1, crinkleSamples, ctx.sampleRate)
    const crinkleData = crinkleBuf.getChannelData(0)
    for (let i = 0; i < crinkleSamples; i++) {
      const t = i / crinkleSamples
      // Irregular, papery envelope — multiple small peaks like paper crackling
      const env = Math.sin(Math.PI * t) *
        (0.3 + 0.7 * Math.abs(Math.sin(t * 47))) * // Irregular amplitude
        (1 - t * 0.5) // Gentle fade
      crinkleData[i] = (Math.random() * 2 - 1) * env
    }
    const crinkleSource = ctx.createBufferSource()
    crinkleSource.buffer = crinkleBuf
    // Narrow bandpass at paper-crinkle frequencies
    const crinkleBP = ctx.createBiquadFilter()
    crinkleBP.type = 'bandpass'
    crinkleBP.frequency.setValueAtTime(4500, now)
    crinkleBP.frequency.linearRampToValueAtTime(6500, now + crinkleDur * 0.4)
    crinkleBP.frequency.linearRampToValueAtTime(5000, now + crinkleDur)
    crinkleBP.Q.value = 1.2  // Narrow band for that papery quality
    const crinkleGain = ctx.createGain()
    crinkleGain.gain.value = 0.06  // Very delicate
    crinkleSource.connect(crinkleBP)
    crinkleBP.connect(crinkleGain)
    crinkleGain.connect(master)

    // ── Layer 2: Soft brush — the page gliding through air ──
    // Unlike a whoosh, this is extremely gentle and low-energy. Think of the
    // lightest possible air movement — barely perceptible, just enough to
    // register as "something moved". Very low frequency, very quiet.
    const brushDur = 0.28
    const brushSamples = Math.floor(ctx.sampleRate * brushDur)
    const brushBuf = ctx.createBuffer(1, brushSamples, ctx.sampleRate)
    const brushData = brushBuf.getChannelData(0)
    for (let i = 0; i < brushSamples; i++) {
      const t = i / brushSamples
      // Asymmetric envelope — slow rise, faster fall (page accelerates then lands)
      const rise = Math.pow(t, 2) // Slow start
      const fall = Math.pow(1 - t, 1.5) // Gentle end
      const env = rise * fall * 4 // Peaks around t=0.45
      brushData[i] = (Math.random() * 2 - 1) * env
    }
    const brushSource = ctx.createBufferSource()
    brushSource.buffer = brushBuf
    const brushLP = ctx.createBiquadFilter()
    brushLP.type = 'lowpass'
    brushLP.frequency.value = 1200  // Very low — no high-frequency "air" sound
    brushLP.Q.value = 0.3
    const brushGain = ctx.createGain()
    brushGain.gain.value = 0.05  // Barely there
    brushSource.connect(brushLP)
    brushLP.connect(brushGain)
    brushGain.connect(master)

    // ── Layer 3: Page release — the tiny "fft" as page separates ──
    // A very short, crisp sound at the start — like a finger releasing
    // the corner of a page. Highpass filtered for that sharp, tiny quality.
    const releaseDur = 0.06
    const releaseSamples = Math.floor(ctx.sampleRate * releaseDur)
    const releaseBuf = ctx.createBuffer(1, releaseSamples, ctx.sampleRate)
    const releaseData = releaseBuf.getChannelData(0)
    for (let i = 0; i < releaseSamples; i++) {
      const t = i / releaseSamples
      // Very fast decay — the snap of release
      const env = Math.exp(-12 * t)
      releaseData[i] = (Math.random() * 2 - 1) * env
    }
    const releaseSource = ctx.createBufferSource()
    releaseSource.buffer = releaseBuf
    const releaseHP = ctx.createBiquadFilter()
    releaseHP.type = 'highpass'
    releaseHP.frequency.value = 2000  // Only the crisp part
    releaseHP.Q.value = 0.5
    const releaseGain = ctx.createGain()
    releaseGain.gain.value = 0.08
    releaseSource.connect(releaseHP)
    releaseHP.connect(releaseGain)
    releaseGain.connect(master)

    // ── Layer 4: Landing pat — paper touching paper ──
    // Extremely short, muffled, low-frequency thump. Like dropping a
    // single sheet of paper onto a stack. Almost felt more than heard.
    const patDur = 0.05
    const patSamples = Math.floor(ctx.sampleRate * patDur)
    const patBuf = ctx.createBuffer(1, patSamples, ctx.sampleRate)
    const patData = patBuf.getChannelData(0)
    for (let i = 0; i < patSamples; i++) {
      const t = i / patSamples
      // Very fast decay with slight sine wave for body
      const env = Math.exp(-15 * t)
      patData[i] = (Math.random() * 0.5 + Math.sin(t * Math.PI * 180) * 0.5) * env
    }
    const patSource = ctx.createBufferSource()
    patSource.buffer = patBuf
    const patLP = ctx.createBiquadFilter()
    patLP.type = 'lowpass'
    patLP.frequency.value = 600  // Very muffled — paper on paper
    patLP.Q.value = 0.5
    const patGain = ctx.createGain()
    patGain.gain.value = 0.10
    patSource.connect(patLP)
    patLP.connect(patGain)
    patGain.connect(master)

    // ── Play timing — mimics real page-turn physics ──
    // Release happens first (finger lets go), then crinkle + brush together
    // as the page arcs through, then the landing pat at the end.
    releaseSource.start(now)                          // t=0: finger releases page
    crinkleSource.start(now + 0.03)                   // t=30ms: paper starts bending
    brushSource.start(now + 0.04)                     // t=40ms: page glides through air
    patSource.start(now + totalDur - patDur - 0.01)   // t=~290ms: page lands softly

    // Clean up after everything finishes
    crinkleSource.onended = () => {
      setTimeout(() => ctx.close(), 200)
    }
  } catch {
    // Silently ignore – e.g. if AudioContext is unavailable
  }
}

export default function StoryBook({ story, onReset, characterBible, sceneCards, storyMode }: StoryBookProps) {
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(0)
  const [isReading, setIsReading] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0])
  const [autoPlayMode, setAutoPlayMode] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())
  const [failedVideos, setFailedVideos] = useState<Set<number>>(new Set())
  const [isGeneratingMovie, setIsGeneratingMovie] = useState(false)
  const [movieProgress, setMovieProgress] = useState(0)
  const [movieProgressLabel, setMovieProgressLabel] = useState('')
  const [localMovieUrl, setLocalMovieUrl] = useState<string | null>(null)

  // ── Page-flip animation state ──
  // 'forward' | 'backward' | null — drives the CSS class applied to the page container
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward' | null>(null)
  // While the exit animation is playing we keep the *previous* page visible
  const [displayedPage, setDisplayedPage] = useState(0)
  // Is the flip animation currently running?
  const [isFlipping, setIsFlipping] = useState(false)
  // Track whether we are showing the outgoing or incoming half of the animation
  const [flipPhase, setFlipPhase] = useState<'out' | 'in' | null>(null)

  // ── Touch / swipe refs ──
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const bookContainerRef = useRef<HTMLDivElement | null>(null)

  const imageRetryCount = useRef<Map<number, number>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlayRef = useRef(false)
  const currentPageRef = useRef(0)
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const preloadingRef = useRef<Set<string>>(new Set())
  const imageLoadedRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => {
    autoPlayRef.current = autoPlayMode
  }, [autoPlayMode])

  useEffect(() => {
    currentPageRef.current = currentPage
    // Reset image loaded state when page changes
    setImageLoaded(false)
    imageLoadedRef.current = false
  }, [currentPage])

  // Stop reading when page changes manually (but not during auto-play)
  useEffect(() => {
    if (!autoPlayRef.current) {
      stopReading()
    }
  }, [currentPage])

  // Auto-start reading when image is loaded during auto-play
  // This is the KEY sync fix: narration only starts AFTER the image is visible
  useEffect(() => {
    if (autoPlayMode && imageLoaded && !isReading && !isGeneratingVoice && currentPage < story.pages.length) {
      const timer = setTimeout(() => {
        if (autoPlayRef.current) {
          readAloud()
        }
      }, 300) // Small delay after image appears, then start narrating
      return () => clearTimeout(timer)
    }
  }, [currentPage, autoPlayMode, imageLoaded])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReading()
      setAutoPlayMode(false)
    }
  }, [])

  // Keep displayedPage in sync when page changes without animation (e.g. auto-play from readAloud)
  useEffect(() => {
    if (!isFlipping) {
      setDisplayedPage(currentPage)
    }
  }, [currentPage, isFlipping])

  // Compute the CSS animation class for the page container
  const flipAnimationClass = (() => {
    if (!flipDirection || !flipPhase) return ''
    if (flipDirection === 'forward' && flipPhase === 'out') return 'page-flip-forward'
    if (flipDirection === 'forward' && flipPhase === 'in') return 'page-flip-forward-in'
    if (flipDirection === 'backward' && flipPhase === 'out') return 'page-flip-backward'
    if (flipDirection === 'backward' && flipPhase === 'in') return 'page-flip-backward-in'
    return ''
  })()

  // Pre-load ALL images when story loads (staggered to avoid CDN throttling)
  useEffect(() => {
    story.pages.forEach((page, i) => {
      if (page.imageUrl) {
        setTimeout(() => {
          const img = new Image()
          img.src = page.imageUrl!
        }, i * 300)
      }
    })
  }, [story.pages])

  // Pre-load videos when story has videoUrls (for backward compat with pre-generated videos)
  useEffect(() => {
    story.pages.forEach((page, i) => {
      if (page.videoUrl) {
        setTimeout(() => {
          const video = document.createElement('video')
          video.preload = 'auto'
          video.src = page.videoUrl!
        }, i * 500)
      }
    })
  }, [story.pages])

  // Pre-load ALL audio pages when story loads
  useEffect(() => {
    if (story.pages.length > 0) {
      const preloadAllPages = async () => {
        for (let i = 0; i < story.pages.length; i++) {
          setTimeout(() => {
            preloadAudio(i, selectedVoice.id)
          }, i * 500)
        }
      }
      preloadAllPages()
    }
  }, [story.pages.length, selectedVoice.id])

  // Pre-load audio for a specific page
  const preloadAudio = async (pageIndex: number, voiceId: string) => {
    const cacheKey = `${pageIndex}-${voiceId}`

    if (audioCacheRef.current.has(cacheKey) || preloadingRef.current.has(cacheKey)) {
      return
    }

    const text = story.pages[pageIndex]?.text
    if (!text || text.trim().length === 0) return

    preloadingRef.current.add(cacheKey)

    try {
      const response = await fetch('/api/generate-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceId, storyMode, language: story.language || 'en' }),
      })

      if (response.ok) {
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        audioCacheRef.current.set(cacheKey, audioUrl)
      }
    } catch (error) {
      console.error('Preload error:', error)
    } finally {
      preloadingRef.current.delete(cacheKey)
    }
  }

  // Pre-load next few pages when auto-play starts
  const preloadUpcomingPages = (startPage: number, voiceId: string) => {
    for (let i = 1; i <= 2; i++) {
      const nextPage = startPage + i
      if (nextPage < story.pages.length) {
        preloadAudio(nextPage, voiceId)
      }
    }
  }

  // Cleanup audio cache on unmount or voice change
  useEffect(() => {
    return () => {
      audioCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      audioCacheRef.current.clear()
    }
  }, [])

  // Clear cache when voice changes
  useEffect(() => {
    audioCacheRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    audioCacheRef.current.clear()
  }, [selectedVoice])

  const readAloud = async () => {
    // If already reading, stop
    if (isReading) {
      stopReading()
      setAutoPlayMode(false)
      return
    }

    const text = story.pages[currentPage].text
    if (!text || text.trim().length === 0) {
      if (autoPlayRef.current && currentPage < story.pages.length - 1) {
        setCurrentPage(prev => prev + 1)
      }
      return
    }

    const cacheKey = `${currentPage}-${selectedVoice.id}`
    let audioUrl = audioCacheRef.current.get(cacheKey)

    // If not cached, generate it
    if (!audioUrl) {
      setIsGeneratingVoice(true)

      try {
        const response = await fetch('/api/generate-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            voice: selectedVoice.id,
            storyMode,
            language: story.language || 'en',
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to generate voice')
        }

        const audioBlob = await response.blob()
        audioUrl = URL.createObjectURL(audioBlob)
        audioCacheRef.current.set(cacheKey, audioUrl)
      } catch (error) {
        console.error('TTS error:', error)
        setIsGeneratingVoice(false)
        setIsReading(false)
        setAutoPlayMode(false)
        alert('Failed to generate voice. Please try again.')
        return
      }
    }

    // Start preloading next pages
    preloadUpcomingPages(currentPage, selectedVoice.id)

    // Play the audio
    const audio = new Audio(audioUrl)
    audio.playbackRate = 1.0 // Normal playback speed
    audioRef.current = audio

    audio.onplay = () => {
      setIsReading(true)
      setIsGeneratingVoice(false)
    }

    audio.onended = () => {
      setIsReading(false)

      const pageNow = currentPageRef.current
      if (autoPlayRef.current && pageNow < story.pages.length - 1) {
        setTimeout(() => {
          if (autoPlayRef.current) {
            // Trigger animated page flip (with sound) during auto-play too
            const nextIdx = pageNow + 1
            playPageFlipSound()
            setIsFlipping(true)
            setFlipDirection('forward')
            setFlipPhase('out')
            setDisplayedPage(pageNow)
            setTimeout(() => {
              setDisplayedPage(nextIdx)
              setCurrentPage(nextIdx)
              setFlipPhase('in')
              setTimeout(() => {
                setFlipDirection(null)
                setFlipPhase(null)
                setIsFlipping(false)
              }, 420)
            }, 420)
          }
        }, 2000) // 2s pause between pages — time to absorb the illustration
      } else if (autoPlayRef.current && pageNow === story.pages.length - 1) {
        setAutoPlayMode(false)
      }
    }

    audio.onerror = () => {
      setIsReading(false)
      setIsGeneratingVoice(false)
      setAutoPlayMode(false)
    }

    try {
      await audio.play()
    } catch (error) {
      console.error('Audio play error:', error)
      setIsGeneratingVoice(false)
      setIsReading(false)
      setAutoPlayMode(false)
    }
  }

  const startAutoPlay = () => {
    const startPage = currentPage === story.pages.length - 1 ? 0 : currentPage
    preloadAudio(startPage, selectedVoice.id)
    preloadUpcomingPages(startPage, selectedVoice.id)

    setAutoPlayMode(true)
    if (currentPage === story.pages.length - 1) {
      setCurrentPage(0)
    }
  }

  const stopAutoPlay = () => {
    setAutoPlayMode(false)
    stopReading()
  }

  const stopReading = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsReading(false)
    setIsGeneratingVoice(false)
  }

  // ── Animated page turn ──────────────────────────────────────────────
  // The FLIP_HALF_DURATION must match the CSS animation duration (0.8s = 800ms).
  // We split it into two halves: first the "out" animation on the old page,
  // then swap to the new page and play the "in" animation.
  const FLIP_HALF_DURATION = 420 // ms – slightly > half of 800ms to overlap

  const animatePageTurn = useCallback(
    (direction: 'forward' | 'backward', newPage: number) => {
      if (isFlipping) return
      setIsFlipping(true)

      // Play sound
      playPageFlipSound()

      // Phase 1 — outgoing page flips away
      setFlipDirection(direction)
      setFlipPhase('out')
      setDisplayedPage(currentPage) // keep showing old page during exit

      setTimeout(() => {
        // Phase 2 — swap to new page and play the incoming animation
        setDisplayedPage(newPage)
        setCurrentPage(newPage)
        setFlipPhase('in')

        setTimeout(() => {
          // Animation complete — clean up
          setFlipDirection(null)
          setFlipPhase(null)
          setIsFlipping(false)
        }, FLIP_HALF_DURATION)
      }, FLIP_HALF_DURATION)
    },
    [currentPage, isFlipping],
  )

  const nextPage = useCallback(() => {
    if (currentPage < story.pages.length - 1 && !isFlipping) {
      animatePageTurn('forward', currentPage + 1)
    }
  }, [currentPage, story.pages.length, isFlipping, animatePageTurn])

  const previousPage = useCallback(() => {
    if (currentPage > 0 && !isFlipping) {
      animatePageTurn('backward', currentPage - 1)
    }
  }, [currentPage, isFlipping, animatePageTurn])

  // ── Touch / swipe gesture handlers ────────────────────────────────
  const SWIPE_THRESHOLD = 50 // minimum horizontal px to count as a swipe

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartX.current
      const deltaY = touch.clientY - touchStartY.current

      // Only count as swipe if horizontal movement dominates vertical
      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          // Swiped left → next page
          nextPage()
        } else {
          // Swiped right → previous page
          previousPage()
        }
      }

      touchStartX.current = null
      touchStartY.current = null
    },
    [nextPage, previousPage],
  )

  const handleGenerateMovie = async () => {
    if (isGeneratingMovie) return
    setIsGeneratingMovie(true)
    setMovieProgress(0)
    setMovieProgressLabel('Starting...')

    try {
      const url = await generateMovie({
        pages: story.pages.map(p => ({ text: p.text, imageUrl: p.imageUrl, videoUrl: p.videoUrl })),
        title: story.title,
        author: story.author || 'Young Author',
        voice: selectedVoice.id,
        sceneCards,
        onProgress: (pct, label) => {
          setMovieProgress(pct)
          setMovieProgressLabel(label)
        },
      })
      setLocalMovieUrl(url)
    } catch (error: any) {
      console.error('Movie generation failed:', error)
      const msg = error?.message || 'Unknown error'
      alert(`Movie generation failed: ${msg}\n\nYour story and illustrations are safe. You can try generating the movie again.`)
    } finally {
      setIsGeneratingMovie(false)
    }
  }

  const downloadMovie = () => {
    if (!localMovieUrl) return
    const a = document.createElement('a')
    a.href = localMovieUrl
    a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_movie.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const downloadPDF = async () => {
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, characterBible, sceneCards, storyMode }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Voice Selector & Auto-Play */}
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl p-4 border border-amber-200/50" style={{ backgroundColor: '#FAF3E0' }}>
        <label className="font-medium text-amber-900/70">Choose Narrator:</label>
        <select
          value={selectedVoice.id}
          onChange={(e) => {
            const voice = VOICE_OPTIONS.find(v => v.id === e.target.value)
            if (voice) setSelectedVoice(voice)
          }}
          disabled={autoPlayMode}
          className="px-4 py-2 rounded-xl border border-amber-200 bg-white text-amber-900 font-medium focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none disabled:opacity-50"
        >
          {VOICE_OPTIONS.map(voice => (
            <option key={voice.id} value={voice.id}>{voice.name}</option>
          ))}
        </select>
        <span className="text-xs text-amber-600/60 italic">{selectedVoice.description}</span>

        {/* Auto-Play Button */}
        <button
          onClick={autoPlayMode ? stopAutoPlay : startAutoPlay}
          disabled={isGeneratingVoice}
          className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 active:scale-[0.98] ${
            autoPlayMode
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {autoPlayMode ? (
            <>
              <PauseCircle className="w-5 h-5" />
              Stop Auto-Play
            </>
          ) : (
            <>
              <PlayCircle className="w-5 h-5" />
              Auto-Play Story
            </>
          )}
        </button>
      </div>

      {/* Auto-Play indicator */}
      {autoPlayMode && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center animate-pulse">
          <p className="text-emerald-700 font-medium">
            Auto-playing story... Pages will turn automatically!
          </p>
        </div>
      )}

      {/* Title */}
      <div className="text-center border-b border-amber-200/50 pb-4">
        <h1
          className={`font-bold text-amber-950 ${
            ['ur', 'ar', 'fa'].includes(story.language || '')
              ? 'text-4xl md:text-5xl leading-[1.8]'
              : 'text-3xl md:text-4xl tracking-tight'
          }`}
          dir={['ur', 'ar', 'fa'].includes(story.language || '') ? 'rtl' : 'ltr'}
        >
          {story.title}
        </h1>
        <div className="mt-3 space-y-1">
          <p className="text-lg text-amber-800/60 font-medium">
            Written by: {story.author || 'Young Author'}
          </p>
        </div>
      </div>

      {/* Book Pages — perspective wrapper enables 3D flip animation */}
      <div
        ref={bookContainerRef}
        className="relative rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] overflow-hidden border border-amber-200/60 book-perspective"
        style={{ minHeight: '600px', backgroundColor: '#FDF6E3' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Page Number */}
        <div className="absolute top-4 right-4 bg-amber-900/80 text-amber-50 px-4 py-2 rounded-full font-medium z-10 text-sm">
          {currentPage + 1}/{story.pages.length}
        </div>

        {/* Side-by-side Page Content — animated via flipAnimationClass */}
        <div
          key={`page-content-${displayedPage}-${flipPhase}`}
          className={`grid md:grid-cols-2 h-full ${flipAnimationClass}`}
        >
          {/* Left Side - Illustration */}
          <div className="relative min-h-[400px] md:min-h-[600px] bg-amber-50/50">
            {story.pages[displayedPage].videoUrl && !failedVideos.has(displayedPage) ? (
              /* Living Picture: looping video (if pre-generated — backward compat) */
              <video
                key={`video-${displayedPage}`}
                src={story.pages[displayedPage].videoUrl}
                autoPlay
                loop
                muted
                playsInline
                poster={story.pages[displayedPage].imageUrl}
                className="absolute inset-0 w-full h-full object-cover"
                onLoadedData={() => {
                  setImageLoaded(true)
                  imageLoadedRef.current = true
                }}
                onError={() => {
                  console.warn(`[StoryBook] Video failed for page ${displayedPage + 1}, falling back to static image`)
                  setFailedVideos(prev => new Set(prev).add(displayedPage))
                }}
              />
            ) : story.pages[displayedPage].imageUrl && !failedImages.has(displayedPage) ? (
              <img
                key={`page-${displayedPage}-${imageRetryCount.current.get(displayedPage) || 0}`}
                src={story.pages[displayedPage].imageUrl}
                alt={`Page ${displayedPage + 1} illustration`}
                className="absolute inset-0 w-full h-full object-cover"
                onLoad={() => {
                  // Signal that this page's image is now visible
                  setImageLoaded(true)
                  imageLoadedRef.current = true
                  if (failedImages.has(displayedPage)) {
                    setFailedImages(prev => {
                      const next = new Set(prev)
                      next.delete(displayedPage)
                      return next
                    })
                  }
                }}
                onError={(e) => {
                  const retries = imageRetryCount.current.get(displayedPage) || 0
                  if (retries < 2) {
                    console.warn(`[StoryBook] Image retry ${retries + 1}/2 for page ${displayedPage + 1}`)
                    imageRetryCount.current.set(displayedPage, retries + 1)
                    setTimeout(() => {
                      setFailedImages(prev => {
                        const next = new Set(prev)
                        next.add(displayedPage)
                        return next
                      })
                      setTimeout(() => {
                        setFailedImages(prev => {
                          const next = new Set(prev)
                          next.delete(displayedPage)
                          return next
                        })
                      }, 100)
                    }, 1000 * (retries + 1))
                  } else {
                    console.error(`[StoryBook] Image failed to load for page ${displayedPage + 1} after ${retries} retries:`, story.pages[displayedPage].imageUrl)
                    setFailedImages(prev => new Set(prev).add(displayedPage))
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full" style={{ backgroundColor: '#F5ECD7' }} ref={() => {
                // No image — mark as "loaded" so auto-play doesn't get stuck
                if (!imageLoadedRef.current) {
                  setImageLoaded(true)
                  imageLoadedRef.current = true
                }
              }}>
                <p className="text-amber-700/40 italic">
                  {story.pages[displayedPage].imageUrl ? 'Image loading failed' : 'No illustration available'}
                </p>
              </div>
            )}
          </div>

          {/* Right Side - Text */}
          <div className="flex flex-col justify-center p-8 md:p-12" style={{ backgroundColor: '#FDF6E3' }}>
            <div className="mb-6">
              <h2 className="text-sm font-medium text-amber-700/50 uppercase tracking-wide mb-2">
                {story.author || 'Young Author'}
              </h2>
              <div className="h-px bg-amber-300/40 w-16"></div>
            </div>

            <div className="flex-1 flex items-center">
              <p
                className={`text-amber-950 font-serif ${
                  ['ur', 'ar', 'fa'].includes(story.language || '')
                    ? 'text-xl md:text-2xl lg:text-3xl leading-[2.2] text-right w-full'
                    : 'text-base md:text-lg lg:text-xl leading-relaxed'
                }`}
                dir={['ur', 'ar', 'fa'].includes(story.language || '') ? 'rtl' : 'ltr'}
              >
                {story.pages[displayedPage].text}
              </p>
            </div>

            <div className="mt-6 text-center">
              <div className="inline-block h-px bg-amber-300/30 w-24"></div>
              <div className="text-sm text-amber-600/40 mt-2">{displayedPage + 1}</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <button
            onClick={previousPage}
            disabled={currentPage === 0 || isFlipping}
            className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Read Aloud Button */}
          <button
            onClick={readAloud}
            disabled={isGeneratingVoice}
            className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait ${
              isReading
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : isGeneratingVoice
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isGeneratingVoice ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Voice...
              </>
            ) : isReading ? (
              <>
                <VolumeX className="w-5 h-5" />
                Stop Reading
              </>
            ) : (
              <>
                <Volume2 className="w-5 h-5" />
                Read Aloud
              </>
            )}
          </button>

          <button
            onClick={nextPage}
            disabled={currentPage === story.pages.length - 1 || isFlipping}
            className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Movie Player */}
      {localMovieUrl && (
        <div className="bg-zinc-900 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 text-center">
            <h3 className="text-white font-semibold flex items-center justify-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              Your AI Movie
            </h3>
          </div>
          <video
            src={localMovieUrl}
            controls
            className="w-full max-h-[500px]"
            poster={story.pages[0]?.imageUrl}
          />
        </div>
      )}

      {/* Movie Generation Progress — Multi-stage tracker */}
      {isGeneratingMovie && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
            <span className="text-purple-700 font-medium text-sm">{movieProgressLabel}</span>
          </div>

          {/* Stage checklist */}
          <div className="space-y-2 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <span>{movieProgress >= 50 ? '✅' : movieProgress > 0 ? '⏳' : '⬜'}</span>
              <span className={movieProgress > 0 && movieProgress < 50 ? 'text-purple-700 font-medium' : 'text-purple-600'}>
                Animating 3 hero pages with AI
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>{movieProgress >= 65 ? '✅' : movieProgress >= 50 ? '⏳' : '⬜'}</span>
              <span className={movieProgress >= 50 && movieProgress < 65 ? 'text-purple-700 font-medium' : 'text-purple-600'}>
                Generating narration
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>{movieProgress >= 70 ? '✅' : movieProgress >= 65 ? '⏳' : '⬜'}</span>
              <span className={movieProgress >= 65 && movieProgress < 70 ? 'text-purple-700 font-medium' : 'text-purple-600'}>
                Adding background music
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>{movieProgress >= 95 ? '✅' : movieProgress >= 70 ? '⏳' : '⬜'}</span>
              <span className={movieProgress >= 70 && movieProgress < 95 ? 'text-purple-700 font-medium' : 'text-purple-600'}>
                Rendering movie
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${movieProgress}%` }}
            />
          </div>

          <p className="text-xs text-purple-500 mt-2 text-center italic">
            This may take 5-8 minutes — AI is animating your story!
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap justify-center gap-4">
        {/* Download PDF */}
        <button
          onClick={downloadPDF}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium flex items-center gap-2 active:scale-[0.98]"
        >
          <Download className="w-5 h-5" />
          Download Book
        </button>

        {/* Generate / Download Movie */}
        {localMovieUrl ? (
          <button
            onClick={downloadMovie}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium flex items-center gap-2 active:scale-[0.98]"
          >
            <Download className="w-5 h-5" />
            Download Movie
          </button>
        ) : (
          <button
            onClick={handleGenerateMovie}
            disabled={isGeneratingMovie}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium flex items-center gap-2 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
          >
            {isGeneratingMovie ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Movie...
              </>
            ) : (
              <>
                <Film className="w-5 h-5" />
                Create AI Movie
              </>
            )}
          </button>
        )}

        {/* Create New Story */}
        <button
          onClick={onReset}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl font-medium flex items-center gap-2 active:scale-[0.98]"
        >
          <RotateCcw className="w-5 h-5" />
          New Story
        </button>
      </div>

      {/* Disclaimer */}
      <div className="text-center text-xs text-amber-700/40 mt-4 px-4">
        <p>
          This is a work of fiction generated with AI assistance. All characters, names, places, events, and illustrations
          are entirely fictional. Any resemblance to actual persons or events is purely coincidental.
          The creators bear no responsibility for any interpretations or opinions that may arise from this content.
        </p>
      </div>
    </div>
  )
}
