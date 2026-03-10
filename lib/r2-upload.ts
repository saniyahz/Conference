// ─────────────────────────────────────────────────
// Cloudflare R2 PDF Upload (S3-compatible)
// Used to host print-ready PDFs for Gelato to download
// ─────────────────────────────────────────────────

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

/**
 * Upload a print-ready PDF to Cloudflare R2.
 * Returns the publicly accessible URL for the print provider to download.
 *
 * @param suffix - Optional suffix before .pdf extension.
 *   Default '' → print-orders/{orderId}.pdf (backward-compatible for Gelato)
 *   '-interior' → print-orders/{orderId}-interior.pdf (Lulu interior)
 *   '-cover'    → print-orders/{orderId}-cover.pdf (Lulu cover)
 */
export async function uploadPrintPdf(
  pdfBuffer: Buffer,
  orderId: string,
  suffix: string = ''
): Promise<string> {
  const bucketName = process.env.R2_BUCKET_NAME
  const publicUrl = process.env.R2_PUBLIC_URL

  if (!bucketName || !publicUrl) {
    throw new Error('R2 bucket config missing. Set R2_BUCKET_NAME and R2_PUBLIC_URL.')
  }

  const key = `print-orders/${orderId}${suffix}.pdf`
  const client = getR2Client()

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    })
  )

  return `${publicUrl}/${key}`
}
