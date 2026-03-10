import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculatePrintPrice, PRINT_BASE_PRICE } from '@/lib/subscriptions'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16' as any,
})

// Create a print order + Stripe Checkout session
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      storyId,
      shippingName,
      shippingAddress,
      shippingCity,
      shippingState,
      shippingZip,
      shippingCountry,
      shippingCost,
      shipmentMethodUid,
    } = await request.json()

    if (!storyId || !shippingAddress || !shippingCity || !shippingCountry) {
      return NextResponse.json(
        { error: 'Story ID and shipping details are required' },
        { status: 400 }
      )
    }

    // Verify story exists and belongs to user
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    })

    if (!story || story.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Story not found' },
        { status: 404 }
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
    const bookPrice = calculatePrintPrice(subscription.plan as any)
    const discountAmount = PRINT_BASE_PRICE - bookPrice
    const discountPercent = Math.round((discountAmount / PRINT_BASE_PRICE) * 100)
    const finalShippingCost = shippingCost || 4.99
    const totalPrice = bookPrice + finalShippingCost

    // Create print order in DB
    const order = await prisma.printOrder.create({
      data: {
        userId: session.user.id,
        storyId,
        storyTitle: story.title,
        status: 'pending',
        basePrice: PRINT_BASE_PRICE,
        discountPercent,
        discountAmount,
        shippingCost: finalShippingCost,
        totalPrice,
        shippingName: shippingName || null,
        shippingAddress: shippingAddress || null,
        shippingCity: shippingCity || null,
        shippingState: shippingState || null,
        shippingZip: shippingZip || null,
        shippingCountry: shippingCountry || null,
      },
    })

    // Create Stripe Checkout Session for one-time payment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Printed Book: ${story.title}`,
              description: `${(process.env.PRINT_PROVIDER || 'gelato') === 'lulu' ? '8.5x8.5" paperback' : '8x8" hardcover'} photobook — ${story.title} by ${story.author || 'Young Author'}`,
            },
            unit_amount: Math.round(bookPrice * 100), // Convert to cents
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Shipping',
              description: `Shipping to ${shippingCity}, ${shippingCountry}`,
            },
            unit_amount: Math.round(finalShippingCost * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'print_order',
        orderId: order.id,
        storyId,
        userId: session.user.id,
        shipmentMethodUid: shipmentMethodUid || '',
        printProvider: process.env.PRINT_PROVIDER || 'gelato',
      },
      success_url: `${appUrl}/print/${storyId}?success=true&orderId=${order.id}`,
      cancel_url: `${appUrl}/print/${storyId}?cancelled=true&orderId=${order.id}`,
    })

    // Update order with Stripe session ID
    await prisma.printOrder.update({
      where: { id: order.id },
      data: {
        stripePaymentIntentId: checkoutSession.id,
      },
    })

    return NextResponse.json({
      order,
      checkoutUrl: checkoutSession.url,
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
