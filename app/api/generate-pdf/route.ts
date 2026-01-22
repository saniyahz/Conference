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

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - 2 * margin

    // Title page
    pdf.setFillColor(147, 51, 234) // Purple
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(32)
    pdf.setFont('helvetica', 'bold')

    // Center the title
    const titleLines = pdf.splitTextToSize(story.title, contentWidth)
    const titleHeight = titleLines.length * 12
    const titleY = (pageHeight - titleHeight) / 2

    pdf.text(titleLines, pageWidth / 2, titleY, { align: 'center' })

    pdf.setFontSize(16)
    pdf.text('A Story Created By You', pageWidth / 2, pageHeight - 30, { align: 'center' })

    // Story pages
    for (let i = 0; i < story.pages.length; i++) {
      pdf.addPage()

      // Page background
      pdf.setFillColor(255, 251, 235) // Light yellow
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')

      // Page border
      pdf.setDrawColor(251, 191, 36) // Amber
      pdf.setLineWidth(2)
      pdf.rect(10, 10, pageWidth - 20, pageHeight - 20)

      // Page number
      pdf.setTextColor(147, 51, 234)
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Page ${i + 1}`, pageWidth / 2, 20, { align: 'center' })

      // Image
      if (story.pages[i].imageUrl) {
        try {
          const imageY = 30
          const imageHeight = 80
          const imageWidth = contentWidth
          const imageX = margin

          // Add image to PDF
          pdf.addImage(
            story.pages[i].imageUrl!,
            'PNG',
            imageX,
            imageY,
            imageWidth,
            imageHeight,
            undefined,
            'FAST'
          )
        } catch (error) {
          console.error('Error adding image to PDF:', error)
        }
      }

      // Text
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'normal')

      const textY = story.pages[i].imageUrl ? 120 : 40
      const textLines = pdf.splitTextToSize(story.pages[i].text, contentWidth - 10)

      pdf.text(textLines, pageWidth / 2, textY, {
        align: 'center',
        maxWidth: contentWidth - 10,
      })
    }

    // Final page
    pdf.addPage()
    pdf.setFillColor(147, 51, 234)
    pdf.rect(0, 0, pageWidth, pageHeight, 'F')

    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(28)
    pdf.setFont('helvetica', 'bold')
    pdf.text('The End', pageWidth / 2, pageHeight / 2 - 10, { align: 'center' })

    pdf.setFontSize(16)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Thank you for reading!', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' })

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
