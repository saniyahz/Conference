import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import { Story } from '@/app/page'

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
    const margin = 25
    const contentWidth = pageWidth - 2 * margin

    // ========== COVER PAGE ==========
    // Gradient background effect with multiple rectangles
    pdf.setFillColor(88, 28, 135) // Deep purple
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    // Decorative stars
    pdf.setFillColor(255, 215, 0) // Gold
    const stars = [
      { x: 30, y: 40 }, { x: 180, y: 50 }, { x: 40, y: 220 },
      { x: 170, y: 240 }, { x: 105, y: 30 }
    ]
    stars.forEach(star => {
      pdf.circle(star.x, star.y, 2, 'F')
    })

    // Title box
    pdf.setFillColor(255, 255, 255, 0.95)
    pdf.roundedRect(20, 80, pageWidth - 40, 90, 5, 5, 'F')

    // Title
    pdf.setTextColor(88, 28, 135)
    pdf.setFontSize(28)
    pdf.setFont('helvetica', 'bold')

    const titleLines = pdf.splitTextToSize(story.title, contentWidth - 20)
    const titleStartY = 110
    titleLines.forEach((line: string, index: number) => {
      pdf.text(line, pageWidth / 2, titleStartY + (index * 12), { align: 'center' })
    })

    // Subtitle
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(120, 60, 150)
    pdf.text('A Magical Story Created Just For You', pageWidth / 2, 145, { align: 'center' })

    // Date
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(255, 255, 255)
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    pdf.text(today, pageWidth / 2, pageHeight - 20, { align: 'center' })

    // ========== STORY PAGES ==========
    for (let i = 0; i < story.pages.length; i++) {
      pdf.addPage()

      // Page background - soft gradient effect
      pdf.setFillColor(255, 250, 240) // Warm ivory
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')

      // Decorative border
      pdf.setDrawColor(218, 165, 32) // Goldenrod
      pdf.setLineWidth(1.5)
      pdf.roundedRect(15, 15, pageWidth - 30, pageHeight - 30, 3, 3, 'S')

      // Inner decorative line
      pdf.setDrawColor(255, 215, 0) // Gold
      pdf.setLineWidth(0.5)
      pdf.roundedRect(18, 18, pageWidth - 36, pageHeight - 36, 2, 2, 'S')

      // Page number circle
      pdf.setFillColor(88, 28, 135)
      pdf.circle(pageWidth / 2, 25, 8, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${i + 1}`, pageWidth / 2, 27, { align: 'center' })

      // Image placeholder (decorative frame if no image)
      const imageY = 40
      const imageHeight = 85
      const imageWidth = contentWidth - 10

      if (story.pages[i].imageUrl) {
        try {
          pdf.setFillColor(255, 255, 255)
          pdf.roundedRect(margin + 5, imageY, imageWidth, imageHeight, 3, 3, 'F')

          pdf.addImage(
            story.pages[i].imageUrl!,
            'PNG',
            margin + 5,
            imageY,
            imageWidth,
            imageHeight,
            undefined,
            'FAST'
          )

          // Image border
          pdf.setDrawColor(218, 165, 32)
          pdf.setLineWidth(2)
          pdf.roundedRect(margin + 5, imageY, imageWidth, imageHeight, 3, 3, 'S')
        } catch (error) {
          console.error('Error adding image:', error)
          // Draw decorative placeholder
          pdf.setFillColor(240, 230, 255)
          pdf.roundedRect(margin + 5, imageY, imageWidth, imageHeight, 3, 3, 'F')
          pdf.setTextColor(150, 150, 150)
          pdf.setFontSize(14)
          pdf.text('Imagine the scene', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
        }
      } else {
        // Decorative placeholder when no image
        pdf.setFillColor(240, 230, 255)
        pdf.roundedRect(margin + 5, imageY, imageWidth, imageHeight, 3, 3, 'F')
        pdf.setDrawColor(180, 150, 200)
        pdf.setLineWidth(1)
        pdf.roundedRect(margin + 5, imageY, imageWidth, imageHeight, 3, 3, 'S')
        pdf.setTextColor(150, 120, 180)
        pdf.setFontSize(16)
        pdf.text('Let Your Imagination Soar', pageWidth / 2, imageY + imageHeight / 2, { align: 'center' })
      }

      // Story text box
      const textY = imageY + imageHeight + 15
      pdf.setFillColor(255, 255, 255, 0.9)
      pdf.roundedRect(margin, textY, contentWidth, 75, 3, 3, 'F')

      // Text content
      pdf.setTextColor(40, 40, 40)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'normal')

      const textLines = pdf.splitTextToSize(story.pages[i].text, contentWidth - 10)
      let currentY = textY + 10

      textLines.forEach((line: string) => {
        if (currentY < pageHeight - 40) {
          pdf.text(line, margin + 5, currentY)
          currentY += 6
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

    // More decorative stars on back
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
