// ─────────────────────────────────────────────────
// Print-Ready PDF Generator — Square Format
// Supports multiple print providers (Gelato, Lulu)
//
// Gelato: 8×8" (203mm), 3mm bleed, 24 pages, single combined PDF
// Lulu:   8.5×8.5" (215.9mm), 0.125" (3.175mm) bleed, 32 min pages,
//         SEPARATE cover + interior PDFs
// ─────────────────────────────────────────────────

import jsPDF from 'jspdf'
import { calculateSpineWidth } from '@/lib/lulu'
import { loadFontForLanguage, isRtlLanguage, preprocessTextForPdf } from '@/lib/fontLoader'

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
  language?: string  // ISO 639-1 code (default: 'en')
}

// ── Print Spec Interface ─────────────────────────

export interface PrintSpec {
  name: string
  trimMm: number          // Trim size in mm (one side of square)
  bleedMm: number         // Bleed in mm
  safeMarginMm: number    // Safe margin inside trim edge
  minPages: number        // Minimum page count for printer
  separateCover: boolean  // Whether cover is a separate PDF (Lulu) vs inline (Gelato)
}

export const GELATO_SPEC: PrintSpec = {
  name: 'gelato',
  trimMm: 203,            // 8" ≈ 203.2mm
  bleedMm: 3,             // 3mm bleed
  safeMarginMm: 10,
  minPages: 24,
  separateCover: false,
}

export const LULU_SPEC: PrintSpec = {
  name: 'lulu',
  trimMm: 215.9,          // 8.5" = 215.9mm
  bleedMm: 3.175,         // 0.125" = 3.175mm
  safeMarginMm: 10,
  minPages: 32,
  separateCover: true,
}

// ── Derived Dimensions ───────────────────────────

interface Dims {
  BLEED: number
  TRIM: number
  PAGE_SIZE: number
  SAFE_MARGIN: number
  SAFE_X: number
  SAFE_Y: number
  SAFE_WIDTH: number
  SAFE_HEIGHT: number
}

function specDimensions(spec: PrintSpec): Dims {
  const BLEED = spec.bleedMm
  const TRIM = spec.trimMm
  const PAGE_SIZE = TRIM + BLEED * 2
  const SAFE_MARGIN = spec.safeMarginMm
  const SAFE_X = BLEED + SAFE_MARGIN
  const SAFE_Y = BLEED + SAFE_MARGIN
  const SAFE_WIDTH = TRIM - 2 * SAFE_MARGIN
  const SAFE_HEIGHT = TRIM - 2 * SAFE_MARGIN
  return { BLEED, TRIM, PAGE_SIZE, SAFE_MARGIN, SAFE_X, SAFE_Y, SAFE_WIDTH, SAFE_HEIGHT }
}

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

function addNewPage(pdf: jsPDF, d: Dims) {
  pdf.addPage([d.PAGE_SIZE, d.PAGE_SIZE])
}

function drawBackground(pdf: jsPDF, d: Dims, color: readonly [number, number, number] = CREAM) {
  pdf.setFillColor(color[0], color[1], color[2])
  pdf.rect(0, 0, d.PAGE_SIZE, d.PAGE_SIZE, 'F')
}

function drawBorder(pdf: jsPDF, d: Dims) {
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.roundedRect(d.BLEED + 5, d.BLEED + 5, d.TRIM - 10, d.TRIM - 10, 2, 2, 'S')
}

function drawPageNumber(pdf: jsPDF, d: Dims, num: number) {
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${num}`, d.PAGE_SIZE / 2, d.PAGE_SIZE - d.BLEED - 8, { align: 'center' })
}

function centerX(d: Dims) {
  return d.PAGE_SIZE / 2
}

// ── Main Export ──────────────────────────────────

/**
 * Generate a print-ready interior PDF.
 *
 * @param spec - Print spec (GELATO_SPEC or LULU_SPEC). Defaults to GELATO_SPEC.
 *
 * When spec.separateCover is true (Lulu), the front cover and back cover pages
 * are OMITTED from this PDF — they go in a separate cover PDF via generateLuluCoverPdf().
 *
 * When spec.minPages exceeds the base page count, extra activity pages are added
 * to meet the printer's minimum.
 */
export async function generatePrintReadyPdf(
  story: PrintStoryInput,
  storyMode: string = 'imagination',
  spec: PrintSpec = GELATO_SPEC
): Promise<Buffer> {
  const d = specDimensions(spec)

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [d.PAGE_SIZE, d.PAGE_SIZE],
  })

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // ── Load Unicode font for non-Latin story text ──
  const language = story.language || 'en'
  const storyFontName = await loadFontForLanguage(pdf, language)
  const rtl = isRtlLanguage(language)

  let pageNum = 0
  let isFirstPage = true // Track if we need addPage (jsPDF starts with page 1)

  // Helper to start a new page (handles first-page edge case)
  function nextPage() {
    if (isFirstPage) {
      isFirstPage = false
    } else {
      addNewPage(pdf, d)
    }
    pageNum++
  }

  // ════════════════════════════════════════════════
  // PAGE: FRONT COVER (skip for Lulu — goes in separate cover PDF)
  // ════════════════════════════════════════════════
  if (!spec.separateCover) {
    nextPage()
    drawBackground(pdf, d, WHITE)

    // Emerald header band (bleeds to edge)
    pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
    pdf.rect(0, 0, d.PAGE_SIZE, 60, 'F')

    // Title (uses story font for multilingual support)
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(28)
    pdf.setFont(storyFontName, 'normal')
    const processedCoverTitle = preprocessTextForPdf(story.title, language)
    const titleLines = pdf.splitTextToSize(processedCoverTitle, d.SAFE_WIDTH - 20)
    let titleY = 30
    titleLines.forEach((line: string, i: number) => {
      pdf.text(line, centerX(d), titleY + i * 12, { align: 'center' })
    })

    // Cover image (if available — use first page image)
    const coverImageUrl = story.pages[0]?.imageUrl
    if (coverImageUrl) {
      try {
        const img = await getImageAsBase64(coverImageUrl)
        const imgSize = 120
        const imgX = (d.PAGE_SIZE - imgSize) / 2
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
    pdf.text(`by ${story.author || 'Young Author'}`, centerX(d), d.PAGE_SIZE - d.BLEED - 20, { align: 'center' })

    // Small branding
    pdf.setFontSize(8)
    pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
    pdf.text("My Story Bear", centerX(d), d.PAGE_SIZE - d.BLEED - 10, { align: 'center' })
  }

  // ════════════════════════════════════════════════
  // INNER TITLE PAGE
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  // Decorative rule
  pdf.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setLineWidth(1)
  pdf.line(d.SAFE_X + 30, 70, d.PAGE_SIZE - d.SAFE_X - 30, 70)

  // Title (uses story font for multilingual support)
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(24)
  pdf.setFont(storyFontName, 'normal')
  const processedInnerTitle = preprocessTextForPdf(story.title, language)
  const innerTitleLines = pdf.splitTextToSize(processedInnerTitle, d.SAFE_WIDTH - 20)
  innerTitleLines.forEach((line: string, i: number) => {
    pdf.text(line, centerX(d), 90 + i * 11, { align: 'center' })
  })

  // Decorative rule
  pdf.line(d.SAFE_X + 30, 90 + innerTitleLines.length * 11 + 5, d.PAGE_SIZE - d.SAFE_X - 30, 90 + innerTitleLines.length * 11 + 5)

  // Subtitle
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(storyMode === 'history' ? 'A Historical Story' : 'A Magical Story', centerX(d), 90 + innerTitleLines.length * 11 + 18, { align: 'center' })

  // Author
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.text(`Written by: ${story.author || 'Young Author'}`, centerX(d), 145, { align: 'center' })

  // Date
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(today, centerX(d), 160, { align: 'center' })

  // ════════════════════════════════════════════════
  // DEDICATION / ABOUT PAGE
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.text('About This Book', centerX(d), d.SAFE_Y + 20, { align: 'center' })

  // Decorative line
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  pdf.line(d.SAFE_X + 40, d.SAFE_Y + 27, d.PAGE_SIZE - d.SAFE_X - 40, d.SAFE_Y + 27)

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
    "Created with My Story Bear",
  ]

  disclaimerLines.forEach((line, i) => {
    if (line === `"${story.title}" by ${story.author || 'Young Author'}`) {
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    } else if (line === "Created with My Story Bear") {
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
    } else {
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
    }
    pdf.text(line, centerX(d), d.SAFE_Y + 40 + i * 6, { align: 'center' })
  })

  // ════════════════════════════════════════════════
  // STORY PAGES (10 pages)
  // ════════════════════════════════════════════════
  for (let i = 0; i < story.pages.length; i++) {
    nextPage()
    drawBackground(pdf, d, WHITE)
    drawBorder(pdf, d)
    drawPageNumber(pdf, d, i + 1)

    const page = story.pages[i]

    // Image area (top ~55% of safe area)
    const imgMaxHeight = d.SAFE_HEIGHT * 0.55
    const imgSize = Math.min(imgMaxHeight, d.SAFE_WIDTH)
    const imgX = d.SAFE_X + (d.SAFE_WIDTH - imgSize) / 2
    const imgY = d.SAFE_Y + 5

    if (page.imageUrl) {
      try {
        const imgBase64 = await getImageAsBase64(page.imageUrl)
        pdf.addImage(imgBase64, 'PNG', imgX, imgY, imgSize, imgSize, undefined, 'FAST')
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'S')
      } catch {
        pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
        pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'F')
        pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'italic')
        pdf.text('[Illustration]', centerX(d), imgY + imgSize / 2, { align: 'center' })
      }
    } else {
      pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
      pdf.roundedRect(imgX, imgY, imgSize, imgSize, 2, 2, 'F')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'italic')
      pdf.text('[Illustration]', centerX(d), imgY + imgSize / 2, { align: 'center' })
    }

    // Text area (bottom ~40%) — uses story font for multilingual support
    const textY = imgY + imgSize + 8
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.setFontSize(12)
    pdf.setFont(storyFontName, 'normal')

    const processedPageText = preprocessTextForPdf(page.text, language)
    const textLines = pdf.splitTextToSize(processedPageText, d.SAFE_WIDTH - 10)
    let currentY = textY
    textLines.forEach((line: string) => {
      if (currentY < d.PAGE_SIZE - d.BLEED - 15) {
        if (rtl) {
          pdf.text(line, d.PAGE_SIZE - d.SAFE_X - 5, currentY, { align: 'right' })
        } else {
          pdf.text(line, d.SAFE_X + 5, currentY)
        }
        currentY += 6
      }
    })
  }

  // ════════════════════════════════════════════════
  // ORIGINAL STORY IDEA
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('The Original Story Idea', centerX(d), d.SAFE_Y + 25, { align: 'center' })

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`As told by ${story.author || 'Young Author'}`, centerX(d), d.SAFE_Y + 37, { align: 'center' })

  // Decorative line
  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  pdf.line(d.SAFE_X + 30, d.SAFE_Y + 43, d.PAGE_SIZE - d.SAFE_X - 30, d.SAFE_Y + 43)

  // Quote box
  pdf.setFillColor(EMERALD_LIGHT[0], EMERALD_LIGHT[1], EMERALD_LIGHT[2])
  pdf.roundedRect(d.SAFE_X + 10, d.SAFE_Y + 50, d.SAFE_WIDTH - 20, 80, 4, 4, 'F')

  // Opening quote
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setFontSize(36)
  pdf.setFont('helvetica', 'bold')
  pdf.text('\u201C', d.SAFE_X + 18, d.SAFE_Y + 70)

  // Prompt text (uses story font for multilingual support)
  const prompt = story.originalPrompt || 'A wonderful story about adventure and friendship!'
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(11)
  pdf.setFont(storyFontName, 'normal')
  const processedPrompt = preprocessTextForPdf(prompt, language)
  const promptLines = pdf.splitTextToSize(processedPrompt, d.SAFE_WIDTH - 50)
  let promptY = d.SAFE_Y + 68
  promptLines.forEach((line: string) => {
    if (promptY < d.SAFE_Y + 125) {
      if (rtl) {
        pdf.text(line, d.PAGE_SIZE - d.SAFE_X - 28, promptY, { align: 'right' })
      } else {
        pdf.text(line, d.SAFE_X + 28, promptY)
      }
      promptY += 7
    }
  })

  // Closing quote
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setFontSize(36)
  pdf.setFont('helvetica', 'bold')
  pdf.text('\u201D', d.PAGE_SIZE - d.SAFE_X - 25, promptY + 5)

  // Footer
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('This magical story grew from this wonderful idea!', centerX(d), d.SAFE_Y + d.SAFE_HEIGHT - 15, { align: 'center' })

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — Word Search
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Word Search', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Find these words from the story!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

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
    const x = d.SAFE_X + 10 + col * 45
    const y = d.SAFE_Y + 45 + row * 10
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.text(word, x, y)
  })

  // Draw grid
  const gridSize = 10
  const cellSize = 12
  const gridStartX = (d.PAGE_SIZE - gridSize * cellSize) / 2
  const gridStartY = d.SAFE_Y + 70
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.3)

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = gridStartX + col * cellSize
      const y = gridStartY + row * cellSize
      pdf.rect(x, y, cellSize, cellSize, 'S')

      const letter = letters[Math.floor(Math.random() * 26)]
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.text(letter, x + cellSize / 2, y + cellSize / 2 + 3, { align: 'center' })
    }
  }

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — Story Questions
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Story Questions', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Think about the story and answer these questions!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

  const questions = [
    'Who is the main character in this story?',
    'Where does the story take place?',
    'What was your favorite part of the story?',
    'How did the story make you feel?',
    'What would you do differently if you were in the story?',
  ]

  let qY = d.SAFE_Y + 48
  questions.forEach((q, i) => {
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.text(`${i + 1}. ${q}`, d.SAFE_X + 5, qY)
    qY += 7

    for (let l = 0; l < 2; l++) {
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.3)
      pdf.line(d.SAFE_X + 10, qY + l * 8, d.PAGE_SIZE - d.SAFE_X - 10, qY + l * 8)
    }
    qY += 22
  })

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — Draw Your Own
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Draw Your Own Scene!', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Draw your favorite scene from the story below:', centerX(d), d.SAFE_Y + 33, { align: 'center' })

  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.setLineDashPattern([3, 3], 0)
  pdf.roundedRect(d.SAFE_X + 5, d.SAFE_Y + 40, d.SAFE_WIDTH - 10, d.SAFE_HEIGHT - 55, 4, 4, 'S')
  pdf.setLineDashPattern([], 0)

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — About the Author
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('About the Author', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  const frameSize = 60
  const frameX = (d.PAGE_SIZE - frameSize) / 2
  const frameY = d.SAFE_Y + 35
  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(1)
  pdf.roundedRect(frameX, frameY, frameSize, frameSize, 3, 3, 'S')
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Paste your photo here!', centerX(d), frameY + frameSize / 2 + 3, { align: 'center' })

  pdf.setFontSize(16)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text(story.author || 'Young Author', centerX(d), frameY + frameSize + 15, { align: 'center' })

  const bioStartY = frameY + frameSize + 28
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write something about yourself:', d.SAFE_X + 10, bioStartY)

  for (let l = 0; l < 5; l++) {
    const lineY = bioStartY + 10 + l * 10
    pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
    pdf.setLineWidth(0.3)
    pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
  }

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — Story Map
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Story Map', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Draw a map of where the adventure takes place!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.5)
  pdf.setLineDashPattern([3, 3], 0)
  pdf.roundedRect(d.SAFE_X + 5, d.SAFE_Y + 40, d.SAFE_WIDTH - 10, d.SAFE_HEIGHT - 55, 4, 4, 'S')
  pdf.setLineDashPattern([], 0)

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.text('N', d.PAGE_SIZE - d.SAFE_X - 15, d.SAFE_Y + 50, { align: 'center' })
  pdf.text('S', d.PAGE_SIZE - d.SAFE_X - 15, d.SAFE_Y + 70, { align: 'center' })
  pdf.text('W', d.PAGE_SIZE - d.SAFE_X - 25, d.SAFE_Y + 60, { align: 'center' })
  pdf.text('E', d.PAGE_SIZE - d.SAFE_X - 5, d.SAFE_Y + 60, { align: 'center' })

  // ════════════════════════════════════════════════
  // ACTIVITY PAGES — My Favorite Words
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('My Favorite Words', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write down your favorite words from the story!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

  const boxWidth = (d.SAFE_WIDTH - 30) / 2
  const boxHeight = 18
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 2; col++) {
      const bx = d.SAFE_X + 10 + col * (boxWidth + 10)
      const by = d.SAFE_Y + 45 + row * (boxHeight + 8)
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.roundedRect(bx, by, boxWidth, boxHeight, 3, 3, 'S')

      pdf.setFontSize(7)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.text(`Word ${row * 2 + col + 1}`, bx + 4, by + 5)
    }
  }

  // ════════════════════════════════════════════════
  // CERTIFICATE OF AUTHORSHIP
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)

  pdf.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.setLineWidth(2)
  pdf.roundedRect(d.BLEED + 8, d.BLEED + 8, d.TRIM - 16, d.TRIM - 16, 3, 3, 'S')
  pdf.setLineWidth(0.5)
  pdf.roundedRect(d.BLEED + 12, d.BLEED + 12, d.TRIM - 24, d.TRIM - 24, 2, 2, 'S')

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text('CERTIFICATE', centerX(d), d.SAFE_Y + 30, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('of Authorship', centerX(d), d.SAFE_Y + 40, { align: 'center' })

  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(1)
  pdf.line(d.SAFE_X + 30, d.SAFE_Y + 48, d.PAGE_SIZE - d.SAFE_X - 30, d.SAFE_Y + 48)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text('This certifies that', centerX(d), d.SAFE_Y + 65, { align: 'center' })

  pdf.setFontSize(22)
  pdf.setFont('helvetica', 'bold')
  pdf.text(story.author || 'Young Author', centerX(d), d.SAFE_Y + 85, { align: 'center' })

  pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2])
  pdf.setLineWidth(0.5)
  const authorWidth = pdf.getTextWidth(story.author || 'Young Author')
  pdf.line(centerX(d) - authorWidth / 2 - 5, d.SAFE_Y + 88, centerX(d) + authorWidth / 2 + 5, d.SAFE_Y + 88)

  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.text('is the official author of', centerX(d), d.SAFE_Y + 100, { align: 'center' })

  pdf.setFontSize(14)
  pdf.setFont(storyFontName, 'normal')
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  const processedCertTitle = preprocessTextForPdf(`\u201C${story.title}\u201D`, language)
  const certTitleLines = pdf.splitTextToSize(processedCertTitle, d.SAFE_WIDTH - 40)
  certTitleLines.forEach((line: string, i: number) => {
    pdf.text(line, centerX(d), d.SAFE_Y + 115 + i * 8, { align: 'center' })
  })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`Awarded on ${today}`, centerX(d), d.SAFE_Y + d.SAFE_HEIGHT - 30, { align: 'center' })

  pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
  pdf.setLineWidth(0.3)
  pdf.line(d.SAFE_X + 50, d.SAFE_Y + d.SAFE_HEIGHT - 15, d.PAGE_SIZE - d.SAFE_X - 50, d.SAFE_Y + d.SAFE_HEIGHT - 15)
  pdf.setFontSize(8)
  pdf.text('Signature', centerX(d), d.SAFE_Y + d.SAFE_HEIGHT - 10, { align: 'center' })

  // ════════════════════════════════════════════════
  // MORE ADVENTURES AWAIT
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, CREAM)
  drawBorder(pdf, d)

  pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('More Adventures Await!', centerX(d), d.SAFE_Y + 22, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text('Write your next story idea here:', centerX(d), d.SAFE_Y + 35, { align: 'center' })

  for (let l = 0; l < 10; l++) {
    const lineY = d.SAFE_Y + 50 + l * 14
    pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
    pdf.setLineWidth(0.3)
    pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
  }

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.text('Tip: Think about a place, a character, and an adventure!', centerX(d), d.SAFE_Y + d.SAFE_HEIGHT - 10, { align: 'center' })

  // ════════════════════════════════════════════════
  // EXTRA ACTIVITY PAGES (for Lulu — 32 page minimum)
  // Only added when current page count < spec.minPages
  // (accounting for cover pages being separate or not)
  // ════════════════════════════════════════════════
  const pagesNeededForEnd = spec.separateCover ? 1 : 2 // "The End" + optional back cover
  const currentContentPages = pageNum
  const totalPagesNeeded = spec.minPages - pagesNeededForEnd
  const extraPagesNeeded = Math.max(0, totalPagesNeeded - currentContentPages)

  if (extraPagesNeeded > 0) {
    // Extra Activity 1: Write a Sequel
    if (extraPagesNeeded >= 1) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Write a Sequel!', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('What happens next in the story? Write it here!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      for (let l = 0; l < 12; l++) {
        const lineY = d.SAFE_Y + 48 + l * 13
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
      }
    }

    // Extra Activity 2: Character Profile
    if (extraPagesNeeded >= 2) {
      nextPage()
      drawBackground(pdf, d, CREAM)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Character Profile', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Draw and describe your favorite character!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Drawing box for character
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.setLineDashPattern([3, 3], 0)
      const charBoxSize = 70
      pdf.roundedRect((d.PAGE_SIZE - charBoxSize) / 2, d.SAFE_Y + 40, charBoxSize, charBoxSize, 3, 3, 'S')
      pdf.setLineDashPattern([], 0)

      // Profile fields
      const fields = ['Name:', 'Age:', 'Special powers:', 'Likes:', 'Dislikes:', 'Best friend:']
      let fieldY = d.SAFE_Y + 40 + charBoxSize + 10
      fields.forEach(field => {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
        pdf.text(field, d.SAFE_X + 10, fieldY)
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(d.SAFE_X + 45, fieldY, d.PAGE_SIZE - d.SAFE_X - 10, fieldY)
        fieldY += 12
      })
    }

    // Extra Activity 3: My Story Review
    if (extraPagesNeeded >= 3) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('My Story Review', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Rate this story like a real book critic!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Star rating
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.text('My rating:', d.SAFE_X + 10, d.SAFE_Y + 50)
      pdf.setFontSize(24)
      pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2])
      pdf.text('\u2606 \u2606 \u2606 \u2606 \u2606', d.SAFE_X + 55, d.SAFE_Y + 52)

      // Review fields
      const reviewFields = [
        'What I liked most:',
        'What surprised me:',
        'My favorite character:',
        'I would recommend this book because:',
      ]
      let rY = d.SAFE_Y + 68
      reviewFields.forEach(field => {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
        pdf.text(field, d.SAFE_X + 10, rY)
        rY += 7
        for (let l = 0; l < 2; l++) {
          pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
          pdf.setLineWidth(0.3)
          pdf.line(d.SAFE_X + 10, rY + l * 8, d.PAGE_SIZE - d.SAFE_X - 10, rY + l * 8)
        }
        rY += 22
      })
    }

    // Extra Activity 4: Letter to a Character
    if (extraPagesNeeded >= 4) {
      nextPage()
      drawBackground(pdf, d, CREAM)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Letter to a Character', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Write a letter to your favorite character!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.text('Dear _______________,', d.SAFE_X + 10, d.SAFE_Y + 50)

      for (let l = 0; l < 11; l++) {
        const lineY = d.SAFE_Y + 65 + l * 13
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
      }

      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.text('Your friend, _______________', d.SAFE_X + 10, d.PAGE_SIZE - d.BLEED - 20)
    }

    // Extra Activity 5: Story Timeline
    if (extraPagesNeeded >= 5) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Story Timeline', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Put the story events in order!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Draw vertical timeline
      const timelineX = d.SAFE_X + 30
      pdf.setDrawColor(EMERALD[0], EMERALD[1], EMERALD[2])
      pdf.setLineWidth(2)
      pdf.line(timelineX, d.SAFE_Y + 45, timelineX, d.PAGE_SIZE - d.BLEED - 20)

      // Timeline nodes
      const timelineLabels = ['Beginning:', 'Then:', 'Next:', 'After that:', 'Finally:']
      timelineLabels.forEach((label, i) => {
        const nodeY = d.SAFE_Y + 55 + i * 30
        // Circle node
        pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
        pdf.circle(timelineX, nodeY, 3, 'F')
        // Label
        pdf.setFontSize(9)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
        pdf.text(label, timelineX + 8, nodeY + 1)
        // Writing line
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(timelineX + 8, nodeY + 8, d.PAGE_SIZE - d.SAFE_X - 10, nodeY + 8)
        pdf.line(timelineX + 8, nodeY + 16, d.PAGE_SIZE - d.SAFE_X - 10, nodeY + 16)
      })
    }

    // Extra Activity 6: Feelings Chart
    if (extraPagesNeeded >= 6) {
      nextPage()
      drawBackground(pdf, d, CREAM)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('My Feelings Chart', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('How did each part of the story make you feel?', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Emotion faces row
      const emotions = [
        { label: 'Happy', symbol: ':)' },
        { label: 'Sad', symbol: ':(' },
        { label: 'Excited', symbol: ':D' },
        { label: 'Scared', symbol: ':O' },
        { label: 'Surprised', symbol: '!!' },
      ]
      const emoWidth = d.SAFE_WIDTH / emotions.length
      emotions.forEach((emo, i) => {
        const ex = d.SAFE_X + i * emoWidth + emoWidth / 2
        pdf.setFontSize(20)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2])
        pdf.text(emo.symbol, ex, d.SAFE_Y + 52, { align: 'center' })
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
        pdf.text(emo.label, ex, d.SAFE_Y + 60, { align: 'center' })
      })

      // Grid for story sections
      const chartParts = ['Beginning', 'Middle', 'End', 'Overall']
      let chartY = d.SAFE_Y + 75
      chartParts.forEach(part => {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
        pdf.text(`${part}:`, d.SAFE_X + 10, chartY)
        // Empty circles for each emotion
        emotions.forEach((_, i) => {
          const cx = d.SAFE_X + i * emoWidth + emoWidth / 2
          pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
          pdf.setLineWidth(0.5)
          pdf.circle(cx, chartY + 10, 6, 'S')
        })
        chartY += 30
      })
    }

    // Extra Activity 7: Design a Book Cover
    if (extraPagesNeeded >= 7) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Design a Book Cover', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Create your own book cover for this story!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Book shape
      const bookW = d.SAFE_WIDTH * 0.6
      const bookH = d.SAFE_HEIGHT * 0.65
      const bookX = (d.PAGE_SIZE - bookW) / 2
      const bookY = d.SAFE_Y + 40
      pdf.setDrawColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
      pdf.setLineWidth(1)
      pdf.rect(bookX, bookY, bookW, bookH, 'S')

      // Guide text
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.text('Title goes here', bookX + bookW / 2, bookY + 15, { align: 'center' })
      pdf.text('Draw your picture here', bookX + bookW / 2, bookY + bookH / 2, { align: 'center' })
      pdf.text('Author name here', bookX + bookW / 2, bookY + bookH - 10, { align: 'center' })
    }

    // Extra Activity 8: Coloring Page
    if (extraPagesNeeded >= 8) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Coloring Page', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Color in this scene from the story!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      // Large outlined drawing area
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.setLineDashPattern([3, 3], 0)
      pdf.roundedRect(d.SAFE_X + 5, d.SAFE_Y + 40, d.SAFE_WIDTH - 10, d.SAFE_HEIGHT - 55, 4, 4, 'S')
      pdf.setLineDashPattern([], 0)

      // Simple decorative shapes to color (stars, hearts, circles)
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.8)
      // Stars in corners
      const starPositions = [
        [d.SAFE_X + 25, d.SAFE_Y + 60],
        [d.PAGE_SIZE - d.SAFE_X - 25, d.SAFE_Y + 60],
        [d.SAFE_X + 25, d.PAGE_SIZE - d.BLEED - 40],
        [d.PAGE_SIZE - d.SAFE_X - 25, d.PAGE_SIZE - d.BLEED - 40],
      ]
      starPositions.forEach(([sx, sy]) => {
        pdf.setFontSize(30)
        pdf.setTextColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.text('\u2606', sx, sy, { align: 'center' })
      })
    }

    // Extra Activity 9: Blank Notes
    if (extraPagesNeeded >= 9) {
      nextPage()
      drawBackground(pdf, d, CREAM)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Notes', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
      pdf.text('Use this space for your thoughts and ideas!', centerX(d), d.SAFE_Y + 33, { align: 'center' })

      for (let l = 0; l < 13; l++) {
        const lineY = d.SAFE_Y + 48 + l * 12
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
      }
    }

    // Extra Activity 10: More Notes (if we still need pages)
    if (extraPagesNeeded >= 10) {
      nextPage()
      drawBackground(pdf, d, WHITE)
      drawBorder(pdf, d)

      pdf.setTextColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('More Notes', centerX(d), d.SAFE_Y + 22, { align: 'center' })

      for (let l = 0; l < 14; l++) {
        const lineY = d.SAFE_Y + 40 + l * 12
        pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
        pdf.setLineWidth(0.3)
        pdf.line(d.SAFE_X + 10, lineY, d.PAGE_SIZE - d.SAFE_X - 10, lineY)
      }
    }
  }

  // ════════════════════════════════════════════════
  // THE END
  // ════════════════════════════════════════════════
  nextPage()
  drawBackground(pdf, d, WHITE)

  pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.rect(0, d.PAGE_SIZE / 2 - 40, d.PAGE_SIZE, 80, 'F')

  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(32)
  pdf.setFont('helvetica', 'bold')
  pdf.text('The End', centerX(d), d.PAGE_SIZE / 2 - 10, { align: 'center' })

  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'italic')
  pdf.text('Thank you for reading!', centerX(d), d.PAGE_SIZE / 2 + 10, { align: 'center' })

  pdf.setFontSize(11)
  pdf.text('May your stories always bring joy', centerX(d), d.PAGE_SIZE / 2 + 25, { align: 'center' })

  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`Story by: ${story.author || 'Young Author'}`, centerX(d), d.PAGE_SIZE / 2 + 55, { align: 'center' })

  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text(`Created: ${today}`, centerX(d), d.PAGE_SIZE / 2 + 65, { align: 'center' })

  // ════════════════════════════════════════════════
  // BACK COVER (skip for Lulu — goes in separate cover PDF)
  // ════════════════════════════════════════════════
  if (!spec.separateCover) {
    nextPage()
    pdf.setFillColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
    pdf.rect(0, 0, d.PAGE_SIZE, d.PAGE_SIZE, 'F')

    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text("My Story Bear", centerX(d), d.PAGE_SIZE / 2 - 10, { align: 'center' })

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(200, 200, 200)
    pdf.text('Where imagination comes to life', centerX(d), d.PAGE_SIZE / 2 + 5, { align: 'center' })

    pdf.setFontSize(7)
    pdf.setTextColor(150, 150, 150)
    pdf.text('This is a work of fiction. All characters and illustrations are AI-generated.', centerX(d), d.PAGE_SIZE - d.BLEED - 15, { align: 'center' })
    pdf.text('Any resemblance to real persons or events is purely coincidental.', centerX(d), d.PAGE_SIZE - d.BLEED - 10, { align: 'center' })
  }

  console.log(`[Print PDF] Generated ${pageNum} pages for ${spec.name} (min: ${spec.minPages})`)

  // ── Generate buffer ────────────────────────────
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}

// ══════════════════════════════════════════════════
// LULU COVER PDF GENERATOR
// ══════════════════════════════════════════════════
//
// Lulu requires a SEPARATE cover PDF as a single-page spread:
//   [Back Cover] + [Spine] + [Front Cover]
//
// Total width = 2 * (trim + 2*bleed) + spineWidth
// Total height = trim + 2*bleed
//
// Spine width is calculated from the interior page count.
// ══════════════════════════════════════════════════

export async function generateLuluCoverPdf(
  story: PrintStoryInput,
  interiorPageCount: number
): Promise<Buffer> {
  const spec = LULU_SPEC
  const d = specDimensions(spec)

  // Calculate spine width in mm (Lulu formula for 80# Coated White)
  const spineInches = calculateSpineWidth(interiorPageCount)
  const spineMm = spineInches * 25.4

  // Cover spread dimensions
  const coverWidth = 2 * d.PAGE_SIZE + spineMm   // back + spine + front
  const coverHeight = d.PAGE_SIZE

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [coverWidth, coverHeight],
  })

  // ── Load Unicode font for non-Latin cover title ──
  const language = story.language || 'en'
  const storyFontName = await loadFontForLanguage(pdf, language)

  // ── BACK COVER (left side) ────────────────────
  const backX = 0
  const backW = d.PAGE_SIZE

  // Dark background for back cover
  pdf.setFillColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.rect(backX, 0, backW, coverHeight, 'F')

  // Branding
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text("My Story Bear", backX + backW / 2, coverHeight / 2 - 10, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(200, 200, 200)
  pdf.text('Where imagination comes to life', backX + backW / 2, coverHeight / 2 + 5, { align: 'center' })

  // Disclaimer
  pdf.setFontSize(7)
  pdf.setTextColor(150, 150, 150)
  pdf.text('This is a work of fiction. All characters and illustrations are AI-generated.', backX + backW / 2, coverHeight - d.BLEED - 15, { align: 'center' })
  pdf.text('Any resemblance to real persons or events is purely coincidental.', backX + backW / 2, coverHeight - d.BLEED - 10, { align: 'center' })

  // ── SPINE (center) ────────────────────────────
  const spineX = d.PAGE_SIZE
  pdf.setFillColor(EMERALD_DARK[0], EMERALD_DARK[1], EMERALD_DARK[2])
  pdf.rect(spineX, 0, spineMm, coverHeight, 'F')

  // Spine text (rotated) — only if spine is wide enough
  if (spineMm > 8) {
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(7)
    pdf.setFont(storyFontName, 'normal')
    // Rotate text 90 degrees for spine
    const spineCenter = spineX + spineMm / 2
    const processedSpineTitle = preprocessTextForPdf(story.title, language)
    const spineTitleTruncated = processedSpineTitle.length > 30 ? processedSpineTitle.slice(0, 27) + '...' : processedSpineTitle
    pdf.text(
      spineTitleTruncated,
      spineCenter,
      coverHeight / 2,
      { align: 'center', angle: 90 }
    )
  }

  // ── FRONT COVER (right side) ──────────────────
  const frontX = d.PAGE_SIZE + spineMm
  const frontW = d.PAGE_SIZE

  // White background
  pdf.setFillColor(WHITE[0], WHITE[1], WHITE[2])
  pdf.rect(frontX, 0, frontW, coverHeight, 'F')

  // Emerald header band
  pdf.setFillColor(EMERALD[0], EMERALD[1], EMERALD[2])
  pdf.rect(frontX, 0, frontW, 60, 'F')

  // Title (uses story font for multilingual support)
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(28)
  pdf.setFont(storyFontName, 'normal')
  const processedLuluTitle = preprocessTextForPdf(story.title, language)
  const titleLines = pdf.splitTextToSize(processedLuluTitle, d.SAFE_WIDTH - 20)
  let titleY = 30
  titleLines.forEach((line: string, i: number) => {
    pdf.text(line, frontX + frontW / 2, titleY + i * 12, { align: 'center' })
  })

  // Cover image
  const coverImageUrl = story.pages[0]?.imageUrl
  if (coverImageUrl) {
    try {
      const img = await getImageAsBase64(coverImageUrl)
      const imgSize = 120
      const imgX = frontX + (frontW - imgSize) / 2
      const imgY = 70
      pdf.addImage(img, 'PNG', imgX, imgY, imgSize, imgSize, undefined, 'FAST')
      pdf.setDrawColor(ZINC_300[0], ZINC_300[1], ZINC_300[2])
      pdf.setLineWidth(0.5)
      pdf.roundedRect(imgX, imgY, imgSize, imgSize, 3, 3, 'S')
    } catch {
      pdf.setFillColor(ZINC_100[0], ZINC_100[1], ZINC_100[2])
      pdf.roundedRect(frontX + (frontW - 120) / 2, 70, 120, 120, 3, 3, 'F')
    }
  }

  // Author
  pdf.setTextColor(ZINC_800[0], ZINC_800[1], ZINC_800[2])
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`by ${story.author || 'Young Author'}`, frontX + frontW / 2, coverHeight - d.BLEED - 20, { align: 'center' })

  // Small branding
  pdf.setFontSize(8)
  pdf.setTextColor(ZINC_500[0], ZINC_500[1], ZINC_500[2])
  pdf.text("My Story Bear", frontX + frontW / 2, coverHeight - d.BLEED - 10, { align: 'center' })

  console.log(`[Lulu Cover PDF] Generated cover spread: ${coverWidth.toFixed(1)}mm x ${coverHeight.toFixed(1)}mm, spine: ${spineMm.toFixed(2)}mm`)

  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  return pdfBuffer
}
