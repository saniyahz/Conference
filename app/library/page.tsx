'use client'

import Link from 'next/link'
import { BookOpen, ArrowLeft, Book } from 'lucide-react'

export default function LibraryPage() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Navigation */}
        <div className="flex justify-between items-center mb-8 bg-white rounded-2xl shadow-lg p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-blue-800">Benny's Story Time</span>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </Link>
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-blue-800 mb-4 font-kids">
              My Story Library
            </h1>
            <p className="text-lg text-gray-700">
              Your collection of magical stories
            </p>
          </div>

          {/* Coming Soon Message */}
          <div className="text-center py-16">
            <Book className="w-24 h-24 text-blue-300 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-gray-700 mb-4">
              Library Feature Coming Soon!
            </h2>
            <p className="text-gray-600 mb-8">
              Soon you'll be able to save and revisit all your favorite stories here.
            </p>
            <Link
              href="/"
              className="inline-block px-8 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-all transform hover:scale-105"
            >
              Create a New Story
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
