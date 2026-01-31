'use client'

import Link from 'next/link'
import { BookOpen, ArrowLeft, Check } from 'lucide-react'

export default function PricingPage() {
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
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-blue-800 mb-4 font-kids">
              Simple, Transparent Pricing
            </h1>
            <p className="text-lg text-gray-700">
              Create magical stories for your children
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Free</h3>
              <div className="text-4xl font-bold text-blue-600 mb-4">
                $0
                <span className="text-lg text-gray-600 font-normal">/month</span>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>1 story per month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>AI-generated illustrations</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Download as PDF</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>1 narrator voice</span>
                </li>
              </ul>
              <Link
                href="/"
                className="block w-full text-center px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-all"
              >
                Get Started
              </Link>
            </div>

            {/* Premium Plan */}
            <div className="border-2 border-blue-600 rounded-2xl p-6 hover:shadow-xl transition-all relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                POPULAR
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Premium</h3>
              <div className="text-4xl font-bold text-blue-600 mb-4">
                $9.99
                <span className="text-lg text-gray-600 font-normal">/month</span>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Unlimited stories</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>AI-generated illustrations</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Download as PDF</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>4 AI narrator voices</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Save to library</span>
                </li>
              </ul>
              <Link
                href="/"
                className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Family Plan */}
            <div className="border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl transition-all">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Family</h3>
              <div className="text-4xl font-bold text-blue-600 mb-4">
                $19.99
                <span className="text-lg text-gray-600 font-normal">/month</span>
              </div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Everything in Premium</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Up to 5 child accounts</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>Priority support</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                  <span>20% off printing</span>
                </li>
              </ul>
              <Link
                href="/"
                className="block w-full text-center px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-all"
              >
                Start Free Trial
              </Link>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-center text-gray-600">
            <p className="mb-2">All plans include professional printing services at additional cost</p>
            <p>Cancel anytime. No long-term contracts.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
