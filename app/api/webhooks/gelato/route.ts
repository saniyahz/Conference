import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Gelato Webhook Handler
 *
 * Receives order status updates from Gelato.
 * Register this URL in Gelato dashboard:
 *   https://yourapp.com/api/webhooks/gelato
 *
 * Events handled:
 *   order:created          → log
 *   order:passed_to_production → log
 *   order:in_production    → log
 *   order:shipped          → update status + save tracking
 *   order:delivered         → update status
 *   order:cancelled         → update status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    // Verify webhook signature if Gelato provides one
    const signature = request.headers.get('x-gelato-signature')
    const secret = process.env.GELATO_WEBHOOK_SECRET

    if (secret && signature) {
      // TODO: Implement HMAC verification when Gelato docs specify the exact method
      // For now, just log that we received a signature
      console.log('[Gelato Webhook] Signature received:', signature?.slice(0, 20) + '...')
    }

    const event = JSON.parse(body)
    const eventType = event.event || event.type || 'unknown'
    const gelatoOrderId = event.orderId || event.id

    console.log(`[Gelato Webhook] Event: ${eventType}, Order: ${gelatoOrderId}`)

    if (!gelatoOrderId) {
      console.warn('[Gelato Webhook] No order ID in event payload')
      return NextResponse.json({ received: true })
    }

    // Find our order by Gelato order ID
    const order = await prisma.printOrder.findFirst({
      where: { gelatoOrderId },
    })

    if (!order) {
      console.warn(`[Gelato Webhook] No matching PrintOrder for Gelato order ${gelatoOrderId}`)
      // Return 200 anyway — don't make Gelato retry for orders we don't recognize
      return NextResponse.json({ received: true })
    }

    // Map Gelato events to our order status
    switch (eventType) {
      case 'order:shipped': {
        const trackingCode = event.shipments?.[0]?.trackingCode
          || event.tracking?.code
          || null

        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'shipped',
            trackingNumber: trackingCode,
            gelatoStatus: eventType,
          },
        })
        console.log(`[Gelato Webhook] Order ${order.id} shipped. Tracking: ${trackingCode}`)
        break
      }

      case 'order:delivered': {
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'delivered',
            gelatoStatus: eventType,
          },
        })
        console.log(`[Gelato Webhook] Order ${order.id} delivered`)
        break
      }

      case 'order:cancelled': {
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            gelatoStatus: eventType,
          },
        })
        console.log(`[Gelato Webhook] Order ${order.id} cancelled`)
        break
      }

      default: {
        // Log other events (created, passed_to_production, in_production, etc.)
        await prisma.printOrder.update({
          where: { id: order.id },
          data: {
            gelatoStatus: eventType,
          },
        })
        console.log(`[Gelato Webhook] Order ${order.id} status updated: ${eventType}`)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Gelato Webhook] Error processing webhook:', error)
    // Return 200 to prevent Gelato from retrying on our errors
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}
