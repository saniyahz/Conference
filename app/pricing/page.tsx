'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, BookOpen, Loader2 } from 'lucide-react'
import { SUBSCRIPTION_PLANS } from '@/lib/subscriptions'

export default function PricingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleSubscribe = async (plan: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setIsLoading(plan)

    try {
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (error) {
      console.error('Error creating checkout:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 text-purple-600 hover:text-purple-700">
            <BookOpen className="w-8 h-8" />
            <span className="text-2xl font-bold">Kids Story Creator</span>
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-purple-800 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-700">
            Start creating magical stories today!
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Free Plan */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Free</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-purple-800">$0</span>
              <span className="text-gray-600">/forever</span>
            </div>
            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_PLANS.free.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => router.push('/auth/signup')}
              className="w-full py-3 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 font-semibold"
            >
              Get Started
            </button>
          </div>

          {/* Monthly Plan */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-400">
            <div className="bg-purple-100 text-purple-800 text-sm font-semibold px-3 py-1 rounded-full inline-block mb-2">
              Popular
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Monthly</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-purple-800">${SUBSCRIPTION_PLANS.monthly.price}</span>
              <span className="text-gray-600">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_PLANS.monthly.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe('monthly')}
              disabled={isLoading === 'monthly'}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isLoading === 'monthly' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Subscribe Monthly'
              )}
            </button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200">
            <div className="bg-green-100 text-green-800 text-sm font-semibold px-3 py-1 rounded-full inline-block mb-2">
              Save 20%
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Yearly</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-purple-800">${SUBSCRIPTION_PLANS.yearly.price}</span>
              <span className="text-gray-600">/year</span>
            </div>
            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_PLANS.yearly.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={isLoading === 'yearly'}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isLoading === 'yearly' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Subscribe Yearly'
              )}
            </button>
          </div>

          {/* Unlimited Monthly */}
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-2xl shadow-xl p-8 md:col-span-2 lg:col-span-1">
            <div className="bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full inline-block mb-2">
              Best Value
            </div>
            <h3 className="text-2xl font-bold mb-2">Unlimited Monthly</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold">${SUBSCRIPTION_PLANS.unlimited_monthly.price}</span>
              <span className="text-white/90">/month</span>
            </div>
            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_PLANS.unlimited_monthly.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
                  <span className="text-white">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe('unlimited_monthly')}
              disabled={isLoading === 'unlimited_monthly'}
              className="w-full py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isLoading === 'unlimited_monthly' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Go Unlimited'
              )}
            </button>
          </div>

          {/* Unlimited Yearly */}
          <div className="bg-gradient-to-br from-purple-700 to-pink-700 text-white rounded-2xl shadow-xl p-8 md:col-span-2 lg:col-span-1">
            <div className="bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full inline-block mb-2">
              Best Deal
            </div>
            <h3 className="text-2xl font-bold mb-2">Unlimited Yearly</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold">${SUBSCRIPTION_PLANS.unlimited_yearly.price}</span>
              <span className="text-white/90">/year</span>
            </div>
            <ul className="space-y-3 mb-8">
              {SUBSCRIPTION_PLANS.unlimited_yearly.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
                  <span className="text-white">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe('unlimited_yearly')}
              disabled={isLoading === 'unlimited_yearly'}
              className="w-full py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              {isLoading === 'unlimited_yearly' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Go Unlimited Yearly'
              )}
            </button>
          </div>
        </div>

        {/* Print Pricing Info */}
        <div className="mt-12 max-w-3xl mx-auto bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-2xl font-bold text-purple-800 mb-4 text-center">
            Professional Book Printing
          </h3>
          <p className="text-gray-700 text-center mb-6">
            Turn your digital stories into beautiful printed books!
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Free Plan</p>
              <p className="text-2xl font-bold text-purple-800">$30</p>
              <p className="text-sm text-gray-600">per book</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Monthly/Yearly</p>
              <p className="text-2xl font-bold text-purple-800">$25.50</p>
              <p className="text-sm text-gray-600">15% off</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Unlimited</p>
              <p className="text-2xl font-bold text-purple-800">$15</p>
              <p className="text-sm text-gray-600">50% off</p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-purple-600 hover:text-purple-700 font-semibold">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
