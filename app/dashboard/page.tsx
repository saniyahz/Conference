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
  ArrowLeft
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

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
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
      const [storiesRes, usageRes] = await Promise.all([
        fetch('/api/stories'),
        fetch('/api/usage')
      ])

      const storiesData = await storiesRes.json()
      const usageData = await usageRes.json()

      setStories(storiesData.stories || [])
      setUsage(usageData.usage || null)
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-yellow-50 to-orange-50">
        <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
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
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-teal-50 via-yellow-50 to-orange-50">
      <div className="max-w-7xl mx-auto">
        {/* Back to Home */}
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-800 font-semibold"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border-2 border-teal-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <Link href="/" className="flex items-center gap-2 mb-2">
                <span className="text-3xl">🦫</span>
                <h1 className="text-3xl font-bold text-teal-700">My Story Library</h1>
              </Link>
              <p className="text-gray-600">Welcome back, {session.user.name || session.user.email}!</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/pricing"
                className="px-4 py-2 border-2 border-teal-500 text-teal-600 rounded-lg hover:bg-teal-50 font-semibold flex items-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                {planType === 'free' ? 'Upgrade' : 'Manage Plan'}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold flex items-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Subscription & Usage Info */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Current Plan */}
          <div className="bg-gradient-to-br from-teal-500 to-green-600 text-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-yellow-300" />
              <h2 className="text-xl font-bold">{planInfo.name} Plan</h2>
            </div>
            <p className="text-white/90 mb-4">{planInfo.description}</p>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm text-white/90 mb-1">Print Discount</p>
              <p className="text-2xl font-bold">{limits.printDiscountPercent}% OFF</p>
            </div>
            {planType === 'free' && (
              <Link
                href="/pricing"
                className="mt-4 block w-full text-center bg-white text-teal-600 py-2 rounded-lg font-semibold hover:bg-gray-100"
              >
                Upgrade for Unlimited Stories
              </Link>
            )}
          </div>

          {/* Usage Stats */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-teal-100">
            <div className="flex items-center gap-2 mb-4">
              <Library className="w-6 h-6 text-teal-600" />
              <h2 className="text-xl font-bold text-gray-800">This Month's Usage</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-teal-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Stories</p>
                <p className="text-lg font-bold text-teal-700">
                  {usage?.storiesCreatedThisMonth || 0} / {limits.storiesPerMonth === -1 ? '∞' : limits.storiesPerMonth}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Downloads</p>
                <p className="text-lg font-bold text-blue-700">
                  {usage?.downloadsThisMonth || 0} / {limits.downloadsPerMonth === -1 ? '∞' : limits.downloadsPerMonth}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Audio Plays</p>
                <p className="text-lg font-bold text-emerald-700">
                  {usage?.audioPlaysThisMonth || 0} / {limits.audioPlaysPerMonth === -1 ? '∞' : limits.audioPlaysPerMonth}
                </p>
              </div>
              <div className="bg-cyan-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Library</p>
                <p className="text-lg font-bold text-cyan-700">
                  {stories.filter(s => s.isSaved).length} / {limits.maxLibrarySize === -1 ? '∞' : limits.maxLibrarySize}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-8">
          <Link
            href="/"
            className="flex-1 bg-teal-500 text-white p-6 rounded-2xl shadow-xl hover:bg-teal-600 transition-all flex items-center justify-center gap-3"
          >
            <Plus className="w-6 h-6" />
            <span className="font-semibold text-lg">Create New Story</span>
          </Link>
        </div>

        {/* Saved Stories */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-teal-100">
          <h2 className="text-2xl font-bold text-teal-700 mb-6">My Saved Stories</h2>

          {stories.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-4">No saved stories yet</p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-semibold"
              >
                Create Your First Story
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stories.map((story) => {
                const pages = JSON.parse(story.pages)
                const firstPageImage = pages[0]?.imageUrl
                return (
                  <div
                    key={story.id}
                    className="bg-gradient-to-br from-teal-50 to-green-50 rounded-xl shadow-lg overflow-hidden border-2 border-teal-200"
                  >
                    {/* Cover Image */}
                    {firstPageImage && (
                      <div className="h-40 bg-teal-100 overflow-hidden">
                        <img
                          src={firstPageImage}
                          alt={story.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <h3 className="text-xl font-bold text-teal-700 mb-1">{story.title}</h3>
                      {story.author && (
                        <p className="text-sm text-gray-600 mb-2">by {story.author}</p>
                      )}
                      <p className="text-gray-500 text-sm mb-4">
                        {pages.length} pages • {new Date(story.createdAt).toLocaleDateString()}
                      </p>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => router.push(`/story/${story.id}`)}
                          className="flex-1 min-w-[80px] px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium text-sm flex items-center justify-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(story)}
                          disabled={downloadingId === story.id || (typeof downloadsRemaining === 'number' && downloadsRemaining <= 0)}
                          className="flex-1 min-w-[80px] px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm flex items-center justify-center gap-1 disabled:bg-gray-400"
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
                          className="flex-1 min-w-[80px] px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 font-medium text-sm flex items-center justify-center gap-1"
                        >
                          <Printer className="w-4 h-4" />
                          Print
                        </button>
                        <button
                          onClick={() => handleDelete(story.id)}
                          disabled={deletingId === story.id}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium text-sm flex items-center justify-center disabled:bg-gray-400"
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

        {/* Footer */}
        <div className="mt-12 text-center text-teal-600 text-sm">
          <p>Made with love for young storytellers everywhere</p>
          <div className="flex justify-center gap-4 mt-4">
            <Link href="/" className="hover:text-teal-800 underline">Create a Story</Link>
            <Link href="/about" className="hover:text-teal-800 underline">About Us</Link>
            <Link href="/pricing" className="hover:text-teal-800 underline">Pricing</Link>
            <Link href="/terms" className="hover:text-teal-800 underline">Terms & Conditions</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
