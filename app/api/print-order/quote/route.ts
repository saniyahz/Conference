import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculatePrintPrice, PRINT_BASE_PRICE } from '@/lib/subscriptions'
import { getShippingQuote, type GelatoAddress } from '@/lib/gelato'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { shippingAddress } = await request.json() as {
      shippingAddress: {
        firstName: string
        lastName: string
        address: string
        city: string
        state: string
        zip: string
        country: string
        email: string
      }
    }

    if (!shippingAddress || !shippingAddress.address || !shippingAddress.city || !shippingAddress.country) {
      return NextResponse.json(
        { error: 'Shipping address is required' },
        { status: 400 }
      )
    }

    // Get user subscription for discount calculation
    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    })

    const plan = (subscription?.plan || 'free') as any
    const ourPrice = calculatePrintPrice(plan)
    const discountAmount = PRINT_BASE_PRICE - ourPrice
    const discountPercent = subscription
      ? Math.round((discountAmount / PRINT_BASE_PRICE) * 100)
      : 0

    // Build Gelato address
    const gelatoAddress: GelatoAddress = {
      firstName: shippingAddress.firstName,
      lastName: shippingAddress.lastName,
      addressLine1: shippingAddress.address,
      city: shippingAddress.city,
      state: shippingAddress.state,
      postCode: shippingAddress.zip,
      country: shippingAddress.country,
      email: shippingAddress.email || session.user.email || '',
    }

    // Get shipping quote from Gelato
    // Use a placeholder PDF URL for quoting — Gelato only needs the product spec for shipping quotes
    let shippingCost = 4.99 // Default fallback
    let minDeliveryDays = 5
    let maxDeliveryDays = 10
    let shipmentMethodUid = ''

    try {
      // Note: For quotes, Gelato may need a valid PDF URL or accept a dummy
      // In sandbox mode, we can use a placeholder
      const quoteResponse = await getShippingQuote(
        gelatoAddress,
        'https://example.com/placeholder.pdf', // Placeholder for quote
        `quote-${Date.now()}`
      )

      if (quoteResponse.quotes && quoteResponse.quotes.length > 0) {
        // Use the cheapest shipping option
        const cheapest = quoteResponse.quotes.reduce((min, q) =>
          q.price < min.price ? q : min
        )
        shippingCost = cheapest.price
        minDeliveryDays = cheapest.minDeliveryDays
        maxDeliveryDays = cheapest.maxDeliveryDays
        shipmentMethodUid = cheapest.shipmentMethodUid
      }
    } catch (error) {
      console.error('Gelato quote error (using fallback pricing):', error)
      // Continue with fallback pricing — don't fail the quote
    }

    const totalPrice = ourPrice + shippingCost

    return NextResponse.json({
      basePrice: PRINT_BASE_PRICE,
      discountPercent,
      discountAmount,
      ourPrice,
      shippingCost,
      totalPrice,
      minDeliveryDays,
      maxDeliveryDays,
      shipmentMethodUid,
      currency: 'USD',
    })
  } catch (error) {
    console.error('Error getting print quote:', error)
    return NextResponse.json(
      { error: 'Failed to get print quote' },
      { status: 500 }
    )
  }
}
