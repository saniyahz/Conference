import jsPDF from 'jspdf'
import { CharacterBible, PageSceneCard } from './visual-types'

// ─────────────────────────────────────────────────────
// Game Page Renderer — adds a personalized activity page
// to the end of each storybook PDF (before back cover).
//
// Three activities on one A4 page:
//   1. Word Search (personalized to story)
//   2. Spot the Difference (scene from story setting)
//   3. Story Questions + Draw box
// ─────────────────────────────────────────────────────

interface StoryBasic {
  title: string
  author: string
  pages: { text: string; imageUrl?: string }[]
  originalPrompt?: string
}

// ── Colors (matching book theme) ────────────────────
const PURPLE = [88, 28, 135] as const
const LIGHT_PURPLE = [180, 160, 200] as const
const GOLD = [218, 165, 32] as const
const CREAM = [255, 253, 250] as const
const DARK_TEXT = [50, 50, 50] as const
const GRAY_TEXT = [100, 100, 100] as const
const LIGHT_BG = [250, 245, 255] as const

// ════════════════════════════════════════════════════
//  MAIN EXPORT
// ════════════════════════════════════════════════════

export function renderGamePage(
  pdf: jsPDF,
  story: StoryBasic,
  characterBible?: CharacterBible,
  sceneCards?: PageSceneCard[]
): void {
  const pageWidth = pdf.internal.pageSize.getWidth()   // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight()  // 297mm
  const margin = 20

  pdf.addPage()

  // ── Background ─────────────────────────────────
  pdf.setFillColor(...CREAM)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  // ── Border ─────────────────────────────────────
  pdf.setDrawColor(...PURPLE)
  pdf.setLineWidth(1)
  pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 2, 2, 'S')

  // ── Extract personalization data ───────────────
  const charName = characterBible?.name || extractNameFromTitle(story.title)
  const species = characterBible?.species || ''
  const words = extractGameWords(charName, species, sceneCards, story)
  const primarySetting = detectPrimarySetting(sceneCards, story)
  const supportingChars = collectSupportingCharacters(sceneCards)
  const firstSetting = sceneCards?.[0]?.setting || ''

  // ── Header ─────────────────────────────────────
  let y = 28
  pdf.setTextColor(...GOLD)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text('*', pageWidth / 2 - 45, y)
  pdf.text('*', pageWidth / 2 + 43, y)

  pdf.setTextColor(...PURPLE)
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Fun Activity Page!', pageWidth / 2, y, { align: 'center' })

  y += 10
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text(`Can you help ${charName}?`, pageWidth / 2, y, { align: 'center' })

  // ════════════════════════════════════════════════
  //  ACTIVITY 1: WORD SEARCH
  // ════════════════════════════════════════════════
  y = 44
  drawActivityHeader(pdf, '1', 'Find the Hidden Words!', margin, y, pageWidth)
  y += 7

  const gridSize = 7   // 7×7 grid fits better on page
  const cellSize = 9   // 9mm cells → 63mm grid
  const gridWidth = gridSize * cellSize   // 63mm
  const gridX = (pageWidth - gridWidth) / 2  // centered
  const gridY = y

  // Generate and draw word search
  const { grid, placedWords } = generateWordSearch(words, gridSize)
  drawWordSearchGrid(pdf, grid, gridX, gridY, cellSize)

  // Word list below grid
  y = gridY + gridWidth + 3
  drawWordList(pdf, placedWords, margin, y, pageWidth)

  // Account for word list height: "Find these words:" label (5mm) + rows of words (6mm each)
  const wordListRows = Math.ceil(placedWords.length / 4)  // 4 words per row
  y += 5 + wordListRows * 6 + 4  // label + word rows + padding

  // ════════════════════════════════════════════════
  //  ACTIVITY 2: SPOT THE DIFFERENCE
  // ════════════════════════════════════════════════
  drawActivityHeader(pdf, '2', 'Spot 5 Differences!', margin, y, pageWidth)
  y += 3

  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text('Circle the differences between the two pictures', pageWidth / 2, y, { align: 'center' })
  y += 4

  const sceneWidth = 70
  const sceneHeight = 45
  const gap = 8
  const scenesX = (pageWidth - (sceneWidth * 2 + gap)) / 2

  drawSpotTheDifference(pdf, primarySetting, scenesX, y, sceneWidth, sceneHeight, gap)

  // ════════════════════════════════════════════════
  //  ACTIVITY 3: STORY QUESTIONS + DRAW BOX
  // ════════════════════════════════════════════════
  y += sceneHeight + 6
  drawActivityHeader(pdf, '3', 'Think About the Story!', margin, y, pageWidth)
  y += 7

  const questions = generateQuestions(charName, firstSetting, supportingChars)
  for (const q of questions) {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...DARK_TEXT)
    pdf.text(q, margin + 2, y)
    y += 4

    // Dotted answer line
    pdf.setDrawColor(...LIGHT_PURPLE)
    pdf.setLineWidth(0.3)
    drawDottedLine(pdf, margin + 2, y, pageWidth - margin - 2, y)
    y += 6
  }

  // Draw box
  y += 1
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text('Draw your favorite scene from the story!', margin + 2, y)
  y += 3

  const boxHeight = pageHeight - 22 - y  // fill remaining space before border
  if (boxHeight > 10) {
    pdf.setDrawColor(...LIGHT_PURPLE)
    pdf.setLineWidth(0.5)
    pdf.setLineDashPattern([2, 2], 0)
    pdf.roundedRect(margin + 2, y, pageWidth - 2 * margin - 4, boxHeight, 3, 3, 'S')
    pdf.setLineDashPattern([], 0)  // reset dash
  }
}

// ════════════════════════════════════════════════════
//  WORD SEARCH GENERATOR
// ════════════════════════════════════════════════════

function generateWordSearch(
  words: string[],
  size: number
): { grid: string[][]; placedWords: string[] } {
  // Initialize empty grid
  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => '')
  )
  const placedWords: string[] = []

  // Filter words that fit in grid, sort longest first for better placement
  const candidates = words
    .map(w => w.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(w => w.length >= 3 && w.length <= size)
    .sort((a, b) => b.length - a.length)

  // Remove duplicates
  const uniqueWords = [...new Set(candidates)]

  for (const word of uniqueWords) {
    if (placedWords.length >= 6) break  // max 6 words for 7×7 grid

    // Try horizontal placement first, then vertical
    if (tryPlaceWord(grid, word, 'horizontal', size) ||
        tryPlaceWord(grid, word, 'vertical', size)) {
      placedWords.push(word)
    }
  }

  // Fill empty cells with random letters
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = letters[Math.floor(Math.random() * 26)]
      }
    }
  }

  return { grid, placedWords }
}

function tryPlaceWord(
  grid: string[][],
  word: string,
  direction: 'horizontal' | 'vertical',
  size: number
): boolean {
  const maxAttempts = 30
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const row = Math.floor(Math.random() * size)
    const col = Math.floor(Math.random() * size)

    if (canPlaceWord(grid, word, row, col, direction, size)) {
      placeWord(grid, word, row, col, direction)
      return true
    }
  }
  return false
}

function canPlaceWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  direction: 'horizontal' | 'vertical',
  size: number
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'vertical' ? row + i : row
    const c = direction === 'horizontal' ? col + i : col

    if (r >= size || c >= size) return false
    if (grid[r][c] !== '' && grid[r][c] !== word[i]) return false
  }
  return true
}

function placeWord(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  direction: 'horizontal' | 'vertical'
): void {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'vertical' ? row + i : row
    const c = direction === 'horizontal' ? col + i : col
    grid[r][c] = word[i]
  }
}

// ════════════════════════════════════════════════════
//  DRAWING HELPERS
// ════════════════════════════════════════════════════

function drawActivityHeader(
  pdf: jsPDF,
  num: string,
  title: string,
  margin: number,
  y: number,
  pageWidth: number
): void {
  // Gold number circle
  pdf.setFillColor(...GOLD)
  pdf.circle(margin + 5, y - 2, 4, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text(num, margin + 5, y - 0.5, { align: 'center' })

  // Title
  pdf.setTextColor(...PURPLE)
  pdf.setFontSize(13)
  pdf.setFont('helvetica', 'bold')
  pdf.text(title, margin + 13, y)
}

function drawWordSearchGrid(
  pdf: jsPDF,
  grid: string[][],
  x: number,
  y: number,
  cellSize: number
): void {
  const size = grid.length

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cx = x + c * cellSize
      const cy = y + r * cellSize

      // Cell border
      pdf.setDrawColor(...LIGHT_PURPLE)
      pdf.setLineWidth(0.3)
      pdf.rect(cx, cy, cellSize, cellSize, 'S')

      // Letter
      pdf.setTextColor(...DARK_TEXT)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text(grid[r][c], cx + cellSize / 2, cy + cellSize / 2 + 1.5, { align: 'center' })
    }
  }
}

function drawWordList(
  pdf: jsPDF,
  words: string[],
  margin: number,
  y: number,
  pageWidth: number
): void {
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'italic')
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text('Find these words:', margin + 2, y)
  y += 5

  // Draw words in a row with checkbox squares
  const wordsPerRow = 4
  const colWidth = (pageWidth - 2 * margin) / wordsPerRow

  for (let i = 0; i < words.length; i++) {
    const col = i % wordsPerRow
    const row = Math.floor(i / wordsPerRow)
    const wx = margin + col * colWidth + 2
    const wy = y + row * 6

    // Small checkbox
    pdf.setDrawColor(...LIGHT_PURPLE)
    pdf.setLineWidth(0.3)
    pdf.rect(wx, wy - 3, 3, 3, 'S')

    // Word
    pdf.setTextColor(...DARK_TEXT)
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.text(words[i], wx + 5, wy)
  }
}

function drawDottedLine(
  pdf: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  const dotSpacing = 2
  const totalLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  const dots = Math.floor(totalLength / dotSpacing)
  const dx = (x2 - x1) / dots
  const dy = (y2 - y1) / dots

  for (let i = 0; i < dots; i += 2) {
    pdf.line(
      x1 + i * dx,
      y1 + i * dy,
      x1 + (i + 1) * dx,
      y1 + (i + 1) * dy
    )
  }
}

// ════════════════════════════════════════════════════
//  SPOT THE DIFFERENCE SCENE DRAWER
// ════════════════════════════════════════════════════

type SettingTheme = 'forest' | 'ocean' | 'moon' | 'sky' | 'default'

function drawSpotTheDifference(
  pdf: jsPDF,
  setting: SettingTheme,
  x: number,
  y: number,
  width: number,
  height: number,
  gap: number
): void {
  // Left scene (complete)
  drawScene(pdf, setting, x, y, width, height, false)

  // Right scene (with 5 differences)
  drawScene(pdf, setting, x + width + gap, y, width, height, true)

  // Labels
  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...GRAY_TEXT)
  pdf.text('A', x + width / 2, y + height + 4, { align: 'center' })
  pdf.text('B', x + width + gap + width / 2, y + height + 4, { align: 'center' })
}

function drawScene(
  pdf: jsPDF,
  setting: SettingTheme,
  x: number,
  y: number,
  w: number,
  h: number,
  withDifferences: boolean
): void {
  // Scene border
  pdf.setFillColor(245, 248, 255)
  pdf.roundedRect(x, y, w, h, 2, 2, 'F')
  pdf.setDrawColor(...LIGHT_PURPLE)
  pdf.setLineWidth(0.5)
  pdf.roundedRect(x, y, w, h, 2, 2, 'S')

  // Ground line
  const groundY = y + h * 0.75
  pdf.setDrawColor(120, 180, 120)
  pdf.setLineWidth(0.5)
  if (setting !== 'ocean' && setting !== 'moon') {
    pdf.line(x, groundY, x + w, groundY)
  }

  switch (setting) {
    case 'forest':
      drawForestScene(pdf, x, y, w, h, groundY, withDifferences)
      break
    case 'ocean':
      drawOceanScene(pdf, x, y, w, h, withDifferences)
      break
    case 'moon':
      drawMoonScene(pdf, x, y, w, h, withDifferences)
      break
    case 'sky':
      drawSkyScene(pdf, x, y, w, h, withDifferences)
      break
    default:
      drawForestScene(pdf, x, y, w, h, groundY, withDifferences)
      break
  }
}

function drawForestScene(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  groundY: number, diff: boolean
): void {
  // Sun
  pdf.setFillColor(255, 220, 50)
  pdf.circle(x + w - 12, y + 10, diff ? 4 : 6, 'F')  // Diff 1: smaller sun

  // Cloud 1
  pdf.setFillColor(230, 235, 245)
  pdf.circle(x + 15, y + 12, 5, 'F')
  pdf.circle(x + 20, y + 10, 6, 'F')
  pdf.circle(x + 25, y + 12, 5, 'F')

  // Cloud 2 (only in original)
  if (!diff) {  // Diff 2: missing cloud
    pdf.setFillColor(230, 235, 245)
    pdf.circle(x + 45, y + 15, 4, 'F')
    pdf.circle(x + 49, y + 13, 5, 'F')
    pdf.circle(x + 53, y + 15, 4, 'F')
  }

  // Tree 1 (tall)
  pdf.setFillColor(101, 67, 33)
  pdf.rect(x + 10, groundY - 20, 4, 20, 'F')
  pdf.setFillColor(34, 139, 34)
  pdf.circle(x + 12, groundY - 22, diff ? 8 : 10, 'F')  // Diff 3: smaller canopy

  // Tree 2
  pdf.setFillColor(101, 67, 33)
  pdf.rect(x + 35, groundY - 15, 3, 15, 'F')
  pdf.setFillColor(34, 139, 34)
  pdf.circle(x + 36.5, groundY - 17, 7, 'F')

  // Tree 3 (only on right side of scene)
  pdf.setFillColor(101, 67, 33)
  pdf.rect(x + 58, groundY - 18, 3.5, 18, 'F')
  pdf.setFillColor(34, 139, 34)
  pdf.circle(x + 59.5, groundY - 20, 8, 'F')

  // Flowers
  const flowerColors: [number, number, number][] = [
    [255, 100, 100], [255, 200, 50], [200, 100, 255]
  ]
  const flowerCount = diff ? 2 : 3  // Diff 4: fewer flowers
  for (let i = 0; i < flowerCount; i++) {
    pdf.setFillColor(...flowerColors[i])
    pdf.circle(x + 20 + i * 15, groundY + 3, 2, 'F')
    pdf.setFillColor(50, 150, 50)
    pdf.line(x + 20 + i * 15, groundY + 5, x + 20 + i * 15, groundY + 9)
  }

  // Bird (different position)
  pdf.setFillColor(50, 50, 50)
  const birdX = diff ? x + 50 : x + 40  // Diff 5: bird moved
  pdf.text('v', birdX, y + 20)
}

function drawOceanScene(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  diff: boolean
): void {
  // Water background
  pdf.setFillColor(173, 216, 250)
  pdf.rect(x + 1, y + h * 0.4, w - 2, h * 0.59, 'F')

  // Sun
  pdf.setFillColor(255, 220, 50)
  pdf.circle(x + w - 12, y + 10, 5, 'F')

  // Waves
  pdf.setDrawColor(65, 105, 225)
  pdf.setLineWidth(0.5)
  const waveCount = diff ? 3 : 4  // Diff 1: fewer waves
  for (let i = 0; i < waveCount; i++) {
    const wy = y + h * 0.4 + i * 8 + 5
    pdf.line(x + 5, wy, x + 15, wy - 3)
    pdf.line(x + 15, wy - 3, x + 25, wy)
    pdf.line(x + 30, wy, x + 40, wy - 3)
    pdf.line(x + 40, wy - 3, x + 50, wy)
  }

  // Fish 1
  pdf.setFillColor(255, 165, 0)
  pdf.circle(x + 20, y + h * 0.55, diff ? 2 : 3, 'F')  // Diff 2: smaller fish

  // Fish 2
  pdf.setFillColor(255, 100, 100)
  pdf.circle(x + 45, y + h * 0.65, 2.5, 'F')

  // Fish 3 (only in original)
  if (!diff) {  // Diff 3: missing fish
    pdf.setFillColor(100, 200, 100)
    pdf.circle(x + 60, y + h * 0.75, 2, 'F')
  }

  // Cloud
  pdf.setFillColor(230, 235, 245)
  pdf.circle(x + 15, y + 10, 5, 'F')
  pdf.circle(x + 20, y + 8, 6, 'F')
  pdf.circle(x + 25, y + 10, 5, 'F')

  // Boat
  pdf.setFillColor(139, 90, 43)
  const boatX = diff ? x + 50 : x + 40  // Diff 4: boat moved
  pdf.rect(boatX, y + h * 0.35, 15, 5, 'F')

  // Star in sky (only in original)
  if (!diff) {  // Diff 5: missing star
    pdf.setFillColor(...GOLD)
    pdf.circle(x + 40, y + 12, 1.5, 'F')
  }
}

function drawMoonScene(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  diff: boolean
): void {
  // Dark sky background
  pdf.setFillColor(25, 25, 60)
  pdf.roundedRect(x + 1, y + 1, w - 2, h - 2, 1, 1, 'F')

  // Moon surface (bottom)
  pdf.setFillColor(200, 200, 210)
  pdf.rect(x + 1, y + h * 0.65, w - 2, h * 0.34, 'F')

  // Stars
  pdf.setFillColor(255, 255, 200)
  const starCount = diff ? 4 : 6  // Diff 1: fewer stars
  const starPositions = [
    [10, 10], [25, 8], [40, 15], [55, 10], [15, 22], [50, 20]
  ]
  for (let i = 0; i < starCount; i++) {
    pdf.circle(x + starPositions[i][0], y + starPositions[i][1], 1, 'F')
  }

  // Earth in sky
  pdf.setFillColor(70, 130, 200)
  pdf.circle(x + w - 15, y + 15, diff ? 5 : 7, 'F')  // Diff 2: smaller Earth

  // Craters
  pdf.setFillColor(170, 170, 180)
  pdf.circle(x + 15, y + h * 0.75, 4, 'F')
  pdf.circle(x + 40, y + h * 0.7, diff ? 3 : 5, 'F')  // Diff 3: smaller crater
  pdf.circle(x + 55, y + h * 0.8, 3, 'F')

  // Rocket
  pdf.setFillColor(200, 50, 50)
  const rocketX = diff ? x + 55 : x + 30  // Diff 4: rocket moved
  pdf.rect(rocketX, y + h * 0.45, 5, 12, 'F')
  pdf.setFillColor(255, 255, 255)
  pdf.circle(rocketX + 2.5, y + h * 0.48, 1.5, 'F')

  // Flag (only in original)
  if (!diff) {  // Diff 5: missing flag
    pdf.setDrawColor(200, 200, 200)
    pdf.setLineWidth(0.3)
    pdf.line(x + 45, y + h * 0.65, x + 45, y + h * 0.55)
    pdf.setFillColor(255, 215, 0)
    pdf.rect(x + 45, y + h * 0.55, 5, 3, 'F')
  }
}

function drawSkyScene(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  diff: boolean
): void {
  // Sky gradient (light blue)
  pdf.setFillColor(135, 206, 250)
  pdf.roundedRect(x + 1, y + 1, w - 2, h - 2, 1, 1, 'F')

  // Sun
  pdf.setFillColor(255, 220, 50)
  pdf.circle(x + w - 12, y + 12, diff ? 4 : 6, 'F')  // Diff 1

  // Clouds
  const cloudCount = diff ? 2 : 3  // Diff 2: fewer clouds
  const cloudPositions = [[15, 20], [40, 15], [60, 25]]
  for (let i = 0; i < cloudCount; i++) {
    pdf.setFillColor(255, 255, 255)
    pdf.circle(x + cloudPositions[i][0], y + cloudPositions[i][1], 5, 'F')
    pdf.circle(x + cloudPositions[i][0] + 5, y + cloudPositions[i][1] - 2, 6, 'F')
    pdf.circle(x + cloudPositions[i][0] + 10, y + cloudPositions[i][1], 5, 'F')
  }

  // Birds
  pdf.setTextColor(50, 50, 50)
  pdf.setFontSize(8)
  pdf.text('v', x + 20, y + h * 0.4)
  pdf.text('v', x + 30, y + h * 0.35)
  if (!diff) pdf.text('v', x + 25, y + h * 0.45)  // Diff 3: missing bird

  // Rainbow (simplified arcs)
  const rainbowColors: [number, number, number][] = [
    [255, 0, 0], [255, 165, 0], [255, 255, 0], [0, 128, 0], [0, 0, 255]
  ]
  const arcCount = diff ? 3 : 5  // Diff 4: fewer arcs
  for (let i = 0; i < arcCount; i++) {
    pdf.setDrawColor(...rainbowColors[i])
    pdf.setLineWidth(1)
    // Simple arc approximation with line segments
    const arcCX = x + w / 2
    const arcCY = y + h * 0.6
    const radius = 20 + i * 2
    for (let a = 0; a < 10; a++) {
      const angle1 = Math.PI + (a / 10) * Math.PI
      const angle2 = Math.PI + ((a + 1) / 10) * Math.PI
      pdf.line(
        arcCX + radius * Math.cos(angle1), arcCY + radius * Math.sin(angle1),
        arcCX + radius * Math.cos(angle2), arcCY + radius * Math.sin(angle2)
      )
    }
  }

  // Star (only in original)
  if (!diff) {  // Diff 5
    pdf.setFillColor(...GOLD)
    pdf.circle(x + 10, y + 10, 1.5, 'F')
  }
}

// ════════════════════════════════════════════════════
//  DATA EXTRACTION HELPERS
// ════════════════════════════════════════════════════

function extractNameFromTitle(title: string): string {
  // Try "X's Adventure" or "The Adventures of X"
  const possessive = title.match(/^(\w+)'s/i)
  if (possessive) return possessive[1]
  const ofPattern = title.match(/of\s+(\w+)/i)
  if (ofPattern) return ofPattern[1]
  return 'Hero'
}

function extractGameWords(
  charName: string,
  species: string,
  sceneCards?: PageSceneCard[],
  story?: StoryBasic
): string[] {
  const words = new Set<string>()

  // Character name and species
  if (charName.length >= 3 && charName.length <= 7) words.add(charName.toUpperCase())
  if (species && species.length >= 3 && species.length <= 7) words.add(species.toUpperCase())

  if (sceneCards) {
    // Settings → keywords
    for (const card of sceneCards) {
      const settingWords = extractKeywordsFromSetting(card.setting)
      for (const w of settingWords) words.add(w.toUpperCase())

      // Supporting characters
      for (const char of card.supporting_characters || []) {
        const cleaned = char.replace(/\s+/g, '')
        if (cleaned.length >= 3 && cleaned.length <= 7) {
          words.add(cleaned.toUpperCase())
        }
      }

      // Key objects
      for (const obj of card.key_objects || []) {
        const parts = obj.split(/\s+/)
        for (const part of parts) {
          if (part.length >= 3 && part.length <= 7) {
            words.add(part.toUpperCase())
          }
        }
      }
    }
  }

  // Fallback: extract from story text
  if (words.size < 5 && story) {
    const fallbackWords = ['STORY', 'BOOK', 'FRIEND', 'HAPPY', 'MAGIC', 'BRAVE', 'LOVE']
    for (const w of fallbackWords) {
      if (words.size < 7) words.add(w)
    }
  }

  return [...words].slice(0, 7)
}

function extractKeywordsFromSetting(setting: string): string[] {
  const keywords: string[] = []
  const settingLower = setting.toLowerCase()

  const settingKeywordMap: Record<string, string[]> = {
    'forest': ['FOREST', 'TREES'],
    'ocean': ['OCEAN', 'WAVES'],
    'moon': ['MOON', 'STARS'],
    'space': ['SPACE', 'STARS'],
    'rocket': ['ROCKET'],
    'beach': ['BEACH', 'SAND'],
    'meadow': ['MEADOW'],
    'garden': ['GARDEN'],
    'castle': ['CASTLE'],
    'mountain': ['MOUNTAIN'],
    'river': ['RIVER'],
    'jungle': ['JUNGLE'],
    'cave': ['CAVE'],
    'desert': ['DESERT'],
    'sunset': ['SUNSET'],
    'picnic': ['PICNIC'],
  }

  for (const [key, words] of Object.entries(settingKeywordMap)) {
    if (settingLower.includes(key)) {
      keywords.push(...words)
    }
  }

  return keywords
}

function detectPrimarySetting(
  sceneCards?: PageSceneCard[],
  story?: StoryBasic
): SettingTheme {
  const settingCounts: Record<SettingTheme, number> = {
    forest: 0, ocean: 0, moon: 0, sky: 0, default: 0
  }

  const text = sceneCards
    ? sceneCards.map(c => c.setting).join(' ').toLowerCase()
    : (story?.pages.map(p => p.text).join(' ').toLowerCase() || '')

  if (text.includes('forest') || text.includes('tree') || text.includes('woods') || text.includes('jungle')) settingCounts.forest += 3
  if (text.includes('ocean') || text.includes('sea') || text.includes('water') || text.includes('beach')) settingCounts.ocean += 3
  if (text.includes('moon') || text.includes('crater') || text.includes('space') || text.includes('rocket')) settingCounts.moon += 3
  if (text.includes('sky') || text.includes('cloud') || text.includes('flying')) settingCounts.sky += 3

  const best = Object.entries(settingCounts).reduce((a, b) => a[1] > b[1] ? a : b)
  return best[1] > 0 ? best[0] as SettingTheme : 'forest'
}

function collectSupportingCharacters(sceneCards?: PageSceneCard[]): string[] {
  if (!sceneCards) return []
  const chars = new Set<string>()
  for (const card of sceneCards) {
    for (const char of card.supporting_characters || []) {
      chars.add(char)
    }
  }
  return [...chars].slice(0, 5)
}

function generateQuestions(
  charName: string,
  firstSetting: string,
  supportingChars: string[]
): string[] {
  const questions: string[] = []

  // Q1: About the adventure start
  questions.push(`Where did ${charName} go on the adventure?`)

  // Q2: About friends — use phrasing that avoids awkward repetition
  // e.g., "Who did meet meet?" → use "make friends with" instead
  if (supportingChars.length > 0) {
    questions.push(`Who did ${charName} make friends with?`)
  } else {
    questions.push(`What did ${charName} discover on the journey?`)
  }

  // Q3: Open-ended (always works, replayable)
  questions.push('What was your favorite part of the story?')

  return questions
}
