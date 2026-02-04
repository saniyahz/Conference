export type SubscriptionPlan = 'free' | 'basic' | 'basic_yearly' | 'premium' | 'premium_yearly'

export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    price: 0,
    interval: null,
    features: [
      '1 story per month',
      '1 PDF download',
      '3 audio plays',
      'Save 1 story',
      'Full print price ($20)',
    ],
    storiesPerMonth: 1,
    downloadsPerMonth: 1,
    audioPlaysPerMonth: 3,
    libraryLimit: 1,
    printDiscount: 0,
  },
  basic: {
    name: 'Basic',
    price: 4.99,
    interval: 'month',
    features: [
      '10 stories per month',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Save up to 25 stories',
      '15% off printing',
    ],
    storiesPerMonth: 10,
    downloadsPerMonth: -1, // unlimited
    audioPlaysPerMonth: -1,
    libraryLimit: 25,
    printDiscount: 0.15,
  },
  basic_yearly: {
    name: 'Basic Yearly',
    price: 39.99, // ~$3.33/mo - 33% savings
    interval: 'year',
    features: [
      '10 stories per month',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Save up to 25 stories',
      '15% off printing',
      'Save 33% vs monthly',
    ],
    storiesPerMonth: 10,
    downloadsPerMonth: -1,
    audioPlaysPerMonth: -1,
    libraryLimit: 25,
    printDiscount: 0.15,
  },
  premium: {
    name: 'Premium',
    price: 9.99,
    interval: 'month',
    features: [
      'Unlimited stories',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Unlimited library',
      '30% off printing',
      'Priority support',
    ],
    storiesPerMonth: -1, // unlimited
    downloadsPerMonth: -1,
    audioPlaysPerMonth: -1,
    libraryLimit: -1, // unlimited
    printDiscount: 0.30,
  },
  premium_yearly: {
    name: 'Premium Yearly',
    price: 79.99, // ~$6.67/mo - 33% savings
    interval: 'year',
    features: [
      'Unlimited stories',
      'Unlimited downloads',
      'Unlimited audio plays',
      'Unlimited library',
      '30% off printing',
      'Priority support',
      'Save 33% vs monthly',
    ],
    storiesPerMonth: -1,
    downloadsPerMonth: -1,
    audioPlaysPerMonth: -1,
    libraryLimit: -1,
    printDiscount: 0.30,
  },
} as const

export const PRINT_BASE_PRICE = 20 // Base price for a printed book

export function calculatePrintPrice(plan: SubscriptionPlan): number {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  const discount = planInfo.printDiscount
  return PRINT_BASE_PRICE * (1 - discount)
}

export function canCreateStory(storiesThisMonth: number, plan: SubscriptionPlan): boolean {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.storiesPerMonth === -1) return true
  return storiesThisMonth < planInfo.storiesPerMonth
}

export function canDownload(downloadsThisMonth: number, plan: SubscriptionPlan): boolean {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.downloadsPerMonth === -1) return true
  return downloadsThisMonth < planInfo.downloadsPerMonth
}

export function canPlayAudio(audioPlaysThisMonth: number, plan: SubscriptionPlan): boolean {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.audioPlaysPerMonth === -1) return true
  return audioPlaysThisMonth < planInfo.audioPlaysPerMonth
}

export function canSaveToLibrary(currentlySaved: number, plan: SubscriptionPlan): boolean {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.libraryLimit === -1) return true
  return currentlySaved < planInfo.libraryLimit
}

export function getRemainingStories(storiesThisMonth: number, plan: SubscriptionPlan): number | 'unlimited' {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.storiesPerMonth === -1) return 'unlimited'
  return Math.max(0, planInfo.storiesPerMonth - storiesThisMonth)
}

export function getRemainingDownloads(downloadsThisMonth: number, plan: SubscriptionPlan): number | 'unlimited' {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.downloadsPerMonth === -1) return 'unlimited'
  return Math.max(0, planInfo.downloadsPerMonth - downloadsThisMonth)
}

export function getRemainingAudioPlays(audioPlaysThisMonth: number, plan: SubscriptionPlan): number | 'unlimited' {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  if (planInfo.audioPlaysPerMonth === -1) return 'unlimited'
  return Math.max(0, planInfo.audioPlaysPerMonth - audioPlaysThisMonth)
}

export function getDiscountPercentage(discount: number): string {
  return `${Math.round(discount * 100)}%`
}

// Price IDs for Stripe (set these in .env)
export const STRIPE_PRICE_IDS = {
  basic: process.env.STRIPE_BASIC_MONTHLY_PRICE_ID || '',
  basic_yearly: process.env.STRIPE_BASIC_YEARLY_PRICE_ID || '',
  premium: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
  premium_yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || '',
}
