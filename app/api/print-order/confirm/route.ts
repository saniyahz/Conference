import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePrintReadyPdf, generateLuluCoverPdf, GELATO_SPEC, LULU_SPEC } from '@/lib/generatePrintPdf'
import { uploadPrintPdf } from '@/lib/r2-upload'
import { createOrder, type GelatoAddress } from '@/lib/gelato'
import { createPrintJob, type LuluAddress } from '@/lib/lulu'

const PRINT_PROVIDER = process.env.PRINT_PROVIDER || 'gelato'

/**
 * Fulfill a print order after payment confirmation.
 * Called by the Stripe webhook handler when checkout.session.completed fires for a print order.
 *
 * Supports both Gelato and Lulu, controlled by PRINT_PROVIDER env var.
 *
 * Gelato flow: single combined PDF → R2 → Gelato order
 * Lulu flow:   interior PDF + cover PDF → R2 → Lulu print job
 */
export async function fulfillPrintOrder(orderId: string, shipmentMethodUid?: string): Promise<void> {
  const provider = PRINT_PROVIDER
  console.log(`[Print Fulfillment] Starting for order ${orderId} (provider: ${provider})`)

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

  const storyInput = {
    title: story.title,
    author: story.author || 'Young Author',
    pages,
    originalPrompt: story.originalPrompt || undefined,
    language: story.language || 'en',
  }

  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: order.userId },
  })

  if (provider === 'lulu') {
    // ══════════════════════════════════════════════
    // LULU FULFILLMENT
    // ══════════════════════════════════════════════

    // 3a. Generate interior PDF (8.5×8.5", 32 pages, no covers)
    console.log(`[Print Fulfillment] Generating Lulu interior PDF for "${story.title}"`)
    const interiorBuffer = await generatePrintReadyPdf(storyInput, (story as any).storyMode || 'imagination', LULU_SPEC)

    // 3b. Generate cover PDF (single spread: back + spine + front)
    console.log(`[Print Fulfillment] Generating Lulu cover PDF`)
    const coverBuffer = await generateLuluCoverPdf(storyInput, LULU_SPEC.minPages)

    // 4. Upload both PDFs to R2
    console.log(`[Print Fulfillment] Uploading interior + cover PDFs to R2`)
    const [interiorUrl, coverUrl] = await Promise.all([
      uploadPrintPdf(interiorBuffer, orderId, '-interior'),
      uploadPrintPdf(coverBuffer, orderId, '-cover'),
    ])
    console.log(`[Print Fulfillment] Interior PDF: ${interiorUrl}`)
    console.log(`[Print Fulfillment] Cover PDF: ${coverUrl}`)

    // Update order with PDF URL (store interior URL as primary)
    await prisma.printOrder.update({
      where: { id: orderId },
      data: { pdfUrl: interiorUrl },
    })

    // 5. Create Lulu print job
    console.log(`[Print Fulfillment] Creating Lulu print job`)

    const luluAddress: LuluAddress = {
      name: order.shippingName || 'Customer',
      street1: order.shippingAddress || '',
      city: order.shippingCity || '',
      state_code: order.shippingState || undefined,
      postcode: order.shippingZip || '',
      country_code: order.shippingCountry || 'US',
      email: user?.email || '',
    }

    const luluJob = await createPrintJob({
      coverUrl,
      interiorUrl,
      address: luluAddress,
      shippingLevel: shipmentMethodUid || 'MAIL',
      externalId: orderId,
      title: story.title,
    })

    console.log(`[Print Fulfillment] Lulu print job created: ${luluJob.id}`)

    // 6. Update order with Lulu reference (reuse gelatoOrderId field)
    await prisma.printOrder.update({
      where: { id: orderId },
      data: {
        gelatoOrderId: String(luluJob.id),
        gelatoStatus: luluJob.status?.name || 'CREATED',
      },
    })

    console.log(`[Print Fulfillment] Order ${orderId} fulfilled via Lulu successfully`)

  } else {
    // ══════════════════════════════════════════════
    // GELATO FULFILLMENT (existing flow)
    // ══════════════════════════════════════════════

    // 3. Generate print-ready PDF
    console.log(`[Print Fulfillment] Generating 8x8" PDF for "${story.title}"`)
    const pdfBuffer = await generatePrintReadyPdf(storyInput, (story as any).storyMode || 'imagination', GELATO_SPEC)

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

    const nameParts = (order.shippingName || 'Customer').split(' ')
    const firstName = nameParts[0] || 'Customer'
    const lastName = nameParts.slice(1).join(' ') || ''

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

    console.log(`[Print Fulfillment] Order ${orderId} fulfilled via Gelato successfully`)
  }
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
