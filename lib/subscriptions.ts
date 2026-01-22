export type SubscriptionPlan = 'free' | 'monthly' | 'yearly' | 'unlimited_monthly' | 'unlimited_yearly'

export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    price: 0,
    interval: null,
    features: [
      'Unlimited story creation',
      'Save 1 story',
      'Full print price ($30)',
    ],
    storiesLimit: 1,
    printDiscount: 0,
  },
  monthly: {
    name: 'Monthly',
    price: 5,
    interval: 'month',
    features: [
      'Unlimited story creation',
      'Save up to 5 stories per month',
      '15% off printing',
    ],
    storiesLimit: 5,
    printDiscount: 0.15,
  },
  yearly: {
    name: 'Yearly',
    price: 48, // $5 * 12 * 0.8 (20% discount)
    interval: 'year',
    features: [
      'Unlimited story creation',
      'Save up to 5 stories per month',
      '15% off printing',
      '20% off subscription',
    ],
    storiesLimit: 5,
    printDiscount: 0.15,
  },
  unlimited_monthly: {
    name: 'Unlimited Monthly',
    price: 15,
    interval: 'month',
    features: [
      'Unlimited everything',
      'Save unlimited stories',
      '50% off printing',
    ],
    storiesLimit: -1, // -1 means unlimited
    printDiscount: 0.5,
  },
  unlimited_yearly: {
    name: 'Unlimited Yearly',
    price: 144, // $15 * 12 * 0.8 (20% discount)
    interval: 'year',
    features: [
      'Unlimited everything',
      'Save unlimited stories',
      '50% off printing',
      '20% off subscription',
    ],
    storiesLimit: -1,
    printDiscount: 0.5,
  },
} as const

export const PRINT_BASE_PRICE = 30

export function calculatePrintPrice(plan: SubscriptionPlan): number {
  const planInfo = SUBSCRIPTION_PLANS[plan]
  const discount = planInfo.printDiscount
  return PRINT_BASE_PRICE * (1 - discount)
}

export function canSaveStory(currentlySaved: number, plan: SubscriptionPlan): boolean {
  const planInfo = SUBSCRIPTION_PLANS[plan]

  // Unlimited
  if (planInfo.storiesLimit === -1) {
    return true
  }

  return currentlySaved < planInfo.storiesLimit
}

export function getDiscountPercentage(discount: number): string {
  return `${Math.round(discount * 100)}%`
}
