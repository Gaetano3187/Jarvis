// pages/home.js
import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

const Home = () => {
  /* ── STATE ── */
  const [prodottiDaAcquistare, setProdotti] = useState([])
  const [scorteAlert, setScorte]            = useState([])
  const [isRec, setIsRec]                   = useState(false)
  const [loadingVoice, setLoadV]            = useState(false)
  const [loadingOCR, setLoadOCR]            = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [ocrResult, setOcrResult]           = useState(null)
  const [err, setErr]                       = useState(null)

  const mediaRef   = useRef(null)
  const chunksRef  = useRef([])

  /* ── FETCH DATI LIVE ── */
  useEffect(() => {
    fetchProdotti()
    fetchScorte()
  }, [])

  async function fetchProdotti() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('shopping_list')
      .select('id, name, list_type')
      .eq('user_id', user.id)
      .eq('purchased', false)
      .order('added_at', { ascending: true })
    setProdotti(data ?? [])
  }

  async function fetchScorte() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const today = new Date()
    const in10  = new Date(today); in10.setDate(today.getDate() + 10)

    const { data } = await supabase
      .from('inventory')
      .select('id, product_name, qty, initial_qty, expiry_date, consumed_pct')
      .eq('user_id', user.id)

    if (!data) return

    const alert = data.filter(item => {
      const pct     = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
      const expiry  = item.expiry_date ? new Date(item.expiry_date) : null
      const scaduta = expiry && expiry <= in10
      const esaurita = pct >= 80
      return scaduta || esaurita
    }).map(item => {
      const pct    = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
      const expiry = item.expiry_date ? new Date(item.expiry_date) : null
      const giorni = expiry ? Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)) : null
      return {
        id:     item.id,
        name:   item.product_name ?? 'Prodotto',
        motivo: giorni !== null && giorni <= 10
          ? `⏰ Scade in ${giorni} giorni`
          : `📉 Consumato ${Math.round(pct)}%`,
      }
    })
    setScorte(alert)
  }

  /* ── OCR SCONTRINO (GPT-4o Vision — singolo call) ── */

  // Ridimensiona l'immagine lato client prima di inviarla
  // Evita payload enormi che bloccano Chrome
  function resizeImage(file, maxPx = 1500, quality = 0.88) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const { width: w, height: h } = img
        const scale = Math.min(1, maxPx / Math.max(w, h))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(w * scale)
        canvas.height = Math.round(h * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob fallito')),
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Immagine non leggibile')) }
      img.src = url
    })
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true)
    setErr(null)
    setOcrResult(null)

    try {
      // PDF: invia direttamente senza resize
      let payload
      if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
        payload = file
      } else {
        // Ridimensiona a max 1500px — sufficiente per GPT-4o Vision sugli scontrini
        payload = await resizeImage(file, 1500, 0.88)
      }

      const fd = new FormData()
      fd.append('image', payload, file.name || 'scontrino.jpg')

      // Timeout di 55 secondi — evita freeze infinito
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 55000)

      let r
      try {
        r = await fetch('/api/ocr-smart', {
          method: 'POST',
          body: fd,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error(e.error || `Errore HTTP ${r.status}`)
      }

      const data = await r.json()
      if (!data.ok) throw new Error(data.error || 'OCR non riuscito')

      if (data.confidence === 'low') {
        setErr('⚠️ Immagine poco nitida — controlla i dati prima di salvare')
      }

      setOcrResult(data)
    } catch (e) {
      if (e.name === 'AbortError') {
        setErr('⏱ Timeout: analisi troppo lenta, riprova con un\'immagine più nitida')
      } else {
        setErr('OCR: ' + e.message)
      }
    } finally {
      setLoadOCR(false)
    }
  }

  /* ── VOCE ── */
  async function startRec() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current  = new MediaRecorder(stream)
      chunksRef.current = []
      mediaRef.current.ondataavailable = e => e.data.size && chunksRef.current.push(e.data)
      mediaRef.current.onstop = async () => {
        setLoadV(true)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const fd   = new FormData(); fd.append('audio', blob, 'audio.webm')
        try {
          const r    = await fetch('/api/stt', { method: 'POST', body: fd })
          const { text } = await r.json()
          const resp = await fetch('/api/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Analizza questo testo vocale e restituisci SOLO un JSON con:
{categoria: "casa"|"vestiti"|"cene"|"varie", store, purchase_date (YYYY-MM-DD), price_total (numero)}
TESTO: ${text}`,
            }),
          })
          const { answer } = await resp.json()
          const clean  = answer.replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(clean)
          setOcrResult(parsed)
        } catch (e) { setErr('Voce: ' + e.message) }
        finally { setLoadV(false) }
      }
      mediaRef.current.start()
      setIsRec(true)
    } catch { setErr('Microfono non disponibile') }
  }
  function stopRec() { mediaRef.current?.stop(); setIsRec(false) }

  /* ── SALVA RISULTATO OCR/VOCE ── */
  async function salvaRisultato() {
    if (!ocrResult) return
    if (saving) return
    setSaving(true)
    setErr(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta — rieffettua il login')

      const purchaseDate  = ocrResult.purchase_date ?? new Date().toISOString().slice(0, 10)
      const storeVal      = ocrResult.store ?? 'Generico'
      const storeAddress  = ocrResult.store_address ?? null
      const importo       = parseFloat(ocrResult.price_total ?? 0)
      const categoria     = ocrResult.categoria ?? 'varie'
      const paymentMethod = ocrResult.payment_method ?? 'unknown'
      const items         = Array.isArray(ocrResult.items) ? ocrResult.items : []

      // 1. Spesa principale in expenses
      const { data: expenseRow, error: expErr } = await supabase
        .from('expenses')
        .insert([{
          user_id:        user.id,
          category:       categoria,
          store:          storeVal,
          store_address:  storeAddress,
          description:    `Spesa ${storeVal} — ${purchaseDate}`,
          purchase_date:  purchaseDate,
          amount:         importo,
          payment_method: paymentMethod,
          source:         'ocr',
        }])
        .select('id')
        .single()

      if (expErr) throw new Error(`Expenses: ${expErr.message}`)
      const expenseId = expenseRow?.id

      // 2. Receipt — fallback silenzioso se la tabella non esiste ancora
      let receiptId = null
      try {
        const { data: receiptRow } = await supabase
          .from('receipts')
          .insert([{
            user_id:        user.id,
            expense_id:     expenseId,
            store:          storeVal,
            store_address:  storeAddress,
            purchase_date:  purchaseDate,
            price_total:    importo,
            payment_method: paymentMethod,
            raw_text:       ocrResult.raw_text ?? null,
            confidence:     ocrResult.confidence ?? 'medium',
          }])
          .select('id')
          .single()
        receiptId = receiptRow?.id ?? null
      } catch {}

      // 3. Receipt items — fallback silenzioso
      if (receiptId && items.length) {
        try {
          await supabase.from('receipt_items').insert(
            items.map(item => ({
              receipt_id:    receiptId,
              user_id:       user.id,
              name:          item.name,
              brand:         item.brand ?? null,
              qty:           item.qty ?? 1,
              unit:          item.unit ?? 'pz',
              unit_price:    item.unit_price ?? item.price ?? 0,
              price:         item.price ?? 0,
              category_item: item.category_item ?? 'alimentari',
              expiry_date:   item.expiry_date ?? null,
              purchase_date: purchaseDate,
            }))
          )
        } catch {}
      }

      // 4. Inventory — ogni prodotto è indipendente, errori non bloccano
      if (categoria === 'casa' && items.length) {
        for (const item of items) {
          if (!item.name) continue
          try {
            // Immagine (timeout 4s, mai bloccante)
            let imageUrl = null
            try {
              const q = encodeURIComponent(item.image_search_query || `${item.brand || ''} ${item.name}`.trim())
              const b = encodeURIComponent(item.brand || '')
              const imgResp = await fetch(`/api/product-image?q=${q}&brand=${b}`,
                { signal: AbortSignal.timeout(4000) })
              if (imgResp.ok) {
                const imgData = await imgResp.json()
                if (imgData?.ok && imgData.imageUrl) imageUrl = imgData.imageUrl
              }
            } catch {}

            const packs        = Number(item.packs || 1)
            const unitsPerPack = Number(item.units_per_pack || 1)
            const totalUnits   = Number(item.qty || packs * unitsPerPack)
            // qty in DB = unità TOTALI (es. 12 uova, non 2 confezioni)
            // packs separato per il display "N conf. × M pz"

            const inventoryQty = totalUnits  // unità fisiche totali
            const unitLabel    = item.unit_per_pack_label || item.unit || 'pz'
            const firstWord    = item.name.split(' ')[0]

            const { data: existing } = await supabase
              .from('inventory')
              .select('id, qty, initial_qty')
              .eq('user_id', user.id)
              .ilike('product_name', `%${firstWord}%`)
              .maybeSingle()

            if (existing) {
              await supabase.from('inventory').update({
                qty:            Number(existing.qty || 0) + inventoryQty,
                initial_qty:    Number(existing.initial_qty || 0) + inventoryQty,
                packs:          Number(existing.packs || 0) + packs,
                units_per_pack: unitsPerPack,
                unit_label:     unitLabel,
                consumed_pct:   0,
                avg_price:      item.unit_price || item.price || 0,
                last_updated:   new Date().toISOString(),
                ...(item.expiry_date ? { expiry_date: item.expiry_date } : {}),
                ...(imageUrl         ? { image_url: imageUrl }           : {}),
              }).eq('id', existing.id)
            } else {
              await supabase.from('inventory').insert({
                user_id:        user.id,
                product_name:   item.name,
                brand:          item.brand ?? null,
                category:       item.category_item ?? 'alimentari',
                qty:            inventoryQty,
                initial_qty:    inventoryQty,
                packs:          packs,
                unit:           item.unit ?? 'pz',
                units_per_pack: unitsPerPack,
                unit_label:     unitLabel,
                avg_price:      item.unit_price || item.price || 0,
                purchase_date:  purchaseDate,
                expiry_date:    item.expiry_date ?? null,
                consumed_pct:   0,
                ...(imageUrl ? { image_url: imageUrl } : {}),
              })
            }
          } catch (itemErr) {
            console.warn(`[inventory] skip ${item.name}:`, itemErr)
          }
        }
      }

      // 5. Pocket cash se pagamento contanti
      if (paymentMethod === 'cash' && importo > 0) {
        try {
          await supabase.from('pocket_cash').insert({
            user_id:  user.id,
            note:     `Spesa ${storeVal} (${purchaseDate})`,
            delta:    -importo,
            moved_at: new Date().toISOString(),
          })
        } catch {}
      }

      // 6. Successo
      setOcrResult(null)
      fetchScorte()
      fetchProdotti()
      alert(
        `✅ Salvato!\n🏪 ${storeVal} — ${purchaseDate}\n💶 €${importo.toFixed(2)}` +
        (items.length ? `\n🛒 ${items.length} prodotti in dispensa` : '')
      )

    } catch (e) {
      console.error('[salvaRisultato]', e)
      setErr('❌ ' + (e.message || 'Errore durante il salvataggio'))
    } finally {
      setSaving(false)
    }
  }

  /* ── CONTEGGI ── */
  const nSuper  = prodottiDaAcquistare.filter(p => p.list_type === 'supermercato').length
  const nOnline = prodottiDaAcquistare.filter(p => p.list_type === 'online').length
  const nScorte = scorteAlert.length

  /* ── UI ── */
  return (
    <>
      <Head>
        <title>Home – Jarvis</title>
        <meta property="og:title" content="Home – Jarvis" />
      </Head>

      <video
        className="home-video"
        src="/composizione%201.mp4"
        autoPlay muted loop preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      {/* OVERLAY CARICAMENTO OCR */}
      {loadingOCR && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', gap: '1rem'
        }}>
          <div style={{ fontSize: '3rem' }}>📷</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Analisi scontrino in corso…</div>
          <div style={{ fontSize: '.9rem', opacity: .7 }}>GPT-4o sta leggendo i prodotti (20–40 sec)</div>
          <div style={{
            width: '200px', height: '4px', background: 'rgba(255,255,255,.2)',
            borderRadius: '2px', overflow: 'hidden', marginTop: '.5rem'
          }}>
            <div style={{
              height: '100%', background: '#f59e0b', borderRadius: '2px',
              animation: 'ocrProgress 35s linear forwards'
            }}/>
          </div>
        </div>
      )}

      <section className="sezione-home">

        {/* ── COLONNA SINISTRA ── */}
        <div className="col-sinistra">
          <Link href="/liste-prodotti" className="box-home box-prodotti">
            🛒 LISTE PRODOTTI
            {(nSuper + nOnline) > 0 && (
              <span className="badge">{nSuper + nOnline}</span>
            )}
            {(nSuper + nOnline) > 0 && (
              <span className="box-sub">
                {nSuper > 0 && `${nSuper} supermercato`}
                {nSuper > 0 && nOnline > 0 && ' · '}
                {nOnline > 0 && `${nOnline} online`}
              </span>
            )}
          </Link>

          <Link href="/finanze" className="box-home">
            📊 FINANZE
          </Link>
        </div>

        {/* ── COLONNA DESTRA ── */}
        <div className="col-destra">

          <div className="funzionalita-box">
            <h2>Funzionalità Avanzate</h2>

            {/* label nativo — più affidabile di button.click() su Windows */}
            <label className={`ocr ocr-label${loadingOCR ? ' disabled' : ''}`}>
              {loadingOCR ? '⏳ Analisi in corso… (20–40 sec)' : '📷 OCR Scontrino'}
              {!loadingOCR && (
                <input
                  type="file"
                  style={{ display:'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) handleOCR(f)
                  }}
                />
              )}
            </label>

            <button className="voice" onClick={isRec ? stopRec : startRec} disabled={loadingVoice}>
              {loadingVoice ? '⏳ Elaborazione…' : isRec ? '⏹ Stop registrazione' : '🎤 Comando vocale'}
            </button>

            <Link href="/dashboard" className="query">
              🔎 Interroga dati
            </Link>
          </div>

          {/* PREVIEW OCR — con tutti i nuovi campi */}
          {ocrResult && (
            <div className="alert-box" style={{ borderColor: '#22c55e' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.5rem' }}>
                <p style={{ fontWeight:600, margin:0 }}>📋 Spesa rilevata</p>
                <span style={{
                  fontSize:'.75rem', padding:'2px 8px', borderRadius:'999px', fontWeight:600,
                  background: ocrResult.confidence==='high' ? '#166534' : ocrResult.confidence==='medium' ? '#92400e' : '#7f1d1d',
                  color:'#fff'
                }}>
                  {ocrResult.confidence==='high' ? '✓ Alta precisione' : ocrResult.confidence==='medium' ? '~ Media' : '⚠ Bassa'}
                </span>
              </div>

              <p>📁 Categoria: <strong>{ocrResult.categoria}</strong></p>
              <p>🏪 Negozio: <strong>{ocrResult.store ?? '—'}</strong>
                {ocrResult.store_address && (
                  <span style={{ opacity:.7, fontSize:'.85rem' }}> · {ocrResult.store_address}</span>
                )}
              </p>
              <p>📅 Data: <strong>{ocrResult.purchase_date ?? '—'}</strong></p>
              <p>💶 Totale: <strong>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></p>
              <p>💳 Pagamento: <strong>
                {ocrResult.payment_method === 'cash' ? '💵 Contanti' :
                 ocrResult.payment_method === 'card' ? '💳 Carta' : '—'}
              </strong></p>

              {Array.isArray(ocrResult.items) && ocrResult.items.length > 0 && (
                <div style={{ marginTop:'.75rem' }}>
                  <p style={{ fontWeight:600, marginBottom:'.4rem' }}>🛒 Prodotti ({ocrResult.items.length}):</p>
                  <div style={{ maxHeight:'220px', overflowY:'auto' }}>
                    {ocrResult.items.map((it, i) => (
                      <div key={i} style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'.3rem 0', borderBottom:'1px solid rgba(255,255,255,.08)',
                        fontSize:'.88rem', gap:'8px', flexWrap:'wrap'
                      }}>
                        <span style={{ flex:1, minWidth:'120px' }}>
                          {it.name}
                          {it.brand && <span style={{ opacity:.6 }}> · {it.brand}</span>}
                        </span>
                        <span style={{ opacity:.7, whiteSpace:'nowrap' }}>
                          {/* Mostra packs × units_per_pack se ha senso */}
                          {it.packs && it.units_per_pack && it.units_per_pack > 1
                            ? `${it.packs} conf. × ${it.units_per_pack} ${it.unit_per_pack_label || 'pz'}`
                            : `${it.qty || it.packs || 1} ${it.unit || 'pz'}`
                          }
                        </span>
                        {it.expiry_date && (
                          <span style={{ color:'#fbbf24', fontSize:'.8rem', whiteSpace:'nowrap' }}>
                            ⏰ {it.expiry_date}
                          </span>
                        )}
                        <span style={{ fontWeight:600, whiteSpace:'nowrap' }}>€ {Number(it.price||0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:'.75rem', marginTop:'.75rem' }}>
                <button
                  className="ocr"
                  onClick={salvaRisultato}
                  disabled={saving}
                  style={{ flex:1, opacity: saving ? .6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? '⏳ Salvataggio…' : '✅ Conferma e salva'}
                </button>
                <button
                  onClick={() => { if (!saving) setOcrResult(null) }}
                  disabled={saving}
                  style={{ flex:1, background:'#6b7280', color:'#fff', border:'none',
                    borderRadius:'.5rem', padding:'.6rem', cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight:600, opacity: saving ? .5 : 1 }}
                >
                  ✕ Annulla
                </button>
              </div>
            </div>
          )}

          {err && (
            <div className="alert-box" style={{ borderColor: '#ef4444' }}>
              <p style={{ color:'#ef4444' }}>⚠️ {err}</p>
            </div>
          )}

          {/* SCORTE IN ESAURIMENTO/SCADENZA */}
          {nScorte > 0 && (
            <div className="alert-box">
              <p style={{ fontWeight:600, marginBottom:'.5rem' }}>
                ⚠️ Scorte da controllare ({nScorte})
              </p>
              <ul style={{ margin:0, padding:0, listStyle:'none' }}>
                {scorteAlert.map(s => (
                  <li key={s.id} style={{ fontSize:'.9rem', padding:'.25rem 0', borderBottom:'1px solid rgba(255,255,255,.1)' }}>
                    <strong>{s.name}</strong> — {s.motivo}
                  </li>
                ))}
              </ul>
              <Link href="/liste-prodotti" style={{ display:'block', marginTop:'.75rem', color:'#00e4ff', fontSize:'.85rem' }}>
                → Aggiungi alla lista spesa
              </Link>
            </div>
          )}

        </div>
      </section>

      {/* input file ora è dentro il label OCR */}

      <style jsx global>{`
        .home-video {
          position: fixed; inset: 0; width: 100%; height: 100%;
          object-fit: cover; z-index: 0;
        }
        .sezione-home {
          position: relative; z-index: 1; min-height: 100vh;
          display: flex; flex-wrap: wrap; gap: 2rem;
          justify-content: center; align-items: flex-start;
          padding: 5rem 1rem 3rem; font-family: Inter, sans-serif;
        }
        .col-sinistra, .col-destra {
          flex: 1 1 320px; display: flex; flex-direction: column; gap: 1.5rem;
        }
        .box-home {
          position: relative; background: #3b82f6; color: #fff;
          padding: 2.5rem 2rem; border-radius: 1rem; text-align: center;
          font-size: 2rem; font-weight: 700; box-shadow: 0 8px 20px rgba(0,0,0,.35);
          transition: opacity .3s, transform .2s; text-decoration: none;
          display: flex; flex-direction: column; align-items: center; gap: .5rem;
        }
        .box-home:hover { opacity: .85; transform: translateY(-2px); }
        .box-prodotti   { background: #22c55e; }
        .box-sub { font-size: .85rem; font-weight: 400; opacity: .85; }
        .badge {
          position: absolute; top: .75rem; right: .75rem;
          background: #ef4444; color: #fff; font-size: .8rem; font-weight: 700;
          width: 1.6rem; height: 1.6rem; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }
        .funzionalita-box {
          background: rgba(0,0,0,.6); border-radius: 1rem; padding: 2rem;
          color: #fff; box-shadow: 0 8px 20px rgba(0,0,0,.35);
          display: flex; flex-direction: column; gap: 1rem; text-align: center;
        }
        .funzionalita-box h2 { font-size: 1.5rem; margin: 0 0 .5rem; }
        .funzionalita-box a, .funzionalita-box button {
          display: inline-block; padding: .75rem 1.5rem; border-radius: .75rem;
          font-weight: 600; transition: opacity .3s; font-size: 1rem;
          cursor: pointer; border: none; text-decoration: none;
        }
        .funzionalita-box a:hover, .funzionalita-box button:hover { opacity: .8; }
        .funzionalita-box button:disabled { opacity: .5; cursor: not-allowed; }
        .ocr   { background: #f59e0b; color: #000; }
        .ocr-label {
          display: inline-block; padding: .75rem 1.5rem; border-radius: .75rem;
          font-weight: 600; font-size: 1rem; cursor: pointer;
          background: #f59e0b; color: #000;
          transition: opacity .3s; text-align: center;
        }
        .ocr-label.disabled { opacity: .5; cursor: not-allowed; pointer-events: none; }
        .ocr-label:hover { opacity: .8; }
        .voice { background: #10b981; color: #fff; }
        .query { background: #6366f1; color: #fff; }
        .alert-box {
          background: rgba(0,0,0,.65); border: 1px solid rgba(255,165,0,.5);
          border-radius: 1rem; padding: 1.25rem 1.5rem; color: #fff;
          font-size: .95rem; box-shadow: 0 4px 16px rgba(0,0,0,.3); line-height: 1.6;
        }
        @media (max-width: 480px) {
          .box-home { font-size: 1.3rem; padding: 2rem 1.25rem; }
          .funzionalita-box { padding: 1.5rem; }
          .funzionalita-box a, .funzionalita-box button { font-size: .9rem; padding: .6rem 1rem; }
        }
        @keyframes ocrProgress {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)

export async function getServerSideProps() {
  return { props: {} }
}