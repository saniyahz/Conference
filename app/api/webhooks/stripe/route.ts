import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { isSchoolPlan, SCHOOL_PLANS, getSchoolLimits } from '@/lib/subscription'
import type { PlanType, SchoolPlanType } from '@/lib/subscription'
import { fulfillPrintOrder } from '@/app/api/print-order/confirm/route'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // ── Handle print order payments ──────────────
        if (session.metadata?.type === 'print_order') {
          const orderId = session.metadata.orderId
          const shipmentMethodUid = session.metadata.shipmentMethodUid

          if (orderId) {
            console.log(`[Stripe Webhook] Print order payment completed: ${orderId}`)
            try {
              await fulfillPrintOrder(orderId, shipmentMethodUid || undefined)
            } catch (fulfillError) {
              // Log but don't fail the webhook — order is paid, fulfillment can be retried
              console.error(`[Stripe Webhook] Print fulfillment failed for ${orderId}:`, fulfillError)
              // Mark order as needing attention
              await prisma.printOrder.update({
                where: { id: orderId },
                data: {
                  status: 'processing',
                  gelatoStatus: 'fulfillment_error',
                },
              })
            }
          }
          break
        }

        // ── Handle subscription payments ─────────────
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan as PlanType | undefined
        const billingCycle = session.metadata?.billingCycle
        const audience = session.metadata?.audience || 'parent'

        if (!userId || !plan) {
          throw new Error('Missing metadata')
        }

        // Retrieve Stripe subscription details
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        )

        // Update user subscription
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            plan,
            audience,
            billingCycle: billingCycle || null,
            status: 'active',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
          create: {
            userId,
            plan,
            audience,
            billingCycle: billingCycle || null,
            status: 'active',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        })

        // If this is a school plan, create a School org record
        if (isSchoolPlan(plan)) {
          const existingSchool = await prisma.school.findFirst({
            where: { adminUserId: userId },
          })

          const schoolLimits = getSchoolLimits(plan as SchoolPlanType)

          if (!existingSchool) {
            await prisma.school.create({
              data: {
                name: 'My School', // admin can rename later
                adminUserId: userId,
                maxStudents: schoolLimits.maxStudents,
                sharedBookPool: schoolLimits.sharedBookPool,
              },
            })
          } else {
            // Upgrade existing school limits
            await prisma.school.update({
              where: { id: existingSchool.id },
              data: {
                maxStudents: schoolLimits.maxStudents,
                sharedBookPool: schoolLimits.sharedBookPool,
              },
            })
          }
        }

        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: subscription.status === 'active' ? 'active' : 'cancelled',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        })

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: 'cancelled',
            plan: 'free',
            audience: 'parent',
          },
        })

        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
