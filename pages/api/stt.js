// pages/api/stt.js
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import OpenAI from 'openai'

const writeFile = promisify(fs.writeFile)
const unlink   = promisify(fs.unlink)

// In‐memory storage per multer + limite dimensione (es. 25MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result)
      resolve(result)
    })
  })
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
}

export default async function handler(req, res) {
  console.log('[STT] handler start, method=', req.method)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Metodo ${req.method} non consentito` })
  }

  // Verifica API key prima di procedere
  if (!process.env.OPENAI_API_KEY) {
    console.error('[STT] OPENAI_API_KEY mancante')
    return res.status(500).json({ error: 'Configurazione STT mancante' })
