'use client'

import Link from 'next/link'
import { BookOpen, Heart, ArrowLeft, Brain, GraduationCap, Globe, Sparkles, Shield, Check, MessageCircle, Users } from 'lucide-react'
import BeaverMascot from '@/components/BeaverMascot'

export default function AboutPage() {
  return (
    <main className="min-h-[100dvh] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </Link>
        </div>

        {/* Hero Section */}
        <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 md:p-12 mb-8 border border-zinc-200">
          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-zinc-800 mb-4 tracking-tight">
                Building Readers, One Story at a Time
              </h1>
              <p className="text-xl text-zinc-500">
                Little Story Bear turns children into authors — developing literacy, empathy, and a lifelong love of learning through the power of their own stories.
              </p>
            </div>
            <div className="hidden md:block">
              <BeaverMascot greeting="Hi there!" isRecording={false} isProcessing={false} size="medium" />
            </div>
          </div>

          {/* Our Educational Mission */}
          <div className="bg-emerald-50 rounded-2xl p-6 md:p-8 mb-8 border border-emerald-200">
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap className="w-8 h-8 text-emerald-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Our Educational Mission</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed mb-4">
              Childhood literacy is in decline. Screens compete for attention, and many children never
              discover the joy of reading because they haven&apos;t experienced the magic of <em>creating</em> a story themselves.
            </p>
            <p className="text-lg text-zinc-600 leading-relaxed">
              <strong>Little Story Bear</strong> exists to change that. We use AI-powered storytelling to meet
              children where they are — letting them speak a story idea and watch it become a real illustrated
              book they can read, share, and treasure. When a child sees themselves as an author,
              they see themselves as a reader.
            </p>
          </div>

          {/* The Science Behind It */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <Brain className="w-8 h-8 text-violet-600" />
              <h2 className="text-2xl font-bold text-zinc-800">How Storytelling Builds Young Minds</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed mb-6">
              Decades of research in child development show that storytelling is one of the most
              powerful tools for learning. When children create and engage with stories, they
              develop critical skills across multiple domains:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                  Literacy &amp; Language
                </h3>
                <p className="text-zinc-500 text-sm">
                  Story creation builds vocabulary, sentence structure, and narrative comprehension — the
                  foundations of reading fluency.
                </p>
              </div>

              <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Creativity &amp; Critical Thinking
                </h3>
                <p className="text-zinc-500 text-sm">
                  Imagining characters, settings, and plot challenges develops creative problem-solving
                  and abstract thinking skills.
                </p>
              </div>

              <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-rose-500" />
                  Emotional Intelligence
                </h3>
                <p className="text-zinc-500 text-sm">
                  Stories help children name and process emotions, understand different perspectives,
                  and build empathy through characters.
                </p>
              </div>

              <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-500" />
                  Confidence &amp; Self-Expression
                </h3>
                <p className="text-zinc-500 text-sm">
                  Children who struggle with writing can still be storytellers. Voice-first creation
                  removes barriers and builds confidence.
                </p>
              </div>

              <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-200 md:col-span-2">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  Parent-Child Bonding
                </h3>
                <p className="text-zinc-500 text-sm">
                  Little Story Bear is designed to be a shared experience. Parents sit with their child,
                  help shape the story idea, and watch it come to life together. Reading the finished
                  book becomes a bedtime ritual, a car ride activity, or a weekend tradition — creating
                  meaningful moments that strengthen the bond between parent and child through the magic of storytelling.
                </p>
              </div>
            </div>
          </div>

          {/* Three Modes of Learning */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <Globe className="w-8 h-8 text-blue-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Three Ways to Learn Through Stories</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed mb-6">
              Every child learns differently. Little Story Bear offers three story modes, each designed
              to develop different skills while keeping children engaged and excited about reading.
            </p>

            <div className="space-y-4">
              <div className="bg-gradient-to-r from-violet-50 to-white rounded-xl p-6 border border-violet-200">
                <h3 className="text-lg font-bold text-zinc-800 mb-2">
                  <span className="text-violet-600">Imagination Mode</span> — Creative Storytelling
                </h3>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  Children speak any story idea — a dragon who loves to bake, a trip to the moon,
                  an adventure with their pet — and watch it become a fully illustrated 10-page book.
                  This builds narrative thinking, vocabulary, and the fundamental belief that their ideas have value.
                </p>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-white rounded-xl p-6 border border-amber-200">
                <h3 className="text-lg font-bold text-zinc-800 mb-2">
                  <span className="text-amber-600">History Mode</span> — Learning Real Events
                </h3>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  Children explore historical topics through engaging stories anchored in real facts.
                  From ancient civilizations to space exploration, history comes alive through
                  child-friendly narratives with factual accuracy — turning learning into an adventure.
                </p>
              </div>

              <div className="bg-gradient-to-r from-emerald-50 to-white rounded-xl p-6 border border-emerald-200">
                <h3 className="text-lg font-bold text-zinc-800 mb-2">
                  <span className="text-emerald-600">Coping Mode</span> — Emotional Growth
                </h3>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  When children face challenges — a new sibling, moving to a new school, fears and
                  worries — stories help them process emotions safely. Coping stories validate
                  feelings and model healthy responses through relatable characters.
                </p>
              </div>
            </div>
          </div>

          {/* Age-Appropriate Growth */}
          <div className="bg-zinc-50 rounded-2xl p-6 md:p-8 mb-8 border border-zinc-200">
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap className="w-8 h-8 text-emerald-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Growing With Your Child</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed mb-6">
              Stories adapt to your child&apos;s developmental stage, so the experience grows with them:
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="bg-emerald-100 text-emerald-700 font-bold text-sm rounded-lg px-3 py-1.5 flex-shrink-0">
                  Ages 3–5
                </div>
                <p className="text-zinc-600 text-sm">
                  Simple sentences, bright colorful illustrations, familiar settings. Builds early
                  vocabulary, letter awareness, and the habit of engaging with books.
                </p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 text-blue-700 font-bold text-sm rounded-lg px-3 py-1.5 flex-shrink-0">
                  Ages 6–8
                </div>
                <p className="text-zinc-600 text-sm">
                  Richer narratives, longer sentences, more complex plots. Develops reading
                  comprehension, cause-and-effect thinking, and emotional nuance.
                </p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-violet-100 text-violet-700 font-bold text-sm rounded-lg px-3 py-1.5 flex-shrink-0">
                  Ages 9–12
                </div>
                <p className="text-zinc-600 text-sm">
                  Complex stories with deeper themes, graphic novel-style illustrations, and layered
                  characters. Builds critical thinking, advanced vocabulary, and a bridge to independent reading.
                </p>
              </div>
            </div>
          </div>

          {/* Multilingual Learning */}
          <div className="bg-blue-50 rounded-2xl p-6 md:p-8 mb-8 border border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="w-8 h-8 text-blue-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Stories in Any Language</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed mb-4">
              Language is the gateway to literacy, and every child deserves to learn in the language
              they speak at home. Little Story Bear generates stories in <strong>30+ languages</strong> — from
              Arabic and Urdu to Spanish, Mandarin, French, and beyond.
            </p>
            <p className="text-lg text-zinc-600 leading-relaxed mb-6">
              For multilingual families, stories can be created in a child&apos;s heritage language,
              helping them build reading skills and cultural connection simultaneously. Whether
              your family speaks one language or three, every child can create stories in the
              language that feels like home.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { lang: 'Arabic', dir: 'RTL support' },
                { lang: 'Spanish', dir: '30+ languages' },
                { lang: 'Mandarin', dir: 'CJK support' },
                { lang: 'Urdu', dir: 'RTL support' },
                { lang: 'French', dir: 'European' },
                { lang: 'Hindi', dir: 'Indic scripts' },
                { lang: 'Turkish', dir: 'And many more' },
                { lang: 'Swahili', dir: 'African languages' },
              ].map((item) => (
                <div key={item.lang} className="bg-white rounded-lg p-3 text-center border border-blue-100">
                  <p className="font-semibold text-zinc-700 text-sm">{item.lang}</p>
                  <p className="text-zinc-400 text-xs">{item.dir}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Safety & Trust */}
          <div className="bg-zinc-50 rounded-2xl p-6 md:p-8 mb-8 border border-zinc-200">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Safe &amp; Age-Appropriate</h2>
            </div>
            <ul className="space-y-3 text-zinc-600">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Every story passes multi-layer content safety checks before reaching your child</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Illustrations are filtered for age-appropriate, child-safe imagery</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>No ads, no data collection from children, no external links</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>Characters represent diverse backgrounds with respectful, inclusive design</span>
              </li>
            </ul>
          </div>

          {/* Our Promise */}
          <div className="bg-emerald-600 text-white rounded-2xl p-6 md:p-8 text-center">
            <div className="flex justify-center mb-4">
              <BeaverMascot greeting="" isRecording={false} isProcessing={false} size="small" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Our Promise to Families</h2>
            <p className="text-lg text-white/90 leading-relaxed max-w-2xl mx-auto">
              Every child deserves to see themselves as a reader and a creator. We&apos;re building
              Little Story Bear to make that possible — one story at a time, in any language,
              for every child, regardless of ability or background.
            </p>
            <p className="text-emerald-200 mt-4 font-semibold">&mdash; The Little Story Bear Team</p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold text-lg active:scale-[0.98] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]"
          >
            <BookOpen className="w-6 h-6" />
            Start Creating Stories
          </Link>
          <p className="text-zinc-400 mt-4">
            Join families around the world building a love of reading through storytelling.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-zinc-400 text-sm">
          <p>Made with love for young learners everywhere</p>
          <div className="flex justify-center gap-4 mt-4">
            <Link href="/pricing" className="hover:text-zinc-600 underline">Pricing</Link>
            <Link href="/terms" className="hover:text-zinc-600 underline">Terms & Conditions</Link>
            <Link href="/" className="hover:text-zinc-600 underline">Create a Story</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
