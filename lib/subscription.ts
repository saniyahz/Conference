// Subscription Plans Configuration

export type PlanType = 'free' | 'basic' | 'premium'
export type BillingCycle = 'monthly' | 'yearly'

export interface PlanLimits {
  storiesPerMonth: number // -1 for unlimited
  maxLibrarySize: number // -1 for unlimited
  downloadsPerMonth: number // -1 for unlimited
  audioPlaysPerMonth: number // -1 for unlimited
  printDiscountPercent: number
}

export interface PlanDetails {
  id: PlanType
  name: string
  description: string
  features: string[]
  limits: PlanLimits
  pricing: {
    monthly: number
    yearly: number
    yearlyPerMonth: number // yearly / 12 for display
  }
  stripePriceIds?: {
    monthly: string
    yearly: string
  }
  popular?: boolean
}

// Plan configurations
export const PLANS: Record<PlanType, PlanDetails> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out the magic',
    features: [
      '1 story per month',
      '1 PDF download',
      '3 audio plays',
      'Basic library (1 story)',
      'Full price printing',
    ],
    limits: {
      storiesPerMonth: 1,
      maxLibrarySize: 1,
      downloadsPerMonth: 1,
      audioPlaysPerMonth: 3,
      printDiscountPercent: 0,
    },
    pricing: {
      monthly: 0,
      yearly: 0,
      yearlyPerMonth: 0,
    },
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'Great for regular storytelling',
    features: [
      '10 stories per month',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Library up to 25 stories',
      '15% off printing',
      'Email support',
    ],
    limits: {
      storiesPerMonth: 10,
      maxLibrarySize: 25,
      downloadsPerMonth: -1, // unlimited
      audioPlaysPerMonth: -1, // unlimited
      printDiscountPercent: 15,
    },
    pricing: {
      monthly: 4.99,
      yearly: 39.99,
      yearlyPerMonth: 3.33,
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_BASIC_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_BASIC_YEARLY_PRICE_ID || '',
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Unlimited creativity for families',
    features: [
      'Unlimited stories',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Unlimited library',
      '30% off printing',
      'Priority support',
      'Early access to new features',
    ],
    limits: {
      storiesPerMonth: -1, // unlimited
      maxLibrarySize: -1, // unlimited
      downloadsPerMonth: -1, // unlimited
      audioPlaysPerMonth: -1, // unlimited
      printDiscountPercent: 30,
    },
    pricing: {
      monthly: 9.99,
      yearly: 79.99,
      yearlyPerMonth: 6.67,
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || '',
    },
    popular: true,
  },
}

// Helper functions
export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLANS[plan].limits
}

export function canCreateStory(
  plan: PlanType,
  storiesCreatedThisMonth: number
): boolean {
  const limits = getPlanLimits(plan)
  if (limits.storiesPerMonth === -1) return true
  return storiesCreatedThisMonth < limits.storiesPerMonth
}

export function canDownload(
  plan: PlanType,
  downloadsThisMonth: number
): boolean {
  const limits = getPlanLimits(plan)
  if (limits.downloadsPerMonth === -1) return true
  return downloadsThisMonth < limits.downloadsPerMonth
}

export function canPlayAudio(
  plan: PlanType,
  audioPlaysThisMonth: number
): boolean {
  const limits = getPlanLimits(plan)
  if (limits.audioPlaysPerMonth === -1) return true
  return audioPlaysThisMonth < limits.audioPlaysPerMonth
}

export function canSaveToLibrary(
  plan: PlanType,
  currentLibrarySize: number
): boolean {
  const limits = getPlanLimits(plan)
  if (limits.maxLibrarySize === -1) return true
  return currentLibrarySize < limits.maxLibrarySize
}

export function getPrintDiscount(plan: PlanType): number {
  return getPlanLimits(plan).printDiscountPercent
}

export function getRemainingStories(
  plan: PlanType,
  storiesCreatedThisMonth: number
): number | 'unlimited' {
  const limits = getPlanLimits(plan)
  if (limits.storiesPerMonth === -1) return 'unlimited'
  return Math.max(0, limits.storiesPerMonth - storiesCreatedThisMonth)
}

export function getRemainingDownloads(
  plan: PlanType,
  downloadsThisMonth: number
): number | 'unlimited' {
  const limits = getPlanLimits(plan)
  if (limits.downloadsPerMonth === -1) return 'unlimited'
  return Math.max(0, limits.downloadsPerMonth - downloadsThisMonth)
}

export function getRemainingAudioPlays(
  plan: PlanType,
  audioPlaysThisMonth: number
): number | 'unlimited' {
  const limits = getPlanLimits(plan)
  if (limits.audioPlaysPerMonth === -1) return 'unlimited'
  return Math.max(0, limits.audioPlaysPerMonth - audioPlaysThisMonth)
}

// Check if user needs to upgrade
export function needsUpgrade(
  plan: PlanType,
  action: 'story' | 'download' | 'audio' | 'library',
  currentUsage: number
): boolean {
  const limits = getPlanLimits(plan)

  switch (action) {
    case 'story':
      return limits.storiesPerMonth !== -1 && currentUsage >= limits.storiesPerMonth
    case 'download':
      return limits.downloadsPerMonth !== -1 && currentUsage >= limits.downloadsPerMonth
    case 'audio':
      return limits.audioPlaysPerMonth !== -1 && currentUsage >= limits.audioPlaysPerMonth
    case 'library':
      return limits.maxLibrarySize !== -1 && currentUsage >= limits.maxLibrarySize
    default:
      return false
  }
}

// Print pricing
export const PRINT_BASE_PRICE = 20 // Base price for a printed book

export function calculatePrintPrice(plan: PlanType): number {
  const discount = getPrintDiscount(plan) / 100 // Convert percentage to decimal
  return PRINT_BASE_PRICE * (1 - discount)
}

export function getDiscountPercentage(plan: PlanType): string {
  return `${getPrintDiscount(plan)}%`
}
