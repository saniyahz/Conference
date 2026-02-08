import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculatePrintPrice, PRINT_BASE_PRICE } from '@/lib/subscriptions'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storyId, shippingAddress } = await request.json()

    if (!storyId || !shippingAddress) {
      return NextResponse.json(
        { error: 'Story ID and shipping address are required' },
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

    // Calculate price with discount
    const totalPrice = calculatePrintPrice(subscription.plan as any)
    const discount = PRINT_BASE_PRICE - totalPrice

    // Create print order
    const order = await prisma.printOrder.create({
      data: {
        userId: session.user.id,
        storyId,
        status: 'pending',
        basePrice: PRINT_BASE_PRICE,
        discount,
        totalPrice,
        shippingAddress,
      },
    })

    // In a real app, you would integrate with a printing service API here
    // For now, we'll just return the order details

    return NextResponse.json({
      order,
      message: 'Print order created successfully. You will receive an email with payment instructions.',
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating print order:', error)
    return NextResponse.json(
      { error: 'Failed to create print order' },
      { status: 500 }
    )
  }
}

// Get all print orders for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orders = await prisma.printOrder.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('Error fetching print orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch print orders' },
      { status: 500 }
    )
  }
}
