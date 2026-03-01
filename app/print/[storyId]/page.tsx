'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Printer,
  Truck,
  CreditCard,
  Check,
  Loader2,
  MapPin,
  BookOpen,
  Package,
  AlertCircle,
} from 'lucide-react'
import { PLANS, PlanType } from '@/lib/subscription'

type Story = {
  id: string
  title: string
  author?: string
  pages: string
  coverImage?: string
  createdAt: string
}

type Quote = {
  basePrice: number
  discountPercent: number
  discountAmount: number
  ourPrice: number
  shippingCost: number
  totalPrice: number
  minDeliveryDays: number
  maxDeliveryDays: number
  shipmentMethodUid: string
}

// Country list (common ones first)
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
]

export default function PrintOrderPage({ params }: { params: { storyId: string } }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [story, setStory] = useState<Story | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [step, setStep] = useState<'shipping' | 'quote' | 'success'>('shipping')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const [isOrdering, setIsOrdering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shipping form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [country, setCountry] = useState('US')

  // Check for success/cancel from Stripe redirect
  const isSuccess = searchParams.get('success') === 'true'
  const isCancelled = searchParams.get('cancelled') === 'true'
  const returnedOrderId = searchParams.get('orderId')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    } else if (status === 'authenticated') {
      fetchStory()
    }
  }, [status])

  useEffect(() => {
    if (isSuccess) {
      setStep('success')
    }
  }, [isSuccess])

  const fetchStory = async () => {
    try {
      const res = await fetch(`/api/stories/${params.storyId}`)
      if (res.ok) {
        const data = await res.json()
        setStory(data.story)
      } else {
        setError('Story not found')
      }
    } catch {
      setError('Failed to load story')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGetQuote = async () => {
    if (!firstName || !lastName || !address || !city || !zip || !country) {
      setError('Please fill in all required fields')
      return
    }

    setIsQuoting(true)
    setError(null)

    try {
      const res = await fetch('/api/print-order/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingAddress: {
            firstName,
            lastName,
            address,
            city,
            state,
            zip,
            country,
            email: session?.user?.email || '',
          },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setQuote(data)
        setStep('quote')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to get quote')
      }
    } catch {
      setError('Failed to get quote. Please try again.')
    } finally {
      setIsQuoting(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!story || !quote) return

    setIsOrdering(true)
    setError(null)

    try {
      const res = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          shippingName: `${firstName} ${lastName}`,
          shippingAddress: address,
          shippingCity: city,
          shippingState: state,
          shippingZip: zip,
          shippingCountry: country,
          shippingCost: quote.shippingCost,
          shipmentMethodUid: quote.shipmentMethodUid,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.checkoutUrl) {
          // Redirect to Stripe Checkout
          window.location.href = data.checkoutUrl
        } else {
          setError('Failed to create checkout session')
        }
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create order')
      }
    } catch {
      setError('Failed to place order. Please try again.')
    } finally {
      setIsOrdering(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!session || !story) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <p className="text-zinc-500 text-lg">{error || 'Story not found'}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.98]"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const pages = JSON.parse(story.pages)
  const coverImage = pages[0]?.imageUrl
  const subscription = session.user.subscription
  const planType = (subscription?.plan || 'free') as PlanType
  const planInfo = PLANS[planType]

  // ═══ SUCCESS STATE ═══
  if (step === 'success') {
    return (
      <div className="min-h-[100dvh] p-4 md:p-8">
        <div className="max-w-xl mx-auto mt-12">
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-8 border border-zinc-200 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-800 mb-2">Order Placed!</h1>
            <p className="text-zinc-500 mb-6">
              Your book is being printed and will ship soon. We&apos;ll update you with tracking info.
            </p>

            {returnedOrderId && (
              <div className="bg-zinc-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm text-zinc-500">Order ID</p>
                <p className="text-sm font-mono text-zinc-800 break-all">{returnedOrderId}</p>
              </div>
            )}

            <div className="bg-emerald-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <p className="font-semibold text-emerald-800">What happens next?</p>
              </div>
              <ol className="text-sm text-emerald-700 space-y-1 ml-7 list-decimal">
                <li>We generate your print-ready book (1-2 minutes)</li>
                <li>Gelato prints your 8x8&quot; hardcover book</li>
                <li>Your book ships from the nearest production hub</li>
                <li>Track your order from the dashboard</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium active:scale-[0.98] text-center"
              >
                Go to Dashboard
              </Link>
              <Link
                href="/"
                className="flex-1 px-6 py-3 bg-zinc-100 text-zinc-700 rounded-xl hover:bg-zinc-200 font-medium active:scale-[0.98] text-center"
              >
                Create New Story
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Printer className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-800 tracking-tight">Print Your Book</h1>
            <p className="text-zinc-500 text-sm">8x8&quot; hardcover photobook, professionally printed</p>
          </div>
        </div>

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-amber-800 text-sm">Payment was cancelled. You can try again below.</p>
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_300px] gap-6">
          {/* Main content */}
          <div>
            {/* Book Preview Card */}
            <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200 mb-6">
              <div className="flex gap-4">
                {coverImage && (
                  <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-zinc-100">
                    <img src={coverImage} alt={story.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-zinc-800">{story.title}</h2>
                  {story.author && <p className="text-sm text-zinc-500">by {story.author}</p>}
                  <p className="text-sm text-zinc-400 mt-1">{pages.length} pages</p>
                  <div className="flex items-center gap-2 mt-2">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs text-emerald-600 font-medium">8x8&quot; Hardcover Book</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 1: Shipping Form */}
            {step === 'shipping' && (
              <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200">
                <div className="flex items-center gap-2 mb-6">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-zinc-800">Shipping Address</h2>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">First Name *</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                        placeholder="John"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">Last Name *</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-700">Street Address *</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                        placeholder="New York"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">State / Province</label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                        placeholder="NY"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">ZIP / Postal Code *</label>
                      <input
                        type="text"
                        value={zip}
                        onChange={(e) => setZip(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800"
                        placeholder="10001"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-zinc-700">Country *</label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="px-4 py-3 border border-zinc-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-zinc-800 bg-white"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleGetQuote}
                  disabled={isQuoting}
                  className="mt-6 w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold flex items-center justify-center gap-2 disabled:bg-zinc-300 active:scale-[0.98]"
                >
                  {isQuoting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Getting Quote...
                    </>
                  ) : (
                    <>
                      <Truck className="w-5 h-5" />
                      Get Shipping Quote
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Step 2: Quote & Confirmation */}
            {step === 'quote' && quote && (
              <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200">
                <div className="flex items-center gap-2 mb-6">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-lg font-bold text-zinc-800">Order Summary</h2>
                </div>

                {/* Price breakdown */}
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-zinc-600">
                    <span>8x8&quot; Hardcover Book</span>
                    <span>${quote.basePrice.toFixed(2)}</span>
                  </div>

                  {quote.discountPercent > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>{planInfo.name} Plan Discount ({quote.discountPercent}%)</span>
                      <span>-${quote.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>Book Price</span>
                    <span>${quote.ourPrice.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-zinc-600">
                    <span>Shipping</span>
                    <span>${quote.shippingCost.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-zinc-200 pt-3 flex justify-between text-lg font-bold text-zinc-800">
                    <span>Total</span>
                    <span>${quote.totalPrice.toFixed(2)}</span>
                  </div>
                </div>

                {/* Delivery estimate */}
                <div className="bg-zinc-50 rounded-xl p-4 mb-6 flex items-center gap-3">
                  <Truck className="w-5 h-5 text-zinc-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-zinc-800">
                      Estimated Delivery: {quote.minDeliveryDays}-{quote.maxDeliveryDays} business days
                    </p>
                    <p className="text-xs text-zinc-500">
                      Shipping to {city}, {COUNTRIES.find(c => c.code === country)?.name || country}
                    </p>
                  </div>
                </div>

                {/* Shipping summary */}
                <div className="bg-zinc-50 rounded-xl p-4 mb-6">
                  <p className="text-sm font-medium text-zinc-800 mb-1">Ship to:</p>
                  <p className="text-sm text-zinc-600">
                    {firstName} {lastName}<br />
                    {address}<br />
                    {city}{state ? `, ${state}` : ''} {zip}<br />
                    {COUNTRIES.find(c => c.code === country)?.name || country}
                  </p>
                  <button
                    onClick={() => setStep('shipping')}
                    className="text-emerald-600 text-sm font-medium mt-2 hover:underline"
                  >
                    Edit address
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={isOrdering}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold flex items-center justify-center gap-2 disabled:bg-zinc-300 active:scale-[0.98]"
                >
                  {isOrdering ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Place Order &amp; Pay ${quote.totalPrice.toFixed(2)}
                    </>
                  )}
                </button>

                <p className="text-xs text-zinc-400 text-center mt-3">
                  You&apos;ll be redirected to Stripe for secure payment
                </p>
              </div>
            )}
          </div>

          {/* Sidebar — Book Info */}
          <div className="hidden md:block">
            <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-5 border border-zinc-200 sticky top-8">
              <h3 className="font-bold text-zinc-800 mb-4">Book Details</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Format</span>
                  <span className="text-zinc-800 font-medium">Hardcover</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Size</span>
                  <span className="text-zinc-800 font-medium">8 x 8 inches</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Pages</span>
                  <span className="text-zinc-800 font-medium">24 pages</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Paper</span>
                  <span className="text-zinc-800 font-medium">Silk coated 170gsm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Cover</span>
                  <span className="text-zinc-800 font-medium">Matte lamination</span>
                </div>
              </div>

              <div className="border-t border-zinc-200 mt-4 pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span className="text-zinc-600">Ships worldwide via Gelato</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1 ml-6">
                  Printed at the nearest hub to your address for faster delivery
                </p>
              </div>

              {planInfo.limits.printDiscountPercent > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 mt-4">
                  <p className="text-sm font-medium text-emerald-800">
                    {planInfo.name} Plan: {planInfo.limits.printDiscountPercent}% OFF
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Your plan discount is applied automatically
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
