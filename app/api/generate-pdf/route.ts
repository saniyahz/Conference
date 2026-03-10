import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import { Story } from '@/app/page'
import { renderGamePage } from '@/lib/gamePageRenderer'
import { loadFontForLanguage, isRtlLanguage, preprocessTextForPdf } from '@/lib/fontLoader'

// Helper function to convert image URL to base64
async function getImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const { story, characterBible, sceneCards, storyMode } = await request.json() as {
      story: Story
      characterBible?: any
      sceneCards?: any[]
      storyMode?: string
    }

    if (!story || !story.title || !story.pages) {
      return NextResponse.json(
        { error: 'Invalid story data provided' },
        { status: 400 }
      )
    }

    // Create PDF with professional book template
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - 2 * margin

    // ── Load Unicode font for non-Latin story text ──
    const language = story.language || 'en'
    const storyFontName = await loadFontForLanguage(pdf, language)
    const rtl = isRtlLanguage(language)

    // ========== COVER PAGE (WARM BEIGE AESTHETIC) ==========
    // Warm beige/parchment background
    pdf.setFillColor(253, 246, 227) // #FDF6E3 — warm beige
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Decorative border — warm brown tone
    pdf.setDrawColor(139, 90, 43) // Warm brown
    pdf.setLineWidth(2)
    pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 3, 3, 'S')

    // Inner decorative border
    pdf.setDrawColor(200, 170, 120) // Soft gold
    pdf.setLineWidth(0.5)
    pdf.roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 2, 2, 'S')

    // Title area — warm brown text (uses story font for multilingual support)
    pdf.setTextColor(101, 67, 33) // Dark warm brown
    pdf.setFontSize(32)
    pdf.setFont(storyFontName, 'normal')

    const processedTitle = preprocessTextForPdf(story.title, language)
    const titleLines = pdf.splitTextToSize(processedTitle, contentWidth - 30)
    const titleStartY = 80
    titleLines.forEach((line: string, index: number) => {
      pdf.text(line, pageWidth / 2, titleStartY + (index * 14), { align: 'center' })
    })

    // Decorative line under title
    pdf.setDrawColor(200, 170, 120) // Soft gold
    pdf.setLineWidth(1)
    pdf.line(40, titleStartY + (titleLines.length * 14) + 10, pageWidth - 40, titleStartY + (titleLines.length * 14) + 10)

    // Subtitle
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(100, 100, 100)
    pdf.text(storyMode === 'history' ? 'A Historical Story' : 'A Magical Story', pageWidth / 2, titleStartY + (titleLines.length * 14) + 25, { align: 'center' })

    // Author section
    const authorY = pageHeight / 2 + 20
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(139, 90, 43) // Warm brown
    pdf.text('Written by:', pageWidth / 2, authorY, { align: 'center' })

    pdf.setFontSize(22)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(story.author || 'Young Author', pageWidth / 2, authorY + 12, { align: 'center' })

    // Enhanced by AI badge
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(120, 120, 120)
    pdf.text('Enhanced by AI', pageWidth / 2, authorY + 24, { align: 'center' })

    // Date at bottom
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    pdf.text(today, pageWidth / 2, pageHeight - 25, { align: 'center' })

    // ========== COPYRIGHT / DISCLAIMER PAGE ==========
    pdf.addPage()

    // Warm beige background
    pdf.setFillColor(253, 246, 227)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Simple elegant border
    pdf.setDrawColor(200, 170, 120)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 2, 2, 'S')

    // Title
    pdf.setTextColor(101, 67, 33)
    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'bold')
    pdf.text('About This Book', pageWidth / 2, pageHeight / 2 - 50, { align: 'center' })

    // Decorative line
    pdf.setDrawColor(218, 165, 32)
    pdf.setLineWidth(0.5)
    pdf.line(60, pageHeight / 2 - 42, pageWidth - 60, pageHeight / 2 - 42)

    // Disclaimer text
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')

    const disclaimerText = storyMode === 'history' ? [
      `"${story.title}" by ${story.author || 'Young Author'}`,
      `Created on ${today}`,
      '',
      'This story was generated with the assistance of artificial intelligence',
      'and is based on real historical events. While the historical facts are',
      'intended to be accurate, some details may be simplified for young readers.',
      '',
      'The fictional child characters are products of AI generation.',
      'Historical events, dates, and places are presented as accurately as possible.',
      '',
      'Parents are encouraged to explore the historical topic further with their children.',
      'All illustrations were generated using AI image generation technology.',
      '',
      'Created with Kids Story Creator — History Mode',
    ] : [
      `"${story.title}" by ${story.author || 'Young Author'}`,
      `Created on ${today}`,
      '',
      'This is a work of fiction generated with the assistance of artificial intelligence.',
      'All characters, names, places, events, and storylines in this book are entirely',
      'fictional and are products of creative imagination and AI generation.',
      '',
      'Any resemblance to actual persons, living or deceased, actual events,',
      'or real locations is purely coincidental and unintentional.',
      '',
      'The creators and publishers of this book bear no responsibility for any',
      'interpretations, opinions, or feelings that may arise from reading this content.',
      'This story is intended purely for entertainment and educational purposes.',
      '',
      'All illustrations were generated using AI image generation technology.',
      '',
      'Created with Kids Story Creator',
    ]

    const disclaimerStartY = pageHeight / 2 - 30
    disclaimerText.forEach((line, index) => {
      if (line === `"${story.title}" by ${story.author || 'Young Author'}`) {
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(50, 50, 50)
      } else if (line === `Created on ${today}`) {
        pdf.setFont('helvetica', 'italic')
        pdf.setTextColor(100, 100, 100)
      } else if (line === 'Created with Kids Story Creator') {
        pdf.setFont('helvetica', 'italic')
        pdf.setTextColor(139, 90, 43)
      } else {
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(100, 100, 100)
      }
      pdf.text(line, pageWidth / 2, disclaimerStartY + (index * 6), { align: 'center' })
    })

    // ========== STORY PAGES (PROFESSIONAL BOOK FORMAT) ==========
    for (let i = 0; i < story.pages.length; i++) {
      pdf.addPage()

      // Warm beige background
      pdf.setFillColor(253, 246, 227)
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')

      // Simple elegant border — warm brown
      pdf.setDrawColor(200, 170, 120) // Soft gold
      pdf.setLineWidth(1)
      pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 2, 2, 'S')

      // Page number at bottom
      pdf.setTextColor(100, 100, 100)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${i + 1}`, pageWidth / 2, pageHeight - 20, { align: 'center' })

      // IMAGE AREA (Top portion of page)
      // Kontext generates 3:4 aspect ratio images (width:height = 3:4).
      // Use portrait rectangle that fits within the content width while
      // leaving enough room below for story text (at least ~70mm).
      const imageY = 25
      const imageWidth = 110  // mm — fits nicely within A4 content width (170mm)
      const imageHeight = Math.round(imageWidth * (4 / 3)) // 3:4 ratio → ~147mm tall
      const imageX = margin + (contentWidth - imageWidth) / 2 // Center horizontally

      const imageUrl = story.pages[i].imageUrl
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
        try {
          // Convert image URL to base64 so jsPDF can use it
          const imageBase64 = await getImageAsBase64(imageUrl)

          // Add the image (3:4 portrait, centered)
          pdf.addImage(
            imageBase64,
            'PNG',
            imageX,
            imageY,
            imageWidth,
            imageHeight,
            undefined,
            'FAST'
          )

          // Simple border around image
          pdf.setDrawColor(180, 180, 180)
          pdf.setLineWidth(0.5)
          pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'S')
        } catch (error) {
          // Light placeholder box — same size as real images
          pdf.setFillColor(245, 237, 215)
          pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'F')
          pdf.setDrawColor(200, 200, 200)
          pdf.setLineWidth(0.5)
          pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'S')

          pdf.setTextColor(150, 150, 150)
          pdf.setFontSize(12)
          pdf.setFont('helvetica', 'italic')
          pdf.text('[Illustration will appear here]', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
        }
      } else {
        // Decorative placeholder when no image — same size as real images
        pdf.setFillColor(245, 237, 215)
        pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'F')
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.5)
        pdf.roundedRect(imageX, imageY, imageWidth, imageHeight, 2, 2, 'S')

        pdf.setTextColor(150, 150, 150)
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'italic')
        pdf.text('[Illustration will appear here]', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
      }

      // TEXT AREA (Below image - uses remaining space)
      const textY = imageY + imageHeight + 8
      const textAreaHeight = pageHeight - textY - 35 // Leave room for page number

      // Story text - larger font and better spacing for kids (uses story font for multilingual)
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(14)
      pdf.setFont(storyFontName, 'normal')

      const processedText = preprocessTextForPdf(story.pages[i].text, language)
      const textLines = pdf.splitTextToSize(processedText, contentWidth - 4)
      let currentY = textY

      textLines.forEach((line: string) => {
        if (currentY < pageHeight - 35) {
          if (rtl) {
            pdf.text(line, pageWidth - margin - 2, currentY, { align: 'right' })
          } else {
            pdf.text(line, margin + 2, currentY)
          }
          currentY += 7 // Better line spacing for readability
        }
      })

      // Decorative footer
      pdf.setDrawColor(218, 165, 32)
      pdf.setLineWidth(0.5)
      pdf.line(margin + 20, pageHeight - 25, pageWidth - margin - 20, pageHeight - 25)
    }

    // ========== ORIGINAL STORY IDEA PAGE ==========
    // Only add this page if we have the original prompt
    if (story.originalPrompt) {
      pdf.addPage()

      // Warm beige background
      pdf.setFillColor(253, 246, 227)
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')

      // Decorative border
      pdf.setDrawColor(139, 90, 43)
      pdf.setLineWidth(1.5)
      pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 2, 2, 'S')

      // Header with speech bubble icon
      pdf.setTextColor(101, 67, 33)
      pdf.setFontSize(24)
      pdf.setFont('helvetica', 'bold')
      pdf.text('The Original Story Idea', pageWidth / 2, 45, { align: 'center' })

      // Subtitle
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'italic')
      pdf.setTextColor(100, 100, 100)
      pdf.text(`As told by ${story.author || 'Young Author'}`, pageWidth / 2, 58, { align: 'center' })

      // Decorative line
      pdf.setDrawColor(218, 165, 32)
      pdf.setLineWidth(1)
      pdf.line(50, 65, pageWidth - 50, 65)

      // Calculate prompt text layout FIRST so we can size the box dynamically
      pdf.setFontSize(13)
      pdf.setFont(storyFontName, 'normal')
      const processedPrompt = preprocessTextForPdf(story.originalPrompt, language)
      const promptLines = pdf.splitTextToSize(processedPrompt, contentWidth - 50)
      const lineHeight = 7
      const promptTextHeight = promptLines.length * lineHeight
      // Box: 15px top padding + text + 15px bottom padding
      const boxHeight = Math.max(60, promptTextHeight + 35)
      // Cap to available page space (leave room for footer)
      const maxBoxHeight = pageHeight - 80 - 45 // 80 = box top, 45 = footer space
      const finalBoxHeight = Math.min(boxHeight, maxBoxHeight)

      // Quote box background — warm parchment (dynamically sized)
      pdf.setFillColor(245, 237, 215)
      pdf.roundedRect(25, 80, pageWidth - 50, finalBoxHeight, 5, 5, 'F')
      pdf.setDrawColor(200, 170, 120)
      pdf.setLineWidth(0.5)
      pdf.roundedRect(25, 80, pageWidth - 50, finalBoxHeight, 5, 5, 'S')

      // Opening quote mark
      pdf.setTextColor(139, 90, 43)
      pdf.setFontSize(48)
      pdf.setFont('helvetica', 'bold')
      pdf.text('"', 35, 105)

      // The original prompt text — render ALL lines that fit (uses story font for multilingual)
      pdf.setTextColor(50, 50, 50)
      pdf.setFontSize(13)
      pdf.setFont(storyFontName, 'normal')
      let promptY = 100
      const maxPromptY = 80 + finalBoxHeight - 15 // stop 15px before box bottom
      promptLines.forEach((line: string) => {
        if (promptY < maxPromptY) {
          if (rtl) {
            pdf.text(line, pageWidth - 45, promptY, { align: 'right' })
          } else {
            pdf.text(line, 45, promptY)
          }
          promptY += lineHeight
        }
      })

      // Closing quote mark — positioned right after the last line of text
      pdf.setTextColor(139, 90, 43)
      pdf.setFontSize(48)
      pdf.setFont('helvetica', 'bold')
      pdf.text('"', pageWidth - 45, Math.min(promptY + 5, 80 + finalBoxHeight - 5))

      // Footer message — positioned below the quote box
      const footerY = 80 + finalBoxHeight + 18
      pdf.setTextColor(100, 100, 100)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'italic')
      pdf.text(storyMode === 'history' ? 'This historical story was inspired by this question!' : 'This magical story grew from this wonderful idea!', pageWidth / 2, footerY, { align: 'center' })

      // Small beaver emoji placeholder text
      pdf.setFontSize(10)
      pdf.text('Created with Kids Story Creator', pageWidth / 2, footerY + 15, { align: 'center' })
    }

    // ========== GAME / ACTIVITY PAGE ==========
    renderGamePage(pdf, story, characterBible, sceneCards)

    // ========== BACK COVER ==========
    pdf.addPage()
    pdf.setFillColor(88, 28, 135)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // "The End" with decorative elements
    pdf.setTextColor(255, 215, 0)
    pdf.setFontSize(36)
    pdf.setFont('helvetica', 'bold')
    pdf.text('The End', pageWidth / 2, pageHeight / 2 - 30, { align: 'center' })

    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(255, 255, 255)
    pdf.text('Thank you for reading!', pageWidth / 2, pageHeight / 2, { align: 'center' })

    pdf.setFontSize(12)
    pdf.text('May your stories always bring joy', pageWidth / 2, pageHeight / 2 + 15, { align: 'center' })

    // Author credit
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 215, 0)
    pdf.text(`Story by: ${story.author || 'Young Author'}`, pageWidth / 2, pageHeight / 2 + 40, { align: 'center' })

    // Date
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(200, 200, 200)
    pdf.text(`Created: ${today}`, pageWidth / 2, pageHeight / 2 + 55, { align: 'center' })

    // Disclaimer on back cover
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(160, 140, 180)
    if (storyMode === 'history') {
      pdf.text('Based on real historical events. Characters and illustrations are AI-generated.', pageWidth / 2, pageHeight - 18, { align: 'center' })
      pdf.text('Historical facts may be simplified for young readers.', pageWidth / 2, pageHeight - 13, { align: 'center' })
    } else {
      pdf.text('This is a work of fiction. All characters, events, and illustrations are AI-generated.', pageWidth / 2, pageHeight - 18, { align: 'center' })
      pdf.text('Any resemblance to real persons or events is purely coincidental.', pageWidth / 2, pageHeight - 13, { align: 'center' })
    }

    // Decorative stars on back cover
    const stars = [
      { x: 30, y: 40 }, { x: 60, y: 80 }, { x: 90, y: 50 },
      { x: 120, y: 100 }, { x: 150, y: 70 }, { x: 40, y: 160 },
      { x: 80, y: 180 }, { x: 110, y: 200 }, { x: 140, y: 220 }
    ]
    stars.forEach(star => {
      pdf.setFillColor(255, 215, 0)
      pdf.circle(star.x, star.y + 20, 2, 'F')
      pdf.circle(pageWidth - star.x, star.y, 2, 'F')
    })

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
