import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Stripe from 'stripe'
import { PLANS, PlanType, BillingCycle } from '@/lib/subscription'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Parse plan string into plan type and billing cycle
// e.g., 'basic_yearly' -> { planType: 'basic', billingCycle: 'yearly' }
// e.g., 'premium' -> { planType: 'premium', billingCycle: 'monthly' }
function parsePlanString(planString: string): { planType: PlanType; billingCycle: BillingCycle } | null {
  // Check for yearly suffix
  if (planString.endsWith('_yearly')) {
    const planType = planString.replace('_yearly', '') as PlanType
    if (planType === 'basic' || planType === 'premium') {
      return { planType, billingCycle: 'yearly' }
    }
    return null
  }

  // Default to monthly for base plan names
  if (planString === 'basic' || planString === 'premium') {
    return { planType: planString as PlanType, billingCycle: 'monthly' }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan } = await request.json()

    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 })
    }

    // Handle 'free' plan
    if (plan === 'free') {
      return NextResponse.json(
        { error: 'Cannot create checkout for free plan' },
        { status: 400 }
      )
    }

    // Parse the plan string into plan type and billing cycle
    const parsedPlan = parsePlanString(plan)
    if (!parsedPlan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const { planType, billingCycle } = parsedPlan
    const planInfo = PLANS[planType]

    if (!planInfo) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 400 })
    }

    // Get the appropriate price based on billing cycle
    const price = billingCycle === 'yearly' ? planInfo.pricing.yearly : planInfo.pricing.monthly
    const interval = billingCycle === 'yearly' ? 'year' : 'month'

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: session.user.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${planInfo.name} (${billingCycle === 'yearly' ? 'Annual' : 'Monthly'})`,
              description: planInfo.features.join(', '),
            },
            unit_amount: Math.round(price * 100), // Convert to cents
            recurring: {
              interval: interval as 'month' | 'year',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId: session.user.id,
        planType, // Store the actual plan type (basic/premium)
        billingCycle, // Store the billing cycle separately
      },
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
