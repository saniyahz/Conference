'use client'

import Link from 'next/link'
import { BookOpen, Heart, Sparkles, Users, ArrowLeft, Mic, PenTool, Headphones } from 'lucide-react'

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-cyan-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-800 font-semibold"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </Link>
        </div>

        {/* Hero Section with Benny */}
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12 mb-8 border-2 border-sky-200">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🦫</div>
            <h1 className="text-4xl md:text-5xl font-bold text-sky-700 mb-4">
              Meet Benny & Our Story
            </h1>
            <p className="text-xl text-sky-600">
              Helping kids discover the joy of storytelling
            </p>
          </div>

          {/* Our Mission */}
          <div className="bg-gradient-to-r from-sky-50 to-cyan-50 rounded-2xl p-6 md:p-8 mb-8 border-2 border-sky-100">
            <div className="flex items-center gap-3 mb-4">
              <Heart className="w-8 h-8 text-red-500" />
              <h2 className="text-2xl font-bold text-sky-700">Our Mission</h2>
            </div>
            <p className="text-lg text-gray-700 leading-relaxed">
              We believe every child has a story to tell. <strong>Benny's Story Time</strong> was created
              to spark the imagination of young minds and help them fall in love with reading and
              storytelling. By letting kids speak their ideas and watch them transform into beautiful
              illustrated stories, we're making creativity accessible and fun for everyone.
            </p>
          </div>

          {/* Why We Started */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-8 h-8 text-sky-500" />
              <h2 className="text-2xl font-bold text-sky-700">Why We Started This Journey</h2>
            </div>

            <div className="space-y-6 text-gray-700">
              <p className="text-lg leading-relaxed">
                In a world full of screens and distractions, we noticed something troubling:
                fewer kids were picking up books, and fewer were discovering the magic of creating
                their own stories. We wanted to change that.
              </p>

              <p className="text-lg leading-relaxed">
                <strong>Benny the Beaver</strong> was born from a simple idea: what if we could
                make storytelling as easy as talking to a friend? Kids don't need to know how to
                write perfectly or draw beautifully to be storytellers. They just need their
                imagination and their voice.
              </p>

              <p className="text-lg leading-relaxed">
                When a child sees their spoken words transformed into a real storybook with
                colorful illustrations, something magical happens. They realize:
                <em className="text-sky-600 font-semibold"> "I'm an author! I created this!"</em>
              </p>
            </div>
          </div>

          {/* What We Believe */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-sky-50 rounded-xl p-6 border-2 border-sky-200 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-sky-600" />
              </div>
              <h3 className="text-lg font-bold text-sky-700 mb-2">Every Voice Matters</h3>
              <p className="text-sky-600 text-sm">
                Kids who struggle with writing can still be amazing storytellers.
                Speaking their ideas removes barriers to creativity.
              </p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-6 border-2 border-emerald-200 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <PenTool className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-emerald-700 mb-2">Creativity Builds Confidence</h3>
              <p className="text-emerald-600 text-sm">
                When kids see their ideas come to life, they gain confidence to
                express themselves and explore new possibilities.
              </p>
            </div>

            <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200 text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Headphones className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-purple-700 mb-2">Reading is an Adventure</h3>
              <p className="text-purple-600 text-sm">
                By creating their own stories, kids develop a love for reading
                that lasts a lifetime. Their journey into books starts here.
              </p>
            </div>
          </div>

          {/* Impact Section */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 md:p-8 mb-8 border-2 border-emerald-200">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-8 h-8 text-emerald-600" />
              <h2 className="text-2xl font-bold text-emerald-700">The Journey Into Reading</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p className="text-lg leading-relaxed">
                Research shows that children who engage with storytelling early develop stronger
                language skills, better comprehension, and a deeper love for reading. When kids
                become authors of their own stories, they:
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Build vocabulary and language skills naturally</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Develop creative thinking and problem-solving abilities</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Gain confidence in expressing their ideas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Create memories they can share with family and friends</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Start a lifelong journey of exploring ideas through books</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Benny's Promise */}
          <div className="bg-sky-100 rounded-2xl p-6 md:p-8 border-2 border-sky-300 text-center">
            <div className="text-5xl mb-4">🦫</div>
            <h2 className="text-2xl font-bold text-sky-700 mb-4">Benny's Promise</h2>
            <p className="text-lg text-sky-800 leading-relaxed max-w-2xl mx-auto">
              "Every story you tell is special. I'm here to listen to your amazing ideas and
              help bring them to life. Together, we'll create adventures you can read again
              and again. So tell me... what story shall we create today?"
            </p>
            <p className="text-sky-600 mt-4 font-semibold">— Benny the Story Beaver</p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-sky-500 text-white rounded-full hover:bg-sky-600 font-bold text-lg transition-all transform hover:scale-105 shadow-lg"
          >
            <Sparkles className="w-6 h-6" />
            Start Creating Stories
          </Link>
          <p className="text-sky-600 mt-4">
            Join thousands of young authors on their storytelling adventure!
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sky-600 text-sm">
          <p>Made with love for young storytellers everywhere</p>
          <div className="flex justify-center gap-4 mt-4">
            <Link href="/pricing" className="hover:text-sky-800 underline">Pricing</Link>
            <Link href="/" className="hover:text-sky-800 underline">Create a Story</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
