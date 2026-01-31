import { NextRequest, NextResponse } from 'next/server';
import { detectLocationFromHeaders } from '@/lib/geolocation';
import { getPrintingPartner, calculatePrintingCost, Region } from '@/lib/printingConfig';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageCount, regionOverride } = body;

    // Detect region from headers or use override
    let region: Region;

    if (regionOverride && ['UAE', 'NORTH_AMERICA', 'EUROPE'].includes(regionOverride)) {
      region = regionOverride as Region;
    } else {
      const locationData = detectLocationFromHeaders(request.headers);
      region = locationData.region;
    }

    // Get printing partner for the region
    const partner = getPrintingPartner(region);

    // Calculate cost if page count provided
    const costInfo = pageCount
      ? calculatePrintingCost(region, pageCount)
      : null;

    return NextResponse.json({
      success: true,
      region,
      partner: {
        id: partner.id,
        name: partner.name,
        estimatedDeliveryDays: partner.estimatedDeliveryDays,
        supportedFormats: partner.supportedFormats,
      },
      pricing: costInfo ? {
        subtotal: costInfo.subtotal,
        currency: costInfo.currency,
        estimatedDelivery: `${partner.estimatedDeliveryDays} business days`,
      } : null,
    });
  } catch (error) {
    console.error('Error getting printing partner:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get printing partner' },
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
