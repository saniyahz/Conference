// ─────────────────────────────────────────────────
// Flat subscription lookup used by API routes (checkout, webhooks, usage gating).
// Re-exports from the canonical subscription.ts and adds convenience helpers.
// ─────────────────────────────────────────────────

import {
  type PlanType,
  type BillingCycle,
  type PlanDetails,
  PLANS,
  PARENT_PLANS,
  SCHOOL_PLANS,
  isSchoolPlan,
  canCreateStory,
  canDownload,
  canPlayAudio,
  canSaveToLibrary,
  getRemainingStories,
  getRemainingDownloads,
  getRemainingAudioPlays,
} from './subscription'

// Re-export canonical types
export {
  type PlanType,
  type BillingCycle,
  type PlanDetails,
  PLANS,
  PARENT_PLANS,
  SCHOOL_PLANS,
  isSchoolPlan,
  canCreateStory,
  canDownload,
  canPlayAudio,
  canSaveToLibrary,
  getRemainingStories,
  getRemainingDownloads,
  getRemainingAudioPlays,
}

// ── Legacy SubscriptionPlan type (flat, includes billing variant) ──
// Kept for backward-compat with checkout route that passes plan key directly.
export type SubscriptionPlan = PlanType

// ── Flat plan map keyed by PlanType ───────────────
export interface FlatPlanInfo {
  name: string
  price: number
  interval: 'month' | 'year' | null
  features: string[]
  storiesPerMonth: number
  downloadsPerMonth: number
  audioPlaysPerMonth: number
  libraryLimit: number
  printDiscount: number
}

function toFlat(plan: PlanDetails, cycle: 'monthly' | 'yearly'): FlatPlanInfo {
  const isMonthly = cycle === 'monthly'
  return {
    name: isMonthly ? plan.name : `${plan.name} Yearly`,
    price: isMonthly ? plan.pricing.monthly : plan.pricing.yearly,
    interval: plan.pricing.monthly === 0 ? null : (isMonthly ? 'month' : 'year'),
    features: [
      ...plan.features,
      ...(!isMonthly && plan.pricing.yearlySavingsPercent > 0
        ? [`Save ${plan.pricing.yearlySavingsPercent}% vs monthly`]
        : []),
    ],
    storiesPerMonth: plan.limits.storiesPerMonth,
    downloadsPerMonth: plan.limits.downloadsPerMonth,
    audioPlaysPerMonth: plan.limits.audioPlaysPerMonth,
    libraryLimit: plan.limits.maxLibrarySize,
    printDiscount: plan.limits.printDiscountPercent / 100,
  }
}

// Build flat map for all plans (monthly + yearly variants)
function buildFlatPlans(): Record<string, FlatPlanInfo> {
  const result: Record<string, FlatPlanInfo> = {}

  for (const [key, plan] of Object.entries(PLANS)) {
    // Monthly entry (or the only entry for free)
    result[key] = toFlat(plan, 'monthly')

    // Yearly variant (skip free)
    if (plan.pricing.yearly > 0) {
      result[`${key}_yearly`] = toFlat(plan, 'yearly')
    }
  }

  return result
}

export const SUBSCRIPTION_PLANS = buildFlatPlans()

// ── Print pricing ─────────────────────────────────
export const PRINT_BASE_PRICE = 36.99

export function calculatePrintPrice(plan: PlanType): number {
  const planInfo = PLANS[plan]
  const discount = planInfo.limits.printDiscountPercent / 100
  return PRINT_BASE_PRICE * (1 - discount)
}

export function getDiscountPercentage(discount: number): string {
  return `${Math.round(discount * 100)}%`
}

// ── Stripe price ID lookup ────────────────────────
export function getStripePriceId(plan: PlanType, cycle: BillingCycle): string {
  const planDetails = PLANS[plan]
  if (!planDetails.stripePriceIds) return ''
  return cycle === 'monthly'
    ? planDetails.stripePriceIds.monthly
    : planDetails.stripePriceIds.yearly
}
