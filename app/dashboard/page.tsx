'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, Trash2, LogOut, CreditCard, Plus, Loader2, Printer } from 'lucide-react'
import { SUBSCRIPTION_PLANS } from '@/lib/subscriptions'

type Story = {
  id: string
  title: string
  pages: string
  coverImage?: string
  createdAt: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stories, setStories] = useState<Story[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    } else if (status === 'authenticated') {
      fetchStories()
    }
  }, [status])

  const fetchStories = async () => {
    try {
      const response = await fetch('/api/stories')
      const data = await response.json()
      setStories(data.stories || [])
    } catch (error) {
      console.error('Error fetching stories:', error)
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

  const handlePrint = async (storyId: string) => {
    const address = prompt('Enter your shipping address:')
    if (!address) return

    try {
      const response = await fetch('/api/print-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, shippingAddress: address }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message)
      } else {
        alert('Failed to create print order')
      }
    } catch (error) {
      console.error('Error creating print order:', error)
      alert('Failed to create print order')
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const subscription = session.user.subscription
  const plan = subscription?.plan || 'free'
  const planInfo = SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS]

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-8 h-8 text-purple-600" />
                <h1 className="text-3xl font-bold text-purple-800">My Dashboard</h1>
              </div>
              <p className="text-gray-600">Welcome back, {session.user.name || session.user.email}!</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/pricing"
                className="px-4 py-2 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 font-semibold flex items-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Upgrade
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold flex items-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">Current Plan: {planInfo.name}</h2>
              <p className="text-white/90">
                Stories saved: {stories.length}
                {planInfo.storiesLimit > 0 && ` / ${planInfo.storiesLimit}`}
                {planInfo.storiesLimit === -1 && ' (Unlimited)'}
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
              <p className="text-sm text-white/90 mb-1">Print Discount</p>
              <p className="text-2xl font-bold">{Math.round(planInfo.printDiscount * 100)}% OFF</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-8">
          <Link
            href="/"
            className="flex-1 bg-purple-600 text-white p-6 rounded-2xl shadow-xl hover:bg-purple-700 transition-all flex items-center justify-center gap-3"
          >
            <Plus className="w-6 h-6" />
            <span className="font-semibold text-lg">Create New Story</span>
          </Link>
        </div>

        {/* Saved Stories */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-purple-800 mb-6">My Saved Stories</h2>

          {stories.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-4">No saved stories yet</p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
              >
                Create Your First Story
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stories.map((story) => {
                const pages = JSON.parse(story.pages)
                return (
                  <div
                    key={story.id}
                    className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl shadow-lg p-6 border-2 border-amber-200"
                  >
                    <h3 className="text-xl font-bold text-purple-800 mb-2">{story.title}</h3>
                    <p className="text-gray-600 text-sm mb-4">
                      {pages.length} pages • Created {new Date(story.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrint(story.id)}
                        className="flex-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold text-sm flex items-center justify-center gap-1"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                      <button
                        onClick={() => handleDelete(story.id)}
                        disabled={deletingId === story.id}
                        className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold text-sm flex items-center justify-center gap-1 disabled:bg-gray-400"
                      >
                        {deletingId === story.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
