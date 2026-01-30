'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, BookOpen, Loader2, Sparkles, Crown, Star } from 'lucide-react'
import { PLANS, PlanType } from '@/lib/subscription'

export default function PricingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  const handleSubscribe = async (plan: PlanType) => {
    if (plan === 'free') {
      router.push('/auth/signup')
      return
    }

    if (!session) {
      router.push('/auth/signin')
      return
    }

    setIsLoading(plan)

    try {
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle }),
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

  const getPrice = (plan: PlanType) => {
    const planDetails = PLANS[plan]
    if (billingCycle === 'yearly') {
      return planDetails.pricing.yearly
    }
    return planDetails.pricing.monthly
  }

  const getMonthlyEquivalent = (plan: PlanType) => {
    const planDetails = PLANS[plan]
    if (billingCycle === 'yearly') {
      return planDetails.pricing.yearlyPerMonth
    }
    return planDetails.pricing.monthly
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 text-purple-600 hover:text-purple-700">
            <BookOpen className="w-8 h-8" />
            <span className="text-2xl font-bold">Kids Story Creator</span>
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-purple-800 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-700 mb-8">
            Start creating magical stories today!
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 bg-white rounded-full p-1 shadow-md">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full font-semibold transition-all flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              Yearly
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                billingCycle === 'yearly'
                  ? 'bg-green-400 text-green-900'
                  : 'bg-green-100 text-green-700'
              }`}>
                Save 33%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Free Plan */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-gray-200 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-6 h-6 text-gray-400" />
              <h3 className="text-2xl font-bold text-gray-800">Free</h3>
            </div>
            <p className="text-gray-600 mb-4">{PLANS.free.description}</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-purple-800">$0</span>
              <span className="text-gray-600">/forever</span>
            </div>
            <ul className="space-y-3 mb-8 flex-grow">
              {PLANS.free.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe('free')}
              className="w-full py-3 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 font-semibold transition-all"
            >
              Get Started Free
            </button>
          </div>

          {/* Basic Plan */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-purple-400 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              <h3 className="text-2xl font-bold text-gray-800">Basic</h3>
            </div>
            <p className="text-gray-600 mb-4">{PLANS.basic.description}</p>
            <div className="mb-2">
              <span className="text-4xl font-bold text-purple-800">
                ${billingCycle === 'yearly' ? getMonthlyEquivalent('basic').toFixed(2) : getPrice('basic').toFixed(2)}
              </span>
              <span className="text-gray-600">/month</span>
            </div>
            {billingCycle === 'yearly' && (
              <p className="text-sm text-gray-500 mb-4">
                Billed ${getPrice('basic').toFixed(2)} annually
              </p>
            )}
            {billingCycle === 'monthly' && <div className="mb-4"></div>}
            <ul className="space-y-3 mb-8 flex-grow">
              {PLANS.basic.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
              {billingCycle === 'yearly' && (
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 font-semibold text-green-700">Save 33% vs monthly</span>
                </li>
              )}
            </ul>
            <button
              onClick={() => handleSubscribe('basic')}
              disabled={isLoading === 'basic'}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2 transition-all"
            >
              {isLoading === 'basic' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Choose Basic'
              )}
            </button>
          </div>

          {/* Premium Plan */}
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-2xl shadow-xl p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full">
              BEST VALUE
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-6 h-6 text-yellow-300" />
              <h3 className="text-2xl font-bold">Premium</h3>
            </div>
            <p className="text-white/90 mb-4">{PLANS.premium.description}</p>
            <div className="mb-2">
              <span className="text-4xl font-bold">
                ${billingCycle === 'yearly' ? getMonthlyEquivalent('premium').toFixed(2) : getPrice('premium').toFixed(2)}
              </span>
              <span className="text-white/90">/month</span>
            </div>
            {billingCycle === 'yearly' && (
              <p className="text-sm text-white/70 mb-4">
                Billed ${getPrice('premium').toFixed(2)} annually
              </p>
            )}
            {billingCycle === 'monthly' && <div className="mb-4"></div>}
            <ul className="space-y-3 mb-8 flex-grow">
              {PLANS.premium.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
                  <span className="text-white">{feature}</span>
                </li>
              ))}
              {billingCycle === 'yearly' && (
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
                  <span className="text-yellow-300 font-semibold">Save 33% vs monthly</span>
                </li>
              )}
            </ul>
            <button
              onClick={() => handleSubscribe('premium')}
              disabled={isLoading === 'premium'}
              className="w-full py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-semibold disabled:bg-gray-400 flex items-center justify-center gap-2 transition-all"
            >
              {isLoading === 'premium' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Go Premium'
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
            Turn your digital stories into beautiful printed hardcover books!
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Free Plan</p>
              <p className="text-2xl font-bold text-purple-800">$20</p>
              <p className="text-sm text-gray-600">per book</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Basic Plan</p>
              <p className="text-2xl font-bold text-purple-800">$17</p>
              <p className="text-sm text-green-600 font-medium">15% off</p>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg">
              <p className="font-semibold text-gray-800 mb-1">Premium Plan</p>
              <p className="text-2xl font-bold text-purple-800">$14</p>
              <p className="text-sm text-green-600 font-medium">30% off</p>
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mt-4">
            + shipping costs based on your location
          </p>
        </div>

        {/* FAQ Section */}
        <div className="mt-12 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-purple-800 mb-6 text-center">
            Frequently Asked Questions
          </h3>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 shadow-md">
              <h4 className="font-semibold text-gray-800 mb-2">Can I try before subscribing?</h4>
              <p className="text-gray-600">
                Yes! Create your first story for free. You can experience the full magic before deciding on a plan.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md">
              <h4 className="font-semibold text-gray-800 mb-2">What happens to my stories if I cancel?</h4>
              <p className="text-gray-600">
                Your saved stories remain in your library. You can still view and download them, but creating new stories will be limited to the free plan.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md">
              <h4 className="font-semibold text-gray-800 mb-2">Can I upgrade or downgrade anytime?</h4>
              <p className="text-gray-600">
                Absolutely! You can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the end of your billing period.
              </p>
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
