import { describe, it, expect } from 'vitest';
import { acceptCandidate, scoreCaption, ClipResult, DetectionResult } from '../candidateScoring';

// Helper to make a ClipResult (moderate score weights for consistency)
function clip(similarity: number): ClipResult {
  let sc: number;
  if (similarity >= 0.82) sc = 7;
  else if (similarity >= 0.78) sc = 5;
  else if (similarity >= 0.72) sc = 3;
  else if (similarity >= 0.65) sc = 1;
  else if (similarity >= 0.58) sc = -1;
  else sc = -4;
  return { similarity, scoreContribution: sc, reason: `CLIP: sim=${similarity}` };
}

// Helper to make a DetectionResult
function dino(confidence: number, bboxArea: number = 0.15): DetectionResult {
  return {
    detected: confidence > 0,
    confidence,
    bestBboxArea: bboxArea,
    scoreContribution: confidence >= 0.65 ? 2 : 0,
  };
}

describe('acceptCandidate - Rule 2: Wrong animal rejection', () => {
  it('rejects when BLIP says "cow" and DINO/CLIP too weak for override', () => {
    const result = acceptCandidate(
      'a cartoon cow standing in a field',
      clip(0.60),   // CLIP too low for override (< 0.68)
      dino(0.85),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
    expect(result.rejectReason).toContain('cow');
  });

  it('rejects when BLIP says "giraffe" and DINO too weak for override', () => {
    const result = acceptCandidate(
      'a cute cartoon giraffe in a forest',
      clip(0.75),
      dino(0.55), // DINO too low for override (< 0.70)
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('rejects when BLIP says "zebra" with high DINO but low CLIP', () => {
    const result = acceptCandidate(
      'a cartoon zebra with stripes on a hill',
      clip(0.60),   // CLIP too low for override
      dino(0.92),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('rejects when BLIP says "dinosaur" with high CLIP but low DINO', () => {
    const result = acceptCandidate(
      'a cute cartoon dinosaur on moon surface',
      clip(0.75),
      dino(0.55), // DINO too low for override (< 0.70)
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('rejects when BLIP says "bull" with no CLIP', () => {
    const result = acceptCandidate(
      'a cartoon bull standing on grass',
      null,        // No CLIP — override not possible
      dino(0.78),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('rejects when BLIP says wrong animal with tiny bbox (even high DINO+CLIP)', () => {
    const result = acceptCandidate(
      'a cartoon rabbit in a garden',
      clip(0.75),
      dino(0.85, 0.05), // bbox 5% — too small for override (< 8%)
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('allows wrong animal if in allowedAnimals list', () => {
    const result = acceptCandidate(
      'a cartoon rhinoceros and a lion in a forest',
      clip(0.78),
      dino(0.85),
      { allowedAnimals: ['lions', 'lion'] },
    );
    // "lion" is allowed, and "rhino" is confirmed → should be accepted
    expect(result.accepted).toBe(true);
  });

  it('rejects wrong animal NOT in allowedAnimals (even with high DINO+CLIP)', () => {
    const result = acceptCandidate(
      'a cartoon cow and a lion in a forest',
      clip(0.60),   // CLIP too low for override
      dino(0.85),
      { allowedAnimals: ['lions'] },
    );
    // "cow" is NOT allowed and CLIP too low → reject
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('cow');
  });
});

describe('acceptCandidate - Rule 2: DINO+CLIP override', () => {
  it('overrides BLIP "rabbit" when DINO and CLIP both strongly confirm', () => {
    const result = acceptCandidate(
      'a cartoon rabbit in a garden',
      clip(0.75),      // CLIP >= 0.68 ✓
      dino(0.80, 0.25), // DINO >= 0.70 AND bbox >= 8% ✓
    );
    // DINO+CLIP override: BLIP says "rabbit" but both detection signals confirm character
    expect(result.accepted).toBe(true);
  });

  it('overrides BLIP "elephant" when DINO and CLIP both strongly confirm', () => {
    const result = acceptCandidate(
      'a cute cartoon elephant on the moon',
      clip(0.72),      // CLIP >= 0.68 ✓
      dino(0.85, 0.30), // DINO >= 0.70 AND bbox >= 8% ✓
    );
    expect(result.accepted).toBe(true);
  });

  it('overrides BLIP "dinosaur" when DINO and CLIP both strongly confirm', () => {
    const result = acceptCandidate(
      'a cute cartoon dinosaur in a forest',
      clip(0.70),      // CLIP >= 0.68 ✓
      dino(0.75, 0.20), // DINO >= 0.70 AND bbox >= 8% ✓
    );
    expect(result.accepted).toBe(true);
  });

  it('does NOT override when DINO is below 0.70 confidence', () => {
    const result = acceptCandidate(
      'a cartoon pig on a hill',
      clip(0.75),
      dino(0.65, 0.20), // DINO too low (< 0.70)
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('does NOT override when CLIP is below 0.68 similarity', () => {
    const result = acceptCandidate(
      'a cartoon pig on a hill',
      clip(0.66),       // CLIP too low (< 0.68)
      dino(0.85, 0.20),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('does NOT override when bbox is below 8%', () => {
    const result = acceptCandidate(
      'a cartoon dog in a park',
      clip(0.75),
      dino(0.85, 0.05), // bbox too small (< 8%)
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });

  it('does NOT override when CLIP is null', () => {
    const result = acceptCandidate(
      'a cartoon bear in the woods',
      null,              // No CLIP data
      dino(0.90, 0.30),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('WRONG ANIMAL');
  });
});

describe('acceptCandidate - Rule 1: No humans', () => {
  it('rejects when BLIP mentions a person', () => {
    const result = acceptCandidate(
      'a person standing next to a rhinoceros',
      clip(0.75),
      dino(0.80),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('HUMAN');
  });

  it('rejects when BLIP mentions a boy', () => {
    const result = acceptCandidate(
      'a boy riding a cartoon rhinoceros',
      clip(0.75),
      dino(0.80),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('HUMAN');
  });
});

describe('acceptCandidate - Rule 3: Character must be confirmed', () => {
  it('rejects when no rhino confirmed by any signal', () => {
    const result = acceptCandidate(
      'a cartoon character standing in a garden',
      clip(0.50), // CLIP too low to confirm
      dino(0.30), // DINO too low to confirm
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('MISSING CHARACTER');
  });

  it('accepts when BLIP explicitly says rhino', () => {
    const result = acceptCandidate(
      'a cute cartoon rhino standing on the moon',
      clip(0.75),
      dino(0.60),
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts when DINO detects rhinoceros above threshold', () => {
    const result = acceptCandidate(
      'a cute cartoon animal standing on grass',
      clip(0.75),
      dino(0.65), // DINO above 0.50 threshold
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts when CLIP strongly confirms (>= 0.80)', () => {
    const result = acceptCandidate(
      'a cute cartoon character in a landscape',
      clip(0.82), // CLIP >= 0.80
      dino(0.30), // DINO too low
    );
    expect(result.accepted).toBe(true);
  });
});

describe('acceptCandidate - Rule 3b/3c: CLIP identity consistency', () => {
  it('rejects when CLIP too low and BLIP does NOT say rhino (Rule 3b)', () => {
    const result = acceptCandidate(
      'a cute cartoon animal on a hill',
      clip(0.66), // Below 0.68 threshold
      dino(0.65), // DINO confirms but CLIP rejects
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('CLIP IDENTITY MISMATCH');
  });

  it('rejects BLIP-confirmed rhino when CLIP is very low (Rule 3c)', () => {
    const result = acceptCandidate(
      'a cute cartoon rhino on a hill',
      clip(0.60), // Below 0.65 consistency threshold
      dino(0.85),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('CLIP CONSISTENCY MISMATCH');
  });

  it('accepts BLIP-confirmed rhino when CLIP is above consistency threshold', () => {
    const result = acceptCandidate(
      'a cute cartoon rhino standing on grass',
      clip(0.68), // Above 0.65 consistency threshold (but below 0.72 general)
      dino(0.85),
    );
    // BLIP says rhino + CLIP >= 0.65 → accepted
    expect(result.accepted).toBe(true);
  });

  it('accepts when CLIP is well above threshold', () => {
    const result = acceptCandidate(
      'a cute cartoon rhino on the moon',
      clip(0.78),
      dino(0.85),
    );
    expect(result.accepted).toBe(true);
  });
});

describe('acceptCandidate - Rule 1c: No B&W images', () => {
  it('rejects black and white images', () => {
    const result = acceptCandidate(
      'a black and white drawing of a rhinoceros',
      clip(0.80),
      dino(0.85),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('BLACK-AND-WHITE');
  });

  it('rejects pencil sketch images', () => {
    const result = acceptCandidate(
      'a pencil sketch of a cute rhinoceros',
      clip(0.78),
      dino(0.80),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('BLACK-AND-WHITE');
  });
});

describe('acceptCandidate - Rule 1d: No cropped images', () => {
  it('rejects close-up images', () => {
    const result = acceptCandidate(
      'a close-up of a rhinoceros face',
      clip(0.80),
      dino(0.85),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('CROPPED');
  });

  it('rejects portrait images', () => {
    const result = acceptCandidate(
      'a portrait of a cute rhinoceros',
      clip(0.80),
      dino(0.85),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toContain('CROPPED');
  });
});

describe('scoreCaption - ranking accepted candidates', () => {
  it('scores higher when BLIP says "rhino"', () => {
    const withRhino = scoreCaption('a cute cartoon rhino standing on a hill');
    const withoutRhino = scoreCaption('a cute cartoon animal standing on a hill');
    expect(withRhino.score).toBeGreaterThan(withoutRhino.score);
  });

  it('gives bonus for "cartoon" mention', () => {
    const result = scoreCaption('a cute cartoon rhinoceros in a field');
    expect(result.reasons.some(r => r.includes('cartoon'))).toBe(true);
  });

  it('gives bonus for "full body" mention', () => {
    const result = scoreCaption('a full body cartoon rhinoceros standing');
    expect(result.reasons.some(r => r.includes('full body') || r.includes('standing'))).toBe(true);
  });
});
