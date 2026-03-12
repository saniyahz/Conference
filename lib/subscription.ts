// ─────────────────────────────────────────────────
// Subscription Plans Configuration
// Two audiences: Parents (individual) & Schools (institutional)
// ─────────────────────────────────────────────────

// ── Plan type unions ──────────────────────────────
export type ParentPlanType = 'free' | 'plus' | 'unlimited'
export type SchoolPlanType = 'library_starter' | 'library_plus' | 'library_max'
export type PlanType = ParentPlanType | SchoolPlanType
export type BillingCycle = 'monthly' | 'yearly'
export type PlanAudience = 'parent' | 'school'

// ── Shared limit shape ────────────────────────────
export interface PlanLimits {
  storiesPerMonth: number       // -1 = unlimited (fair-use for "unlimited" parent plan)
  maxLibrarySize: number        // -1 = unlimited
  downloadsPerMonth: number     // -1 = unlimited
  audioPlaysPerMonth: number    // -1 = unlimited
  printDiscountPercent: number
}

// ── School-specific extras ────────────────────────
export interface SchoolLimits extends PlanLimits {
  maxStudents: number           // seat cap
  sharedBookPool: number        // books/month across all students
}

// ── Plan details shape ────────────────────────────
export interface PlanDetails {
  id: PlanType
  audience: PlanAudience
  name: string
  description: string
  features: string[]
  limits: PlanLimits | SchoolLimits
  pricing: {
    monthly: number
    yearly: number
    yearlyPerMonth: number      // yearly / 12 for display
    yearlySavingsPercent: number
  }
  stripePriceIds?: {
    monthly: string
    yearly: string
  }
  popular?: boolean
  fairUseNote?: string          // shown as fine print
}

// ── School add-on shape ───────────────────────────
export interface SchoolAddOn {
  id: string
  name: string
  description: string
  monthlyPrice: number
  note?: string
}

// ═════════════════════════════════════════════════
//  PARENT PLANS
// ═════════════════════════════════════════════════

export const PARENT_PLANS: Record<ParentPlanType, PlanDetails> = {
  free: {
    id: 'free',
    audience: 'parent',
    name: 'Free',
    description: 'Try the magic — one story on us',
    features: [
      '1 story total (lifetime)',
      'PDF download',
      'Audio playback',
      'Saved to Library',
    ],
    limits: {
      storiesPerMonth: 1,         // enforced as 1 lifetime, not monthly
      maxLibrarySize: 1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 0,
    },
    pricing: {
      monthly: 0,
      yearly: 0,
      yearlyPerMonth: 0,
      yearlySavingsPercent: 0,
    },
  },

  plus: {
    id: 'plus',
    audience: 'parent',
    name: 'Plus',
    description: 'Great for regular storytelling',
    features: [
      '7 books per month',
      'PDF download included',
      'Audio playback included',
      'Saved to Library',
      '25% off hardcover printing',
      'Printing coming soon',
    ],
    limits: {
      storiesPerMonth: 7,
      maxLibrarySize: -1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 25,
    },
    pricing: {
      monthly: 7.99,
      yearly: 67.99,
      yearlyPerMonth: parseFloat((67.99 / 12).toFixed(2)),  // ~5.67
      yearlySavingsPercent: 30,
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_PLUS_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || '',
    },
  },

  unlimited: {
    id: 'unlimited',
    audience: 'parent',
    name: 'Unlimited',
    description: 'Unlimited creativity for families',
    features: [
      'Unlimited books',
      'PDF download included',
      'Audio playback included',
      'Saved to Library',
      '35% off printing services',
      'Printing coming soon',
    ],
    limits: {
      storiesPerMonth: -1,
      maxLibrarySize: -1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 35,
    },
    pricing: {
      monthly: 14.99,
      yearly: 116.99,
      yearlyPerMonth: parseFloat((116.99 / 12).toFixed(2)),  // ~9.75
      yearlySavingsPercent: 35,
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_UNLIMITED_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_UNLIMITED_YEARLY_PRICE_ID || '',
    },
    popular: true,
    fairUseNote: 'Unlimited is intended for normal family use (fair-use protections apply).',
  },
}

// ═════════════════════════════════════════════════
//  SCHOOL PLANS  — Library (School-Wide)
// ═════════════════════════════════════════════════

export const SCHOOL_PLANS: Record<SchoolPlanType, PlanDetails> = {
  library_starter: {
    id: 'library_starter',
    audience: 'school',
    name: 'Library Starter',
    description: 'Get your school started with AI stories',
    features: [
      'Up to 250 students',
      '500 books/month (shared school pool)',
      'School Library (collections by grade/class)',
      'Admin dashboard',
      'PDF + Audio included',
    ],
    limits: {
      storiesPerMonth: 500,
      maxLibrarySize: -1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 0,
      maxStudents: 250,
      sharedBookPool: 500,
    } as SchoolLimits,
    pricing: {
      monthly: 499,
      yearly: 4499,
      yearlyPerMonth: parseFloat((4499 / 12).toFixed(2)),  // ~374.92
      yearlySavingsPercent: Math.round((1 - 4499 / (499 * 12)) * 100), // ~25%
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_SCHOOL_STARTER_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_SCHOOL_STARTER_YEARLY_PRICE_ID || '',
    },
  },

  library_plus: {
    id: 'library_plus',
    audience: 'school',
    name: 'Library Plus',
    description: 'For growing schools with more readers',
    features: [
      'Up to 750 students',
      '1,500 books/month (shared school pool)',
      'Everything in Starter',
      'Expanded limits',
    ],
    limits: {
      storiesPerMonth: 1500,
      maxLibrarySize: -1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 0,
      maxStudents: 750,
      sharedBookPool: 1500,
    } as SchoolLimits,
    pricing: {
      monthly: 899,
      yearly: 7999,
      yearlyPerMonth: parseFloat((7999 / 12).toFixed(2)),  // ~666.58
      yearlySavingsPercent: Math.round((1 - 7999 / (899 * 12)) * 100), // ~26%
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_SCHOOL_PLUS_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_SCHOOL_PLUS_YEARLY_PRICE_ID || '',
    },
    popular: true,
  },

  library_max: {
    id: 'library_max',
    audience: 'school',
    name: 'Library Max',
    description: 'Full-scale access for large schools',
    features: [
      'Up to 1,500 students',
      '3,500 books/month (shared school pool)',
      'Everything in Plus',
      'Highest limits',
    ],
    limits: {
      storiesPerMonth: 3500,
      maxLibrarySize: -1,
      downloadsPerMonth: -1,
      audioPlaysPerMonth: -1,
      printDiscountPercent: 0,
      maxStudents: 1500,
      sharedBookPool: 3500,
    } as SchoolLimits,
    pricing: {
      monthly: 1499,
      yearly: 12999,
      yearlyPerMonth: parseFloat((12999 / 12).toFixed(2)),  // ~1083.25
      yearlySavingsPercent: Math.round((1 - 12999 / (1499 * 12)) * 100), // ~28%
    },
    stripePriceIds: {
      monthly: process.env.STRIPE_SCHOOL_MAX_MONTHLY_PRICE_ID || '',
      yearly: process.env.STRIPE_SCHOOL_MAX_YEARLY_PRICE_ID || '',
    },
  },
}

// ═════════════════════════════════════════════════
//  SCHOOL ADD-ONS
// ═════════════════════════════════════════════════

export const SCHOOL_ADDONS: SchoolAddOn[] = [
  {
    id: 'extra_500_books',
    name: 'Extra 500 books/month',
    description: 'Add 500 more books to your monthly school pool',
    monthlyPrice: 399,
  },
  {
    id: 'extra_1000_books',
    name: 'Extra 1,000 books/month',
    description: 'Add 1,000 more books to your monthly school pool',
    monthlyPrice: 699,
  },
  {
    id: 'multi_school_bundle',
    name: 'Multi-school bundle',
    description: '15% off each additional school',
    monthlyPrice: 0,
    note: '15% discount applied per additional school at checkout',
  },
  {
    id: 'printing_discount',
    name: 'Printing discounts',
    description: 'Discounted rates for bulk school printing orders',
    monthlyPrice: 0,
    note: 'Coming soon',
  },
]

// ═════════════════════════════════════════════════
//  COMBINED LOOKUP  — all plans in one map
// ═════════════════════════════════════════════════

export const PLANS: Record<PlanType, PlanDetails> = {
  ...PARENT_PLANS,
  ...SCHOOL_PLANS,
}

// ═════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═════════════════════════════════════════════════

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLANS[plan].limits
}

export function isSchoolPlan(plan: PlanType): plan is SchoolPlanType {
  return plan === 'library_starter' || plan === 'library_plus' || plan === 'library_max'
}

export function isParentPlan(plan: PlanType): plan is ParentPlanType {
  return plan === 'free' || plan === 'plus' || plan === 'unlimited'
}

export function getSchoolLimits(plan: SchoolPlanType): SchoolLimits {
  return PLANS[plan].limits as SchoolLimits
}

/** Free plan: 1 story lifetime (not monthly). All other plans use monthly quota. Superusers bypass all limits. */
export function canCreateStory(
  plan: PlanType,
  storiesCreatedThisMonth: number,
  totalStoriesCreated: number = 0,
  role: string = 'user'
): boolean {
  if (role === 'superuser') return true
  if (plan === 'free') {
    return totalStoriesCreated < 1
  }
  const limits = getPlanLimits(plan)
  if (limits.storiesPerMonth === -1) return true
  return storiesCreatedThisMonth < limits.storiesPerMonth
}

export function canDownload(plan: PlanType, downloadsThisMonth: number): boolean {
  const limits = getPlanLimits(plan)
  if (limits.downloadsPerMonth === -1) return true
  return downloadsThisMonth < limits.downloadsPerMonth
}

export function canPlayAudio(plan: PlanType, audioPlaysThisMonth: number): boolean {
  const limits = getPlanLimits(plan)
  if (limits.audioPlaysPerMonth === -1) return true
  return audioPlaysThisMonth < limits.audioPlaysPerMonth
}

export function canSaveToLibrary(plan: PlanType, currentLibrarySize: number): boolean {
  const limits = getPlanLimits(plan)
  if (limits.maxLibrarySize === -1) return true
  return currentLibrarySize < limits.maxLibrarySize
}

export function getPrintDiscount(plan: PlanType): number {
  return getPlanLimits(plan).printDiscountPercent
}

export function getRemainingStories(
  plan: PlanType,
  storiesCreatedThisMonth: number,
  totalStoriesCreated: number = 0
): number | 'unlimited' {
  if (plan === 'free') {
    return Math.max(0, 1 - totalStoriesCreated)
  }
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

export function needsUpgrade(
  plan: PlanType,
  action: 'story' | 'download' | 'audio' | 'library',
  currentUsage: number,
  totalStoriesCreated: number = 0
): boolean {
  if (action === 'story') {
    return !canCreateStory(plan, currentUsage, totalStoriesCreated)
  }
  const limits = getPlanLimits(plan)
  switch (action) {
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

/** Multi-school discount: 15% off per additional school */
export const MULTI_SCHOOL_DISCOUNT = 0.15
