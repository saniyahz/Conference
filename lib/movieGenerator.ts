'use client'

/**
 * AI-Animated Movie Generator
 *
 * Creates a narrated movie from storybook illustrations using AI-animated video clips.
 * Two-phase pipeline:
 *   Phase 1: Generate AI video clips via MiniMax (server-side, /api/generate-videos)
 *   Phase 2: Stitch on Canvas + MediaRecorder (client-side) with TTS + background music
 *
 * Ken Burns pan/zoom is kept as a fallback for any page whose video clip fails.
 *
 * Uses Canvas API for rendering and MediaRecorder for capture — no FFmpeg needed.
 * Wall-clock sync via performance.now() keeps canvas rendering in sync with real-time audio.
 *
 * Flow:
 *   1. Generate AI video clips for each page (MiniMax via Replicate)
 *   2. Generate TTS audio for each page
 *   3. Load background music + all video/image assets
 *   4. For each page: play TTS audio + render video (or Ken Burns fallback) on canvas
 *   5. Record the canvas + audio stream as WebM
 *   6. Return a Blob URL for download
 */

export interface MoviePage {
  text: string
  imageUrl?: string
  videoUrl?: string  // Pre-existing video URL (from living pictures)
}

export interface MovieConfig {
  pages: MoviePage[]
  title: string
  author: string
  voice: string       // TTS voice ID (e.g. 'mama_beaver')
  width?: number      // Output width (default 1280)
  height?: number     // Output height (default 720)
  onProgress?: (pct: number, label: string) => void
  sceneCards?: any[]  // Scene cards for AI video generation
}

// ─── KEN BURNS (FALLBACK) ─────────────────────────────────────────────

type KenBurnsEffect = {
  startScale: number
  endScale: number
  startX: number
  startY: number
  endX: number
  endY: number
}

const KB_EFFECTS: KenBurnsEffect[] = [
  { startScale: 1.0, endScale: 1.05, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  { startScale: 1.0, endScale: 1.04, startX: 0.47, startY: 0.5, endX: 0.53, endY: 0.48 },
  { startScale: 1.0, endScale: 1.04, startX: 0.53, startY: 0.48, endX: 0.47, endY: 0.52 },
  { startScale: 1.06, endScale: 1.0, startX: 0.5, startY: 0.48, endX: 0.5, endY: 0.5 },
  { startScale: 1.02, endScale: 1.04, startX: 0.5, startY: 0.45, endX: 0.5, endY: 0.55 },
  { startScale: 1.02, endScale: 1.04, startX: 0.5, startY: 0.55, endX: 0.5, endY: 0.45 },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// ─── ASSET LOADERS ────────────────────────────────────────────────────

/**
 * Load an image from URL, returning an HTMLImageElement.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Load a video from URL, returning an HTMLVideoElement ready to play.
 */
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.playsInline = true
    video.muted = true  // Must be muted for autoplay; audio comes from TTS
    video.loop = true   // Loop if page duration > clip length
    video.preload = 'auto'

    video.oncanplaythrough = () => resolve(video)
    video.onerror = () => reject(new Error(`Failed to load video: ${url}`))

    // Try loading with CORS proxy fallback
    video.src = url

    // Timeout after 30 seconds
    setTimeout(() => reject(new Error(`Video load timeout: ${url}`)), 30000)
  })
}

/**
 * Fetch TTS audio for a page and return an AudioBuffer.
 */
async function fetchTTSAudio(text: string, voice: string, audioCtx: AudioContext): Promise<AudioBuffer> {
  const response = await fetch('/api/generate-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  })

  if (!response.ok) throw new Error('TTS generation failed')

  const arrayBuffer = await response.arrayBuffer()
  return audioCtx.decodeAudioData(arrayBuffer)
}

/**
 * Load a random background music track from public/music/.
 * Returns null on failure — background music is optional.
 */
async function loadBackgroundMusic(audioCtx: AudioContext): Promise<AudioBuffer | null> {
  const tracks = [
    '/music/gentle-lullaby.mp3',
    '/music/adventure-theme.mp3',
    '/music/magical-wonder.mp3',
  ]

  const track = tracks[Math.floor(Math.random() * tracks.length)]

  try {
    const response = await fetch(track)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return audioCtx.decodeAudioData(arrayBuffer)
  } catch {
    console.warn(`[Movie] Could not load background music: ${track}`)
    return null
  }
}

// ─── VIDEO CLIP GENERATION ────────────────────────────────────────────

/**
 * Hero page indices that get AI animation.
 * Only 3 key pages are animated to balance cost ($1.50) and time (~6 min):
 *   - Page 1 (index 0): Opening scene — sets the visual tone
 *   - Page 5 (index 4): Climax — the story's peak moment
 *   - Page 10 (index 9): Ending — the emotional close
 * All other pages use Ken Burns pan/zoom over the static illustration.
 */
const HERO_PAGE_INDICES = [0, 4, 9]

/**
 * Generate AI video clips for HERO pages only via /api/generate-videos.
 * Non-hero pages automatically fall back to Ken Burns (no API call needed).
 * Calls one page at a time to avoid API timeouts.
 * Returns array of video URLs (null for non-hero / failed pages).
 */
async function generateVideoClips(
  pages: MoviePage[],
  sceneCards: any[] | undefined,
  onProgress: (pageNum: number, totalPages: number) => void,
): Promise<(string | null)[]> {
  const videoUrls: (string | null)[] = new Array(pages.length).fill(null)
  const heroCount = HERO_PAGE_INDICES.filter(i => i < pages.length).length
  let heroGenerated = 0

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]

    // Skip pages without images
    if (!page.imageUrl) {
      onProgress(i + 1, pages.length)
      continue
    }

    // Skip non-hero pages — they'll use Ken Burns fallback
    if (!HERO_PAGE_INDICES.includes(i)) {
      console.log(`[Movie] Page ${i + 1}: Ken Burns (not a hero page)`)
      onProgress(i + 1, pages.length)
      continue
    }

    // If page already has a video URL (from living pictures), use it
    if (page.videoUrl) {
      videoUrls[i] = page.videoUrl
      onProgress(i + 1, pages.length)
      continue
    }

    try {
      onProgress(i + 1, pages.length)

      const response = await fetch('/api/generate-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: pages.map(p => p.imageUrl || ''),
          sceneCards: sceneCards || [],
          pageTexts: pages.map(p => p.text),
          keyPageIndices: [i],  // Generate one page at a time
        }),
      })

      if (!response.ok) {
        console.warn(`[Movie] Video generation failed for page ${i + 1}: HTTP ${response.status}`)
        continue
      }

      const data = await response.json()
      if (data.videoUrls && data.videoUrls[i]) {
        videoUrls[i] = data.videoUrls[i]
      }
    } catch (err) {
      console.warn(`[Movie] Video generation error for page ${i + 1}:`, err)
    }
  }

  return videoUrls
}

// ─── CANVAS DRAWING ───────────────────────────────────────────────────

/**
 * Draw a single frame of Ken Burns on a canvas (fallback for pages without video).
 */
function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  effect: KenBurnsEffect,
  progress: number,
  canvasW: number,
  canvasH: number,
) {
  const t = easeInOut(progress)
  const scale = lerp(effect.startScale, effect.endScale, t)
  const panX = lerp(effect.startX, effect.endX, t)
  const panY = lerp(effect.startY, effect.endY, t)

  const imgAspect = img.width / img.height
  const canvasAspect = canvasW / canvasH

  let srcW: number, srcH: number
  if (imgAspect > canvasAspect) {
    srcH = img.height / scale
    srcW = srcH * canvasAspect
  } else {
    srcW = img.width / scale
    srcH = srcW / canvasAspect
  }

  const srcX = Math.max(0, Math.min(img.width - srcW, (img.width * panX) - srcW / 2))
  const srcY = Math.max(0, Math.min(img.height - srcH, (img.height * panY) - srcH / 2))

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH)
}

/**
 * Draw a video frame on canvas with cover-fit aspect ratio handling.
 */
function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasW: number,
  canvasH: number,
) {
  const videoAspect = video.videoWidth / video.videoHeight
  const canvasAspect = canvasW / canvasH

  let drawW: number, drawH: number, drawX: number, drawY: number

  if (videoAspect > canvasAspect) {
    // Video is wider — fit by height, crop sides
    drawH = canvasH
    drawW = canvasH * videoAspect
    drawX = (canvasW - drawW) / 2
    drawY = 0
  } else {
    // Video is taller — fit by width, crop top/bottom
    drawW = canvasW
    drawH = canvasW / videoAspect
    drawX = 0
    drawY = (canvasH - drawH) / 2
  }

  ctx.drawImage(video, drawX, drawY, drawW, drawH)
}

/**
 * Draw a title card or end card.
 */
function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  text: string,
  subtitle: string,
  canvasW: number,
  canvasH: number,
) {
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, canvasW, canvasH)

  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.floor(canvasW / 18)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  const maxWidth = canvasW * 0.8
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)

  const lineHeight = Math.floor(canvasW / 15)
  const totalHeight = lines.length * lineHeight
  const startY = canvasH / 2 - totalHeight / 2 - 20

  lines.forEach((line, i) => {
    ctx.fillText(line, canvasW / 2, startY + i * lineHeight)
  })

  ctx.font = `${Math.floor(canvasW / 30)}px system-ui, sans-serif`
  ctx.fillStyle = '#a0aec0'
  ctx.fillText(subtitle, canvasW / 2, startY + totalHeight + 30)
}

// ─── FRAME SYNC ───────────────────────────────────────────────────────

/**
 * Render frames for a given duration, synced to wall clock.
 *
 * Uses requestAnimationFrame + performance.now() to track
 * real elapsed time. This keeps frames in sync with audio playback.
 */
function renderFramesSynced(
  drawFn: (progress: number) => void,
  durationSec: number,
): Promise<void> {
  return new Promise((resolve) => {
    const durationMs = durationSec * 1000
    const startTime = performance.now()

    const tick = () => {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / durationMs, 1.0)

      drawFn(progress)

      if (progress >= 1.0) {
        resolve()
        return
      }

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  })
}

// ─── MAIN GENERATOR ───────────────────────────────────────────────────

/**
 * Generate a narrated AI-animated movie from story pages.
 * Returns a Blob URL that can be used for download or playback.
 *
 * Hero pages (1, 5, 10) get AI animation; others get Ken Burns.
 * Cost: ~$1.50 (3 clips). Time: ~6-8 min.
 *
 * Two-phase pipeline:
 *   Phase 1 (0-50%): Generate AI video clips for 3 hero pages
 *   Phase 2 (50-65%): Generate TTS narration
 *   Phase 2b (65-70%): Load all assets (videos, images, music)
 *   Phase 3 (70-95%): Stitch on Canvas + record
 *   Phase 4 (95-100%): Export
 */
export async function generateMovie(config: MovieConfig): Promise<string> {
  const {
    pages,
    title,
    author,
    voice,
    width = 1280,
    height = 720,
    onProgress,
    sceneCards,
  } = config

  const report = (pct: number, label: string) => onProgress?.(pct, label)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Generate AI video clips (0-50%)
  // ═══════════════════════════════════════════════════════════════════
  report(0, 'Animating 3 hero pages with AI...')

  const videoUrls = await generateVideoClips(
    pages,
    sceneCards,
    (pageNum, totalPages) => {
      const pct = Math.floor((pageNum / totalPages) * 50)
      report(pct, `Animating page ${pageNum} of ${totalPages}...`)
    },
  )

  const videoSuccessCount = videoUrls.filter(u => u).length
  console.log(`[Movie] AI video clips: ${videoSuccessCount}/${pages.length} succeeded`)

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Generate TTS narration (50-65%)
  // ═══════════════════════════════════════════════════════════════════
  report(50, 'Generating narration...')
  const audioCtx = new AudioContext()
  const audioBuffers: (AudioBuffer | null)[] = []

  for (let i = 0; i < pages.length; i++) {
    try {
      if (pages[i].text) {
        audioBuffers.push(await fetchTTSAudio(pages[i].text, voice, audioCtx))
      } else {
        audioBuffers.push(null)
      }
    } catch {
      audioBuffers.push(null)
    }
    report(50 + Math.floor((i / pages.length) * 15), 'Generating narration...')
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2b: Load all assets in parallel (65-70%)
  // ═══════════════════════════════════════════════════════════════════
  report(65, 'Loading assets...')

  // Load video elements for successful clips
  const videoElements: (HTMLVideoElement | null)[] = new Array(pages.length).fill(null)
  const fallbackImages: (HTMLImageElement | null)[] = new Array(pages.length).fill(null)

  const assetPromises: Promise<void>[] = []

  for (let i = 0; i < pages.length; i++) {
    if (videoUrls[i]) {
      // Try to load the video clip
      assetPromises.push(
        loadVideo(videoUrls[i]!)
          .then(video => { videoElements[i] = video })
          .catch(() => {
            console.warn(`[Movie] Failed to load video for page ${i + 1}, will use Ken Burns`)
            // Try CORS proxy as fallback
            return loadVideo(`/api/proxy-video?url=${encodeURIComponent(videoUrls[i]!)}`)
              .then(video => { videoElements[i] = video })
              .catch(() => {
                // Load static image as final fallback
                if (pages[i].imageUrl) {
                  return loadImage(pages[i].imageUrl!)
                    .then(img => { fallbackImages[i] = img })
                    .catch(() => {})
                }
              })
          })
      )
    } else if (pages[i].imageUrl) {
      // No video — load static image for Ken Burns fallback
      assetPromises.push(
        loadImage(pages[i].imageUrl!)
          .then(img => { fallbackImages[i] = img })
          .catch(() => {})
      )
    }
  }

  // Load background music
  let bgMusicBuffer: AudioBuffer | null = null
  assetPromises.push(
    loadBackgroundMusic(audioCtx)
      .then(buf => { bgMusicBuffer = buf })
  )

  await Promise.all(assetPromises)
  report(70, 'Preparing movie...')

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Stitch on Canvas + MediaRecorder (70-95%)
  // ═══════════════════════════════════════════════════════════════════
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Create a MediaStream from the canvas
  const canvasStream = canvas.captureStream(30)

  // Create audio destination for mixing
  const audioDest = audioCtx.createMediaStreamDestination()

  // Combine canvas video + audio into one stream
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ])

  // Set up MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm'

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 2500000,
  })

  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  recorder.start(100)

  // ── Constants ──
  const FADE_DURATION = 0.6
  const TITLE_DURATION = 4
  const POST_NARRATION_PAUSE = 2.5
  const MIN_PAGE_DURATION = 5

  // ── Start background music (looping, quiet) ──
  let bgMusicSource: AudioBufferSourceNode | null = null
  if (bgMusicBuffer) {
    bgMusicSource = audioCtx.createBufferSource()
    bgMusicSource.buffer = bgMusicBuffer
    bgMusicSource.loop = true

    // Mix at 15% volume so it doesn't overpower narration
    const bgGain = audioCtx.createGain()
    bgGain.gain.value = 0.15
    bgMusicSource.connect(bgGain)
    bgGain.connect(audioDest)
    bgMusicSource.start()
  }

  // Play TTS audio and return its duration
  const playPageAudio = (buffer: AudioBuffer | null): number => {
    if (!buffer) return MIN_PAGE_DURATION
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioDest)
    source.start()
    return buffer.duration
  }

  // Draw text overlay on a page
  const drawTextOverlay = (text: string) => {
    if (!text) return
    const barHeight = height * 0.15
    const gradient = ctx.createLinearGradient(0, height - barHeight * 1.5, 0, height)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.7)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, height - barHeight * 1.5, width, barHeight * 1.5)

    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.floor(width / 40)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    const maxW = width * 0.85
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)

    const lh = Math.floor(width / 35)
    const startTextY = height - 20 - (lines.length - 1) * lh
    lines.forEach((l, li) => {
      ctx.fillText(l, width / 2, startTextY + li * lh)
    })
  }

  // Draw fade overlay
  const drawFade = (progress: number, durationSec: number) => {
    const fadeFraction = FADE_DURATION / durationSec
    if (progress < fadeFraction) {
      const fadeProgress = progress / fadeFraction
      ctx.fillStyle = `rgba(0,0,0,${1 - fadeProgress})`
      ctx.fillRect(0, 0, width, height)
    } else if (progress > 1 - fadeFraction) {
      const fadeProgress = (progress - (1 - fadeFraction)) / fadeFraction
      ctx.fillStyle = `rgba(0,0,0,${fadeProgress})`
      ctx.fillRect(0, 0, width, height)
    }
  }

  // ── Render title card ──
  report(70, 'Rendering title...')
  await renderFramesSynced((progress) => {
    drawTitleCard(ctx, title, `Written by ${author}`, width, height)
    drawFade(progress, TITLE_DURATION)
  }, TITLE_DURATION)

  // ── Render each page ──
  for (let i = 0; i < pages.length; i++) {
    const video = videoElements[i]
    const img = fallbackImages[i]
    const audio = audioBuffers[i]
    const effect = KB_EFFECTS[i % KB_EFFECTS.length]

    // Start TTS audio for this page
    const audioDuration = playPageAudio(audio)

    // Calculate page duration
    let videoDuration = 0
    if (video && video.duration && isFinite(video.duration)) {
      videoDuration = video.duration
    }
    const pageDuration = Math.max(
      audioDuration + POST_NARRATION_PAUSE,
      videoDuration,
      MIN_PAGE_DURATION,
    )

    report(
      70 + Math.floor((i / pages.length) * 25),
      `Rendering page ${i + 1}/${pages.length}...`
    )

    if (video) {
      // ── AI VIDEO PATH ──
      // Start playing the video element (muted, loops automatically)
      video.currentTime = 0
      try {
        await video.play()
      } catch {
        console.warn(`[Movie] Could not play video for page ${i + 1}`)
      }

      // Render video frames to canvas, synced to wall clock
      await renderFramesSynced((progress) => {
        // Draw current video frame onto canvas
        if (video.readyState >= 2) {
          drawVideoFrame(ctx, video, width, height)
        } else {
          // Video not ready — draw black
          ctx.fillStyle = '#2d3748'
          ctx.fillRect(0, 0, width, height)
        }

        // Text overlay
        drawTextOverlay(pages[i].text)

        // Fade transitions
        drawFade(progress, pageDuration)
      }, pageDuration)

      // Pause the video element
      video.pause()
    } else if (img) {
      // ── KEN BURNS FALLBACK ──
      await renderFramesSynced((progress) => {
        drawKenBurnsFrame(ctx, img, effect, progress, width, height)
        drawTextOverlay(pages[i].text)
        drawFade(progress, pageDuration)
      }, pageDuration)
    } else {
      // ── NO ASSET FALLBACK ──
      await renderFramesSynced((progress) => {
        ctx.fillStyle = '#2d3748'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = `${Math.floor(width / 25)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`Page ${i + 1}`, width / 2, height / 2)
        drawTextOverlay(pages[i].text)
        drawFade(progress, pageDuration)
      }, pageDuration)
    }
  }

  // ── Render end card ──
  report(95, 'Finishing up...')
  await renderFramesSynced((progress) => {
    drawTitleCard(ctx, 'The End', `Made with My Story Bear`, width, height)
    drawFade(progress, TITLE_DURATION)
  }, TITLE_DURATION)

  // ── Stop background music ──
  if (bgMusicSource) {
    try {
      bgMusicSource.stop()
    } catch {
      // Already stopped
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: Export (95-100%)
  // ═══════════════════════════════════════════════════════════════════

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      const url = URL.createObjectURL(blob)
      audioCtx.close()
      report(100, 'Done!')
      resolve(url)
    }
    recorder.stop()
  })
}
