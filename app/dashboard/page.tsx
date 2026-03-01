'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen,
  Trash2,
  LogOut,
  CreditCard,
  Plus,
  Loader2,
  Printer,
  Download,
  Volume2,
  Eye,
  Library,
  Sparkles,
  ArrowLeft,
  Package,
  Truck,
  Check,
  ExternalLink,
} from 'lucide-react'
import { PLANS, PlanType } from '@/lib/subscription'

type Story = {
  id: string
  title: string
  author?: string
  pages: string
  coverImage?: string
  createdAt: string
  downloadCount: number
  audioPlayCount: number
  isSaved: boolean
}

type UsageTracking = {
  storiesCreatedThisMonth: number
  downloadsThisMonth: number
  audioPlaysThisMonth: number
  totalStoriesCreated: number
}

type PrintOrder = {
  id: string
  storyId: string
  storyTitle?: string
  status: string
  totalPrice: number
  trackingNumber?: string
  createdAt: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [orders, setOrders] = useState<PrintOrder[]>([])
  const [usage, setUsage] = useState<UsageTracking | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    } else if (status === 'authenticated') {
      fetchData()
    }
  }, [status])

  const fetchData = async () => {
    try {
      const [storiesRes, usageRes, ordersRes] = await Promise.all([
        fetch('/api/stories'),
        fetch('/api/usage'),
        fetch('/api/print-order'),
      ])

      const storiesData = await storiesRes.json()
      const usageData = await usageRes.json()
      const ordersData = await ordersRes.json()

      setStories(storiesData.stories || [])
      setUsage(usageData.usage || null)
      setOrders(ordersData.orders || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this story?')) {
      return
    }

    setDeletingId(id)

    try {
      const response = await fetch(`/api/stories/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setStories(stories.filter((s) => s.id !== id))
      } else {
        alert('Failed to delete story')
      }
    } catch (error) {
      console.error('Error deleting story:', error)
      alert('Failed to delete story')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = async (story: Story) => {
    setDownloadingId(story.id)

    try {
      const pages = JSON.parse(story.pages)
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story: {
            title: story.title,
            author: story.author,
            pages
          }
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)

        // Update usage tracking
        await fetch('/api/usage/download', { method: 'POST', body: JSON.stringify({ storyId: story.id }) })
      } else {
        alert('Failed to download PDF')
      }
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF')
    } finally {
      setDownloadingId(null)
    }
  }

  const handlePrint = async (storyId: string) => {
    router.push(`/print/${storyId}`)
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const subscription = session.user.subscription
  const planType = (subscription?.plan || 'free') as PlanType
  const planInfo = PLANS[planType]
  const limits = planInfo.limits

  // Calculate remaining allowances
  const storiesRemaining = limits.storiesPerMonth === -1
    ? 'Unlimited'
    : Math.max(0, limits.storiesPerMonth - (usage?.storiesCreatedThisMonth || 0))
  const downloadsRemaining = limits.downloadsPerMonth === -1
    ? 'Unlimited'
    : Math.max(0, limits.downloadsPerMonth - (usage?.downloadsThisMonth || 0))
  const audioRemaining = limits.audioPlaysPerMonth === -1
    ? 'Unlimited'
    : Math.max(0, limits.audioPlaysPerMonth - (usage?.audioPlaysThisMonth || 0))
  const libraryRemaining = limits.maxLibrarySize === -1
    ? 'Unlimited'
    : Math.max(0, limits.maxLibrarySize - stories.filter(s => s.isSaved).length)

  return (
    <div className="min-h-[100dvh] p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back to Home */}
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-800 font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 mb-8 border border-zinc-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-2">
                <BookOpen className="w-7 h-7 text-emerald-600" />
                <h1 className="text-3xl font-bold text-zinc-800 tracking-tight">My Story Library</h1>
              </Link>
              <p className="text-zinc-500">Welcome back, {session.user.name || session.user.email}!</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/pricing"
                className="px-4 py-2 border border-emerald-500 text-emerald-600 rounded-xl hover:bg-emerald-50 font-medium flex items-center gap-2 active:scale-[0.98]"
              >
                <CreditCard className="w-5 h-5" />
                {planType === 'free' ? 'Upgrade' : 'Manage Plan'}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 font-medium flex items-center gap-2 active:scale-[0.98]"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Subscription & Usage Info */}
        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-6 mb-8">
          {/* Current Plan */}
          <div className="bg-emerald-600 text-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-emerald-200" />
              <h2 className="text-xl font-bold">{planInfo.name} Plan</h2>
            </div>
            <p className="text-white/80 mb-4">{planInfo.description}</p>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
              <p className="text-sm text-white/80 mb-1">Print Discount</p>
              <p className="text-2xl font-bold">{limits.printDiscountPercent}% OFF</p>
            </div>
            {planType === 'free' && (
              <Link
                href="/pricing"
                className="mt-4 block w-full text-center bg-white text-emerald-600 py-2 rounded-xl font-semibold hover:bg-zinc-50 active:scale-[0.98]"
              >
                Upgrade for Unlimited Stories
              </Link>
            )}
          </div>

          {/* Usage Stats */}
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200">
            <div className="flex items-center gap-2 mb-4">
              <Library className="w-6 h-6 text-emerald-600" />
              <h2 className="text-xl font-bold text-zinc-800">This Month&apos;s Usage</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-50 rounded-xl p-3">
                <p className="text-sm text-zinc-500">Stories</p>
                <p className="text-lg font-bold text-emerald-600">
                  {usage?.storiesCreatedThisMonth || 0} / {limits.storiesPerMonth === -1 ? '\u221e' : limits.storiesPerMonth}
                </p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3">
                <p className="text-sm text-zinc-500">Downloads</p>
                <p className="text-lg font-bold text-emerald-600">
                  {usage?.downloadsThisMonth || 0} / {limits.downloadsPerMonth === -1 ? '\u221e' : limits.downloadsPerMonth}
                </p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3">
                <p className="text-sm text-zinc-500">Audio Plays</p>
                <p className="text-lg font-bold text-emerald-600">
                  {usage?.audioPlaysThisMonth || 0} / {limits.audioPlaysPerMonth === -1 ? '\u221e' : limits.audioPlaysPerMonth}
                </p>
              </div>
              <div className="bg-zinc-50 rounded-xl p-3">
                <p className="text-sm text-zinc-500">Library</p>
                <p className="text-lg font-bold text-emerald-600">
                  {stories.filter(s => s.isSaved).length} / {limits.maxLibrarySize === -1 ? '\u221e' : limits.maxLibrarySize}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-8">
          <Link
            href="/"
            className="flex-1 bg-emerald-600 text-white p-6 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:bg-emerald-700 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <Plus className="w-6 h-6" />
            <span className="font-semibold text-lg">Create New Story</span>
          </Link>
        </div>

        {/* Saved Stories */}
        <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200">
          <h2 className="text-2xl font-bold text-zinc-800 mb-6 tracking-tight">My Saved Stories</h2>

          {stories.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 text-lg mb-4">No saved stories yet</p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium active:scale-[0.98]"
              >
                Create Your First Story
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-[2fr_1fr] lg:grid-cols-[2fr_1fr_1fr] gap-6">
              {stories.map((story) => {
                const pages = JSON.parse(story.pages)
                const firstPageImage = pages[0]?.imageUrl
                return (
                  <div
                    key={story.id}
                    className="bg-white rounded-xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] overflow-hidden border border-zinc-200"
                  >
                    {/* Cover Image */}
                    {firstPageImage && (
                      <div className="h-40 bg-zinc-100 overflow-hidden">
                        <img
                          src={firstPageImage}
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <h3 className="text-xl font-bold text-zinc-800 mb-1">{story.title}</h3>
                      {story.author && (
                        <p className="text-sm text-zinc-500 mb-2">by {story.author}</p>
                      )}
                      <p className="text-zinc-400 text-sm mb-4">
                        {pages.length} pages &middot; {new Date(story.createdAt).toLocaleDateString()}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push(`/story/${story.id}`)}
                          className="flex-1 min-w-[80px] px-3 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium text-sm flex items-center justify-center gap-1 active:scale-[0.98]"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(story)}
                          disabled={downloadingId === story.id || (typeof downloadsRemaining === 'number' && downloadsRemaining <= 0)}
                          className="flex-1 min-w-[80px] px-3 py-2 bg-zinc-800 text-white rounded-xl hover:bg-zinc-900 font-medium text-sm flex items-center justify-center gap-1 disabled:bg-zinc-300 active:scale-[0.98]"
                        >
                          {downloadingId === story.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          PDF
                        </button>
                        <button
                          onClick={() => handlePrint(story.id)}
                          className="flex-1 min-w-[80px] px-3 py-2 bg-zinc-100 text-zinc-700 rounded-xl hover:bg-zinc-200 font-medium text-sm flex items-center justify-center gap-1 active:scale-[0.98]"
                        >
                          <Printer className="w-4 h-4" />
                          Print
                        </button>
                        <button
                          onClick={() => handleDelete(story.id)}
                          disabled={deletingId === story.id}
                          className="px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 font-medium text-sm flex items-center justify-center disabled:bg-zinc-100 disabled:text-zinc-400 active:scale-[0.98]"
                        >
                          {deletingId === story.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Print Orders */}
        {orders.length > 0 && (
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] p-6 border border-zinc-200 mt-8">
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-6 h-6 text-emerald-600" />
              <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">Print Orders</h2>
            </div>

            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-zinc-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-zinc-200">
                      <BookOpen className="w-5 h-5 text-zinc-500" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-800">{order.storyTitle || 'Untitled Story'}</p>
                      <p className="text-xs text-zinc-400">
                        {new Date(order.createdAt).toLocaleDateString()} &middot; ${order.totalPrice.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        order.status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-700'
                          : order.status === 'shipped'
                          ? 'bg-emerald-50 text-emerald-600'
                          : order.status === 'processing'
                          ? 'bg-amber-50 text-amber-700'
                          : order.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {order.status === 'delivered' && <Check className="w-3 h-3" />}
                      {order.status === 'shipped' && <Truck className="w-3 h-3" />}
                      {order.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {order.status === 'pending' && <Package className="w-3 h-3" />}
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>

                    {/* Tracking link */}
                    {order.trackingNumber && (
                      <a
                        href={`https://track.aftership.com/${order.trackingNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline"
                      >
                        Track
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-zinc-400 text-sm">
          <p>Made with love for young storytellers everywhere</p>
          <div className="flex justify-center gap-4 mt-4">
            <Link href="/" className="hover:text-zinc-600 underline">Create a Story</Link>
            <Link href="/about" className="hover:text-zinc-600 underline">About Us</Link>
            <Link href="/pricing" className="hover:text-zinc-600 underline">Pricing</Link>
            <Link href="/terms" className="hover:text-zinc-600 underline">Terms & Conditions</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
