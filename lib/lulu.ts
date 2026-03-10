// ─────────────────────────────────────────────────
// Lulu Print-on-Demand API Client
// Docs: https://developers.lulu.com/
//
// Auth: OAuth 2.0 Client Credentials flow
// Sandbox: https://api.sandbox.lulu.com
// Production: https://api.lulu.com
// ─────────────────────────────────────────────────

const LULU_SANDBOX_URL = 'https://api.sandbox.lulu.com'
const LULU_PRODUCTION_URL = 'https://api.lulu.com'

function getBaseUrl(): string {
  return process.env.LULU_SANDBOX === 'true' ? LULU_SANDBOX_URL : LULU_PRODUCTION_URL
}

// ── OAuth 2.0 Token Management ──────────────────

let cachedToken: string | null = null
let tokenExpiresAt: number = 0

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const clientKey = process.env.LULU_CLIENT_KEY
  const clientSecret = process.env.LULU_CLIENT_SECRET
  if (!clientKey || !clientSecret) {
    throw new Error('LULU_CLIENT_KEY and LULU_CLIENT_SECRET must be set')
  }

  const baseUrl = getBaseUrl()
  const tokenUrl = `${baseUrl}/auth/realms/glasstree/protocol/openid-connect/token`

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientKey,
      client_secret: clientSecret,
    }).toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Lulu OAuth error:', response.status, errorText)
    throw new Error(`Lulu OAuth failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000

  return cachedToken!
}

async function luluHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Cache-Control': 'no-cache',
  }
}

// ── Types ────────────────────────────────────────

export interface LuluAddress {
  name: string
  street1: string
  street2?: string
  city: string
  state_code?: string
  postcode: string
  country_code: string // ISO 2-letter code
  email?: string
  phone_number?: string
}

export interface LuluShippingOption {
  level: string           // e.g., "MAIL", "PRIORITY_MAIL", "GROUND_HD", "EXPRESS", "GROUND"
  cost_excl_tax: string   // e.g., "5.99"
  total_cost_excl_tax: string
  currency: string
  estimated_shipping_dates?: {
    arrival_min?: string
    arrival_max?: string
  }
}

export interface LuluCostResponse {
  total_cost_excl_tax: string
  total_cost_incl_tax: string
  total_tax: string
  currency: string
  shipping_cost: LuluShippingOption
  line_item_costs: Array<{
    cost_excl_tax: string
    quantity: number
    tax_amount: string
  }>
}

export interface LuluPrintJobResponse {
  id: number
  status: {
    name: string       // "CREATED", "UNPAID", "PAYMENT_IN_PROGRESS", "PRODUCTION_READY", etc.
    message?: string
  }
  line_items: Array<{
    id: number
    external_id?: string
    title: string
    quantity: number
  }>
  shipping_address: LuluAddress
  date_created: string
}

export interface LuluPrintJobStatus {
  id: number
  status: {
    name: string
    message?: string
  }
  tracking_id?: string
  tracking_urls?: string[]
  date_created: string
  date_modified: string
}

// ── Product Configuration ────────────────────────
// 8.5x8.5" square, perfect bound (paperback), full-color interior,
// 80# coated white (444 PPI pages-per-inch), gloss cover
//
// Pod Package ID format: TRIMxTRIM_BINDING_INTERIOR-COLOR_PAPER_COVER
// 0850X0850 = 8.5x8.5" trim
// FC = Full Color
// STD = Standard quality
// PB = Perfect Bound (paperback)
// 080CW = 80# Coated White paper
// 444 = pages per inch (for spine calculation)
// G = Gloss laminate
// XX = No special finish
export const LULU_POD_PACKAGE_ID = '0850X0850FCSTDPB080CW444GXX'

// ── Spine Calculation ────────────────────────────

/**
 * Calculate spine width in inches for Lulu's cover template.
 * Formula for 80# Coated White (444 PPI): spine = pageCount / 444 + 0.06"
 * The 0.06" is Lulu's cover board thickness allowance.
 */
export function calculateSpineWidth(pageCount: number): number {
  return pageCount / 444 + 0.06
}

// ── API Functions ────────────────────────────────

/**
 * Calculate shipping cost from Lulu.
 * Returns cost breakdown including manufacturing + shipping.
 */
export async function calculateShippingCost(
  address: LuluAddress,
  pageCount: number,
  shippingLevel: string = 'MAIL'
): Promise<LuluCostResponse> {
  const baseUrl = getBaseUrl()
  const headers = await luluHeaders()

  const body = {
    line_items: [
      {
        page_count: pageCount,
        pod_package_id: LULU_POD_PACKAGE_ID,
        quantity: 1,
      },
    ],
    shipping_address: {
      city: address.city,
      country_code: address.country_code,
      postcode: address.postcode,
      state_code: address.state_code || undefined,
      street1: address.street1,
    },
    shipping_level: shippingLevel,
  }

  const response = await fetch(`${baseUrl}/print-job-cost-calculations/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Lulu cost calculation error:', response.status, errorText)
    throw new Error(`Lulu cost calculation failed: ${response.status} - ${errorText}`)
  }

  return response.json()
}

/**
 * Create a print job on Lulu.
 * Only call this AFTER payment has been confirmed.
 *
 * Lulu requires separate cover and interior PDF files.
 */
export async function createPrintJob(params: {
  coverUrl: string
  interiorUrl: string
  address: LuluAddress
  shippingLevel?: string
  externalId: string
  title?: string
  quantity?: number
}): Promise<LuluPrintJobResponse> {
  const baseUrl = getBaseUrl()
  const headers = await luluHeaders()

  const body = {
    contact_email: params.address.email || '',
    external_id: params.externalId,
    line_items: [
      {
        external_id: params.externalId,
        printable_normalization: {
          cover: {
            source_url: params.coverUrl,
          },
          interior: {
            source_url: params.interiorUrl,
          },
          pod_package_id: LULU_POD_PACKAGE_ID,
        },
        quantity: params.quantity || 1,
        title: params.title || 'Storybook',
      },
    ],
    production_delay: 120, // 2 minutes — allows cancellation window
    shipping_address: {
      name: params.address.name,
      street1: params.address.street1,
      street2: params.address.street2 || undefined,
      city: params.address.city,
      state_code: params.address.state_code || undefined,
      postcode: params.address.postcode,
      country_code: params.address.country_code,
      phone_number: params.address.phone_number || '',
    },
    shipping_level: params.shippingLevel || 'MAIL',
  }

  const response = await fetch(`${baseUrl}/print-jobs/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Lulu create print job error:', response.status, errorText)
    throw new Error(`Lulu create print job failed: ${response.status} - ${errorText}`)
  }

  return response.json()
}

/**
 * Get the status of a Lulu print job.
 * Use as a backup to webhooks or for manual status checks.
 */
export async function getPrintJob(jobId: number | string): Promise<LuluPrintJobStatus> {
  const baseUrl = getBaseUrl()
  const headers = await luluHeaders()

  const response = await fetch(`${baseUrl}/print-jobs/${jobId}/`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Lulu get print job failed: ${response.status} - ${errorText}`)
  }

  return response.json()
}
