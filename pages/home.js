// pages/home.js
import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'

const Home = () => {
  /* ── STATE ── */
  const [prodottiDaAcquistare, setProdotti] = useState([])   // shopping_list non acquistati
  const [scorteAlert, setScorte]            = useState([])   // inventory in esaurimento/scadenza
  const [isRec, setIsRec]                   = useState(false)
  const [loadingVoice, setLoadV]            = useState(false)
  const [loadingOCR, setLoadOCR]            = useState(false)
  const [ocrResult, setOcrResult]           = useState(null)
  const [err, setErr]                       = useState(null)

  const mediaRef   = useRef(null)
  const chunksRef  = useRef([])
  const fileRef    = useRef(null)

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

  /* ── OCR SCONTRINO ── */
  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true); setErr(null); setOcrResult(null)
    const fd = new FormData(); fd.append('image', file)
    try {
      const r    = await fetch('/api/ocr', { method: 'POST', body: fd })
      const { text } = await r.json()
      // Chiedi all'assistant di categorizzare e mostra il risultato
      const resp = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Analizza questo scontrino e restituisci SOLO un JSON con:
{categoria: "casa"|"vestiti"|"cene"|"varie", store, purchase_date (YYYY-MM-DD), price_total (numero)}
TESTO: ${text}`,
        }),
      })
      const { answer } = await resp.json()
      const clean  = answer.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setOcrResult(parsed)
    } catch (e) { setErr('OCR: ' + e.message) }
    finally { setLoadOCR(false) }
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

  /* ── SALVA RISULTATO OCR/VOCE in expenses ── */
  async function salvaRisultato() {
    if (!ocrResult) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const purchaseDate = ocrResult.purchase_date ?? new Date().toISOString().slice(0, 10)
    const storeVal     = ocrResult.store ?? 'Generico'
    const importo      = parseFloat(ocrResult.price_total ?? 0)
    const categoria    = ocrResult.categoria ?? 'varie'

    const { error } = await supabase.from('expenses').insert([{
      user_id:        user.id,
      category:       categoria,
      store:          storeVal,
      purchase_date:  purchaseDate,
      amount:         importo,
      payment_method: 'cash',
      source:         'ocr',
    }])
    if (error) { setErr(error.message); return }

    setOcrResult(null)
    alert('✅ Spesa salvata')
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

      {/* VIDEO SFONDO */}
      <video
        className="home-video"
        src="/composizione%201.mp4"
        autoPlay muted loop preload="auto"
        poster="https://play.teleporthq.io/static/svg/videoposter.svg"
      />

      {/* GRIGLIA PRINCIPALE */}
      <section className="sezione-home">

        {/* ── COLONNA SINISTRA ── */}
        <div className="col-sinistra">

          {/* Box Liste Prodotti con badge */}
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

          {/* Funzionalità Avanzate */}
          <div className="funzionalita-box">
            <h2>Funzionalità Avanzate</h2>

            <button className="ocr" onClick={() => fileRef.current?.click()} disabled={loadingOCR}>
              {loadingOCR ? '⏳ Analisi…' : '📷 OCR Scontrino'}
            </button>

            <button className="voice" onClick={isRec ? stopRec : startRec} disabled={loadingVoice}>
              {loadingVoice ? '⏳ Elaborazione…' : isRec ? '⏹ Stop registrazione' : '🎤 Comando vocale'}
            </button>

            <Link href="/dashboard" className="query">
              🔎 Interroga dati
            </Link>
          </div>

          {/* RISULTATO OCR/VOCE — mostra preview e chiede conferma */}
          {ocrResult && (
            <div className="alert-box" style={{ borderColor: '#22c55e' }}>
              <p style={{ marginBottom: '.5rem', fontWeight: 600 }}>📋 Spesa rilevata:</p>
              <p>📁 Categoria: <strong>{ocrResult.categoria}</strong></p>
              <p>🏪 Negozio: <strong>{ocrResult.store ?? '—'}</strong></p>
              <p>📅 Data: <strong>{ocrResult.purchase_date ?? '—'}</strong></p>
              <p>💶 Importo: <strong>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></p>
              {Array.isArray(ocrResult.items) && ocrResult.items.length > 0 && (
                <div style={{marginTop:'.5rem'}}>
                  <p style={{fontWeight:600}}>🛒 Prodotti ({ocrResult.items.length}):</p>
                  <ul style={{margin:'4px 0',paddingLeft:'1.2rem',fontSize:'.9rem'}}>
                    {ocrResult.items.map((it,i) => (
                      <li key={i}>{it.name} — {it.qty} {it.unit} — € {Number(it.price||0).toFixed(2)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p>📅 Data: <strong>{ocrResult.purchase_date ?? '—'}</strong></p>
              <p>💶 Importo: <strong>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></p>
              <div style={{ display: 'flex', gap: '.75rem', marginTop: '.75rem' }}>
                <button className="ocr" onClick={salvaRisultato} style={{ flex: 1 }}>✅ Salva</button>
                <button onClick={() => setOcrResult(null)} style={{ flex: 1, background: '#6b7280', color: '#fff', border: 'none', borderRadius: '.5rem', padding: '.6rem', cursor: 'pointer', fontWeight: 600 }}>✕ Annulla</button>
              </div>
            </div>
          )}

          {err && <div className="alert-box" style={{ borderColor: '#ef4444' }}><p style={{ color: '#ef4444' }}>⚠️ {err}</p></div>}

          {/* SCORTE IN ESAURIMENTO/SCADENZA */}
          {nScorte > 0 && (
            <div className="alert-box">
              <p style={{ fontWeight: 600, marginBottom: '.5rem' }}>
                ⚠️ Scorte da controllare ({nScorte})
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {scorteAlert.map(s => (
                  <li key={s.id} style={{ fontSize: '.9rem', padding: '.25rem 0', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
                    <strong>{s.name}</strong> — {s.motivo}
                  </li>
                ))}
              </ul>
              <Link href="/liste-prodotti" style={{ display: 'block', marginTop: '.75rem', color: '#00e4ff', fontSize: '.85rem' }}>
                → Aggiungi alla lista spesa
              </Link>
            </div>
          )}

        </div>
      </section>

      {/* input OCR nascosto */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={e => handleOCR(e.target.files?.[0])}
      />

      <style jsx global>{`
        .home-video {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }
        .sezione-home {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-wrap: wrap;
          gap: 2rem;
          justify-content: center;
          align-items: flex-start;
          padding: 5rem 1rem 3rem;
          font-family: Inter, sans-serif;
        }
        .col-sinistra,
        .col-destra {
          flex: 1 1 320px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .box-home {
          position: relative;
          background: #3b82f6;
          color: #fff;
          padding: 2.5rem 2rem;
          border-radius: 1rem;
          text-align: center;
          font-size: 2rem;
          font-weight: 700;
          box-shadow: 0 8px 20px rgba(0,0,0,.35);
          transition: opacity .3s, transform .2s;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: .5rem;
        }
        .box-home:hover { opacity: .85; transform: translateY(-2px); }
        .box-prodotti   { background: #22c55e; }
        .box-sub { font-size: .85rem; font-weight: 400; opacity: .85; }
        .badge {
          position: absolute;
          top: .75rem;
          right: .75rem;
          background: #ef4444;
          color: #fff;
          font-size: .8rem;
          font-weight: 700;
          width: 1.6rem;
          height: 1.6rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .funzionalita-box {
          background: rgba(0,0,0,.6);
          border-radius: 1rem;
          padding: 2rem;
          color: #fff;
          box-shadow: 0 8px 20px rgba(0,0,0,.35);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          text-align: center;
        }
        .funzionalita-box h2 { font-size: 1.5rem; margin: 0 0 .5rem; }
        .funzionalita-box a,
        .funzionalita-box button {
          display: inline-block;
          padding: .75rem 1.5rem;
          border-radius: .75rem;
          font-weight: 600;
          transition: opacity .3s;
          font-size: 1rem;
          cursor: pointer;
          border: none;
          text-decoration: none;
        }
        .funzionalita-box a:hover,
        .funzionalita-box button:hover { opacity: .8; }
        .funzionalita-box button:disabled { opacity: .5; cursor: not-allowed; }
        .ocr   { background: #f59e0b; color: #000; }
        .voice { background: #10b981; color: #fff; }
        .query { background: #6366f1; color: #fff; }

        .alert-box {
          background: rgba(0,0,0,.65);
          border: 1px solid rgba(255,165,0,.5);
          border-radius: 1rem;
          padding: 1.25rem 1.5rem;
          color: #fff;
          font-size: .95rem;
          box-shadow: 0 4px 16px rgba(0,0,0,.3);
          line-height: 1.6;
        }

        @media (max-width: 480px) {
          .box-home { font-size: 1.3rem; padding: 2rem 1.25rem; }
          .funzionalita-box { padding: 1.5rem; }
          .funzionalita-box a,
          .funzionalita-box button { font-size: .9rem; padding: .6rem 1rem; }
        }
      `}</style>
    </>
  )
}

export default withAuth(Home)

export async function getServerSideProps() {
  return { props: {} }
}
