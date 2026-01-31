'use client'

import Link from 'next/link'
import { BookOpen, ArrowLeft } from 'lucide-react'

export default function AboutPage() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
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
          <h1 className="text-4xl font-bold text-blue-800 mb-6 font-kids">
            About Benny's Story Time
          </h1>

          <div className="space-y-6 text-gray-700 text-lg">
            <p>
              Welcome to Benny's Story Time, where imagination comes to life! Our AI-powered
              platform helps children create magical, personalized stories complete with beautiful
              illustrations and professional narration.
            </p>

            <h2 className="text-2xl font-bold text-blue-700 mt-8 mb-4">
              What We Do
            </h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Transform your child's story ideas into beautifully illustrated books</li>
              <li>Provide high-quality AI narration with multiple voice options</li>
              <li>Create downloadable PDFs to keep forever</li>
              <li>Offer professional printing services worldwide</li>
            </ul>

            <h2 className="text-2xl font-bold text-blue-700 mt-8 mb-4">
              Our Mission
            </h2>
            <p>
              We believe every child has a unique story to tell. Benny's Story Time empowers
              young storytellers to bring their imaginations to life through the power of AI,
              fostering creativity and a love of reading.
            </p>

            <h2 className="text-2xl font-bold text-blue-700 mt-8 mb-4">
              Perfect For
            </h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Children aged 4-8 exploring their creativity</li>
              <li>Parents looking for engaging educational activities</li>
              <li>Teachers creating custom classroom stories</li>
              <li>Gift-givers wanting something truly unique and personal</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
