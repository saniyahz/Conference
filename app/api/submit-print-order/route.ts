import { NextRequest, NextResponse } from 'next/server';
import { detectLocationFromHeaders } from '@/lib/geolocation';
import { getPrintingPartner, calculatePrintingCost, Region } from '@/lib/printingConfig';

export interface PrintOrderRequest {
  storyTitle: string;
  storyAuthor: string;
  pageCount: number;
  pdfUrl?: string;
  pdfBase64?: string;
  shippingAddress: {
    name: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  customerEmail: string;
  regionOverride?: Region;
}

export async function POST(request: NextRequest) {
  try {
    const body: PrintOrderRequest = await request.json();

    // Validate required fields
    if (!body.storyTitle || !body.pageCount || !body.shippingAddress || !body.customerEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!body.pdfUrl && !body.pdfBase64) {
      return NextResponse.json(
        { success: false, error: 'Either pdfUrl or pdfBase64 must be provided' },
        { status: 400 }
      );
    }

    // Detect region from headers or use override
    let region: Region;

    if (body.regionOverride && ['UAE', 'NORTH_AMERICA', 'EUROPE'].includes(body.regionOverride)) {
      region = body.regionOverride;
    } else {
      const locationData = detectLocationFromHeaders(request.headers);
      region = locationData.region;
    }

    // Get printing partner for the region
    const partner = getPrintingPartner(region);
    const costInfo = calculatePrintingCost(region, body.pageCount);

    // Generate a unique order ID
    const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // In a real implementation, this would make an API call to the printing partner
    // For now, we'll simulate the order creation
    const orderData = {
      orderId,
      partnerId: partner.id,
      partnerName: partner.name,
      storyTitle: body.storyTitle,
      storyAuthor: body.storyAuthor,
      pageCount: body.pageCount,
      pricing: {
        subtotal: costInfo.subtotal,
        currency: costInfo.currency,
        shipping: 0, // Could be calculated based on shipping address
        total: costInfo.subtotal,
      },
      shippingAddress: body.shippingAddress,
      customerEmail: body.customerEmail,
      estimatedDelivery: `${partner.estimatedDeliveryDays} business days`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // TODO: In production, you would:
    // 1. Upload the PDF to the partner's API endpoint
    // 2. Create the order with the partner
    // 3. Process payment
    // 4. Store order in database
    // 5. Send confirmation email

    // For now, simulate a successful order
    console.log('Print order created:', orderData);

    // Simulate API call to partner
    // const partnerResponse = await fetch(partner.apiEndpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${process.env.PRINTING_PARTNER_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     pdf: body.pdfBase64 || body.pdfUrl,
    //     shipping: body.shippingAddress,
    //     email: body.customerEmail,
    //   }),
    // });

    return NextResponse.json({
      success: true,
      order: {
        orderId: orderData.orderId,
        partner: orderData.partnerName,
        total: orderData.pricing.total,
        currency: orderData.pricing.currency,
        estimatedDelivery: orderData.estimatedDelivery,
        status: 'pending',
        trackingUrl: `https://example.com/track/${orderData.orderId}`, // Placeholder
      },
      message: `Order submitted successfully to ${partner.name}. You will receive a confirmation email at ${body.customerEmail}`,
    });
  } catch (error) {
    console.error('Error submitting print order:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit print order' },
      { status: 500 }
    );
  }
}

// Enable CORS for ChatGPT integration
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
