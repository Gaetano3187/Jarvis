// pages/api/wine-pairing-flow.js
// Flusso abbinamento vino da home:
//   confirm_take  → salva vino + luoghi + schedula notifica voto 30min
//   submit_feedback → salva voti vino + qualità consiglio sommelier
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'it', 'User-Agent': 'Jarvis/1.0' } }
    )
    const j = await r.json()
    const addr = j?.address || {}
    const local = j?.name || addr.amenity || addr.shop || addr.tourism || addr.leisure || ''
    const road  = addr.road || addr.pedestrian || ''
    const city  = addr.city || addr.town || addr.village || ''
    return [local, road, city].filter(Boolean).join(', ') || j?.display_name || null
  } catch { return null }
}

async function searchGeocode(query) {
  if (!query?.trim()) return null
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      { headers: { 'User-Agent': 'Jarvis/1.0' } }
    )
    const j = await r.json()
    if (Array.isArray(j) && j.length)
      return { name: j[0].display_name, lat: Number(j[0].lat), lng: Number(j[0].lon) }
  } catch {}
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action, userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId richiesto' })

  try {
    // ── STEP 1: utente dice "prendo il N" ─────────────────────────
    if (action === 'confirm_take') {
      const { wineRec, lat, lng, price, sommelierQuery } = req.body
      if (!wineRec?.name) return res.status(400).json({ error: 'wineRec.name richiesto' })

      // Geocodifica luogo d'acquisto/consumo
      let purchaseName = null
      if (lat && lng) purchaseName = await reverseGeocode(lat, lng)

      // Geocodifica origine vino
      let originLat = null, originLng = null, originName = null
      const originQuery = [wineRec.winery, wineRec.region, wineRec.denomination]
        .filter(Boolean).join(' ')
      if (originQuery) {
        const orig = await searchGeocode(originQuery)
        if (orig) { originLat = orig.lat; originLng = orig.lng; originName = orig.name }
      }

      // Salva vino in wines
      const { data: newWine, error: wErr } = await sb.from('wines').insert({
        user_id:      userId,
        name:         wineRec.name.trim(),
        winery:       wineRec.winery       || null,
        denomination: wineRec.denomination || null,
        region:       wineRec.region       || null,
        style:        wineRec.style        || 'rosso',
        price_target: price || wineRec.typical_price_eur || null,
        source:       'sommelier',
      }).select().single()
      if (wErr) throw wErr

      // Salva luoghi
      const places = []
      if (originLat && originLng) places.push({
        user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'origin',
        place_name: originName, lat: originLat, lng: originLng, is_primary: true
      })
      if (lat && lng) places.push({
        user_id: userId, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
        place_name: purchaseName || `(${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`,
        lat: Number(lat), lng: Number(lng), is_primary: true
      })
      if (places.length) await sb.from('product_places').insert(places)

      // Crea feedback parziale
      const { data: feedback, error: fbErr } = await sb.from('wine_feedback').insert({
        user_id:            userId,
        wine_id:            newWine.id,
        sommelier_query:    sommelierQuery || null,
        sommelier_rec_name: wineRec.name,
        price_paid:         price ? Number(price) : null,
        place_name:         purchaseName,
        lat:                lat ? Number(lat) : null,
        lng:                lng ? Number(lng) : null,
        drunk_at:           new Date().toISOString(),
      }).select().single()
      if (fbErr) throw fbErr

      // Schedula notifica voto tra 30 minuti
      const voteAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      await sb.from('notification_queue').insert({
        user_id:      userId,
        type:         'wine_vote',
        payload:      { wine_id: newWine.id, wine_name: newWine.name, feedback_id: feedback.id, place: purchaseName },
        scheduled_at: voteAt,
      })

      return res.status(200).json({
        wine: newWine, feedback_id: feedback.id,
        notification_at: voteAt,
        place_name:  purchaseName,
        origin_name: originName,
        text: `✅ ${newWine.name} aggiunto ai tuoi vini!\n📍 Dove: ${purchaseName || '—'}\n🗺️ Origine: ${originName || '—'}\n\n⏰ Tra 30 minuti ti chiederò di votarlo!`
      })
    }

    // ── STEP 2: utente vota il vino ────────────────────────────────
    if (action === 'submit_feedback') {
      const { feedbackId, ratingWine, ratingAdvice, notes } = req.body
      if (!feedbackId) return res.status(400).json({ error: 'feedbackId richiesto' })

      const { data: fb, error: fbErr } = await sb.from('wine_feedback')
        .update({
          rating_wine:   ratingWine   ? Number(ratingWine)   : null,
          rating_advice: ratingAdvice ? Number(ratingAdvice) : null,
          notes:         notes        || null,
        })
        .eq('id', feedbackId).eq('user_id', userId)
        .select('wine_id, wine:wines(name)').single()
      if (fbErr) throw fbErr

      // Aggiorna rating del vino
      if (ratingWine && fb.wine_id)
        await sb.from('wines').update({ rating_5: Number(ratingWine) }).eq('id', fb.wine_id).eq('user_id', userId)

      // Marca notifica come inviata
      await sb.from('notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('user_id', userId).eq('type', 'wine_vote')
        .contains('payload', { feedback_id: feedbackId })

      const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0))
      return res.status(200).json({
        text: `🍷 Voto salvato per ${fb.wine?.name || 'il vino'}!\nVino: ${stars(ratingWine)} · Consiglio: ${stars(ratingAdvice)}\n\nGrazie! Ogni voto migliora i consigli futuri. 🎯`
      })
    }

    return res.status(400).json({ error: `action non supportata: ${action}` })
  } catch (e) {
    console.error('[wine-pairing-flow]', action, e?.message)
    return res.status(500).json({ error: e?.message || 'Errore interno' })
  }
}