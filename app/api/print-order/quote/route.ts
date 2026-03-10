import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculatePrintPrice, PRINT_BASE_PRICE } from '@/lib/subscriptions'
import { getShippingQuote, type GelatoAddress } from '@/lib/gelato'
import { calculateShippingCost, type LuluAddress } from '@/lib/lulu'

const PRINT_PROVIDER = process.env.PRINT_PROVIDER || 'gelato'

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

    let shippingCost = 4.99 // Default fallback
    let minDeliveryDays = 5
    let maxDeliveryDays = 10
    let shipmentMethodUid = ''

    if (PRINT_PROVIDER === 'lulu') {
      // ── Lulu cost calculation ──────────────────
      const luluAddress: LuluAddress = {
        name: `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim(),
        street1: shippingAddress.address,
        city: shippingAddress.city,
        state_code: shippingAddress.state || undefined,
        postcode: shippingAddress.zip,
        country_code: shippingAddress.country,
        email: shippingAddress.email || session.user.email || '',
      }

      try {
        // Lulu cost calculation includes manufacturing + shipping
        // 32 pages = Lulu minimum for our book spec
        const costResponse = await calculateShippingCost(luluAddress, 32, 'MAIL')

        shippingCost = parseFloat(costResponse.shipping_cost?.total_cost_excl_tax || '4.99')
        shipmentMethodUid = 'MAIL' // Lulu uses shipping level strings
        // Lulu estimated dates come as ISO strings — calculate day ranges
        if (costResponse.shipping_cost?.estimated_shipping_dates) {
          const { arrival_min, arrival_max } = costResponse.shipping_cost.estimated_shipping_dates
          if (arrival_min) {
            const now = new Date()
            const minDate = new Date(arrival_min)
            const maxDate = arrival_max ? new Date(arrival_max) : minDate
            minDeliveryDays = Math.max(1, Math.ceil((minDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            maxDeliveryDays = Math.max(minDeliveryDays, Math.ceil((maxDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          }
        }
      } catch (error) {
        console.error('Lulu cost calculation error (using fallback pricing):', error)
        // Continue with fallback pricing
      }
    } else {
      // ── Gelato cost calculation (existing) ─────
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

      try {
        const quoteResponse = await getShippingQuote(
          gelatoAddress,
          'https://example.com/placeholder.pdf',
          `quote-${Date.now()}`
        )

        if (quoteResponse.quotes && quoteResponse.quotes.length > 0) {
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
      }
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
