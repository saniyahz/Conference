'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check,
  BookOpen,
  Loader2,
  Sparkles,
  Crown,
  Star,
  School,
  Users,
  Zap,
} from 'lucide-react'
import {
  PARENT_PLANS,
  SCHOOL_PLANS,
  type PlanType,
} from '@/lib/subscription'

export default function PricingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleSubscribe = async (plan: PlanType, billingCycle: 'monthly' | 'yearly' = 'monthly') => {
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

  return (
    <div className="min-h-[100dvh] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 text-emerald-600 hover:text-emerald-700">
            <BookOpen className="w-8 h-8" />
            <span className="text-2xl font-bold">My Story Bear</span>
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-800 mb-3 tracking-tight">
            Choose Your Plan
          </h1>
          <p className="text-xl text-zinc-500">
            Start creating magical stories today!
          </p>
        </div>

        {/* Parent Plans — Asymmetric: featured plan is larger */}
        <div className="grid md:grid-cols-[1fr_1fr_1.15fr] gap-6 max-w-5xl mx-auto">

          {/* Free */}
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 border border-zinc-200 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-6 h-6 text-zinc-400" />
              <h3 className="text-2xl font-bold text-zinc-800">Free</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-4">Try the magic</p>
            <div className="mb-6">
              <span className="text-4xl font-bold text-zinc-800">$0</span>
              <span className="text-zinc-400 ml-1">forever</span>
            </div>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-600">1 free story</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-600">PDF download &amp; audio</span>
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('free')}
              className="w-full py-3 border border-emerald-500 text-emerald-600 rounded-xl hover:bg-emerald-50 font-medium active:scale-[0.98]"
            >
              Get Started Free
            </button>
          </div>

          {/* Plus */}
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 border border-zinc-200 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-6 h-6 text-emerald-500" />
              <h3 className="text-2xl font-bold text-zinc-800">Plus</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-4">Great for regular storytelling</p>
            <div className="mb-1">
              <span className="text-4xl font-bold text-zinc-800">
                ${PARENT_PLANS.plus.pricing.monthly.toFixed(2)}
              </span>
              <span className="text-zinc-400 ml-1">/month</span>
            </div>
            <button
              onClick={() => handleSubscribe('plus', 'yearly')}
              className="text-sm text-emerald-600 hover:text-emerald-800 hover:underline mb-6 text-left"
            >
              or ${PARENT_PLANS.plus.pricing.yearlyPerMonth.toFixed(2)}/mo billed yearly (save {PARENT_PLANS.plus.pricing.yearlySavingsPercent}%)
            </button>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-600">7 books per month</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-600">PDF download &amp; audio</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-600">25% off printing</span>
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('plus')}
              disabled={isLoading === 'plus'}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:bg-zinc-300 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isLoading === 'plus' ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
              ) : (
                'Choose Plus'
              )}
            </button>
          </div>

          {/* Unlimited — Featured */}
          <div className="bg-zinc-900 text-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              BEST VALUE
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-6 h-6 text-emerald-400" />
              <h3 className="text-2xl font-bold">Unlimited</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-4">Unlimited creativity for families</p>
            <div className="mb-1">
              <span className="text-4xl font-bold">
                ${PARENT_PLANS.unlimited.pricing.monthly.toFixed(2)}
              </span>
              <span className="text-zinc-400 ml-1">/month</span>
            </div>
            <button
              onClick={() => handleSubscribe('unlimited', 'yearly')}
              className="text-sm text-zinc-400 hover:text-white hover:underline mb-6 text-left"
            >
              or ${PARENT_PLANS.unlimited.pricing.yearlyPerMonth.toFixed(2)}/mo billed yearly (save {PARENT_PLANS.unlimited.pricing.yearlySavingsPercent}%)
            </button>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>Unlimited books</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>PDF download &amp; audio</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>35% off printing</span>
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('unlimited')}
              disabled={isLoading === 'unlimited'}
              className="w-full py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 font-medium disabled:bg-zinc-600 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {isLoading === 'unlimited' ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
              ) : (
                'Go Unlimited'
              )}
            </button>
          </div>
        </div>

        {/* School Plans */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-zinc-800 flex items-center justify-center gap-2 tracking-tight">
              <School className="w-7 h-7 text-emerald-600" />
              School Plans
            </h2>
            <p className="text-zinc-500 mt-2">School-wide access with shared book pools</p>
          </div>

          <div className="grid md:grid-cols-[1fr_1.15fr_1fr] gap-6">

            {/* Library Starter */}
            <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 border border-zinc-200 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <School className="w-6 h-6 text-emerald-500" />
                <h3 className="text-2xl font-bold text-zinc-800">Starter</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Get your school started</p>
              <div className="mb-1">
                <span className="text-4xl font-bold text-zinc-800">
                  ${SCHOOL_PLANS.library_starter.pricing.monthly}
                </span>
                <span className="text-zinc-400 ml-1">/month</span>
              </div>
              <button
                onClick={() => handleSubscribe('library_starter', 'yearly')}
                className="text-sm text-emerald-600 hover:text-emerald-800 hover:underline mb-6 text-left"
              >
                or ${SCHOOL_PLANS.library_starter.pricing.yearlyPerMonth.toFixed(0)}/mo billed yearly (save ~{SCHOOL_PLANS.library_starter.pricing.yearlySavingsPercent}%)
              </button>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">Up to 250 students</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">500 books/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">Admin dashboard</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe('library_starter')}
                disabled={isLoading === 'library_starter'}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:bg-zinc-300 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isLoading === 'library_starter' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  'Get Started'
                )}
              </button>
            </div>

            {/* Library Plus — Featured */}
            <div className="bg-zinc-900 text-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] p-8 flex flex-col relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-6 h-6 text-emerald-400" />
                <h3 className="text-2xl font-bold">Plus</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">For growing schools</p>
              <div className="mb-1">
                <span className="text-4xl font-bold">
                  ${SCHOOL_PLANS.library_plus.pricing.monthly}
                </span>
                <span className="text-zinc-400 ml-1">/month</span>
              </div>
              <button
                onClick={() => handleSubscribe('library_plus', 'yearly')}
                className="text-sm text-zinc-400 hover:text-white hover:underline mb-6 text-left"
              >
                or ${SCHOOL_PLANS.library_plus.pricing.yearlyPerMonth.toFixed(0)}/mo billed yearly (save ~{SCHOOL_PLANS.library_plus.pricing.yearlySavingsPercent}%)
              </button>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Up to 750 students</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>1,500 books/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Everything in Starter</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe('library_plus')}
                disabled={isLoading === 'library_plus'}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 font-medium disabled:bg-zinc-600 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isLoading === 'library_plus' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  'Choose Plus'
                )}
              </button>
            </div>

            {/* Library Max */}
            <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 border border-zinc-200 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-6 h-6 text-emerald-600" />
                <h3 className="text-2xl font-bold text-zinc-800">Max</h3>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Full-scale access</p>
              <div className="mb-1">
                <span className="text-4xl font-bold text-zinc-800">
                  ${SCHOOL_PLANS.library_max.pricing.monthly}
                </span>
                <span className="text-zinc-400 ml-1">/month</span>
              </div>
              <button
                onClick={() => handleSubscribe('library_max', 'yearly')}
                className="text-sm text-emerald-600 hover:text-emerald-800 hover:underline mb-6 text-left"
              >
                or ${SCHOOL_PLANS.library_max.pricing.yearlyPerMonth.toFixed(0)}/mo billed yearly (save ~{SCHOOL_PLANS.library_max.pricing.yearlySavingsPercent}%)
              </button>
              <ul className="space-y-3 mb-8 flex-grow">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">Up to 1,500 students</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">3,500 books/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-600">Everything in Plus</span>
                </li>
              </ul>
              <button
                onClick={() => handleSubscribe('library_max')}
                disabled={isLoading === 'library_max'}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:bg-zinc-300 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isLoading === 'library_max' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  'Choose Max'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-10 text-center space-y-2">
          <Link href="/" className="text-zinc-500 hover:text-zinc-700 font-medium block">
            &larr; Back to Home
          </Link>
          <Link href="/terms" className="text-zinc-400 hover:text-zinc-600 text-sm underline">
            Terms &amp; Conditions
          </Link>
        </div>
      </div>
    </div>
  )
}
