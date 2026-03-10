'use client'

import Link from 'next/link'
import { BookOpen, Heart, Users, ArrowLeft, Mic, PenTool, Headphones, Check } from 'lucide-react'
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

        {/* Hero Section with Benny */}
        <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 md:p-12 mb-8 border border-zinc-200">
          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center mb-8">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-zinc-800 mb-4 tracking-tight">
                Meet Story Bear &amp; Our Story
              </h1>
              <p className="text-xl text-zinc-500">
                Helping kids discover the joy of storytelling
              </p>
            </div>
            <div className="hidden md:block">
              <BeaverMascot greeting="Hi there!" isRecording={false} isProcessing={false} size="medium" />
            </div>
          </div>

          {/* Our Mission */}
          <div className="bg-zinc-50 rounded-2xl p-6 md:p-8 mb-8 border border-zinc-200">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-8 h-8 text-rose-500" />
              <h2 className="text-2xl font-bold text-zinc-800">Our Mission</h2>
            </div>
            <p className="text-lg text-zinc-600 leading-relaxed">
              We believe every child has a story to tell. <strong>My Story Bear</strong> was created
              to spark the imagination of young minds and help them fall in love with reading and
              storytelling. By letting kids speak their ideas and watch them transform into beautiful
              illustrated stories, we&apos;re making creativity accessible and fun for everyone.
            </p>
          </div>

          {/* Why We Started */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="w-8 h-8 text-emerald-600" />
              <h2 className="text-2xl font-bold text-zinc-800">Why We Started This Journey</h2>
            </div>

            <div className="space-y-6 text-zinc-600">
              <p className="text-lg leading-relaxed">
                In a world full of screens and distractions, we noticed something troubling:
                fewer kids were picking up books, and fewer were discovering the magic of creating
                their own stories. We wanted to change that.
              </p>

              <p className="text-lg leading-relaxed">
                <strong>Story Bear</strong> was born from a simple idea: what if we could
                make storytelling as easy as talking to a friend? Kids don&apos;t need to know how to
                write perfectly or draw beautifully to be storytellers. They just need their
                imagination and their voice.
              </p>

              <p className="text-lg leading-relaxed">
                When a child sees their spoken words transformed into a real storybook with
                colorful illustrations, something magical happens. They realize:
                <em className="text-emerald-600 font-semibold"> &quot;I&apos;m an author! I created this!&quot;</em>
              </p>
            </div>
          </div>

          {/* What We Believe — 2-column zig-zag */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <Mic className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Every Voice Matters</h3>
              <p className="text-zinc-500 text-sm">
                Kids who struggle with writing can still be amazing storytellers.
                Speaking their ideas removes barriers to creativity.
              </p>
            </div>

            <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200 md:mt-8">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <PenTool className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Creativity Builds Confidence</h3>
              <p className="text-zinc-500 text-sm">
                When kids see their ideas come to life, they gain confidence to
                express themselves and explore new possibilities.
              </p>
            </div>

            <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <Headphones className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Reading is an Adventure</h3>
              <p className="text-zinc-500 text-sm">
                By creating their own stories, kids develop a love for reading
                that lasts a lifetime. Their journey into books starts here.
              </p>
            </div>

            <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200 md:mt-8">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Stories Connect Families</h3>
              <p className="text-zinc-500 text-sm">
                A story created by a child becomes a treasured memory — something
                to share, read aloud, and keep forever.
              </p>
            </div>
          </div>

          {/* Impact Section */}
          <div className="bg-zinc-50 rounded-2xl p-6 md:p-8 mb-8 border border-zinc-200">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-8 h-8 text-emerald-600" />
              <h2 className="text-2xl font-bold text-zinc-800">The Journey Into Reading</h2>
            </div>
            <div className="space-y-4 text-zinc-600">
              <p className="text-lg leading-relaxed">
                Research shows that children who engage with storytelling early develop stronger
                language skills, better comprehension, and a deeper love for reading. When kids
                become authors of their own stories, they:
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Build vocabulary and language skills naturally</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Develop creative thinking and problem-solving abilities</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Gain confidence in expressing their ideas</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Create memories they can share with family and friends</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>Start a lifelong journey of exploring ideas through books</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Benny's Promise */}
          <div className="bg-emerald-600 text-white rounded-2xl p-6 md:p-8 text-center">
            <div className="flex justify-center mb-4">
              <BeaverMascot greeting="" isRecording={false} isProcessing={false} size="small" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Our Promise</h2>
            <p className="text-lg text-white/90 leading-relaxed max-w-2xl mx-auto">
              &quot;Every story you tell is special. I&apos;m here to listen to your amazing ideas and
              help bring them to life. Together, we&apos;ll create adventures you can read again
              and again. So tell me... what story shall we create today?&quot;
            </p>
            <p className="text-emerald-200 mt-4 font-semibold">&mdash; The My Story Bear Team</p>
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
            Join thousands of young authors on their storytelling adventure!
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-zinc-400 text-sm">
          <p>Made with love for young storytellers everywhere</p>
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
