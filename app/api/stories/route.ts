import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSaveStory } from '@/lib/subscriptions'

// Get all saved stories for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stories = await prisma.story.findMany({
      where: {
        userId: session.user.id,
        isSaved: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ stories })
  } catch (error) {
    console.error('Error fetching stories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stories' },
      { status: 500 }
    )
  }
}

// Save a new story
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title, pages, coverImage } = await request.json()

    if (!title || !pages) {
      return NextResponse.json(
        { error: 'Title and pages are required' },
        { status: 400 }
      )
    }

    // Get user subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    // Check if user can save more stories
    const savedStoriesCount = await prisma.story.count({
      where: {
        userId: session.user.id,
        isSaved: true,
      },
    })

    if (!canSaveStory(savedStoriesCount, subscription.plan as any)) {
      return NextResponse.json(
        { error: 'Story limit reached for your plan. Please upgrade to save more stories.' },
        { status: 403 }
      )
    }

    // Create story
    const story = await prisma.story.create({
      data: {
        userId: session.user.id,
        title,
        pages: JSON.stringify(pages),
        coverImage,
        isSaved: true,
      },
    })

    // Update stories saved this month
    await prisma.subscription.update({
      where: { userId: session.user.id },
      data: {
        storiesSavedThisMonth: subscription.storiesSavedThisMonth + 1,
      },
    })

    return NextResponse.json({ story }, { status: 201 })
  } catch (error) {
    console.error('Error saving story:', error)
    return NextResponse.json(
      { error: 'Failed to save story' },
      { status: 500 }
    )
  }
}
