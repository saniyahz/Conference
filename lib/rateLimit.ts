/**
 * Server-side rate limiting for story generation.
 *
 * Two modes:
 *   1. Authenticated users → checked against subscription plan + UsageTracking
 *   2. Guest users (no login) → checked against GuestUsage by IP (1 free story)
 *
 * Also provides a lightweight generation token system so generate-images
 * can verify the caller came through generate-story (not called directly).
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { prisma } from './prisma'
import { canCreateStory, type PlanType } from './subscription'
import { randomUUID } from 'crypto'

// ─── Generation tokens (in-memory, 10min TTL) ──────────────────────────────
// After generate-story succeeds, it issues a token. generate-images validates it.
// This prevents someone from calling generate-images directly without going through
// the rate-limited generate-story endpoint first.

interface TokenEntry {
  createdAt: number
  userId?: string
  ip: string
}

const generationTokens = new Map<string, TokenEntry>()
const TOKEN_TTL_MS = 10 * 60 * 1000 // 10 minutes

/** Issue a generation token after successful story generation */
export function issueGenerationToken(ip: string, userId?: string): string {
  // Clean expired tokens periodically
  if (generationTokens.size > 1000) {
    const now = Date.now()
    for (const [key, entry] of generationTokens) {
      if (now - entry.createdAt > TOKEN_TTL_MS) {
        generationTokens.delete(key)
      }
    }
  }

  const token = randomUUID()
  generationTokens.set(token, { createdAt: Date.now(), userId, ip })
  return token
}

/** Validate and consume a generation token */
export function validateGenerationToken(token: string, ip: string): boolean {
  const entry = generationTokens.get(token)
  if (!entry) return false

  const expired = Date.now() - entry.createdAt > TOKEN_TTL_MS
  if (expired) {
    generationTokens.delete(token)
    return false
  }

  // Token is valid — consume it (one-time use)
  generationTokens.delete(token)
  return true
}

// ─── IP extraction ──────────────────────────────────────────────────────────

export function getClientIP(req: NextRequest): string {
  // Vercel / reverse proxy headers
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // Fallback
  return '127.0.0.1'
}

// ─── Main rate limit check ──────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  reason?: 'guest_limit' | 'plan_limit' | 'not_active'
  userId?: string
  isGuest: boolean
  plan?: string
  remaining?: number | 'unlimited'
}

/**
 * Check whether this request is allowed to generate a story.
 *
 * 1. If authenticated → check subscription plan + usage counters
 * 2. If guest → check IP against GuestUsage (1 free story per IP)
 */
export async function checkStoryLimit(req: NextRequest): Promise<RateLimitResult> {
  // Try to get session
  const session = await getServerSession(authOptions)
  const ip = getClientIP(req)

  if (session?.user?.id) {
    // ═══ AUTHENTICATED USER ═══
    const userId = session.user.id
    const role = (session.user as { role?: string }).role || 'user'

    // Superusers bypass everything
    if (role === 'superuser') {
      return { allowed: true, isGuest: false, userId, plan: 'superuser', remaining: 'unlimited' }
    }

    // Fetch subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    })

    const plan = (subscription?.plan || 'free') as PlanType
    const status = subscription?.status || 'active'

    // Check subscription is active
    if (status !== 'active') {
      return { allowed: false, reason: 'not_active', isGuest: false, userId, plan }
    }

    // Fetch usage
    let usage = await prisma.usageTracking.findUnique({
      where: { userId },
    })

    // Auto-create if missing
    if (!usage) {
      usage = await prisma.usageTracking.create({
        data: { userId },
      })
    }

    // Monthly reset check
    const now = new Date()
    const lastReset = new Date(usage.lastResetDate)
    const isNewMonth = now.getMonth() !== lastReset.getMonth() ||
                       now.getFullYear() !== lastReset.getFullYear()

    if (isNewMonth) {
      usage = await prisma.usageTracking.update({
        where: { userId },
        data: {
          storiesCreatedThisMonth: 0,
          downloadsThisMonth: 0,
          audioPlaysThisMonth: 0,
          lastResetDate: now,
        },
      })
    }

    const allowed = canCreateStory(plan, usage.storiesCreatedThisMonth, usage.totalStoriesCreated, role)

    return {
      allowed,
      reason: allowed ? undefined : 'plan_limit',
      isGuest: false,
      userId,
      plan,
    }
  } else {
    // ═══ GUEST USER (not logged in) ═══
    let guestUsage = await prisma.guestUsage.findUnique({
      where: { ipAddress: ip },
    })

    if (!guestUsage) {
      // First visit — allowed
      return { allowed: true, isGuest: true }
    }

    if (guestUsage.storiesCreated >= 1) {
      return { allowed: false, reason: 'guest_limit', isGuest: true }
    }

    return { allowed: true, isGuest: true }
  }
}

// ─── Usage increment (called after successful generation) ────────────────────

/** Increment story count for an authenticated user */
export async function incrementUserUsage(userId: string): Promise<void> {
  await prisma.usageTracking.upsert({
    where: { userId },
    create: {
      userId,
      storiesCreatedThisMonth: 1,
      totalStoriesCreated: 1,
    },
    update: {
      storiesCreatedThisMonth: { increment: 1 },
      totalStoriesCreated: { increment: 1 },
    },
  })
}

/** Increment story count for a guest IP */
export async function incrementGuestUsage(ip: string): Promise<void> {
  await prisma.guestUsage.upsert({
    where: { ipAddress: ip },
    create: {
      ipAddress: ip,
      storiesCreated: 1,
      lastStoryAt: new Date(),
    },
    update: {
      storiesCreated: { increment: 1 },
      lastStoryAt: new Date(),
    },
  })
}
