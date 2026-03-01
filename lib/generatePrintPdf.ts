// ─────────────────────────────────────────────────
// Print-Ready PDF Generator — 8x8" Square Format
// For Gelato print-on-demand (hardcover photobook)
//
// Differences from the download PDF (A4 portrait):
//   - 8x8" square (203mm) with 3mm bleed → 209mm total
//   - 24 pages minimum (Gelato requirement)
//   - Bleed + safe zone for professional printing
//   - Activity pages to fill page count
// ─────────────────────────────────────────────────

import jsPDF from 'jspdf'

// ── Types ────────────────────────────────────────

interface StoryPage {
  text: string
  imageUrl?: string
}

interface PrintStoryInput {
  title: string
  author: string
  pages: StoryPage[]
  originalPrompt?: string
}

// ── Dimensions (in mm) ──────────────────────────

const BLEED = 3                          // 3mm bleed on each side
const TRIM = 203                         // 8" ≈ 203.2mm
const PAGE_SIZE = TRIM + BLEED * 2       // 209mm total page
const SAFE_MARGIN = 10                   // Keep text 10mm inside trim edge
const SAFE_X = BLEED + SAFE_MARGIN       // 13mm from page edge
const SAFE_Y = BLEED + SAFE_MARGIN       // 13mm from page edge
const SAFE_WIDTH = TRIM - 2 * SAFE_MARGIN  // 183mm usable width
const SAFE_HEIGHT = TRIM - 2 * SAFE_MARGIN // 183mm usable height

// ── Colors ───────────────────────────────────────

const EMERALD = [5, 150, 105] as const         // emerald-600
const EMERALD_DARK = [4, 120, 87] as const     // emerald-700
const EMERALD_LIGHT = [209, 250, 229] as const // emerald-100
const ZINC_800 = [39, 39, 42] as const
const ZINC_500 = [113, 113, 122] as const
const ZINC_300 = [212, 212, 216] as const
const ZINC_100 = [244, 244, 245] as const
const WHITE = [255, 255, 255] as const
const CREAM = [255, 253, 250] as const
const GOLD = [218, 165, 32] as const

// ── Helpers ──────────────────────────────────────

async function getImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    console.error('Failed to fetch image:', url, error)
    throw error
  }
}

function addNewPage(pdf: jsPDF) {
  pdf.addPage([PAGE_SIZE, PAGE_SIZE])
}

function drawBackground(pdf: jsPDF, color: readonly [number, number, number] = CREAM) {
  pdf.setFillColor(color[0], color[1], color[2])
  pdf.rect(0, 0, PAGE_SIZE, PAGE_SIZE, 'F')
}

function drawBorder(pdf: jsPDF) {
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.roundedRect(BLEED + 5, BLEED + 5, TRIM - 10, TRIM - 10, 2, 2, 'S')
}

function drawPageNumber(pdf: jsPDF, num: number) {
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${num}`, PAGE_SIZE / 2, PAGE_SIZE - BLEED - 8, { align: 'center' })
}

function centerX() {
  return PAGE_SIZE / 2
}

// ── Main Export ──────────────────────────────────

export async function generatePrintReadyPdf(
  story: PrintStoryInput
): Promise<Buffer> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_SIZE, PAGE_SIZE],
  })

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let pageNum = 0

  // ════════════════════════════════════════════════
  // PAGE 1: FRONT COVER
  // ════════════════════════════════════════════════
  pageNum++
  drawBackground(pdf, WHITE)

  // Emerald header band (bleeds to edge)
  pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.rect(0, 0, PAGE_SIZE, 60, 'F')

  // Title
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(28)
  pdf.setFont('helvetica', 'bold')
  const titleLines = pdf.splitTextToSize(story.title, SAFE_WIDTH - 20)
  let titleY = 30
  titleLines.forEach((line: string, i: number) => {
    pdf.text(line, centerX(), titleY + i * 12, { align: 'center' })
  })

  // Cover image (if available — use first page image)
  const coverImageUrl = story.pages[0]?.imageUrl
  if (coverImageUrl) {
    try {
      const img = await getImageAsBase64(coverImageUrl)
      const imgSize = 120
      const imgX = (PAGE_SIZE - imgSize) / 2
      const imgY = 70
      pdf.addImage(img, 'PNG', imgX, imgY, imgSize, imgSize, undefined, 'FAST')
      // Subtle border
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.roundedRect(imgX, imgY, imgSize, imgSize, 3, 3, 'S')
    } catch {
      // Placeholder box
      pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
      pdf.roundedRect(44.5, 70, 120, 120, 3, 3, 'F')
    }
  }

  // Author
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`by ${story.author || 'Young Author'}`, centerX(), PAGE_SIZE - BLEED - 20, { align: 'center' })

  // Small branding
  pdf.setFontSize(8)
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text("Benny's Story Time", centerX(), PAGE_SIZE - BLEED - 10, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 2: INNER TITLE PAGE
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  // Decorative rule
  pdf.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setLineWidth(1)
  pdf.line(SAFE_X + 30, 70, PAGE_SIZE - SAFE_X - 30, 70)

  // Title
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(24)
  pdf.setFont('helvetica', 'bold')
  const innerTitleLines = pdf.splitTextToSize(story.title, SAFE_WIDTH - 20)
  innerTitleLines.forEach((line: string, i: number) => {
    pdf.text(line, centerX(), 90 + i * 11, { align: 'center' })
  })

  // Decorative rule
  pdf.line(SAFE_X + 30, 90 + innerTitleLines.length * 11 + 5, PAGE_SIZE - SAFE_X - 30, 90 + innerTitleLines.length * 11 + 5)

  // Subtitle
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('A Magical Story', centerX(), 90 + innerTitleLines.length * 11 + 18, { align: 'center' })

  // Author
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.text(`Written by: ${story.author || 'Young Author'}`, centerX(), 145, { align: 'center' })

  // Date
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(today, centerX(), 160, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 3: DEDICATION / ABOUT PAGE
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('About This Book', centerX(), SAFE_Y + 20, { align: 'center' })

  // Decorative line
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  pdf.line(SAFE_X + 40, SAFE_Y + 27, PAGE_SIZE - SAFE_X - 40, SAFE_Y + 27)

  // Disclaimer text
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')

  const disclaimerLines = [
    `"${story.title}" by ${story.author || 'Young Author'}`,
    `Created on ${today}`,
    '',
    'This is a work of fiction generated with the assistance',
    'of artificial intelligence. All characters, names, places,',
    'events, and storylines are entirely fictional.',
    '',
    'Any resemblance to actual persons, living or deceased,',
    'or real locations is purely coincidental.',
    '',
    'All illustrations were generated using AI technology.',
    '',
    "Created with Benny's Story Time",
  ]

  disclaimerLines.forEach((line, i) => {
    if (line === `"${story.title}" by ${story.author || 'Young Author'}`) {
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    } else if (line === "Created with Benny's Story Time") {
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
    } else {
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
    }
    pdf.text(line, centerX(), SAFE_Y + 40 + i * 6, { align: 'center' })
  })

  // ════════════════════════════════════════════════
  // PAGES 4-13: STORY PAGES (10 pages)
  // ════════════════════════════════════════════════
  for (let i = 0; i < story.pages.length; i++) {
    addNewPage(pdf)
    pageNum++
    drawBackground(pdf, WHITE)
    drawBorder(pdf)
    drawPageNumber(pdf, i + 1)

    const page = story.pages[i]

    // Image area (top ~55% of safe area)
    // Kontext generates 1:1 square images. Use a consistent square size for
    // both actual images and placeholders to avoid layout inconsistency.
    const imgMaxHeight = SAFE_HEIGHT * 0.55
    const imgSize = Math.min(imgMaxHeight, SAFE_WIDTH) // Square, constrained by height
    const imgX = SAFE_X + (SAFE_WIDTH - imgSize) / 2 // Center horizontally
    const imgY = SAFE_Y + 5

    if (page.imageUrl) {
      try {
        const imgBase64 = await getImageAsBase64(page.imageUrl)
        pdf.addImage(imgBase64, 'PNG', imgX, imgY, imgSize, imgSize, undefined, 'FAST')
        // Border
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'S')
      } catch {
        // Placeholder — same size as real images
        pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
        pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'F')
        pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'italic')
        pdf.text('[Illustration]', centerX(), imgY + imgSize / 2, { align: 'center' })
      }
    } else {
      // Placeholder when no image — same size as real images
      pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
      pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'F')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'italic')
      pdf.text('[Illustration]', centerX(), imgY + imgSize / 2, { align: 'center' })
    }

    // Text area (bottom ~40%)
    const textY = imgY + imgSize + 8
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'normal')

    const textLines = pdf.splitTextToSize(page.text, SAFE_WIDTH - 10)
    let currentY = textY
    textLines.forEach((line: string) => {
      if (currentY < PAGE_SIZE - BLEED - 15) {
        pdf.text(line, SAFE_X + 5, currentY)
        currentY += 6
      }
    })
  }

  // ════════════════════════════════════════════════
  // PAGE 14: ORIGINAL STORY IDEA
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('The Original Story Idea', centerX(), SAFE_Y + 25, { align: 'center' })

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`As told by ${story.author || 'Young Author'}`, centerX(), SAFE_Y + 37, { align: 'center' })

  // Decorative line
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  pdf.line(SAFE_X + 30, SAFE_Y + 43, PAGE_SIZE - SAFE_X - 30, SAFE_Y + 43)

  // Quote box
  pdf.setFillColor(EMERALD_LIGHT[0], EMERALD_LIGHT[1], EMERALD_LIGHT[2])
  pdf.roundedRect(SAFE_X + 10, SAFE_Y + 50, SAFE_WIDTH - 20, 80, 4, 4, 'F')

  // Opening quote
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setFontSize(36)
  pdf.setFont('helvetica', 'bold')
  pdf.text('\u201C', SAFE_X + 18, SAFE_Y + 70)

  // Prompt text
  const prompt = story.originalPrompt || 'A wonderful story about adventure and friendship!'
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  const promptLines = pdf.splitTextToSize(prompt, SAFE_WIDTH - 50)
  let promptY = SAFE_Y + 68
  promptLines.forEach((line: string) => {
    if (promptY < SAFE_Y + 125) {
      pdf.text(line, SAFE_X + 28, promptY)
      promptY += 7
    }
  })

  // Closing quote
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setFontSize(36)
  pdf.setFont('helvetica', 'bold')
  pdf.text('\u201D', PAGE_SIZE - SAFE_X - 25, promptY + 5)

  // Footer
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('This magical story grew from this wonderful idea!', centerX(), SAFE_Y + SAFE_HEIGHT - 15, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGES 15-16: GAME / ACTIVITY PAGES
  // ════════════════════════════════════════════════

  // Page 15: Word Search Activity
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Word Search', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Find these words from the story!', centerX(), SAFE_Y + 33, { align: 'center' })

  // Extract words from story text for word search
  const allText = story.pages.map(p => p.text).join(' ')
  const words = allText
    .split(/\s+/)
    .filter(w => w.length >= 4 && w.length <= 8)
    .map(w => w.replace(/[^a-zA-Z]/g, '').toUpperCase())
    .filter(w => w.length >= 4)
  const uniqueWords = [...new Set(words)].slice(0, 8)

  // Draw word list
  const wordsPerRow = 4
  uniqueWords.forEach((word, i) => {
    const col = i % wordsPerRow
    const row = Math.floor(i / wordsPerRow)
    const x = SAFE_X + 10 + col * 45
    const y = SAFE_Y + 45 + row * 10
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.text(word, x, y)
  })

  // Draw grid
  const gridSize = 10
  const cellSize = 12
  const gridStartX = (PAGE_SIZE - gridSize * cellSize) / 2
  const gridStartY = SAFE_Y + 70
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.3)

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = gridStartX + col * cellSize
      const y = gridStartY + row * cellSize
      pdf.rect(x, y, cellSize, cellSize, 'S')

      // Fill with random letters (simplified — not a real solvable word search)
      const letter = letters[Math.floor(Math.random() * 26)]
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.text(letter, x + cellSize / 2, y + cellSize / 2 + 3, { align: 'center' })
    }
  }

  // Page 16: Story Questions
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Story Questions', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Think about the story and answer these questions!', centerX(), SAFE_Y + 33, { align: 'center' })

  const questions = [
    'Who is the main character in this story?',
    'Where does the story take place?',
    'What was your favorite part of the story?',
    'How did the story make you feel?',
    'What would you do differently if you were in the story?',
  ]

  let qY = SAFE_Y + 48
  questions.forEach((q, i) => {
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.text(`${i + 1}. ${q}`, SAFE_X + 5, qY)
    qY += 7

    // Lines for writing
    for (let l = 0; l < 2; l++) {
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.3)
      pdf.line(SAFE_X + 10, qY + l * 8, PAGE_SIZE - SAFE_X - 10, qY + l * 8)
    }
    qY += 22
  })

  // ════════════════════════════════════════════════
  // PAGE 17: DRAW YOUR OWN
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Draw Your Own Scene!', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Draw your favorite scene from the story below:', centerX(), SAFE_Y + 33, { align: 'center' })

  // Large drawing box
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.setLineDashPattern([3, 3], 0)
  pdf.roundedRect(SAFE_X + 5, SAFE_Y + 40, SAFE_WIDTH - 10, SAFE_HEIGHT - 55, 4, 4, 'S')
  pdf.setLineDashPattern([], 0) // Reset dash

  // ════════════════════════════════════════════════
  // PAGE 18: ABOUT THE AUTHOR
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('About the Author', centerX(), SAFE_Y + 22, { align: 'center' })

  // Photo frame placeholder
  const frameSize = 60
  const frameX = (PAGE_SIZE - frameSize) / 2
  const frameY = SAFE_Y + 35
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(1)
  pdf.roundedRect(frameX, frameY, frameSize, frameSize, 3, 3, 'S')
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Paste your photo here!', centerX(), frameY + frameSize / 2 + 3, { align: 'center' })

  // Author name
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text(story.author || 'Young Author', centerX(), frameY + frameSize + 15, { align: 'center' })

  // Writing lines
  const bioStartY = frameY + frameSize + 28
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write something about yourself:', SAFE_X + 10, bioStartY)

  for (let l = 0; l < 5; l++) {
    const lineY = bioStartY + 10 + l * 10
    pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
    pdf.setLineWidth(0.3)
    pdf.line(SAFE_X + 10, lineY, PAGE_SIZE - SAFE_X - 10, lineY)
  }

  // ════════════════════════════════════════════════
  // PAGE 19: STORY MAP
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Story Map', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Draw a map of where the adventure takes place!', centerX(), SAFE_Y + 33, { align: 'center' })

  // Large drawing area with compass rose hint
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.setLineDashPattern([3, 3], 0)
  pdf.roundedRect(SAFE_X + 5, SAFE_Y + 40, SAFE_WIDTH - 10, SAFE_HEIGHT - 55, 4, 4, 'S')
  pdf.setLineDashPattern([], 0)

  // Small compass hint in corner
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.text('N', PAGE_SIZE - SAFE_X - 15, SAFE_Y + 50, { align: 'center' })
  pdf.text('S', PAGE_SIZE - SAFE_X - 15, SAFE_Y + 70, { align: 'center' })
  pdf.text('W', PAGE_SIZE - SAFE_X - 25, SAFE_Y + 60, { align: 'center' })
  pdf.text('E', PAGE_SIZE - SAFE_X - 5, SAFE_Y + 60, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 20: MY FAVORITE WORDS
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('My Favorite Words', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write down your favorite words from the story!', centerX(), SAFE_Y + 33, { align: 'center' })

  // Word boxes (2 columns, 6 rows)
  const boxWidth = (SAFE_WIDTH - 30) / 2
  const boxHeight = 18
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 2; col++) {
      const bx = SAFE_X + 10 + col * (boxWidth + 10)
      const by = SAFE_Y + 45 + row * (boxHeight + 8)
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.roundedRect(bx, by, boxWidth, boxHeight, 3, 3, 'S')

      // Small "Word" label
      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.text(`Word ${row * 2 + col + 1}`, bx + 4, by + 5)
    }
  }

  // ════════════════════════════════════════════════
  // PAGE 21: CERTIFICATE OF AUTHORSHIP
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)

  // Decorative double border
  pdf.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setLineWidth(2)
  pdf.roundedRect(BLEED + 8, BLEED + 8, TRIM - 16, TRIM - 16, 3, 3, 'S')
  pdf.setLineWidth(0.5)
  pdf.roundedRect(BLEED + 12, BLEED + 12, TRIM - 24, TRIM - 24, 2, 2, 'S')

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CERTIFICATE', centerX(), SAFE_Y + 30, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('of Authorship', centerX(), SAFE_Y + 40, { align: 'center' })

  // Decorative rule
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(1)
  pdf.line(SAFE_X + 30, SAFE_Y + 48, PAGE_SIZE - SAFE_X - 30, SAFE_Y + 48)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text('This certifies that', centerX(), SAFE_Y + 65, { align: 'center' })

  // Author name (big)
  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.text(story.author || 'Young Author', centerX(), SAFE_Y + 85, { align: 'center' })

  // Underline
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  const authorWidth = pdf.getTextWidth(story.author || 'Young Author')
  pdf.line(centerX() - authorWidth / 2 - 5, SAFE_Y + 88, centerX() + authorWidth / 2 + 5, SAFE_Y + 88)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text('is the official author of', centerX(), SAFE_Y + 100, { align: 'center' })

  // Story title
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  const certTitleLines = pdf.splitTextToSize(`"${story.title}"`, SAFE_WIDTH - 40)
  certTitleLines.forEach((line: string, i: number) => {
    pdf.text(line, centerX(), SAFE_Y + 115 + i * 8, { align: 'center' })
  })

  // Date
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`Awarded on ${today}`, centerX(), SAFE_Y + SAFE_HEIGHT - 30, { align: 'center' })

  // Signature line
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.3)
  pdf.line(SAFE_X + 50, SAFE_Y + SAFE_HEIGHT - 15, PAGE_SIZE - SAFE_X - 50, SAFE_Y + SAFE_HEIGHT - 15)
  pdf.setFontSize(8)
  pdf.text('Signature', centerX(), SAFE_Y + SAFE_HEIGHT - 10, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 22: MORE ADVENTURES AWAIT
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, CREAM)
  drawBorder(pdf)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('More Adventures Await!', centerX(), SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write your next story idea here:', centerX(), SAFE_Y + 35, { align: 'center' })

  // Writing lines
  for (let l = 0; l < 10; l++) {
    const lineY = SAFE_Y + 50 + l * 14
    pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
    pdf.setLineWidth(0.3)
    pdf.line(SAFE_X + 10, lineY, PAGE_SIZE - SAFE_X - 10, lineY)
  }

  // Fun prompt at bottom
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.text('Tip: Think about a place, a character, and an adventure!', centerX(), SAFE_Y + SAFE_HEIGHT - 10, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 23: THE END
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  drawBackground(pdf, WHITE)

  // Emerald background band
  pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.rect(0, PAGE_SIZE / 2 - 40, PAGE_SIZE, 80, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(32)
  pdf.setFont('helvetica', 'bold')
  pdf.text('The End', centerX(), PAGE_SIZE / 2 - 10, { align: 'center' })

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'italic')
  pdf.text('Thank you for reading!', centerX(), PAGE_SIZE / 2 + 10, { align: 'center' })

  pdf.setFontSize(11)
  pdf.text('May your stories always bring joy', centerX(), PAGE_SIZE / 2 + 25, { align: 'center' })

  // Author credit below band
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Story by: ${story.author || 'Young Author'}`, centerX(), PAGE_SIZE / 2 + 55, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`Created: ${today}`, centerX(), PAGE_SIZE / 2 + 65, { align: 'center' })

  // ════════════════════════════════════════════════
  // PAGE 24: BACK COVER
  // ════════════════════════════════════════════════
  addNewPage(pdf)
  pageNum++
  // Solid dark back cover
  pdf.setFillColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.rect(0, 0, PAGE_SIZE, PAGE_SIZE, 'F')

  // Branding
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text("Benny's Story Time", centerX(), PAGE_SIZE / 2 - 10, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200, 200, 200)
  pdf.text('Where imagination comes to life', centerX(), PAGE_SIZE / 2 + 5, { align: 'center' })

  // Disclaimer
  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  pdf.text('This is a work of fiction. All characters and illustrations are AI-generated.', centerX(), PAGE_SIZE - BLEED - 15, { align: 'center' })
  pdf.text('Any resemblance to real persons or events is purely coincidental.', centerX(), PAGE_SIZE - BLEED - 10, { align: 'center' })

  // ── Generate buffer ────────────────────────────
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}
