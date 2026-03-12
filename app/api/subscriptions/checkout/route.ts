import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import {
  PLANS,
  type PlanType,
  type BillingCycle,
  isSchoolPlan,
} from '@/lib/subscription'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan, billingCycle = 'monthly', couponCode } = (await request.json()) as {
      plan: string
      billingCycle?: BillingCycle
      couponCode?: string
    }

    // Validate plan exists
    if (!plan || !(plan in PLANS)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const planType = plan as PlanType
    const planInfo = PLANS[planType]

    if (planType === 'free') {
      return NextResponse.json(
        { error: 'Cannot create checkout for free plan' },
        { status: 400 }
      )
    }

    const price =
      billingCycle === 'yearly' ? planInfo.pricing.yearly : planInfo.pricing.monthly
    const interval: 'month' | 'year' =
      billingCycle === 'yearly' ? 'year' : 'month'

    // Build product description
    const description = planInfo.features.join(', ')

    // School plans get extra metadata
    const metadata: Record<string, string> = {
      userId: session.user.id,
      plan: planType,
      billingCycle,
      audience: planInfo.audience,
    }

    // Validate coupon if provided
    let discounts: { coupon: string }[] | undefined
    if (couponCode) {
      try {
        const coupon = await stripe.coupons.retrieve(couponCode)
        if (!coupon.valid) {
          return NextResponse.json({ error: 'This discount code has expired' }, { status: 400 })
        }
        discounts = [{ coupon: couponCode }]
      } catch {
        // Try as promotion code instead
        try {
          const promoCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 })
          if (promoCodes.data.length > 0) {
            discounts = [{ coupon: promoCodes.data[0].coupon.id as string }]
          } else {
            return NextResponse.json({ error: 'Invalid discount code' }, { status: 400 })
          }
        } catch {
          return NextResponse.json({ error: 'Invalid discount code' }, { status: 400 })
        }
      }
    }

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: session.user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: planInfo.name,
              description,
            },
            unit_amount: Math.round(price * 100), // Convert to cents
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      success_url: isSchoolPlan(planType)
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true&school=true`
        : `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
