import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { storyId } = await request.json()

    // Update usage tracking
    await prisma.usageTracking.upsert({
      where: { userId: session.user.id },
      update: {
        downloadsThisMonth: { increment: 1 },
        totalDownloads: { increment: 1 },
      },
      create: {
        userId: session.user.id,
        downloadsThisMonth: 1,
        totalDownloads: 1,
      },
    })

    // Update story download count if provided
    if (storyId) {
      await prisma.story.update({
        where: { id: storyId },
        data: {
          downloadCount: { increment: 1 },
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error tracking download:', error)
    return NextResponse.json(
      { error: 'Failed to track download' },
      { status: 500 }
    )
  }
}
