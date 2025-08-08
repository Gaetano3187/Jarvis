// pages/api/ocr.js
import { IncomingForm } from 'formidable'
import fs from 'fs'

export const config = {
  api: { bodyParser: false },
  runtime: 'nodejs',            // 👈 evita Edge
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let files
  try {
    ({ files } = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ multiples: true, keepExtensions: true })
      form.parse(req, (err, _fields, files) => {
        if (err) return reject(err)
        resolve({ files })
      })
    }))
  } catch (err) {
    console.error('parse error:', err)
    return res.status(500).json({ error: String(err.message || err) })
  }

  const list = []
  const input = files.images
  if (Array.isArray(input)) list.push(...input)
  else if (input) list.push(input)

  if (list.length === 0) {
    return res.status(400).json({ error: 'Nessun file nel campo "images"' })
  }

  const results = []
  for (const u of list) {
    try {
      const buf = await fs.promises.readFile(u.filepath)
      const blob = new Blob([buf], { type: u.mimetype || 'application/octet-stream' })

      const fd = new FormData()
      fd.append('apikey', process.env.OCRSPACE_API_KEY ?? 'helloworld')
      fd.append('language', 'ita')
      fd.append('isOverlayRequired', 'false')
      fd.append('file', blob, u.originalFilename || 'upload.jpg')

      const resp = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd })
      const json = await resp.json()

      if (json?.IsErroredOnProcessing) {
        throw new Error(Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(' | ') : json.ErrorMessage || 'OCR error')
      }

      const text = (json?.ParsedResults || []).map(r => r?.ParsedText || '').join('\n').trim()
      results.push({ name: u.originalFilename || 'upload.jpg', text })
    } catch (err) {
      console.error('ocr error for', u?.originalFilename, err)
      results.push({ name: u?.originalFilename || 'upload.jpg', text: '', error: String(err.message || err) })
    } finally {
      if (u?.filepath) fs.unlink(u.filepath, () => {})
    }
  }

  const joined = results.map(r => (r.error ? '' : `### ${r.name}\n${r.text}`)).filter(Boolean).join('\n\n')

  if (!joined) {
    return res.status(500).json({ error: results.find(r => r.error)?.error || 'OCR fallito su tutti i file' })
  }

  res.status(200).json({ text: joined })
}
