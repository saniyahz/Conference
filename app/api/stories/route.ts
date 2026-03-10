import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSaveToLibrary, PlanType } from '@/lib/subscription'

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

    const { title, author, originalPrompt, pages, coverImage, language } = await request.json()

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

    const plan = (subscription?.plan || 'free') as PlanType

    // Check if user can save more stories
    const savedStoriesCount = await prisma.story.count({
      where: {
        userId: session.user.id,
        isSaved: true,
      },
    })

    if (!canSaveToLibrary(plan, savedStoriesCount)) {
      return NextResponse.json(
        { error: 'You have reached your library limit for your plan. Please upgrade to save more stories.' },
        { status: 403 }
      )
    }

    // Create story
    const story = await prisma.story.create({
      data: {
        userId: session.user.id,
        title,
        author,
        originalPrompt,
        pages: JSON.stringify(pages),
        coverImage,
        language: language || 'en',
        isSaved: true,
      },
    })

    // Update usage tracking - story created
    await prisma.usageTracking.upsert({
      where: { userId: session.user.id },
      update: {
        storiesCreatedThisMonth: { increment: 1 },
        totalStoriesCreated: { increment: 1 },
      },
      create: {
        userId: session.user.id,
        storiesCreatedThisMonth: 1,
        totalStoriesCreated: 1,
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
