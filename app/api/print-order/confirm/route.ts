import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePrintReadyPdf } from '@/lib/generatePrintPdf'
import { uploadPrintPdf } from '@/lib/r2-upload'
import { createOrder, type GelatoAddress } from '@/lib/gelato'

/**
 * Fulfill a print order after payment confirmation.
 * Called by the Stripe webhook handler when checkout.session.completed fires for a print order.
 *
 * Flow:
 * 1. Fetch the story
 * 2. Generate 8x8" print-ready PDF
 * 3. Upload PDF to Cloudflare R2
 * 4. Create Gelato order
 * 5. Update PrintOrder with Gelato order ID + PDF URL
 */
export async function fulfillPrintOrder(orderId: string, shipmentMethodUid?: string): Promise<void> {
  console.log(`[Print Fulfillment] Starting for order ${orderId}`)

  // 1. Get the order
  const order = await prisma.printOrder.findUnique({
    where: { id: orderId },
  })

  if (!order) {
    throw new Error(`PrintOrder ${orderId} not found`)
  }

  // Update status to processing
  await prisma.printOrder.update({
    where: { id: orderId },
    data: { status: 'processing' },
  })

  // 2. Fetch the story
  const story = await prisma.story.findUnique({
    where: { id: order.storyId },
  })

  if (!story) {
    throw new Error(`Story ${order.storyId} not found for order ${orderId}`)
  }

  // Parse pages from JSON string
  const pages = JSON.parse(story.pages) as { text: string; imageUrl?: string }[]

  // 3. Generate print-ready PDF
  console.log(`[Print Fulfillment] Generating 8x8" PDF for "${story.title}"`)
  const pdfBuffer = await generatePrintReadyPdf({
    title: story.title,
    author: story.author || 'Young Author',
    pages,
    originalPrompt: story.originalPrompt || undefined,
  })

  // 4. Upload PDF to R2
  console.log(`[Print Fulfillment] Uploading PDF to R2`)
  const pdfUrl = await uploadPrintPdf(pdfBuffer, orderId)
  console.log(`[Print Fulfillment] PDF uploaded: ${pdfUrl}`)

  // Update order with PDF URL
  await prisma.printOrder.update({
    where: { id: orderId },
    data: { pdfUrl },
  })

  // 5. Create Gelato order
  console.log(`[Print Fulfillment] Creating Gelato order`)

  // Build address from order shipping fields
  const nameParts = (order.shippingName || 'Customer').split(' ')
  const firstName = nameParts[0] || 'Customer'
  const lastName = nameParts.slice(1).join(' ') || ''

  // Get user email for Gelato
  const user = await prisma.user.findUnique({
    where: { id: order.userId },
  })

  const gelatoAddress: GelatoAddress = {
    firstName,
    lastName,
    addressLine1: order.shippingAddress || '',
    city: order.shippingCity || '',
    state: order.shippingState || undefined,
    postCode: order.shippingZip || '',
    country: order.shippingCountry || 'US',
    email: user?.email || '',
  }

  const gelatoOrder = await createOrder({
    orderReferenceId: orderId,
    address: gelatoAddress,
    pdfUrl,
    shipmentMethodUid: shipmentMethodUid || undefined,
  })

  console.log(`[Print Fulfillment] Gelato order created: ${gelatoOrder.id}`)

  // 6. Update order with Gelato reference
  await prisma.printOrder.update({
    where: { id: orderId },
    data: {
      gelatoOrderId: gelatoOrder.id,
      gelatoStatus: gelatoOrder.status || 'created',
    },
  })

  console.log(`[Print Fulfillment] Order ${orderId} fulfilled successfully`)
}

// Direct POST endpoint (for manual triggering / testing)
export async function POST(request: NextRequest) {
  try {
    const { orderId, shipmentMethodUid } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    await fulfillPrintOrder(orderId, shipmentMethodUid)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error fulfilling print order:', error)
    return NextResponse.json(
      { error: 'Failed to fulfill print order' },
      { status: 500 }
    )
  }
}
