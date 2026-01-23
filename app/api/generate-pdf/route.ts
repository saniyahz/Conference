import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import { Story } from '@/app/page'

// Helper function to convert image URL to base64
async function getImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    console.error('Error fetching image:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const { story }: { story: Story } = await request.json()

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

    // ========== COVER PAGE (WHITE BACKGROUND FOR PRINTING) ==========
    // Cream/off-white background
    pdf.setFillColor(255, 253, 250)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Decorative border
    pdf.setDrawColor(88, 28, 135) // Purple
    pdf.setLineWidth(2)
    pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 3, 3, 'S')

    // Inner decorative border
    pdf.setDrawColor(180, 160, 200) // Light purple
    pdf.setLineWidth(0.5)
    pdf.roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 2, 2, 'S')

    // Title area
    pdf.setTextColor(88, 28, 135)
    pdf.setFontSize(32)
    pdf.setFont('helvetica', 'bold')

    const titleLines = pdf.splitTextToSize(story.title, contentWidth - 30)
    const titleStartY = 80
    titleLines.forEach((line: string, index: number) => {
      pdf.text(line, pageWidth / 2, titleStartY + (index * 14), { align: 'center' })
    })

    // Decorative line under title
    pdf.setDrawColor(88, 28, 135)
    pdf.setLineWidth(1)
    pdf.line(40, titleStartY + (titleLines.length * 14) + 10, pageWidth - 40, titleStartY + (titleLines.length * 14) + 10)

    // Subtitle
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(100, 100, 100)
    pdf.text('A Magical Story', pageWidth / 2, titleStartY + (titleLines.length * 14) + 25, { align: 'center' })

    // Author section
    const authorY = pageHeight / 2 + 20
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(88, 28, 135)
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

    // ========== STORY PAGES (PROFESSIONAL BOOK FORMAT) ==========
    for (let i = 0; i < story.pages.length; i++) {
      pdf.addPage()

      // White/cream background for printing
      pdf.setFillColor(255, 253, 250)
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')

      // Simple elegant border
      pdf.setDrawColor(88, 28, 135) // Purple
      pdf.setLineWidth(1)
      pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 2, 2, 'S')

      // Page number at bottom
      pdf.setTextColor(100, 100, 100)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`${i + 1}`, pageWidth / 2, pageHeight - 20, { align: 'center' })

      // IMAGE AREA (Top half of page)
      const imageY = 30
      const maxImageHeight = 110
      const maxImageWidth = contentWidth

      if (story.pages[i].imageUrl) {
        try {
          // Convert image URL to base64 so jsPDF can use it
          console.log(`📄 Adding image ${i + 1} to PDF...`)
          const imageBase64 = await getImageAsBase64(story.pages[i].imageUrl!)

          // DALL-E images are 1024x1024 (square), so maintain aspect ratio
          // Calculate dimensions to fit within max width/height while preserving aspect
          const aspectRatio = 1 // DALL-E images are square
          let imageWidth = maxImageWidth
          let imageHeight = maxImageWidth / aspectRatio

          // If height exceeds max, scale down based on height
          if (imageHeight > maxImageHeight) {
            imageHeight = maxImageHeight
            imageWidth = imageHeight * aspectRatio
          }

          // Center the image horizontally if it's smaller than max width
          const imageX = margin + (maxImageWidth - imageWidth) / 2

          // Add the image
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
          console.log(`✅ Image ${i + 1} added to PDF successfully`)
        } catch (error) {
          console.error('Error adding image:', error)
          // Light placeholder box
          pdf.setFillColor(245, 245, 250)
          pdf.roundedRect(margin, imageY, imageWidth, imageHeight, 2, 2, 'F')
          pdf.setDrawColor(200, 200, 200)
          pdf.setLineWidth(0.5)
          pdf.roundedRect(margin, imageY, imageWidth, imageHeight, 2, 2, 'S')

          pdf.setTextColor(150, 150, 150)
          pdf.setFontSize(12)
          pdf.setFont('helvetica', 'italic')
          pdf.text('[Illustration will appear here]', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
        }
      } else {
        // Decorative placeholder when no image (light and printable)
        pdf.setFillColor(245, 245, 250)
        pdf.roundedRect(margin, imageY, imageWidth, imageHeight, 2, 2, 'F')
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.5)
        pdf.roundedRect(margin, imageY, imageWidth, imageHeight, 2, 2, 'S')

        pdf.setTextColor(150, 150, 150)
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'italic')
        pdf.text('[Illustration will appear here]', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
      }

      // TEXT AREA (Bottom half - uses remaining space efficiently)
      const textY = imageY + imageHeight + 15
      const textAreaHeight = pageHeight - textY - 35 // Leave room for page number

      // Story text - larger font and better spacing for kids
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'normal')

      const textLines = pdf.splitTextToSize(story.pages[i].text, contentWidth - 4)
      let currentY = textY

      textLines.forEach((line: string) => {
        if (currentY < pageHeight - 35) {
          pdf.text(line, margin + 2, currentY)
          currentY += 7 // Better line spacing for readability
        }
      })

      // Decorative footer
      pdf.setDrawColor(218, 165, 32)
      pdf.setLineWidth(0.5)
      pdf.line(margin + 20, pageHeight - 25, pageWidth - margin - 20, pageHeight - 25)
    }

    // ========== BACK COVER ==========
    pdf.addPage()
    pdf.setFillColor(88, 28, 135)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // "The End" with decorative elements
    pdf.setTextColor(255, 215, 0)
    pdf.setFontSize(36)
    pdf.setFont('helvetica', 'bold')
    pdf.text('The End', pageWidth / 2, pageHeight / 2 - 20, { align: 'center' })

    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(255, 255, 255)
    pdf.text('Thank you for reading!', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' })

    pdf.setFontSize(12)
    pdf.text('May your stories always bring joy', pageWidth / 2, pageHeight / 2 + 25, { align: 'center' })

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
