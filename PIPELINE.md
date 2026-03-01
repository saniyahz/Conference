# Benny's Story Time — Feature Pipeline

> Living document tracking upcoming features, ideas, and priorities.
> Updated: 2025-02-19

---

## Status Legend
- **SHIPPED** — Live in production
- **IN PROGRESS** — Currently being built
- **NEXT UP** — Approved, ready to build
- **PLANNED** — Scoped out, waiting for prioritization
- **IDEA** — Brainstormed, needs scoping

---

## SHIPPED

### Core Story Generation
- Voice input (speech-to-text) for story prompts
- GPT-4o-mini story generation (10 pages)
- Character DNA extraction + Character Bible (once per book)
- Scene Card generation (per-page settings, actions, objects)

### Image Pipeline
- SDXL plate generation (background without character)
- Anchor compositing (reference character seeded onto plate)
- Multi-round inpainting with escalating masks (3 rounds)
- CLIP embedding similarity scoring
- BLIP caption verification
- GroundingDINO / OWL-ViT object detection
- 5-rule candidate acceptance gate
- Solo plate fallback + txt2img emergency fallback
- Anti-drift negative prompts (species-aware)
- Pose variation injection per page

### Character System
- Character library with pre-cached assets (rhinoceros)
- 16 supported animal types (only rhinoceros has cached refs)
- Kid-safety word filter

### Subscription Plans (NEW)
- Parent plans: Free (1 story lifetime) / Plus ($7.99/mo) / Unlimited ($14.99/mo)
- School plans: Library Starter ($199/mo) / Library Plus ($399/mo) / Library Max ($699/mo)
- School add-ons: extra book packs, multi-school bundles
- Stripe checkout + webhook integration
- Usage tracking (monthly resets)
- Pricing page with Parents/Schools toggle

### Other
- PDF export
- Audio playback (TTS)
- Story library / dashboard
- Google OAuth authentication
- About page, Terms & Conditions

---

## PLANNED

### Series Feature
> Create one book, then keep creating sequels with the same character(s).

**Core concept:**
- After finishing a book, kid sees "Continue the Adventure" button
- Next book reuses the same character bible, CLIP embedding, art style, anchor reference
- Perfect character consistency across books since same identity pipeline

**What carries over between books:**
- Character Bible (appearance, personality, species)
- Art style settings (medium, genre, mood)
- CLIP anchor embedding + reference images
- Character relationships (recurring supporting characters)

**What's new each book:**
- Story text, scene cards, settings, actions
- Supporting characters (new or recurring)

**Sub-features:**
- Series Library View — books grouped on dashboard ("Riri's Adventures - 3 books")
- Recurring Characters — "Bring back a friend" from previous book
- Character Growth — accessories/outfit changes while keeping base identity
- "Previously on..." Recap — GPT generates 1-sentence recap for continuity
- Series Arc — kid gives high-level arc ("Riri visits every continent"), GPT plans multiple books
- Print as Box Set — matching set with consistent spine design

**Data model (rough):**
```
Series
  - id, name ("Riri's Adventures")
  - characterBible (JSON, locked at creation)
  - artStyle (locked)
  - anchorImage (reference PNG)
  - clipEmbedding (cached)
  - books[] -> Story (ordered)
```

**Why it's feasible now:** Character consistency pipeline is already built. Series is mostly a DB model + UI for linking stories to a shared character bible.

---

### "My Art, My Story" — Kid Artwork-to-Book
> Kid uploads their own drawing. AI analyzes it, writes a story around it, and extends their art style into a full illustrated book.

**The flow:**
1. Kid draws or uploads a photo of their artwork
2. GPT-4o Vision analyzes: characters, setting, mood, objects, colors, art style
3. GPT writes a 10-page story starring whatever the kid drew
4. AI generates page illustrations that reference the kid's art
5. Kid's original drawing becomes the cover or hero page

**Two modes:**
- **Storybook Mode** (simpler, build first) — Kid's art as cover, AI illustrates remaining pages in professional children's book style but using kid's color choices and character design
- **My Style Mode** (premium, build later) — AI attempts to match the kid's actual art style via img2img / style transfer. Pages look like the kid drew them with more detail

**Vision analysis extracts:**
```json
{
  "characters": [{"name": "guess", "description": "purple dinosaur", "colors": ["purple"]}],
  "setting": "grassy hill with sun",
  "mood": "happy, sunny",
  "objects": ["flowers", "sun", "clouds"],
  "dominantColors": ["purple", "green", "yellow"],
  "artStyle": "crayon | marker | watercolor | pencil | digital"
}
```

**Kid interaction:**
- After upload, AI shows what it "sees": "I see a purple dinosaur on a hill!"
- Kid can correct: "That's not a dinosaur, it's a dragon!"
- Optional voice: "Tell me about your drawing!" (transcribe + merge with vision)

**In the finished book:**
- Special badge: "Original artwork by [name], age [age]"
- Kid's page has hand-drawn frame to set it apart
- Print version: kid's original art on inside front cover

**Connects to Series:** Kid draws a character → Book 1. Draws again → Book 2 with same character in new scene. Over time, a series where the kid contributed art to every book.

**Considerations:**
- Age range: younger kids (3-5) = scribbles, need generous interpretation. Older kids (7-10) = recognizable characters
- Multiple drawings per book? Kid draws 3 scenes → AI connects them + fills 7 remaining pages
- In-app drawing canvas vs photo upload only
- Content moderation on uploaded images
- Style transfer quality (img2img is hit-or-miss)

**Why it's a differentiator:** No other kids' story app does this. Parents love seeing their kid's art become a real book. Natural upsell for printing.

---

### "My Movie" — AI-Generated Story Movies
> Kids create a 3-5 minute animated movie from their storybook — narrated, scored, and ready to share.

**Core concept:**
- After a storybook is generated, kid taps "Make My Movie!"
- Existing storybook illustrations become key frames
- AI video model animates between key frames (camera pans, parallax, subtle character motion)
- TTS narration synced to each scene, background music auto-selected by mood
- Final output: MP4 video, 3-5 minutes, downloadable + shareable

**Recommended Architecture (based on model research):**

| Stage | Tool | Why |
|-------|------|-----|
| Key frames | Flux Kontext Pro (existing) | Already generating 10 pages per book — reuse as-is |
| Video clips | Runway Gen-3 Alpha Turbo | Best API availability, 10s clips, img2vid mode, consistent style, ~$0.25/5s |
| Assembly | FFmpeg (server-side) | Stitching clips, adding audio tracks, crossfades |
| Narration | OpenAI TTS (alloy/shimmer) | Kid-friendly voices, low-latency, $15/1M chars (~$0.01/book) |
| Music | Licensed stock library | Royalty-free kids music packs, mood-tagged (adventure, calm, silly) |
| SFX | Freesound / stock library | Ocean waves, bird chirps, door creaks — mood-matched per scene card |

**Alternative video models evaluated:**

| Model | Pros | Cons |
|-------|------|------|
| **Runway Gen-3 Alpha Turbo** ★ | Best API, img2vid, 10s clips, turbo speed | $0.25/5s cost |
| Kling AI 1.6 | Cheap ($0.014/s), 10s clips | API less mature, quality slightly lower |
| Google Veo 2/3 | Highest quality, 8s clips | Limited API access (Vertex AI waitlist) |
| OpenAI Sora | Good quality | API access very limited, expensive |
| Minimax (Hailuo) | 6s clips, decent quality | Character consistency can drift |
| Luma Dream Machine | Fast, 5s clips | Lower quality than Runway/Kling |
| Pika Labs | Good for stylized art | Short clips only (3-4s) |
| Stable Video Diffusion | Open-source, self-hostable | Requires GPU infrastructure |

**Pipeline flow (per book → movie):**

```
1. Extract 10 key frames from existing storybook images
2. For each page:
   a. Generate video clip (Runway img2vid, 5-10s per page)
   b. Generate narration audio (OpenAI TTS from page text)
   c. Select background music segment (mood-matched from scene card)
   d. Select SFX layer (setting-based: ocean, forest, city, etc.)
3. FFmpeg assembly:
   a. Concat video clips with 0.5s crossfade transitions
   b. Mix narration + music + SFX audio tracks
   c. Add title card (book title + character name) at start
   d. Add credits card ("Made with Benny's Story Time") at end
   e. Export as MP4 (1080p, H.264)
4. Upload to storage, return download URL
```

**Parallelization strategy:**
- All 10 video clips can generate in parallel (independent img2vid calls)
- All 10 narration clips can generate in parallel
- Only FFmpeg assembly is sequential
- Estimated total time: 8-15 minutes (parallelized) vs 30+ minutes (sequential)

**Cost estimates (per movie):**

| Component | Cost |
|-----------|------|
| Video clips (10 × 5s) | $5.00 (Runway) or $0.70 (Kling) |
| Narration | ~$0.01 |
| Music licensing | Bundled (stock library, one-time purchase) |
| FFmpeg compute | ~$0.10 (serverless) |
| Storage + CDN | ~$0.05 |
| **Total (Runway path)** | **~$5.16/movie** |
| **Total (Kling path)** | **~$0.86/movie** |

**Suggested pricing tiers:**
- Free plan: No movies
- Plus plan ($7.99/mo): 1 movie/month included
- Unlimited plan ($14.99/mo): 3 movies/month
- À la carte: $4.99 per additional movie
- School plans: bulk movie credits

**New files needed:**
```
lib/moviePipeline.ts          — orchestrator: key frames → clips → assembly
lib/videoGenerator.ts         — Runway/Kling API wrapper (img2vid)
lib/narrationGenerator.ts     — OpenAI TTS per page
lib/audioMixer.ts             — FFmpeg audio mixing (narration + music + SFX)
lib/movieAssembler.ts         — FFmpeg video concat + audio merge
app/api/generate-movie/route.ts  — API endpoint
components/MoviePlayer.tsx    — in-app video player with download button
public/music/                 — stock music library (mood-tagged)
public/sfx/                   — stock SFX library (setting-tagged)
```

**Phase rollout:**
1. **MVP (Phase 1):** Static pan-and-zoom (Ken Burns effect) over existing images + narration + music. No AI video generation needed. FFmpeg only. Ship fast, test demand.
2. **Phase 2:** Replace Ken Burns with AI video generation (Runway/Kling). Subtle animation: clouds moving, water rippling, character breathing.
3. **Phase 3:** Full scene animation — characters walking, interacting. Music dynamically generated per mood. SFX per scene.

**Why it's a major differentiator:** No other kids' story platform goes from prompt → illustrated book → animated movie. Parents will pay premium for a "movie my kid wrote." Natural viral content (parents share on social media).

**Dependencies:** Runway or Kling API access, FFmpeg on server (or serverless via Lambda/Cloud Run), stock music licensing.

---

## IDEAS (Not Yet Scoped)

### Collaborative Stories
- Two kids share a character and take turns writing the next adventure
- Could work with Series feature — alternating authors per book

### Branching Stories
- "What if Riri went to the ocean instead?" — fork a series into alternate paths
- Choose-your-own-adventure style

### Character Marketplace
- Kids can share their characters publicly
- Other kids can use shared characters in their own stories
- "Featured character of the week"

### Classroom Mode (School Plans)
- Teacher assigns a story prompt to the whole class
- Each student generates their own version
- Teacher can create a "class book" combining the best pages from each student

### Multi-language Support
- Generate stories in different languages
- Bilingual books (English + Spanish, etc.)

### Physical Products Beyond Books
- Posters of favorite pages
- Character stickers
- Coloring book version (line art export)
- T-shirts with character art

---

## Priority Order (Suggested)
1. Series Feature — highest impact, leverages existing pipeline
2. My Movie (Phase 1: Ken Burns MVP) — huge wow factor, moderate effort, tests demand
3. My Art, My Story (Storybook Mode) — big differentiator, moderate effort
4. Classroom Mode — drives school plan adoption
5. My Movie (Phase 2: AI Video) — premium upgrade once demand proven
6. My Art, My Story (My Style Mode) — premium upgrade to #3
7. Multi-language — expands market
8. Everything else based on user feedback
