# Grok Cost-Per-Book Analysis

## Overview

This analysis compares the cost of using xAI's Grok models (text + Aurora images) versus the current stack (GPT-4o-mini + Flux Kontext Pro) for generating 10-page illustrated children's storybooks in Benny's Story Time.

Each book requires:
- **1** story text generation call
- **10** image generation calls (one per page)
- **5-10** video animation calls (optional "Living Pictures")
- **10** audio narration (TTS) calls

---

## Current Stack Cost Per Book

| Component       | Model              | Calls/Book | Unit Cost        | Total Cost   |
|-----------------|--------------------|-----------|------------------|-------------|
| Story text      | GPT-4o-mini        | 1         | ~$0.005/call     | ~$0.005     |
| Images          | Flux Kontext Pro   | 10        | $0.04/image      | $0.40       |
| Videos          | Wan 2.2 I2V Fast   | 5-10      | $0.05/video      | $0.15-$0.50 |
| Audio (TTS)     | OpenAI TTS (tts-1) | 10        | ~$0.0075/page    | ~$0.075     |
| **Total**       |                    |           |                  | **~$0.63-$0.98** |

---

## Grok Stack Cost Per Book

| Component       | Model                              | Calls/Book | Unit Cost           | Total Cost   |
|-----------------|------------------------------------|-----------|---------------------|-------------|
| Story text      | Grok 4.1 Fast                      | 1         | $0.20/M in, $0.50/M out | ~$0.003  |
| Images          | Aurora (grok-imagine-image)        | 10        | $0.07/image         | **$0.70**   |
| Videos          | N/A (xAI has no video API)         | 5-10      | $0.05/video (Wan)   | $0.15-$0.50 |
| Audio (TTS)     | N/A (xAI has no TTS API)          | 10        | ~$0.0075/page (OpenAI) | ~$0.075 |
| **Total**       |                                    |           |                     | **~$0.93-$1.28** |

---

## Side-by-Side Comparison

| Metric                | Current Stack       | Grok Stack          | Difference          |
|-----------------------|---------------------|---------------------|---------------------|
| Text generation       | ~$0.005             | ~$0.003             | -$0.002 (cheaper)   |
| Image generation      | $0.40               | $0.70               | +$0.30 (75% more)   |
| Video generation      | $0.15-$0.50         | $0.15-$0.50         | Same (no xAI alt)   |
| Audio/TTS             | $0.075              | $0.075              | Same (no xAI alt)   |
| **Total per book**    | **$0.63-$0.98**     | **$0.93-$1.28**     | **+$0.30 (~48%)**   |

---

## Scaling Projections

| Books/Month | Current Stack Cost | Grok Stack Cost | Additional Cost |
|-------------|-------------------|-----------------|-----------------|
| 100         | $63-$98           | $93-$128        | ~$30            |
| 500         | $315-$490         | $465-$640       | ~$150           |
| 1,000       | $630-$980         | $930-$1,280     | ~$300           |
| 5,000       | $3,150-$4,900     | $4,650-$6,400   | ~$1,500         |

---

## Key Findings

1. **Aurora images are 75% more expensive** than Flux Kontext Pro ($0.07 vs $0.04 per image). Since 10 images are generated per book, this is the primary cost driver.

2. **Grok 4.1 Fast text generation is slightly cheaper** ($0.20/M input tokens vs GPT-4o-mini), but text generation is already the cheapest component (~$0.005 per book), so savings are negligible.

3. **xAI has no video or TTS APIs**, so video generation (Wan 2.2) and audio narration (OpenAI TTS) would remain unchanged regardless of switching to Grok.

4. **Net impact: +$0.30 per book (~48% increase)** switching from the current stack to Grok for text + images.

---

## Recommendation

The current stack (GPT-4o-mini + Flux Kontext Pro) is more cost-effective at **~$0.63-$0.98 per book** vs Grok's **~$0.93-$1.28 per book**. The primary cost difference comes from image generation pricing. Unless Grok Aurora provides significantly better image quality or character consistency for children's illustrations, the current stack should be retained.

---

## Pricing Sources (as of March 2026)

- xAI API pricing: https://docs.x.ai/developers/models
- xAI Aurora image generation: $0.07/image (launched March 2025)
- Grok 4.1 Fast: $0.20/M input tokens, $0.50/M output tokens
- Flux Kontext Pro (Replicate): $0.04/image
- OpenAI GPT-4o-mini: ~$0.15/M input, ~$0.60/M output
- OpenAI TTS: $15/M characters
- Wan 2.2 I2V Fast (Replicate): $0.05/video
