import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * Lulu Webhook Handler
 *
 * Receives print job status updates from Lulu.
 * Register this URL in Lulu dashboard → Webhooks:
 *   https://yourapp.com/api/webhooks/lulu
 *
 * Lulu sends HMAC-SHA256 signature in the `Lulu-Signature` header.
 *
 * Lulu print job statuses:
 *   CREATED             → Initial state
 *   UNPAID              → Awaiting payment (not used for API orders)
 *   PAYMENT_IN_PROGRESS → Processing payment
 *   PRODUCTION_READY    → Ready for production
 *   IN_PRODUCTION       → Being printed
 *   SHIPPED             → Shipped to customer
 *   CANCELED            → Canceled
 *   REJECTED            → Rejected (file issue, etc.)
 *   ERROR               → Error occurred
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    // ── Verify HMAC-SHA256 signature ─────────────
    const signature = request.headers.get('lulu-signature')
    const secret = process.env.LULU_WEBHOOK_SECRET

    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex')

      if (signature !== expectedSignature) {
        console.warn('[Lulu Webhook] Invalid signature — rejecting')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const event = JSON.parse(body)

    // Lulu webhook payload structure:
    // { "id": 12345, "status": { "name": "SHIPPED", "message": "..." }, "tracking_id": "...", ... }
    const luluJobId = String(event.id || '')
    const statusName = event.status?.name || event.topic || 'unknown'

    console.log(`[Lulu Webhook] Status: ${statusName}, Job: ${luluJobId}`)

    if (!luluJobId) {
      console.warn('[Lulu Webhook] No job ID in event payload')
      return NextResponse.json({ received: true })
    }

    // Find our order by Lulu job ID (stored in gelatoOrderId field)
    const order = await prisma.printOrder.findFirst({
      where: { gelatoOrderId: luluJobId },
    })

    if (!order) {
      console.warn(`[Lulu Webhook] No matching PrintOrder for Lulu job ${luluJobId}`)
      // Return 200 anyway — don't make Lulu retry for jobs we don't recognize
      return NextResponse.json({ received: true })
    }

    // Map Lulu statuses to our order status
    switch (statusName) {
      case 'SHIPPED': {
        const trackingId = event.tracking_id || event.tracking_urls?.[0] || null

        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'shipped',
            trackingNumber: trackingId,
            gelatoStatus: statusName,
          },
        })
        console.log(`[Lulu Webhook] Order ${order.id} shipped. Tracking: ${trackingId}`)
        break
      }

      case 'CANCELED':
      case 'REJECTED': {
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            gelatoStatus: statusName,
          },
        })
        console.log(`[Lulu Webhook] Order ${order.id} ${statusName.toLowerCase()}`)
        break
      }

      case 'ERROR': {
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'failed',
            gelatoStatus: `ERROR: ${event.status?.message || 'Unknown error'}`,
          },
        })
        console.error(`[Lulu Webhook] Order ${order.id} error: ${event.status?.message}`)
        break
      }

      default: {
        // Log other statuses (CREATED, PRODUCTION_READY, IN_PRODUCTION, etc.)
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            gelatoStatus: statusName,
          },
        })
        console.log(`[Lulu Webhook] Order ${order.id} status updated: ${statusName}`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Lulu Webhook] Error processing webhook:', error)
    // Return 200 to prevent Lulu from retrying on our errors
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}
