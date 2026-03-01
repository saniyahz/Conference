# BENNY'S STORY TIME — GO-LIVE DEPLOYMENT PLAN
### Prepared: February 25, 2026

---

## CURRENT STATE AUDIT

| Area                        | Status         | Notes                                                    |
|-----------------------------|----------------|----------------------------------------------------------|
| Story generation pipeline   | DONE           | GPT-4o-mini, Kontext images, Minimax videos, TTS audio   |
| Auth (NextAuth + Google)    | BUILT, NOT ON  | Login pages, JWT sessions, Google + email/password coded  |
| Stripe subscriptions        | BUILT          | Checkout, webhooks, plan enforcement all coded            |
| Print ordering (Gelato)     | BUILT, UNTESTED| Full pipeline coded, needs end-to-end testing             |
| User dashboard + library    | BUILT          | Save/view/delete stories, usage stats, print orders       |
| Pricing page                | BUILT          | Parent + school toggle with all plan tiers                |
| Admin dashboard             | NOT BUILT      | No admin routes, no super-admin flag, no analytics        |
| Analytics backend           | NOT BUILT      | Per-user usage tracking exists, no aggregate views        |
| Database                    | SQLite (dev)   | Must switch to PostgreSQL for production                  |
| Environments                | NONE           | Running locally only                                      |

---

## PHASE 1: PRE-LAUNCH FOUNDATION (Week 1-2)

### 1A. Three-Environment Architecture

| Environment  | Purpose                          | URL                              | Database            |
|--------------|----------------------------------|----------------------------------|---------------------|
| STAGING      | Test upgrades, new features      | staging.bennysstorytime.com      | Separate Postgres   |
| PRODUCTION   | Live site for real users         | www.bennysstorytime.com          | Production Postgres  |
| BACKUP / DR  | Production clone, failover       | Auto-replicated by Vercel        | Read replica of Prod |

Setup Steps:

  1. Buy domain: bennysstorytime.com (or your preferred name)

  2. Create Vercel project, connect GitHub repo, configure 3 branches:
     - main     --> deploys to PRODUCTION (www.bennysstorytime.com)
     - staging  --> deploys to STAGING (staging.bennysstorytime.com)
     - backup   --> manual snapshot branch for rollback (not auto-deployed)

  3. Create 2 PostgreSQL databases (Vercel Postgres, Neon, or Supabase):
     - benny-prod    --> used by Production
     - benny-staging --> used by Staging
     - Backup: enable automatic daily snapshots / point-in-time recovery

  4. Set separate env vars per environment in Vercel dashboard:
     - Staging uses Stripe TEST mode keys (no real charges)
     - Production uses Stripe LIVE mode keys
     - Each gets its own DATABASE_URL, NEXTAUTH_URL, etc.

Git Workflow:

  feature-branch --> PR to staging --> test on staging --> PR to main --> auto-deploys to production

Backup / Disaster Recovery:
  - Vercel keeps full deployment history (instant rollback to any previous deploy)
  - Database: enable point-in-time recovery or nightly pg_dump to R2
  - Weekly: merge main --> backup branch as code snapshot


### 1B. Database Migration: SQLite to PostgreSQL

Code Changes Required:

  1. Update prisma/schema.prisma:
     Change provider from "sqlite" to "postgresql"

  2. Run: npx prisma migrate dev --name init

  3. Run: npx prisma generate

  4. Test all queries work (Prisma abstracts the differences)

  No other code changes needed.


### 1C. Add Missing Environment Variables

Add to .env.example:

  GOOGLE_CLIENT_ID=your_google_client_id
  GOOGLE_CLIENT_SECRET=your_google_client_secret

---

## PHASE 2: PRINTING INTEGRATION TESTING (Week 1-2, parallel)

### 2A. Gelato Account Setup

  [ ] Create Gelato account at gelato.com, get API key
  [ ] Find the REAL product UID for:
      - 8x8 inch (210x210mm) hardcover photobook
      - Silk coated 170gsm paper
      - Matte lamination
      (Code currently has a placeholder UID that must be replaced)
  [ ] Set up Gelato webhook pointed at:
      https://staging.bennysstorytime.com/api/webhooks/gelato
  [ ] Implement Gelato webhook HMAC signature verification (marked TODO in code)


### 2B. Cloudflare R2 Setup

  [ ] Create R2 bucket named "storybook-pdfs" in Cloudflare dashboard
  [ ] Create API token with S3-compatible access
  [ ] Enable public access on the bucket (Gelato needs to fetch the PDF)
  [ ] Set R2_PUBLIC_URL to the public bucket URL


### 2C. Print Testing Checklist (run on Staging environment)

  [ ] Generate a story, go to Dashboard, click "Print this book"
  [ ] Enter test shipping address, verify Gelato shipping quote returns
  [ ] Complete Stripe checkout (test card: 4242 4242 4242 4242)
  [ ] Verify: Stripe webhook fires --> print PDF generates --> uploads to R2
  [ ] Verify: Gelato order created with correct PDF URL and product UID
  [ ] Verify: Gelato webhook updates order status in database
  [ ] Test shipping quotes to different countries (US, UK, EU)
  [ ] Test plan-based print discounts (Plus = 25% off, Unlimited = 35% off)
  [ ] Verify print PDF quality: correct 8x8 inch dimensions, bleed area, image resolution
  [ ] Verify Gelato's preflight check passes on generated PDFs


### 2D. Print Fixes Likely Needed

  - Replace placeholder Gelato product UID with real one
  - Add Gelato webhook HMAC signature verification
  - Confirm R2 URLs are publicly accessible to Gelato's servers
  - Test that generatePrintPdf.ts output passes Gelato preflight

---

## PHASE 3: AUTHENTICATION ACTIVATION (Week 2)

Auth is fully coded. Just needs activation.

### 3A. Google OAuth Setup

  1. Go to Google Cloud Console (console.cloud.google.com)
  2. Create new project (or use existing)
  3. Enable Google Identity API
  4. Create OAuth 2.0 credentials:
     - Authorized JavaScript origins:
       https://www.bennysstorytime.com
       https://staging.bennysstorytime.com
     - Authorized redirect URIs:
       https://www.bennysstorytime.com/api/auth/callback/google
       https://staging.bennysstorytime.com/api/auth/callback/google
  5. Copy Client ID + Secret --> add to Vercel env vars for both environments


### 3B. Auth Gate on Story Generation

  Current state: Home page lets anyone generate stories without logging in.

  RECOMMENDED for launch: Require login before generating.
  - Add session check at top of handleTranscriptionComplete() in app/page.tsx
  - If not logged in, redirect to /auth/signin?callbackUrl=/
  - This ensures every story is tracked to a user and counted against plan limits


### 3C. Route Protection Middleware (Recommended)

  Add middleware.ts at project root to protect routes centrally:
  - PROTECT: /dashboard, /print/*, /api/stories/*, /api/usage/*
  - ALLOW: /, /auth/*, /api/auth/*, /pricing, /about, /terms
  - Currently each route checks getServerSession() individually (works but messy)


### 3D. Auth Features to Build Later (not blocking launch)

  - Password reset flow ("Forgot password?" link --> email with reset token)
  - Email verification (send verification email on signup)
  - These can be added post-launch

---

## PHASE 4: SUPER ADMIN ACCOUNT + ADMIN DASHBOARD (Week 2-3)

### 4A. Add Admin Role to Database

  Add to User model in prisma/schema.prisma:
    role    String  @default("user")    // "user", "school_admin", "super_admin"

  Run: npx prisma migrate dev --name add-user-role


### 4B. Seed Your Super Admin Account

  Create prisma/seed.ts:
  - Creates your account with role: "super_admin"
  - Hashes your password with bcryptjs
  - Creates subscription (unlimited, free — you don't pay yourself)
  - Creates usage tracking record

  Add to package.json: "prisma": { "seed": "ts-node prisma/seed.ts" }
  Run: npx prisma db seed


### 4C. Admin Dashboard Routes

  Build app/admin/ with these pages:

  | Route             | Purpose                                              |
  |-------------------|------------------------------------------------------|
  | /admin            | Overview: total users, stories today, revenue         |
  | /admin/stories    | All stories with search, filters, theme analysis      |
  | /admin/users      | User list with subscription status, usage             |
  | /admin/analytics  | Charts: stories/day, popular themes, revenue          |
  | /admin/orders     | Print order status, Gelato tracking                   |

  Admin access check: session.user.role === "super_admin"
  Non-admins redirected to home page.


### 4D. Admin Dashboard Content

  OVERVIEW PAGE:
  - Total users (today / this week / all time)
  - Stories generated (today / this week / all time)
  - Revenue (MRR from subscriptions + print order revenue)
  - Active subscriptions by plan type
  - System health (API success rates, error counts)

  STORIES PAGE:
  - Searchable table: title, author, date, page count, downloads, original prompt
  - Filter by date range
  - Theme tags per story

  USERS PAGE:
  - User list: name, email, plan, stories created, signup date
  - Quick actions: view stories, change plan, disable account

  ANALYTICS PAGE:
  - Stories generated per day (line chart)
  - Popular themes (pie chart)
  - Conversion funnel: visit --> generate --> save --> print
  - Revenue breakdown: subscriptions vs print orders
  - Average generation time and cost per story

  ORDERS PAGE:
  - Print orders: story title, user, status, tracking number, amount
  - Filter by status (pending, processing, shipped, delivered)

---

## PHASE 5: ANALYTICS BACKEND (Week 3)

### 5A. Story Generation Logging

  Add new Prisma model: StoryGeneration

  Fields:
  - id, userId, originalPrompt, storyTitle
  - characterSpecies, themes (JSON array)
  - pageCount, imageCount, videoCount
  - totalDurationMs (how long generation took)
  - success (boolean), errorMessage
  - imageCost, videoCost, audioCost, totalCost
  - createdAt

  Log every generation attempt (success AND failure) from the generation pipeline.


### 5B. Theme Analysis

  After each story generates, call GPT to classify themes:
  Categories: adventure, animals, space, ocean, friendship, magic,
  family, nature, science, sports, music, food, school, holidays

  Store in StoryGeneration.themes as JSON array.
  Admin dashboard reads these for theme distribution charts.


### 5C. External Analytics (Quick Wins, Free/Cheap)

  | Service          | Cost      | What it does                                    |
  |------------------|-----------|-------------------------------------------------|
  | Vercel Analytics | Free/Pro  | Page views, web vitals, visitor counts           |
  | PostHog          | Free tier | Product analytics, funnels, session replays      |
  |                  | 1M events | (1M events/mo free)                              |
  | Sentry           | Free tier | Error tracking, crash reports                    |
  |                  | 5K errors | (5K errors/mo free)                              |

  Add PostHog + Sentry to app/layout.tsx as script tags.

---

## PHASE 6: PRE-LAUNCH HARDENING (Week 3-4)

### 6A. Security Checklist

  [ ] Generate strong NEXTAUTH_SECRET: openssl rand -base64 32
  [ ] Verify ALL API routes check session authentication
  [ ] Add rate limiting to generation endpoints (prevent abuse)
  [ ] Add OpenAI moderation API check (beyond the word filter)
  [ ] HTTPS only (Vercel handles automatically)
  [ ] Set secure: true on cookies in production
  [ ] Review CORS settings
  [ ] Ensure no API keys leak to client-side code


### 6B. Performance Checklist

  [ ] Add loading.tsx skeleton screens for slow pages
  [ ] Verify next/image usage for image optimization
  [ ] CDN caching for static assets (Vercel Edge handles this)
  [ ] Database connection pooling configured
  [ ] Test with slow 3G connection simulation


### 6C. Error Handling Checklist

  [ ] Add global error boundary: app/error.tsx
  [ ] Add 404 page: app/not-found.tsx
  [ ] Ensure API routes return proper error JSON (not stack traces)
  [ ] Add Sentry for runtime error tracking
  [ ] Test: what happens when Replicate is down? OpenAI is down?


### 6D. Legal / Compliance Checklist

  [ ] Terms of Service (exists at /terms -- verify content with lawyer)
  [ ] Privacy Policy page (may need to create)
  [ ] COPPA compliance (children's app -- parental consent required)
  [ ] Cookie consent banner (required if using analytics cookies)
  [ ] AI content disclaimer (exists in footer -- verify sufficiency)
  [ ] Data retention policy documented


### 6E. SEO / Marketing Checklist

  [ ] Open Graph meta tags for social sharing
  [ ] Favicon + app icons (all sizes)
  [ ] Sitemap at /sitemap.xml
  [ ] robots.txt
  [ ] Landing page copy optimized for conversions
  [ ] Social media preview images

---

## PHASE 7: GO-LIVE (Launch Day)

### 7A. Production Environment Variables

  Set ALL of these in Vercel Production environment:

  CORE:
    DATABASE_URL=postgresql://...               (Vercel Postgres connection string)
    NEXTAUTH_URL=https://www.bennysstorytime.com
    NEXTAUTH_SECRET=<generated-with-openssl>
    NEXT_PUBLIC_APP_URL=https://www.bennysstorytime.com

  AI APIS:
    REPLICATE_API_TOKEN=<your-token>            (ENSURE SUFFICIENT BALANCE!)
    OPENAI_API_KEY=<your-key>                   (ENSURE SUFFICIENT BALANCE!)

  AUTH:
    GOOGLE_CLIENT_ID=<from-google-console>
    GOOGLE_CLIENT_SECRET=<from-google-console>

  PAYMENTS (USE LIVE KEYS, NOT TEST!):
    STRIPE_SECRET_KEY=sk_live_...
    STRIPE_PUBLISHABLE_KEY=pk_live_...
    STRIPE_WEBHOOK_SECRET=whsec_...

  PRINTING:
    GELATO_API_KEY=<your-key>
    GELATO_WEBHOOK_SECRET=<your-secret>

  STORAGE:
    R2_ACCOUNT_ID=<your-id>
    R2_ACCESS_KEY_ID=<your-key>
    R2_SECRET_ACCESS_KEY=<your-secret>
    R2_BUCKET_NAME=storybook-pdfs
    R2_PUBLIC_URL=https://your-bucket.r2.dev


### 7B. Stripe Production Setup

  1. Switch from test mode to live mode in Stripe dashboard
  2. Register production webhook:
     URL: https://www.bennysstorytime.com/api/webhooks/stripe
     Events: checkout.session.completed,
             customer.subscription.updated,
             customer.subscription.deleted
  3. Register Gelato production webhook:
     URL: https://www.bennysstorytime.com/api/webhooks/gelato


### 7C. Pre-Launch Verification Checklist

  [ ] npm run build -- no errors
  [ ] npm run typecheck -- no errors
  [ ] Test on staging: full flow from signup to story to download to print
  [ ] Test Stripe checkout with real test card
  [ ] Test Google OAuth login on staging
  [ ] Test email/password signup + login
  [ ] Verify all Living Pictures animate correctly (5 of 10 pages)
  [ ] Verify dashboard shows correct usage counts
  [ ] Check mobile responsiveness (iPhone, iPad, Android)
  [ ] Run Lighthouse audit: performance, accessibility, SEO all green
  [ ] Verify PDF download works correctly
  [ ] Verify audio narration plays on all pages
  [ ] Test with different story prompts (space, ocean, forest, etc.)


### 7D. Launch Sequence

  1. Merge staging --> main
  2. Vercel auto-deploys to production
  3. Run: npx prisma migrate deploy (against production database)
  4. Run: npx prisma db seed (create super admin account)
  5. Verify site is live at www.bennysstorytime.com
  6. Create a test story to verify full pipeline end-to-end
  7. Monitor Vercel logs for errors for first 24 hours
  8. Verify Replicate and OpenAI billing dashboards (watch for cost spikes)

---

## PHASE 8: POST-LAUNCH (Week 5+)

  [ ] Plan-gate Living Pictures (Unlimited plan only)
  [ ] Build school admin dashboard (student management, class views)
  [ ] Add password reset flow
  [ ] Add email verification
  [ ] Build referral program
  [ ] Clean up legacy SDXL code (src/lib/pipeline.ts, imageGeneration.ts, etc.)
  [ ] Load testing (simulate 100 concurrent users)
  [ ] Set up cost monitoring dashboard (daily Replicate + OpenAI spend alerts)
  [ ] A/B test pricing page
  [ ] Add multi-language support

---

## INFRASTRUCTURE COST ESTIMATE

  | Service           | Monthly Cost  | Notes                                    |
  |-------------------|---------------|------------------------------------------|
  | Vercel Pro        | $20/mo        | Hosting, edge network, analytics         |
  | Vercel Postgres   | $0-25/mo      | Free tier covers early users             |
  | Cloudflare R2     | ~$5/mo        | PDF storage, 10GB free tier              |
  | Domain            | ~$1/mo        | ($12/year)                               |
  | Google OAuth      | Free          |                                          |
  | Sentry            | Free          | 5K errors/mo free tier                   |
  | PostHog           | Free          | 1M events/mo free tier                   |
  | TOTAL INFRA       | ~$30-50/mo    | Before API costs                         |

  API costs scale with usage:
  - Per book generated: ~$0.67
    (Replicate images $0.44 + Replicate videos $0.15 + OpenAI story $0.005 + OpenAI TTS $0.075)
  - 10 books/day   = ~$200/mo in API costs
  - 50 books/day   = ~$1,000/mo in API costs
  - 100 books/day  = ~$2,000/mo in API costs

  Break-even estimate: ~280 paid subscribers at $14.99/mo Unlimited plan


## REVENUE PROJECTIONS

  | Milestone         | Subscribers | Monthly Revenue | Monthly API Cost | Net        |
  |-------------------|-------------|-----------------|------------------|------------|
  | Month 1           | 50          | $750            | $300             | $400       |
  | Month 3           | 200         | $3,000          | $1,000           | $1,950     |
  | Month 6           | 500         | $7,500          | $2,500           | $4,950     |
  | Month 12          | 1,000       | $15,000         | $5,000           | $9,950     |
  | + 5 schools       | +5 schools  | +$4,500         | +$1,500          | +$2,950    |

---

## PRIORITY ORDER SUMMARY

  Priority 1: Set up Vercel + PostgreSQL + domain (staging + production + backup)
  Priority 2: Test printing end-to-end on staging (Gelato + R2 + Stripe)
  Priority 3: Activate authentication (Google OAuth credentials + login gate)
  Priority 4: Build admin dashboard + seed super admin account
  Priority 5: Add analytics logging (StoryGeneration model + theme classification)
  Priority 6: Security hardening (rate limiting, error boundaries, COPPA review)
  Priority 7: GO LIVE

---

## ACCOUNTS TO CREATE

  [ ] Vercel account         -- vercel.com (hosting)
  [ ] Vercel Postgres        -- via Vercel dashboard (database)
  [ ] Domain registrar       -- Namecheap, Google Domains, or via Vercel
  [ ] Google Cloud Console   -- console.cloud.google.com (OAuth)
  [ ] Gelato account         -- gelato.com (print-on-demand)
  [ ] Cloudflare account     -- cloudflare.com (R2 storage)
  [ ] Stripe account         -- stripe.com (payments) -- switch to live mode
  [ ] Sentry account         -- sentry.io (error tracking)
  [ ] PostHog account        -- posthog.com (product analytics)
  [ ] Replicate account      -- replicate.com (already have, add billing alerts)
  [ ] OpenAI account         -- platform.openai.com (already have, add billing alerts)

---

END OF DOCUMENT
