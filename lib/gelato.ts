// ─────────────────────────────────────────────────
// Gelato Print-on-Demand API Client
// Docs: https://docs.gelato.com/reference
// ─────────────────────────────────────────────────

const GELATO_API_BASE = 'https://order.gelatoapis.com/v4'

function getApiKey(): string {
  const key = process.env.GELATO_API_KEY
  if (!key) throw new Error('GELATO_API_KEY is not set')
  return key
}

function gelatoHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-API-KEY': getApiKey(),
  }
}

// ── Types ────────────────────────────────────────

export interface GelatoAddress {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state?: string
  postCode: string
  country: string // ISO 2-letter code (e.g., "US", "GB", "DE")
  email: string
  phone?: string
}

export interface GelatoShipmentMethod {
  shipmentMethodUid: string
  shipmentMethodName: string
  price: number
  currency: string
  minDeliveryDays: number
  maxDeliveryDays: number
}

export interface GelatoQuoteResponse {
  orderReferenceId: string
  quotes: GelatoShipmentMethod[]
}

export interface GelatoOrderResponse {
  id: string
  orderReferenceId: string
  status: string
  fulfillmentStatus: string
  items: Array<{
    itemReferenceId: string
    productUid: string
    quantity: number
  }>
}

export interface GelatoOrderStatus {
  id: string
  orderReferenceId: string
  status: string
  fulfillmentStatus: string
  shipments?: Array<{
    shipmentId: string
    trackingCode?: string
    trackingUrl?: string
    carrierName?: string
  }>
}

// ── Product Configuration ────────────────────────
// 8x8" (210x210mm) hardcover photobook, silk coated 170gsm, matte lamination
// NOTE: Look up the exact product UID from Gelato's catalog API in sandbox:
// GET https://product.gelatoapis.com/v3/catalogs/all/products?productType=photobook
// and filter for 210x210mm hardcover. The UID below is a placeholder.
export const GELATO_PRODUCT_UID = 'photobooks_pf_210x210-mm_pt_170-gsm-coated-silk_cl_4-4_ccl_4-4_bt_glued_ct_matt-lamination'

// ── API Functions ────────────────────────────────

/**
 * Get a shipping quote from Gelato.
 * Returns available shipping methods with pricing and delivery estimates.
 */
export async function getShippingQuote(
  address: GelatoAddress,
  pdfUrl: string,
  orderReferenceId: string
): Promise<GelatoQuoteResponse> {
  const body = {
    orderType: 'order',
    orderReferenceId,
    currency: 'USD',
    recipient: {
      firstName: address.firstName,
      lastName: address.lastName,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || undefined,
      city: address.city,
      state: address.state || undefined,
      postCode: address.postCode,
      country: address.country,
      email: address.email,
      phone: address.phone || undefined,
    },
    items: [
      {
        itemReferenceId: 'book-1',
        productUid: GELATO_PRODUCT_UID,
        files: [
          {
            type: 'default',
            url: pdfUrl,
          },
        ],
        quantity: 1,
      },
    ],
  }

  const response = await fetch(`${GELATO_API_BASE}/orders/quote`, {
    method: 'POST',
    headers: gelatoHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.text()
    console.error('Gelato quote error:', response.status, errorData)
    throw new Error(`Gelato quote failed: ${response.status} - ${errorData}`)
  }

  return response.json()
}

/**
 * Create a print order on Gelato.
 * Only call this AFTER payment has been confirmed.
 */
export async function createOrder(params: {
  orderReferenceId: string
  address: GelatoAddress
  pdfUrl: string
  shipmentMethodUid?: string
}): Promise<GelatoOrderResponse> {
  const body = {
    orderType: 'order',
    orderReferenceId: params.orderReferenceId,
    currency: 'USD',
    recipient: {
      firstName: params.address.firstName,
      lastName: params.address.lastName,
      addressLine1: params.address.addressLine1,
      addressLine2: params.address.addressLine2 || undefined,
      city: params.address.city,
      state: params.address.state || undefined,
      postCode: params.address.postCode,
      country: params.address.country,
      email: params.address.email,
      phone: params.address.phone || undefined,
    },
    items: [
      {
        itemReferenceId: 'book-1',
        productUid: GELATO_PRODUCT_UID,
        files: [
          {
            type: 'default',
            url: params.pdfUrl,
          },
        ],
        quantity: 1,
      },
    ],
    ...(params.shipmentMethodUid && {
      shipmentMethodUid: params.shipmentMethodUid,
    }),
  }

  const response = await fetch(`${GELATO_API_BASE}/orders`, {
    method: 'POST',
    headers: gelatoHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorData = await response.text()
    console.error('Gelato order error:', response.status, errorData)
    throw new Error(`Gelato order failed: ${response.status} - ${errorData}`)
  }

  return response.json()
}

/**
 * Get the status of a Gelato order.
 * Use as a backup to webhooks or for manual status checks.
 */
export async function getOrder(gelatoOrderId: string): Promise<GelatoOrderStatus> {
  const response = await fetch(`${GELATO_API_BASE}/orders/${gelatoOrderId}`, {
    method: 'GET',
    headers: gelatoHeaders(),
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Gelato get order failed: ${response.status} - ${errorData}`)
  }

  return response.json()
}

/**
 * Cancel a Gelato order.
 * Only works before production starts.
 */
export async function cancelOrder(gelatoOrderId: string): Promise<void> {
  const response = await fetch(`${GELATO_API_BASE}/orders/${gelatoOrderId}:cancel`, {
    method: 'POST',
    headers: gelatoHeaders(),
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Gelato cancel failed: ${response.status} - ${errorData}`)
  }
}
