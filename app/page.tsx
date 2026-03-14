'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import SpeechRecorder, { AgeGroup, GenerationMode, StoryMode } from '@/components/SpeechRecorder'
import StoryBook from '@/components/StoryBook'
import LoadingSpinner from '@/components/LoadingSpinner'
import BeaverMascot from '@/components/BeaverMascot'
import { BookOpen, Mic, Globe, Shield, Printer, Sparkles, ChevronDown } from 'lucide-react'
import { clientValidateContent } from '@/lib/blockedTerms'

export type StoryPage = {
  text: string
  imageUrl?: string
  videoUrl?: string   // Looping animation URL (mp4) for "Living Pictures" mode
}

export type Story = {
  title: string
  author: string
  pages: StoryPage[]
  originalPrompt?: string
  language?: string  // ISO 639-1 code from Whisper auto-detection (default: 'en')
}

export default function Home() {
  const [step, setStep] = useState<'record' | 'generating' | 'generating-images' | 'book'>('record')
  const [story, setStory] = useState<Story | null>(null)
  const [characterBible, setCharacterBible] = useState<any>(null)
  const [sceneCards, setSceneCards] = useState<any[]>([])
  const [transcription, setTranscription] = useState<string>('')
  const [loadingMessage, setLoadingMessage] = useState('Creating your magical story...')
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('3-5')
  const [selectedMode, setSelectedMode] = useState<GenerationMode>('storybook')
  const [selectedStoryMode, setSelectedStoryMode] = useState<StoryMode>('imagination')
  const [detectedLanguage, setDetectedLanguage] = useState<string>('en')
  const router = useRouter()

  const isGenerating = step === 'generating' || step === 'generating-images'

  // Warn on browser tab close / refresh while generating
  useEffect(() => {
    if (!isGenerating) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isGenerating])

  // Guarded navigation for in-app links
  const guardedNavigate = useCallback((href: string) => {
    if (isGenerating) {
      const confirmed = window.confirm(
        'Your story is still being created! If you leave now, you\'ll lose your progress. Are you sure?'
      )
      if (!confirmed) return
    }
    router.push(href)
  }, [isGenerating, router])

  const handleTranscriptionComplete = async (text: string, authorName: string, ageGroup: AgeGroup, mode: GenerationMode, storyMode: StoryMode = 'imagination', language: string = 'en') => {
    setTranscription(text)
    setSelectedAgeGroup(ageGroup)
    setSelectedMode(mode)
    setSelectedStoryMode(storyMode)
    setDetectedLanguage(language)

    // ─── CLIENT-SIDE CONTENT SAFETY ─────────────────────────────────
    // Advisory check — gives immediate feedback. Server enforces the real rules.
    // Uses comprehensive blocklist from lib/blockedTerms.ts (250+ terms across
    // sexual, violence, profanity, slurs, substance, religious categories).
    const blockedTerm = clientValidateContent(text, storyMode)
    if (blockedTerm) {
      console.warn(`[CLIENT SAFETY] Blocked term detected: "${blockedTerm}"`)
      alert('This story idea contains content that isn\'t appropriate for a children\'s story app. Please try a different, kid-friendly idea! Think of fun adventures with animals, magical creatures, or everyday heroes.')
      return
    }

    setStep('generating')
    setLoadingMessage('Creating your magical story...')

    try {
      // Step 1: Generate story text
      const storyResponse = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, ageGroup, storyMode, language }),
      })

      if (!storyResponse.ok) {
        const errorData = await storyResponse.json()

        // Handle rate limit / upgrade required
        if (storyResponse.status === 403 && errorData.upgradeRequired) {
          setStep('record')
          if (errorData.isGuest) {
            // Guest user — prompt to sign up
            const shouldSignUp = confirm(
              'You\'ve used your free story!\n\nSign up for a free account to create another story, or upgrade to Plus for 7 stories/month.\n\nWould you like to sign up now?'
            )
            if (shouldSignUp) {
              window.location.href = '/auth/signin'
            }
          } else {
            // Authenticated user — prompt to upgrade
            const shouldUpgrade = confirm(
              errorData.error + '\n\nWould you like to see our plans?'
            )
            if (shouldUpgrade) {
              window.location.href = '/pricing'
            }
          }
          return
        }

        throw new Error(errorData.error || 'Failed to generate story')
      }

      const storyData = await storyResponse.json()

      // Step 2: Generate images + videos in ONE overlapping pipeline
      // Videos start generating as soon as each key-page image finishes,
      // so image and video generation run in parallel — much faster than sequential.
      setStep('generating-images')
      setLoadingMessage('Creating beautiful illustrations...')

      const imagesResponse = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // GPT now writes complete image prompts directly — no more scene cards or visual scenes
          imagePrompts: storyData.story?.pages?.map((p: any) => p.imagePrompt || '') || [],
          characterBible: storyData.characterBible,
          additionalCharacterBibles: storyData.additionalCharacterBibles,
          seed: storyData.seed,
          seeds: storyData.seeds,
          storyMode,
          ageGroup,
          // New JSON pipeline fields — when present, image route skips regex corrections
          promptsPreBuilt: storyData.promptsPreBuilt || false,
          storyWorldDNA: storyData.storyWorldDNA,
          generationToken: storyData.generationToken,
        }),
      })

      if (!imagesResponse.ok) {
        // If pipeline fails, continue with story but no images
        setStory({
          ...storyData.story,
          author: authorName,
          language,
        })
        setStep('book')
        return
      }

      const mediaData = await imagesResponse.json()

      // Debug: log received media URLs
      console.log(`[Frontend] Received ${mediaData.imageUrls?.length ?? 0} image URLs`)
      console.log(`[Frontend] Received ${mediaData.videoUrls?.filter(Boolean).length ?? 0} video URLs`)
      mediaData.imageUrls?.forEach((url: string, i: number) => {
        const hasVideo = mediaData.videoUrls?.[i] ? ' + VIDEO' : ''
        console.log(`[Frontend] Page ${i + 1}: ${url ? 'IMAGE' : 'EMPTY'}${hasVideo}`)
      })

      // Combine story with images and videos
      const storyWithImages = {
        ...storyData.story,
        author: authorName,
        language,
        pages: storyData.story.pages.map((page: any, index: number) => ({
          ...page,
          imageUrl: mediaData.imageUrls[index] || undefined,
          videoUrl: mediaData.videoUrls?.[index] || undefined,
        }))
      }

      // Debug: verify all pages have media set
      console.log(`[Frontend] Story pages with media:`)
      storyWithImages.pages.forEach((p: any, i: number) => {
        console.log(`[Frontend] Page ${i + 1} imageUrl: ${p.imageUrl ? 'SET' : 'MISSING'}, videoUrl: ${p.videoUrl ? 'SET' : 'MISSING'}`)
      })

      setStory(storyWithImages)
      setCharacterBible(storyData.characterBible || null)
      setSceneCards(storyData.sceneCards || [])

      setStep('book')
    } catch (error: any) {
      console.error('Error generating story:', error)
      const errorMessage = error.message || 'Failed to generate story. Please try again.'
      alert(errorMessage)
      setStep('record')
    }
  }

  const handleReset = () => {
    setStep('record')
    setStory(null)
    setTranscription('')
  }

  const creatorRef = useRef<HTMLDivElement>(null)

  const scrollToCreator = () => {
    creatorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // When generating or viewing book, show minimal layout (no landing sections)
  const showLandingContent = step === 'record'

  return (
    <main className="min-h-[100dvh]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-6xl mx-auto flex justify-between items-center p-4">
          <div className="flex items-center gap-3">
            <BeaverMascot greeting="" isRecording={false} isProcessing={false} size="tiny" />
            <span className="text-xl font-semibold text-zinc-800 tracking-tight">Little Story Bear</span>
          </div>
          <div className="flex gap-1 md:gap-2">
            <button
              onClick={() => guardedNavigate('/about')}
              className="hidden md:block px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 active:scale-[0.98]"
            >
              About
            </button>
            <button
              onClick={() => guardedNavigate('/pricing')}
              className="px-3 md:px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 active:scale-[0.98]"
            >
              Pricing
            </button>
            <button
              onClick={() => guardedNavigate('/dashboard')}
              className="px-3 md:px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium flex items-center gap-2 active:scale-[0.98]"
            >
              <BookOpen className="w-5 h-5" />
              <span className="hidden md:inline">My Library</span>
            </button>
          </div>
        </div>
      </nav>

      {showLandingContent && (
        <>
          {/* ═══ HERO SECTION ═══ */}
          <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white">
            <div className="max-w-6xl mx-auto px-4 pt-16 md:pt-24 pb-12 md:pb-20">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium mb-6">
                  <Sparkles className="w-4 h-4" />
                  AI-powered personalized storybooks
                </div>
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[0.95] text-zinc-900 mb-6">
                  Your child is the{' '}
                  <span className="text-emerald-600">hero</span>{' '}
                  of every story
                </h1>
                <p className="text-xl md:text-2xl text-zinc-500 max-w-2xl mb-8 leading-relaxed">
                  Describe a story idea in any language. We create a beautifully illustrated, personalized storybook with your child as the main character — in under 3 minutes.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mb-10">
                  <button
                    onClick={scrollToCreator}
                    className="px-8 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-semibold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
                  >
                    <Sparkles className="w-5 h-5" />
                    Create a Free Story
                  </button>
                  <button
                    onClick={() => guardedNavigate('/pricing')}
                    className="px-8 py-4 bg-white text-zinc-700 border border-zinc-200 rounded-2xl hover:bg-zinc-50 font-semibold text-lg active:scale-[0.98] transition-all"
                  >
                    See Plans
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Ages 3-12
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    20+ languages
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Print-ready books
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    No ads, ever
                  </span>
                </div>
              </div>
            </div>
            {/* Decorative gradient blur */}
            <div className="absolute top-20 right-0 w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-40 w-64 h-64 bg-teal-200/20 rounded-full blur-3xl pointer-events-none" />
          </section>

          {/* ═══ HOW IT WORKS ═══ */}
          <section className="py-16 md:py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mb-3">
                  Three steps. One magical book.
                </h2>
                <p className="text-zinc-500 text-lg max-w-xl mx-auto">
                  From idea to illustrated storybook in under 3 minutes.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center p-6">
                  <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Mic className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div className="text-sm font-semibold text-emerald-600 mb-2">Step 1</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Describe your story</h3>
                  <p className="text-zinc-500">
                    Speak or type a story idea in any language. &quot;Liam finds a dragon egg in the park&quot; is all it takes.
                  </p>
                </div>
                <div className="text-center p-6">
                  <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-8 h-8 text-amber-600" />
                  </div>
                  <div className="text-sm font-semibold text-amber-600 mb-2">Step 2</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">AI writes &amp; illustrates</h3>
                  <p className="text-zinc-500">
                    Our AI creates a 10-page story with original illustrations, age-appropriate language, and your child as the star.
                  </p>
                </div>
                <div className="text-center p-6">
                  <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <BookOpen className="w-8 h-8 text-purple-600" />
                  </div>
                  <div className="text-sm font-semibold text-purple-600 mb-2">Step 3</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Read, listen, or print</h3>
                  <p className="text-zinc-500">
                    Read it together, have it narrated aloud, download as PDF, or order a real printed book delivered to your door.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ FEATURES GRID ═══ */}
          <section className="py-16 md:py-24 bg-zinc-50">
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mb-3">
                  Built for families who love stories
                </h2>
                <p className="text-zinc-500 text-lg max-w-xl mx-auto">
                  Every feature designed with parents and kids in mind.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  {
                    icon: Globe,
                    color: 'emerald',
                    title: 'Stories in 20+ Languages',
                    desc: 'Speak your story idea in Arabic, Urdu, Spanish, French, Chinese, or any of 20+ supported languages. Perfect for bilingual families.',
                  },
                  {
                    icon: Shield,
                    color: 'blue',
                    title: '100% Child-Safe',
                    desc: 'Every story passes through multiple safety layers. Age-appropriate content, no ads, no data collection from children.',
                  },
                  {
                    icon: Printer,
                    color: 'amber',
                    title: 'Real Printed Books',
                    desc: 'Turn any story into a beautiful hardcover book delivered to your doorstep. The perfect keepsake or gift.',
                  },
                  {
                    icon: Mic,
                    color: 'purple',
                    title: 'Voice Narration',
                    desc: 'Choose from multiple narrator voices to have each story read aloud. Great for bedtime or independent reading practice.',
                  },
                  {
                    icon: BookOpen,
                    color: 'rose',
                    title: 'Fiction & History Modes',
                    desc: 'Create imaginative adventures or historically accurate educational stories. Your child learns real history through storytelling.',
                  },
                  {
                    icon: Sparkles,
                    color: 'teal',
                    title: 'Your Child, Every Page',
                    desc: 'Consistent character appearance across all 10 pages. Your child sees themselves as the hero of their own adventure.',
                  },
                ].map((feature, i) => {
                  const colorMap: Record<string, { bg: string; text: string }> = {
                    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
                    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
                    amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
                    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
                    rose: { bg: 'bg-rose-100', text: 'text-rose-600' },
                    teal: { bg: 'bg-teal-100', text: 'text-teal-600' },
                  }
                  const colors = colorMap[feature.color] || colorMap.emerald
                  return (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-zinc-100 hover:border-zinc-200 transition-colors">
                      <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center mb-4`}>
                        <feature.icon className={`w-6 h-6 ${colors.text}`} />
                      </div>
                      <h3 className="text-lg font-bold text-zinc-900 mb-2">{feature.title}</h3>
                      <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* ═══ AGE GROUPS ═══ */}
          <section className="py-16 md:py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mb-3">
                  Stories that grow with your child
                </h2>
                <p className="text-zinc-500 text-lg max-w-xl mx-auto">
                  Age-appropriate writing, vocabulary, and plot complexity for every stage.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="relative bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 border border-emerald-100">
                  <div className="text-4xl mb-4">&#x1F423;</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-1">Little Ones</h3>
                  <div className="text-emerald-600 font-semibold text-sm mb-3">Ages 3 &ndash; 5</div>
                  <ul className="space-y-2 text-zinc-600 text-sm">
                    <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">&#10003;</span> Simple words, short sentences</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">&#10003;</span> Sound effects &amp; repetition</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">&#10003;</span> Gentle adventures with cozy endings</li>
                  </ul>
                </div>
                <div className="relative bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 border border-amber-100">
                  <div className="text-4xl mb-4">&#x1F31F;</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-1">Growing Up</h3>
                  <div className="text-amber-600 font-semibold text-sm mb-3">Ages 6 &ndash; 8</div>
                  <ul className="space-y-2 text-zinc-600 text-sm">
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#10003;</span> Rich vocabulary &amp; dialogue</li>
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#10003;</span> Real plot twists &amp; surprises</li>
                    <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">&#10003;</span> Characters that solve problems</li>
                  </ul>
                </div>
                <div className="relative bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-8 border border-purple-100">
                  <div className="text-4xl mb-4">&#x1F680;</div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-1">Big Kids</h3>
                  <div className="text-purple-600 font-semibold text-sm mb-3">Ages 9 &ndash; 12</div>
                  <ul className="space-y-2 text-zinc-600 text-sm">
                    <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5">&#10003;</span> Novel-quality storytelling</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5">&#10003;</span> Complex characters &amp; conflicts</li>
                    <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5">&#10003;</span> Themes of courage &amp; growth</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ═══ CTA SECTION ═══ */}
          <section className="py-16 md:py-24 bg-gradient-to-br from-emerald-600 to-teal-700">
            <div className="max-w-3xl mx-auto px-4 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Create your first story for free
              </h2>
              <p className="text-emerald-100 text-lg mb-8 max-w-xl mx-auto">
                No credit card required. See your child light up when they discover they are the hero.
              </p>
              <button
                onClick={scrollToCreator}
                className="px-8 py-4 bg-white text-emerald-700 rounded-2xl hover:bg-emerald-50 font-semibold text-lg active:scale-[0.98] transition-all shadow-lg"
              >
                Start Creating
              </button>
            </div>
          </section>
        </>
      )}

      {/* ═══ STORY CREATOR (always rendered, scrolled to) ═══ */}
      <div ref={creatorRef} className="px-4 md:px-8 py-8 md:py-12">
        <div className="max-w-6xl mx-auto">
          {showLandingContent && (
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mb-3" id="create">
                Create Your Story
              </h2>
              <p className="text-zinc-500 text-lg">
                Speak or type your story idea below to get started.
              </p>
            </div>
          )}

          <div className="bg-white border border-zinc-200 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 md:p-10">
            {step === 'record' && (
              <SpeechRecorder onComplete={handleTranscriptionComplete} />
            )}

            {(step === 'generating' || step === 'generating-images') && (
              <LoadingSpinner
                message={loadingMessage}
                stage={step === 'generating' ? 'story' : 'images'}
                prompt={transcription}
              />
            )}

            {step === 'book' && story && (
              <StoryBook story={story} onReset={handleReset} characterBible={characterBible} sceneCards={sceneCards} storyMode={selectedStoryMode} />
            )}
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-zinc-900 text-zinc-400 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-6 h-6 text-emerald-500" />
                <span className="text-white font-semibold text-lg">Little Story Bear</span>
              </div>
              <p className="text-sm max-w-xs">
                Personalized, illustrated storybooks for children ages 3&ndash;12. Created by parents, powered by AI, loved by kids.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">Product</h4>
                <div className="space-y-2 text-sm">
                  <button onClick={() => guardedNavigate('/pricing')} className="block hover:text-white transition-colors">Pricing</button>
                  <button onClick={() => guardedNavigate('/about')} className="block hover:text-white transition-colors">About</button>
                  <button onClick={scrollToCreator} className="block hover:text-white transition-colors">Create a Story</button>
                </div>
              </div>
              <div>
                <h4 className="text-white font-semibold text-sm mb-3">Legal</h4>
                <div className="space-y-2 text-sm">
                  <button onClick={() => guardedNavigate('/terms')} className="block hover:text-white transition-colors">Terms of Service</button>
                  <button onClick={() => guardedNavigate('/terms')} className="block hover:text-white transition-colors">Privacy Policy</button>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800 mt-8 pt-8 text-sm text-center">
            &copy; {new Date().getFullYear()} Little Story Bear. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  )
}
