import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get or create usage tracking
    let usage = await prisma.usageTracking.findUnique({
      where: { userId: session.user.id },
    })

    if (!usage) {
      usage = await prisma.usageTracking.create({
        data: {
          userId: session.user.id,
        },
      })
    }

    // Check if we need to reset monthly counters
    const now = new Date()
    const lastReset = new Date(usage.lastResetDate)
    const isNewMonth = now.getMonth() !== lastReset.getMonth() ||
                       now.getFullYear() !== lastReset.getFullYear()

    if (isNewMonth) {
      usage = await prisma.usageTracking.update({
        where: { userId: session.user.id },
        data: {
          storiesCreatedThisMonth: 0,
          downloadsThisMonth: 0,
          audioPlaysThisMonth: 0,
          lastResetDate: now,
        },
      })
    }

    return NextResponse.json({ usage })
  } catch (error) {
    console.error('Error fetching usage:', error)
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    )
  }
}
