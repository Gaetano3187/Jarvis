// pages/home.js
import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

/* --- Normalizza categoria spesa --- */
function normCat(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // CASA: cibo (anche da asporto/pizzerie porta via), pulizia, bollette, arredo, elettrodomestici
  if (/\b(supermercat|spesa|alimentar|cibo|frutta|verdura|carne|pesce|pane|latte|uova|pasta|riso|olio|acqua|bibite|bevande|detersiv|pulizia|ammorbident|candeggina|scottex|pannolini|bolletta|luce|gas|internet|affitto|mutuo|condomin|manutenzione|riparazione|arredo|mobile|divano|sedia|tavolo|letto|cucina|elettrodomest|lavatrice|frigorifero|forno|aspirapolvere|utensili|stoviglie|tende|coperte|lampadine|ferramenta|giardinaggio|asporto|porta.?via|take.?away|deliveroo|glovo|just.?eat)\b/.test(s)) return 'casa'
  // VESTITI
  if (/\b(vestit|abbigliam|scarpe|camicia|pantalon|maglion|giacca|cappotto|borsa|cintura|cravatta|calze|intimo|pigiama|costume|sciarpa|guanti|cappello|gioiell|orologio|zaino|valigia|moda)\b/.test(s)) return 'vestiti'
  // CENE: consumo fuori casa (NON asporto che va in casa)
  if (/\b(ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar|caffe|caffetteria|colazione|pranzo|cena|aperitiv|spritz|cocktail|digestivo|gelato|gelateria|pasticceria|panetteria|paninoteca|fast.?food)\b/.test(s)) return 'cene'
  // VARIE: tutto il resto
  return 'varie'
}

/* ─── Audio helpers ─────────────────────────────────────────────── */
function getBestMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m = '') {
  if (m.includes('mp4')) return 'voice.mp4'
  if (m.includes('ogg')) return 'voice.ogg'
  return 'voice.webm'
}

/* ─── Esegui azione agente ──────────────────────────────────────── */
async function executeAction(action, userId, router) {
  if (!action || !userId) return null
  try {
    const today = new Date().toISOString().slice(0, 10)
    switch (action.type) {
      case 'add_expense': {
        const { error } = await supabase.from('expenses').insert({
          user_id: userId, category: normCat(action.category || 'varie'),
          store: action.store || null,
          description: action.description || action.store || 'Spesa vocale',
          amount: Number(action.amount || 0), purchase_date: action.date || today,
          payment_method: action.payment_method || 'cash', source: 'voice',
        })
        if (error) throw error
        if ((action.payment_method || 'cash') === 'cash' && action.amount > 0)
          await supabase.from('pocket_cash').insert({
            user_id: userId, note: action.description || 'Spesa vocale',
            delta: -Number(action.amount), moved_at: new Date().toISOString(),
          })
        return `✓ Spesa €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_income': {
        const { error } = await supabase.from('incomes').insert({
          user_id: userId, source: action.source || 'Entrata',
          description: action.description || 'Entrata vocale',
          amount: Number(action.amount || 0),
          received_at: `${action.date || today}T12:00:00Z`,
        })
        if (error) throw error
        return `✓ Entrata €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_to_list': {
        // Guard: name può arrivare come action.name, action.item, action.product o action.product_name
        const itemName = (action.name || action.item || action.product || action.product_name || '').trim()
        if (!itemName) return '⚠️ Non ho capito il prodotto da aggiungere, riprova'
        const { error } = await supabase.from('shopping_list').insert({
          user_id: userId,
          name: itemName,
          qty: Number(action.qty || action.quantity || 1),
          unit_label: action.unit || action.unit_label || 'pz',
          list_type: action.list_type || 'supermercato',
          category: action.category || 'alimentari',
        })
        if (error) throw error
        return `✓ "${itemName}" aggiunto alla lista della spesa`
      }
      case 'add_wine': {
        const { error } = await supabase.from('wines').insert({
          user_id: userId, name: action.name, winery: action.winery || null,
          region: action.region || null, vintage: action.vintage || null,
          style: action.style || 'rosso', source: 'voice',
        })
        if (error) throw error
        return `✓ Vino "${action.name}" aggiunto`
      }
      case 'navigate':
        if (action.path) router.push(action.path)
        return null
      default: return null
    }
  } catch (e) { return '⚠️ ' + (e.message || e) }
}

/* ═══════════════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════════════ */
const Home = () => {
  const router = useRouter()
    /* ── State ── */
  const [userId,      setUserId]      = useState(null)
  const [pocketBal,   setPocketBal]   = useState(null)
  const [alertItems,  setAlertItems]  = useState([])
  const [listaSpesa,  setListaSpesa]  = useState([])
  const [showLista,   setShowLista]   = useState(false)
  const [loadingOCR,  setLoadOCR]     = useState(false)
  const [ocrResult,   setOcrResult]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState(null)

  /* Jarvis chat */
  const mediaRef    = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const [isRec,     setIsRec]     = useState(false)
  const [aibusy,    setAiBusy]    = useState(false)
  const [jarvisOpen, setJarvisOpen] = useState(false)
  const [messages,  setMessages]  = useState([
    { role: 'assistant', text: 'Ciao! Sono Jarvis. Chiedimi delle scorte, saldi, lista spesa — o di registrare una spesa.' }
  ])
  const [textInput, setTextInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  /* ── Auth + dati ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadData(user.id)
    })
    return () => {
      try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    }
  }, [])

  async function loadData(uid) {
    const today = new Date(); const in10 = new Date(); in10.setDate(today.getDate() + 10)
    const [{ data: inv }, { data: lista }, { data: pocket }] = await Promise.all([
      supabase.from('inventory').select('id,product_name,qty,initial_qty,consumed_pct,expiry_date').eq('user_id', uid),
      supabase.from('shopping_list').select('id,name,qty,unit_label,list_type,store,price').eq('user_id', uid).eq('purchased', false).order('added_at', { ascending: true }),
      supabase.from('pocket_cash').select('delta').eq('user_id', uid),
    ])
    setPocketBal((pocket || []).reduce((t, r) => t + Number(r.delta || 0), 0))
    const scorteAlert = (inv || []).filter(item => {
      const pct = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      return pct >= 80 || (exp && exp <= in10)
    }).map(item => {
      const pct = item.consumed_pct ?? 0
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      const gg  = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null
      return { id: 'inv-' + item.id, name: item.product_name ?? 'Prodotto', tag: gg !== null && gg <= 10 ? `scade in ${gg}g` : `consumato ${Math.round(pct)}%`, type: 'scorta' }
    })
    const daComprare = (lista || []).map(p => ({ id: 'shop-' + p.id, name: p.name, tag: 'da comprare', type: 'lista' }))
    setAlertItems([...scorteAlert, ...daComprare])
    setListaSpesa(lista || [])
  }


  /* ── Jarvis chat ── */
  const historyRef = useRef([])
  useEffect(() => { historyRef.current = messages.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })) }, [messages])

  const send = useCallback(async (text) => {
    if (!text.trim() || !userId) return
    setAiBusy(true)
    setMessages(p => [...p, { role: 'user', text }])
    try {
      const r = await fetch('/api/assistant-v2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, userId, conversationHistory: historyRef.current }),
      })
      const data = await r.json()
      let reply = data.text || 'Non ho capito, puoi ripetere?'
      if (data.action) { const res = await executeAction(data.action, userId, router); if (res) reply += '\n' + res }
      if (data.navigate) { setTimeout(() => router.push(data.navigate), 800); reply += '\n→ Navigo…' }
      setMessages(p => [...p, { role: 'assistant', text: reply }])
    } catch { setMessages(p => [...p, { role: 'assistant', text: '⚠️ Errore di connessione.' }]) }
    finally { setAiBusy(false) }
  }, [userId, router])

  const toggleRec = useCallback(async () => {
    if (isRec) {
      try { if (mediaRef.current?.state === 'recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; chunksRef.current = []
      const mime = getBestMimeType()
      mediaRef.current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRef.current.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      mediaRef.current.onstop = async () => {
        try {
          const t0 = Date.now()
          while (!chunksRef.current.length && Date.now() - t0 < 1500) await new Promise(r => setTimeout(r, 60))
          if (!chunksRef.current.length) throw new Error('Nessun audio')
          const am = mediaRef.current?.mimeType || mime || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: am })
          if (blob.size < 500) throw new Error('Audio troppo corto')
          setAiBusy(true)
          const fd = new FormData(); fd.append('audio', blob, extForMime(am))
          const r = await fetch('/api/stt', { method: 'POST', body: fd })
          const j = await r.json().catch(() => ({}))
          if (!r.ok || !j?.text) throw new Error('Trascrizione fallita')
          await send(String(j.text || '').trim())
        } catch (e) { setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (e.message || 'Errore') }]) }
        finally {
          setAiBusy(false)
          try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
          streamRef.current = null
        }
      }
      mediaRef.current.start(250); setIsRec(true); setJarvisOpen(true)
    } catch (err) {
      setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (err?.name === 'NotAllowedError' ? 'Microfono non autorizzato' : 'Microfono non disponibile') }])
    }
  }, [isRec, send])

  useEffect(() => { if (!isRec) return; return () => { try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {} } }, [isRec])

  const onSubmit = e => { e.preventDefault(); if (!textInput.trim() || aibusy) return; const t = textInput.trim(); setTextInput(''); send(t) }

  /* ── OCR ── */
  function resizeImage(file, maxPx = 1500, q = .88) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const s = Math.min(1, maxPx / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', q)
      }
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')) }
      img.src = url
    })
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true); setErr(null); setOcrResult(null)
    try {
      const pl = (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) ? file : await resizeImage(file)

      // ocr-universal: riconosce tipo (scontrino/vino/fattura) + categoria in un'unica chiamata
      const fd = new FormData(); fd.append('image', pl, file.name || 'foto.jpg')
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 65000)
      let r; try { r = await fetch('/api/ocr-universal', { method: 'POST', body: fd, signal: ctrl.signal }) } finally { clearTimeout(t) }
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`) }
      const data = await r.json()

      if (!data.doc_type || data.doc_type === 'unknown')
        throw new Error('Documento non riconoscibile — riprova con una foto più nitida')

      if (data.confidence === 'low') setErr('⚠️ Immagine poco nitida — controlla i dati')
      setOcrResult(data)

    } catch (e) { setErr(e.name === 'AbortError' ? '⏱ Timeout — riprova' : 'OCR: ' + e.message) }
    finally { setLoadOCR(false) }
  }


  async function salvaRisultato() {
    if (!ocrResult || saving) return; setSaving(true); setErr(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const docType = ocrResult.doc_type || 'receipt'

      // ── ETICHETTA VINO ──
      if (docType === 'wine_label') {
        const { data: newWine, error: wErr } = await supabase.from('wines').insert([{
          user_id: user.id,
          name: ocrResult.name || 'Vino (da etichetta)',
          winery: ocrResult.winery || null,
          denomination: ocrResult.denomination || null,
          region: ocrResult.region || null,
          vintage: ocrResult.vintage || null,
          alcohol: ocrResult.alcohol || null,
          style: ocrResult.style || 'rosso',
          grapes: ocrResult.grapes?.length ? ocrResult.grapes : null,
          source: 'ocr',
        }]).select().single()
        if (wErr) throw new Error(wErr.message)
        // Geocodifica origine
        try {
          const geoQ = [ocrResult.locality, ocrResult.winery, ocrResult.region].filter(Boolean).join(' ')
          if (geoQ.trim()) {
            const geoR = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQ)}&limit=1`)
            const geoJ = await geoR.json()
            if (Array.isArray(geoJ) && geoJ.length) {
              await supabase.from('product_places').insert([{
                user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'origin',
                place_name: ocrResult.locality || geoJ[0].display_name,
                lat: Number(geoJ[0].lat), lng: Number(geoJ[0].lon), is_primary: true,
              }])
            }
          }
        } catch {}
        // GPS dove lo bevo
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }))
          await supabase.from('product_places').insert([{
            user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
            place_name: null, lat: pos.coords.latitude, lng: pos.coords.longitude, is_primary: true,
          }])
        } catch {}
        setOcrResult(null)
        alert(`✅ Vino salvato!\n🍷 ${ocrResult.name || 'Vino'}${ocrResult.winery ? '\n🏠 ' + ocrResult.winery : ''}${ocrResult.vintage ? '\n📅 ' + ocrResult.vintage : ''}`)
        return
      }

      // ── SCONTRINO / FATTURA ──
      const pd = ocrResult.purchase_date ?? new Date().toISOString().slice(0, 10)
      const st = ocrResult.store ?? 'Generico'
      const im = parseFloat(ocrResult.price_total ?? 0)
      const cat = normCat(ocrResult.categoria ?? 'varie')
      const pm = ocrResult.payment_method ?? 'unknown'
      const items = Array.isArray(ocrResult.items) ? ocrResult.items : []

      const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
        user_id: user.id, category: cat, store: st,
        store_address: ocrResult.store_address ?? null,
        description: `Spesa ${st} — ${pd}`,
        purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)

      let recId = null
      try {
        const { data: rr } = await supabase.from('receipts').insert([{
          user_id: user.id, expense_id: expRow?.id, store: st,
          store_address: ocrResult.store_address ?? null,
          purchase_date: pd, price_total: im, payment_method: pm,
          raw_text: ocrResult.raw_text ?? null, confidence: ocrResult.confidence ?? 'medium',
        }]).select('id').single(); recId = rr?.id ?? null
      } catch {}

      if (recId && items.length) try {
        await supabase.from('receipt_items').insert(items.map(it => ({
          receipt_id: recId, user_id: user.id, name: it.name,
          brand: it.brand ?? null, qty: it.qty ?? 1, unit: it.unit ?? 'pz',
          unit_price: it.unit_price ?? it.price ?? 0, price: it.price ?? 0,
          category_item: it.category_item ?? 'alimentari',
          expiry_date: it.expiry_date ?? null, purchase_date: pd,
        })))
      } catch {}

      // Aggiorna inventory per TUTTI i prodotti alimentari (non solo categoria casa)
      // casa = supermercato → inventory; cene = fuori casa → no inventory
      const itemsForInventory = items.filter(it => it.name && it.category_item !== 'altro')
      if (cat === 'casa' && itemsForInventory.length) for (const item of itemsForInventory) {
        try {
          const tot          = Number(item.qty || 1)
          const perishable   = item.perishable_type || 'standard'
          const catItem      = item.category_item   || 'alimentari'
          // Expiry: usa quella dello scontrino, oppure 2gg auto per freschi
          const expiryAuto   = perishable === 'fresh' && !item.expiry_date
            ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
            : (item.expiry_date ?? null)

          // Cerca per le prime 2 parole del nome (più preciso di 1 sola)
          const searchKey = item.name.split(' ').slice(0,2).join(' ')
          const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
            .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()

          if (ex) {
            // Prodotto esistente: aggiorna quantità
            await supabase.from('inventory').update({
              qty:         Number(ex.qty || 0) + tot,
              initial_qty: Number(ex.initial_qty || 0) + tot,
              consumed_pct: 0,
              avg_price:   item.unit_price || item.price || 0,
              last_updated: new Date().toISOString(),
              perishable_type: perishable,
              ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
            }).eq('id', ex.id)
          } else {
            // Prodotto nuovo: inserisci
            await supabase.from('inventory').insert({
              user_id:        user.id,
              product_name:   item.name,
              brand:          item.brand ?? null,
              category:       catItem,
              qty:            tot,
              initial_qty:    tot,
              avg_price:      item.unit_price || item.price || 0,
              purchase_date:  pd,
              expiry_date:    expiryAuto,
              consumed_pct:   0,
              perishable_type: perishable,
            })
          }
        } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
      }

      // ── Spunta automatica lista spesa ──
      // Per ogni prodotto acquistato, cerca nella lista e spunta purchased=true
      if (items.length) {
        try {
          const { data: listaAperta } = await supabase
            .from('shopping_list')
            .select('id, name')
            .eq('user_id', user.id)
            .eq('purchased', false)

          if (listaAperta?.length) {
            const daSpuntare = []
            for (const item of items) {
              if (!item.name) continue
              const parola = item.name.split(' ')[0].toLowerCase()
              const match = listaAperta.find(l =>
                l.name.toLowerCase().includes(parola) ||
                parola.includes(l.name.toLowerCase().split(' ')[0])
              )
              if (match && !daSpuntare.includes(match.id))
                daSpuntare.push(match.id)
            }
            if (daSpuntare.length) {
              await supabase
                .from('shopping_list')
                .update({ purchased: true, updated_at: new Date().toISOString() })
                .in('id', daSpuntare)
            }
          }
        } catch (listErr) { console.warn('[lista] spunta skip:', listErr?.message) }
      }

      if (pm === 'cash' && im > 0) try {
        await supabase.from('pocket_cash').insert({
          user_id: user.id, note: `Spesa ${st} (${pd})`,
          delta: -im, moved_at: new Date().toISOString(),
        })
      } catch {}

      setOcrResult(null); if (userId) loadData(userId)
      alert(`✅ Salvato!\n🏪 ${st} — ${pd}\n💶 €${im.toFixed(2)}${items.length ? `\n🛒 ${items.length} prodotti` : ''}`)

    } catch (e) { setErr('❌ ' + (e.message || 'Errore')) }
    finally { setSaving(false) }
  }

  const nAlert = alertItems.length

  /* ══ RENDER ══ */
  return (
    <>
      <Head><title>Home – Jarvis</title></Head>

      {/* OCR overlay */}
      {loadingOCR && (
        <div className="ocr-overlay">
          <div className="ocr-ov-icon">📷</div>
          <div className="ocr-ov-title">Analisi immagine…</div>
          <div className="ocr-ov-sub">GPT-4o riconosce il documento</div>
          <div className="ocr-prog-track"><div className="ocr-prog-fill" /></div>
        </div>
      )}

      <div className="home-wrap">

        {/* ══ HERO LOGO ══ */}
        <div className="hero">
          <div className="logo-wrap">
            <div className="logo-halo logo-halo-a" />
            <div className="logo-halo logo-halo-b" />
            <div className="logo-halo logo-halo-c" />
            <div className="logo-inner">
              <span className="logo-j">J</span><span className="logo-arvis">ARVIS</span>
            </div>
          </div>
          <div className="hero-tagline">
            <span className="tagline-dot" />
            SMART HOME ASSISTANT
            <span className="tagline-dot" />
          </div>
        </div>

        {/* ══ KPI ══ */}
        <div className="kpi-row">
          <div className="kpi kpi-cyan">
            <div className="kpi-icon-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#22d3ee" strokeWidth="1.5"/>
                <path d="M12 7v5l3 3" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="kpi-label">In tasca</div>
              <div className="kpi-val">{pocketBal !== null ? `€ ${pocketBal.toFixed(2)}` : '—'}</div>
            </div>
          </div>

          <button className={`kpi kpi-alert ${nAlert > 0 ? 'kpi-alert--active' : ''}`} onClick={() => setShowLista(v => !v)}>
            <div className="kpi-icon-wrap">
              {nAlert > 0
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 20h20L12 2z" stroke="#f87171" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 9v5M12 17v.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              }
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="kpi-label">Scorte & Acquisti</div>
              <div className="kpi-val" style={{ color: nAlert > 0 ? '#f87171' : '#22c55e' }}>
                {nAlert > 0 ? `${nAlert} in alert` : 'Tutto ok'}
              </div>
            </div>
            <span className="kpi-chevron">{showLista ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* Lista dropdown */}
        {showLista && (
          <div className="lista-drop">
            {alertItems.length === 0
              ? <div className="lista-empty">Nessun alert — ottimo!</div>
              : alertItems.map(item => (
                <div key={item.id} className={`lista-row ${item.type === 'lista' ? 'row-buy' : 'row-alert'}`}>
                  <span className="lista-name">{item.name}</span>
                  <span className="lista-tag">{item.tag}</span>
                </div>
              ))
            }
            <Link href="/liste-prodotti" className="lista-cta">Vai alla lista completa →</Link>
          </div>
        )}

        {/* ══ ZONA COMANDO ══ */}
        <div className="cmd-zone">

          {/* PULSANTE AI — effetto plasma */}
          <button
            className={`cmd-ai ${jarvisOpen ? 'cmd-ai--open' : ''} ${isRec ? 'cmd-ai--rec' : ''} ${aibusy ? 'cmd-ai--busy' : ''}`}
            onClick={() => { setJarvisOpen(v => !v); if (isRec) toggleRec() }}
          >
            {/* Anelli plasma */}
            <span className="ai-plasma ai-plasma-1" />
            <span className="ai-plasma ai-plasma-2" />
            <span className="ai-plasma ai-plasma-3" />
            {/* Core */}
            <span className="ai-core">
              <span className="ai-core-inner">AI</span>
            </span>
            <span className="ai-label-wrap">
              <span className="ai-name">Jarvis</span>
              <span className="ai-status">
                {isRec ? '● In ascolto' : aibusy ? '◌ Elaboro…' : 'Assistente vocale'}
              </span>
            </span>
            {/* Particelle decorative */}
            <span className="ai-spark ai-spark-1" />
            <span className="ai-spark ai-spark-2" />
            <span className="ai-spark ai-spark-3" />
          </button>

          {/* PULSANTE OCR — effetto scan */}
          <label className={`cmd-ocr ${loadingOCR ? 'cmd-ocr--busy' : ''}`}>
            <span className="ocr-scan ocr-scan-h" />
            <span className="ocr-scan ocr-scan-v" />
            <span className="ocr-qr-wrap">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="ocr-qr-svg">
                <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.6"/>
                <rect x="3.5" y="3.5" width="5" height="5" rx=".5" fill="#f59e0b" fillOpacity=".35"/>
                <rect x="14" y="2" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.6"/>
                <rect x="15.5" y="3.5" width="5" height="5" rx=".5" fill="#f59e0b" fillOpacity=".35"/>
                <rect x="2" y="14" width="8" height="8" rx="1.5" stroke="#f59e0b" strokeWidth="1.6"/>
                <rect x="3.5" y="15.5" width="5" height="5" rx=".5" fill="#f59e0b" fillOpacity=".35"/>
                <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z" fill="#f59e0b"/>
              </svg>
            </span>
            <span className="ocr-label-wrap">
              <span className="ocr-name">Scontrino</span>
              <span className="ocr-status">{loadingOCR ? 'Analisi…' : 'Scansiona OCR'}</span>
            </span>
            {!loadingOCR && (
              <input type="file" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleOCR(f) }} />
            )}
          </label>
        </div>

        {/* ══ CHAT JARVIS ══ */}
        {jarvisOpen && (
          <div className="chat-panel">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
                  {m.role === 'assistant' && <span className="chat-av">J</span>}
                  <div className="chat-bubble">
                    {m.text.split('\n').map((l, li) => <p key={li} style={{ margin: li > 0 ? '3px 0 0' : 0 }}>{l}</p>)}
                  </div>
                </div>
              ))}
              {aibusy && (
                <div className="chat-msg msg-ai">
                  <span className="chat-av">J</span>
                  <div className="chat-bubble chat-typing"><span /><span /><span /></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggerimenti */}
            <div className="chat-sugs">
              {['Quante scorte ho?', 'Qual è il mio saldo?', 'Cosa devo comprare?', 'Dove conviene il latte?', 'Ho speso 30€ al supermercato', 'Ho incassato 100€'].map(s => (
                <button key={s} className="sug-pill" onClick={() => !aibusy && send(s)} disabled={aibusy}>{s}</button>
              ))}
            </div>

            {/* Input */}
            <form className="chat-form" onSubmit={onSubmit}>
              <button type="button" className={`chat-mic-btn ${isRec ? 'mic-rec' : ''}`}
                onClick={toggleRec} disabled={aibusy && !isRec}>
                {isRec ? '⏹' : '🎙'}
              </button>
              <input className="chat-inp" value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Scrivi o usa il microfono…"
                disabled={aibusy || isRec} />
              <button type="submit" className="chat-send"
                disabled={!textInput.trim() || aibusy || isRec}>↑</button>
            </form>
          </div>
        )}

        {/* OCR preview */}
        {ocrResult && (
          <div className="ocr-prev">
            <div className="ocr-prev-head">
              {ocrResult.doc_type === 'wine_label'
                ? <span>🍷 Etichetta vino rilevata</span>
                : <span>📋 {ocrResult.doc_type === 'invoice' ? 'Fattura' : 'Scontrino'} rilevato</span>
              }
              {ocrResult.confidence && (
                <span className={`conf ${ocrResult.confidence === 'high' ? 'conf-hi' : ocrResult.confidence === 'medium' ? 'conf-md' : 'conf-lo'}`}>
                  {ocrResult.confidence === 'high' ? '✓ Alta' : ocrResult.confidence === 'medium' ? '~ Media' : '⚠ Bassa'}
                </span>
              )}
            </div>
            <div className="ocr-prev-rows">
              {ocrResult.doc_type === 'wine_label' ? <>
                <div className="ocr-row"><span>Vino</span><strong>{ocrResult.name ?? '—'}</strong></div>
                <div className="ocr-row"><span>Cantina</span><strong>{ocrResult.winery ?? '—'}</strong></div>
                <div className="ocr-row"><span>Località</span><strong>{ocrResult.locality ?? ocrResult.region ?? '—'}</strong></div>
                {ocrResult.vintage && <div className="ocr-row"><span>Annata</span><strong>{ocrResult.vintage}</strong></div>}
                {ocrResult.alcohol && <div className="ocr-row"><span>Alcol</span><strong>{ocrResult.alcohol}%</strong></div>}
                {ocrResult.denomination && <div className="ocr-row"><span>Denominazione</span><strong>{ocrResult.denomination}</strong></div>}
              </> : <>
                <div className="ocr-row"><span>Negozio</span><strong>{ocrResult.store ?? '—'}</strong></div>
                <div className="ocr-row"><span>Data</span><strong>{ocrResult.purchase_date ?? '—'}</strong></div>
                <div className="ocr-row"><span>Totale</span><strong style={{ color: '#22c55e' }}>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></div>
                <div className="ocr-row"><span>Categoria</span><strong>{ocrResult.categoria ?? '—'}</strong></div>
                {Array.isArray(ocrResult.items) && ocrResult.items.length > 0 && (
                  <div className="ocr-row"><span>Prodotti</span><strong>{ocrResult.items.length} articoli</strong></div>
                )}
              </>}
            </div>
            <div className="ocr-prev-btns">
              <button className="ocr-save" onClick={salvaRisultato} disabled={saving}>
                {saving ? '⏳ Salvataggio…' : ocrResult.doc_type === 'wine_label' ? '🍷 Salva vino' : '✅ Conferma e salva'}
              </button>
              <button className="ocr-cancel" onClick={() => !saving && setOcrResult(null)} disabled={saving}>✕</button>
            </div>
          </div>
        )}

        {err && <div className="err-box">{err}</div>}

      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        
        

        .home-wrap {
          position: relative; z-index: 1; min-height: 100vh;
          display: flex; flex-direction: column; align-items: center; gap: 1.1rem;
          padding: 2.5rem 1rem 3rem; font-family: Inter, system-ui, sans-serif;
          max-width: 680px; margin: 0 auto;
          background: linear-gradient(180deg, #2aa9a9 0%, #114a52 38%, #0b2b31 100%);
          background-attachment: fixed;
        }

        /* ══ HERO ══ */
        .hero { display: flex; flex-direction: column; align-items: center; gap: .5rem; }
        .logo-wrap { position: relative; display: flex; align-items: center; justify-content: center; padding: 1.2rem 2rem; }

        .logo-halo {
          position: absolute; border-radius: 50%; pointer-events: none;
          border: 1px solid rgba(34,211,238,.18);
        }
        .logo-halo-a { width: 260px; height: 52px; animation: halo 3s ease-in-out infinite; }
        .logo-halo-b { width: 320px; height: 42px; border-color: rgba(34,211,238,.1); animation: halo 3s ease-in-out infinite .5s; }
        .logo-halo-c { width: 200px; height: 64px; border-color: rgba(56,189,248,.12); animation: halo 4s ease-in-out infinite 1s; }
        @keyframes halo { 0%,100%{opacity:.3;transform:scaleX(1)} 50%{opacity:1;transform:scaleX(1.04)} }

        .logo-inner { position: relative; display: flex; align-items: baseline; z-index: 1; }
        .logo-j {
          font-family: 'Orbitron', monospace; font-size: 5rem; font-weight: 900; color: #fff; line-height: 1;
          text-shadow: 0 0 16px rgba(34,211,238,.9), 0 0 40px rgba(34,211,238,.6), 0 0 80px rgba(34,211,238,.3);
          animation: glowJ 2.5s ease-in-out infinite;
        }
        .logo-arvis {
          font-family: 'Orbitron', monospace; font-size: 5rem; font-weight: 900; line-height: 1;
          background: linear-gradient(90deg,#5eead4,#22d3ee,#38bdf8,#22d3ee,#5eead4);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: shimmer 2.8s linear infinite; letter-spacing: 3px;
        }
        @keyframes glowJ {
          0%,100%{text-shadow:0 0 14px rgba(34,211,238,.8),0 0 32px rgba(34,211,238,.4)}
          50%{text-shadow:0 0 30px rgba(34,211,238,1),0 0 60px rgba(34,211,238,.7),0 0 100px rgba(56,189,248,.5)}
        }
        @keyframes shimmer { to { background-position: 200% center; } }

        .hero-tagline {
          display: flex; align-items: center; gap: .5rem;
          font-size: .62rem; letter-spacing: .45em; color: rgba(34,211,238,.45); text-transform: uppercase;
        }
        .tagline-dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(34,211,238,.5); }

        /* ══ KPI ══ */
        .kpi-row { display: flex; gap: .7rem; width: 100%; }
        .kpi {
          flex: 1; display: flex; align-items: center; gap: .65rem;
          background: rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px; padding: .8rem 1rem; text-align: left;
        }
        button.kpi { cursor: pointer; transition: border-color .15s, background .15s; }
        button.kpi:hover { background: rgba(255,255,255,.04); }
        .kpi-cyan { border-color: rgba(34,211,238,.25) !important; }
        .kpi-alert { border-color: rgba(255,255,255,.08); }
        .kpi-alert--active { border-color: rgba(239,68,68,.3) !important; }
        .kpi-icon-wrap { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; }
        .kpi-label { font-size: .64rem; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: .12rem; }
        .kpi-val { font-size: .95rem; font-weight: 700; color: #e2e8f0; }
        .kpi-chevron { margin-left: auto; font-size: .65rem; color: #334155; }

        /* ── Lista drop ── */
        .lista-drop {
          width: 100%; background: rgba(0,0,0,.75); border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px; overflow: hidden; animation: slideDown .18s ease;
        }
        @keyframes slideDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .lista-row { display: flex; align-items: center; justify-content: space-between; padding: .5rem .9rem; border-bottom: 1px solid rgba(255,255,255,.04); font-size: .8rem; }
        .row-buy  { border-left: 2px solid rgba(6,182,212,.4); }
        .row-alert{ border-left: 2px solid rgba(239,68,68,.4); }
        .lista-name { color: #e2e8f0; }
        .lista-tag  { font-size: .68rem; color: #475569; background: rgba(255,255,255,.05); border-radius: 4px; padding: .1rem .4rem; }
        .lista-empty{ padding: .9rem; text-align: center; font-size: .8rem; color: #334155; }
        .lista-cta  { display: block; padding: .55rem .9rem; text-align: center; font-size: .75rem; color: #22d3ee; border-top: 1px solid rgba(255,255,255,.06); text-decoration: none; }
        .lista-cta:hover { background: rgba(34,211,238,.04); }

        /* ══ ZONA COMANDO ══ */
        .cmd-zone { display: flex; gap: .75rem; width: 100%; }

        /* ── Pulsante AI ── */
        .cmd-ai {
          flex: 1; position: relative; display: flex; align-items: center; gap: .9rem;
          background: rgba(0,6,15,.8); border: 1px solid rgba(34,211,238,.3);
          border-radius: 18px; padding: 1rem 1.2rem;
          cursor: pointer; overflow: hidden; isolation: isolate;
          transition: border-color .2s, box-shadow .2s;
        }
        .cmd-ai:hover { border-color: rgba(34,211,238,.6); box-shadow: 0 0 24px -6px rgba(34,211,238,.4); }
        .cmd-ai--open { border-color: rgba(34,211,238,.7); box-shadow: 0 0 30px -4px rgba(34,211,238,.5); }
        .cmd-ai--rec  { border-color: rgba(239,68,68,.6) !important; box-shadow: 0 0 24px -4px rgba(239,68,68,.4) !important; }
        .cmd-ai--busy { border-color: rgba(251,191,36,.4) !important; }

        /* Anelli plasma */
        .ai-plasma {
          position: absolute; border-radius: 50%; pointer-events: none;
          border: 1px solid rgba(34,211,238,.25); top: 50%; left: 28px;
        }
        .ai-plasma-1 { width: 52px; height: 52px; transform: translate(-50%,-50%); animation: plasma 2s ease-in-out infinite; }
        .ai-plasma-2 { width: 40px; height: 40px; transform: translate(-50%,-50%); animation: plasma 2s ease-in-out infinite .3s; border-color: rgba(34,211,238,.4); }
        .ai-plasma-3 { width: 28px; height: 28px; transform: translate(-50%,-50%); animation: plasma 2s ease-in-out infinite .6s; border-color: rgba(34,211,238,.6); }
        @keyframes plasma { 0%,100%{opacity:.4;transform:translate(-50%,-50%)scale(1)} 50%{opacity:1;transform:translate(-50%,-50%)scale(1.12)} }

        .ai-core {
          position: relative; z-index: 1; width: 36px; height: 36px; flex-shrink: 0;
          border-radius: 50%; border: 1px solid rgba(34,211,238,.5);
          background: radial-gradient(circle,rgba(34,211,238,.25),rgba(0,6,15,.8));
          display: flex; align-items: center; justify-content: center;
          animation: coreGlow 2s ease-in-out infinite;
        }
        @keyframes coreGlow { 0%,100%{box-shadow:0 0 8px rgba(34,211,238,.4)} 50%{box-shadow:0 0 20px rgba(34,211,238,.8),0 0 40px rgba(34,211,238,.3)} }
        .ai-core-inner { font-family: 'Orbitron',monospace; font-size: .5rem; font-weight: 900; color: #22d3ee; letter-spacing: 1px; }

        .ai-label-wrap { display: flex; flex-direction: column; gap: .1rem; position: relative; z-index: 1; }
        .ai-name   { font-family: 'Orbitron',monospace; font-size: .88rem; font-weight: 900; color: #22d3ee; letter-spacing: 2px; }
        .ai-status { font-size: .68rem; color: #475569; }

        /* Scintille decorative */
        .ai-spark {
          position: absolute; width: 3px; height: 3px; border-radius: 50%;
          background: rgba(34,211,238,.8); pointer-events: none;
          animation: spark 3s ease-in-out infinite;
        }
        .ai-spark-1 { top: 20%; right: 18%; animation-delay: 0s; }
        .ai-spark-2 { top: 65%; right: 25%; animation-delay: 1s; }
        .ai-spark-3 { top: 40%; right: 12%; animation-delay: 2s; }
        @keyframes spark { 0%,100%{opacity:0;transform:scale(.5)} 40%,60%{opacity:1;transform:scale(1)} }

        /* ── Pulsante OCR ── */
        .cmd-ocr {
          flex: 1; position: relative; display: flex; align-items: center; gap: .9rem;
          background: rgba(15,8,0,.8); border: 1px solid rgba(245,158,11,.3);
          border-radius: 18px; padding: 1rem 1.2rem;
          cursor: pointer; overflow: hidden; isolation: isolate;
          transition: border-color .2s, box-shadow .2s;
        }
        .cmd-ocr:hover { border-color: rgba(245,158,11,.65); box-shadow: 0 0 24px -6px rgba(245,158,11,.4); }
        .cmd-ocr--busy { opacity: .6; pointer-events: none; }

        /* Linee scan animate */
        .ocr-scan {
          position: absolute; background: rgba(245,158,11,.35); pointer-events: none;
        }
        .ocr-scan-h { height: 1px; left: 0; right: 0; top: 35%; animation: scanH 2.5s linear infinite; }
        .ocr-scan-v { width: 1px; top: 0; bottom: 0; left: 30%; animation: scanV 3s linear infinite .8s; }
        @keyframes scanH { 0%{top:15%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{top:85%;opacity:0} }
        @keyframes scanV { 0%{left:15%;opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{left:85%;opacity:0} }

        .ocr-qr-wrap {
          position: relative; z-index: 1; width: 36px; height: 36px; flex-shrink: 0;
          border-radius: 10px; border: 1px solid rgba(245,158,11,.4);
          background: rgba(245,158,11,.08);
          display: flex; align-items: center; justify-content: center;
          animation: qrGlow 2.5s ease-in-out infinite;
        }
        @keyframes qrGlow { 0%,100%{box-shadow:0 0 6px rgba(245,158,11,.3)} 50%{box-shadow:0 0 18px rgba(245,158,11,.7),0 0 32px rgba(245,158,11,.2)} }
        .ocr-qr-svg { animation: qrSpin 8s linear infinite; }
        @keyframes qrSpin { 0%,90%{transform:rotate(0)} 95%{transform:rotate(3deg)} 100%{transform:rotate(0)} }

        .ocr-label-wrap { display: flex; flex-direction: column; gap: .1rem; position: relative; z-index: 1; }
        .ocr-name   { font-family: 'Orbitron',monospace; font-size: .88rem; font-weight: 900; color: #fbbf24; letter-spacing: 2px; }
        .ocr-status { font-size: .68rem; color: #475569; }

        /* ══ CHAT ══ */
        .chat-panel {
          width: 100%; background: rgba(0,4,12,.85);
          border: 1px solid rgba(34,211,238,.2); border-radius: 18px; overflow: hidden;
          animation: slideDown .2s ease;
        }
        .chat-messages { max-height: 280px; overflow-y: auto; padding: .7rem .9rem; display: flex; flex-direction: column; gap: .5rem; }
        .chat-msg { display: flex; align-items: flex-start; gap: .4rem; }
        .msg-ai   { flex-direction: row; }
        .msg-user { flex-direction: row-reverse; }
        .chat-av  { width: 20px; height: 20px; border-radius: 50%; background: rgba(34,211,238,.12); border: 1px solid rgba(34,211,238,.3); display: flex; align-items: center; justify-content: center; font-size: .55rem; font-weight: 900; color: #22d3ee; flex-shrink: 0; margin-top: 2px; }
        .chat-bubble { max-width: 88%; padding: .45rem .7rem; border-radius: 10px; font-size: .8rem; line-height: 1.5; color: #e2e8f0; }
        .msg-ai   .chat-bubble { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.07); }
        .msg-user .chat-bubble { background: rgba(99,102,241,.2); border: 1px solid rgba(99,102,241,.3); color: #c7d2fe; }
        .chat-typing { display: flex; gap: 4px; align-items: center; }
        .chat-typing span { width: 5px; height: 5px; border-radius: 50%; background: #22d3ee; animation: typing .9s infinite; }
        .chat-typing span:nth-child(2){animation-delay:.2s} .chat-typing span:nth-child(3){animation-delay:.4s}
        @keyframes typing { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }

        .chat-sugs { display: flex; flex-wrap: wrap; gap: .3rem; padding: .4rem .7rem; border-top: 1px solid rgba(255,255,255,.05); }
        .sug-pill { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; color: #475569; font-size: .67rem; padding: .2rem .55rem; cursor: pointer; white-space: nowrap; transition: color .15s,border-color .15s; }
        .sug-pill:hover:not(:disabled) { color: #22d3ee; border-color: rgba(34,211,238,.3); }
        .sug-pill:disabled { opacity: .4; cursor: not-allowed; }

        .chat-form { display: flex; gap: .4rem; padding: .5rem .7rem; border-top: 1px solid rgba(255,255,255,.05); }
        .chat-mic-btn { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.3); border-radius: 8px; color: #22d3ee; width: 34px; height: 34px; cursor: pointer; font-size: .9rem; flex-shrink: 0; }
        .mic-rec { background: rgba(239,68,68,.2) !important; border-color: rgba(239,68,68,.4) !important; color: #f87171 !important; animation: pulsRec 1s ease-in-out infinite; }
        @keyframes pulsRec { 0%,100%{opacity:1} 50%{opacity:.5} }
        .chat-inp { flex: 1; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: #e2e8f0; padding: .38rem .65rem; font-size: .8rem; outline: none; }
        .chat-inp:focus { border-color: rgba(34,211,238,.4); }
        .chat-send { background: rgba(34,211,238,.15); border: 1px solid rgba(34,211,238,.3); border-radius: 8px; color: #22d3ee; width: 32px; cursor: pointer; font-size: .9rem; }
        .chat-send:disabled { opacity: .3; cursor: not-allowed; }

        /* ══ OCR PREVIEW ══ */
        .ocr-prev { width: 100%; background: rgba(0,0,0,.75); border: 1px solid rgba(34,197,94,.25); border-radius: 16px; padding: .9rem 1rem; }
        .ocr-prev-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .65rem; font-size: .85rem; font-weight: 600; color: #e2e8f0; }
        .conf { font-size: .67rem; padding: .17rem .5rem; border-radius: 20px; font-weight: 700; }
        .conf-hi { background: rgba(34,197,94,.15); color: #22c55e; }
        .conf-md { background: rgba(251,191,36,.15); color: #fbbf24; }
        .conf-lo { background: rgba(239,68,68,.15); color: #f87171; }
        .ocr-prev-rows { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .65rem; }
        .ocr-row { display: flex; justify-content: space-between; font-size: .8rem; }
        .ocr-row span { color: #475569; } .ocr-row strong { color: #e2e8f0; }
        .ocr-prev-btns { display: flex; gap: .6rem; }
        .ocr-save { flex: 1; background: #22c55e; border: none; border-radius: 10px; color: #fff; font-size: .8rem; font-weight: 700; padding: .5rem; cursor: pointer; }
        .ocr-save:disabled { opacity: .5; cursor: not-allowed; }
        .ocr-cancel { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; color: #64748b; font-size: .8rem; padding: .5rem .8rem; cursor: pointer; }

        /* OCR overlay */
        .ocr-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.82); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .8rem; color: #fff; }
        .ocr-ov-icon { font-size: 2.5rem; }
        .ocr-ov-title { font-size: 1rem; font-weight: 700; }
        .ocr-ov-sub { font-size: .8rem; opacity: .6; }
        .ocr-prog-track { width: 160px; height: 3px; background: rgba(255,255,255,.12); border-radius: 2px; overflow: hidden; }
        .ocr-prog-fill { height: 100%; background: #f59e0b; border-radius: 2px; animation: ocrProg 35s linear forwards; }
        @keyframes ocrProg { from{width:0} to{width:100%} }

        .err-box { width: 100%; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25); border-radius: 12px; padding: .7rem .9rem; color: #f87171; font-size: .8rem; }

        @media (max-width: 480px) {
          .logo-j, .logo-arvis { font-size: 3.5rem; }
          .cmd-zone { flex-direction: column; }
          .kpi-row  { flex-direction: column; }
          .home-wrap { padding: 2rem .75rem 3rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .logo-halo,.logo-j,.logo-arvis,.ai-plasma,.ai-core,.ai-spark,
          .ocr-scan,.ocr-qr-wrap,.ocr-qr-svg { animation: none !important; }
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)
export async function getServerSideProps() { return { props: {} } }