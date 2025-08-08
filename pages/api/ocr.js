// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'
import sharp from 'sharp'
import Tesseract from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true, // evita warning "API resolved without sending..."
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  await new Promise((resolve) => {
    const form = new IncomingForm({
      keepExtensions: true,
      multiples: true,
      maxFileSize: 20 * 1024 * 1024, // 20MB
    })

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('⚠️ parse error:', err)
        res.status(500).json({ step: 'parse', error: err.message })
        return resolve()
      }

      try {
        console.log('➡️ OCR fields:', fields)
        console.log('➡️ OCR files keys:', Object.keys(files))

        // Supporta sia "images" che "file" come chiave
        const fileListRaw = files.images ?? files.file ?? files.upload
        if (!fileListRaw) {
          console.error('❌ Nessun file trovato (files.images | files.file | files.upload)')
          res.status(400).json({ step: 'no-file', error: 'Nessun file ricevuto' })
          return resolve()
        }

        const uploads = Array.isArray(fileListRaw) ? fileListRaw : [fileListRaw]
        let combinedText = ''

        for (const file of uploads) {
          console.log('➡️ OCR file raw object:', file)

          const imagePath =
            file.filepath || // formidable v3
            file.path ||     // versioni precedenti
            file._writeStream?.path

          if (!imagePath) {
            res.status(500).json({ step: 'no-path', error: 'imagePath undefined' })
            return resolve()
          }

          const mimetype = file.mimetype || file.type || ''
          const isPDF = mimetype === 'application/pdf' || (file.originalFilename || '').toLowerCase().endsWith('.pdf')

          // Se è un PDF, prova prima a estrarre il testo nativo (se pdf-parse è disponibile)
          if (isPDF) {
            try {
              let pdfParse
              try {
                // import dinamico: evita errori in build se il pacchetto non è installato
                pdfParse = (await import('pdf-parse')).default
              } catch {
                pdfParse = null
              }

              if (pdfParse) {
                const dataBuffer = fs.readFileSync(imagePath)
                const pdfData = await pdfParse(dataBuffer)
                if (pdfData?.text && pdfData.text.trim()) {
                  console.log('✅ PDF native text snippet:', pdfData.text.trim().slice(0, 100))
                  combinedText += pdfData.text.trim() + '\n'
                  try { fs.unlinkSync(imagePath) } catch {}
                  continue // passa al prossimo file
                }
                console.log('ℹ️ PDF senza testo nativo, passo a OCR su immagini')
              } else {
                console.log('ℹ️ pdf-parse non disponibile: salto estrazione nativa, passo a OCR')
              }
            } catch (pdfErr) {
              console.error('❌ errore pdf-parse:', pdfErr)
              // proseguiamo comunque con OCR
            }
          }

          // Preprocessing immagine
          const preprocPath = imagePath + '-pre.jpg'
          try {
            await sharp(imagePath)
              .grayscale()
              .threshold(140)
              .toFile(preprocPath)
          } catch (prepErr) {
            console.error('❌ preprocessing error:', prepErr)
            // useremo l’originale
          }

          // OCR su immagine (preprocessed o originale)
          try {
            const sourcePath = fs.existsSync(preprocPath) ? preprocPath : imagePath
            const { data: { text } } = await Tesseract.recognize(
              sourcePath,
              'ita',
              {
                tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                tessedit_char_whitelist:
                  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,-/:€ '
              }
            )
            console.log('✅ OCR snippet:', (text || '').trim().slice(0, 100))
            combinedText += (text || '').trim() + '\n'
          } catch (ocrErr) {
            console.error('❌ OCR recognize error:', ocrErr)
            res.status(500).json({ step: 'recognize', error: String(ocrErr) })
            return resolve()
          } finally {
            // pulizia temporanei
            try { fs.unlinkSync(imagePath) } catch {}
            try { fs.unlinkSync(preprocPath) } catch {}
          }
        }

        res.status(200).json({ text: combinedText.trim() })
        return resolve()
      } catch (e) {
        console.error('❌ Handler error:', e)
        res.status(500).json({ step: 'handler', error: String(e?.message || e) })
        return resolve()
      }
    })
  })
}
