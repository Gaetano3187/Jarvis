// pages/liste-prodotti.js
import { useState, useEffect, useRef } from 'react';
import Head  from 'next/head';
import Link  from 'next/link';

import { supabase } from '../lib/supabaseClient';
import { askAssistant, parseAssistant } from '@/lib/assistant';


/* costanti */
const LISTA_SUPER  = 'supermercato';
const LISTA_ONLINE = 'online';

/* ——————————————————————————————————————————————————————————————— */
export default function ListeProdotti() {
  /* state */
  const [input,  setInput]  = useState('');
  const [active, setActive] = useState(LISTA_SUPER);
  const [items,  setItems]  = useState({ [LISTA_SUPER]: [], [LISTA_ONLINE]: [] });

  const [scorte,        setScorte]   = useState([]);
  const [inEsaurimento, setInEsaur]  = useState([]);
  const [offerte,       setOfferte]  = useState([]);

  const [isRec, setIsRec]      = useState(false);
  const [loadingVoice, setLV]  = useState(false);
  const [loadingOCR,  setLOCR] = useState(false);
  const [err, setErr]          = useState(null);

  /* refs */
  const mediaRef  = useRef(null);
  const chunksRef = useRef([]);
  const ocrTarget = useRef(null);

  /* ─── mount: carica liste ───────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at');

      if (data) groupAndSet(data);
    })();
  }, []);

  const groupAndSet = rows => {
    const g = { [LISTA_SUPER]: [], [LISTA_ONLINE]: [] };
    rows.forEach(r => g[r.list_type]?.push(r));
    setItems(g);
  };

  /* ─── helper DB --------------------------------------------------------- */
  const addMany = async (names, listType) => {
    if (!names.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('Utente non loggato'); return; }

    const { error } = await supabase.from('lists').insert(
      names.map(n => ({
        name       : n,
        list_type  : listType,
        user_id    : user.id,
        acquired   : false,
        created_at : new Date().toISOString(),
      }))
    );
    if (error) { setErr(error.message); return; }

    setItems(p => ({
      ...p,
      [listType]: [
        ...p[listType],
        ...names.map((n, i) => ({
          id   : `tmp-${Date.now()}-${i}`,
          name : n,
          acquired: false,
          list_type: listType,
        })),
      ],
    }));
    setInput('');
  };

  /* ─── assistant --------------------------------------------------------- */

  const parseJson = (answer, fallback) => {
    try {
      const s = answer.indexOf('{');
      const e = answer.lastIndexOf('}');
      if (s > -1 && e > -1) {
        const j = JSON.parse(answer.slice(s, e + 1));

        if (j.type === 'shopping_list' && Array.isArray(j.prodotti)) {
          const t = j.lista === LISTA_ONLINE ? LISTA_ONLINE : LISTA_SUPER;
          return { listType: t, names: j.prodotti.map(p => p.nome) };
        }
        if (Array.isArray(j)) return { listType: fallback, names: j };
      }
    } catch {/* ignore */}
    return {
      listType: fallback,
      names   : answer.split('\n').map(t => t.trim()).filter(Boolean),
    };
  };

  const handleAI = async (prompt, listType) => {
    try {
      const ans   = await askAssistant(prompt);
      const { names } = parseJson(ans, listType);
      await addMany(names, listType);
    } catch (e) { setErr(e.message); }
  };


  /* ─── manuale ----------------------------------------------------------- */
  const handleAdd = listType => {
    if (!input.trim()) return;
    const names = input.split('\n').map(t => t.trim()).filter(Boolean);
    addMany(names, listType);
  };

  /* ─── voce -------------------------------------------------------------- */
  const startRec = async listType => {
    setIsRec(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current  = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRef.current.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
      mediaRef.current.onstop          = onStop(listType);
      mediaRef.current.start();
    } catch (err) {
      console.error(err);
      setIsRec(false);
      setErr('Microfono non disponibile o permesso negato');
    }
  };
  const stopRec = () => mediaRef.current?.stop();

  const onStop = listType => async () => {
    setLV(true);
    const fd = new FormData();
    fd.append('audio', new Blob(chunksRef.current, { type: 'audio/webm' }), 'rec.webm');

    try {
      const r = await fetch('/api/stt', { method: 'POST', body: fd });
      const { text } = await r.json();
      const fd = new FormData();
    fd.append('audio', blob, 'voice.webm');
      await handleAI(text, listType);
    } catch (e) { setErr(e.message); }
    setLV(false);
    setIsRec(false);
  };

  /* ─── OCR --------------------------------------------------------------- */
  const handleOCR = async (file, listType) => {
    if (!file) return;
    setLOCR(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r   = await fetch('/api/ocr', { method: 'POST', body: fd });
      const { text } = await r.json();
      await handleAI(text, listType);
    } catch (e) { setErr(e.message); }
    setLOCR(false);
  };

  /* ─── toggle / delete --------------------------------------------------- */
  const toggle = async it => {
    const { error } = await supabase
      .from('lists')
      .update({ acquired: !it.acquired })
      .eq('id', it.id);

    if (!error) {
      setItems(p => {
        const copy = { ...p };
        copy[it.list_type] = copy[it.list_type].map(x =>
          x.id === it.id ? { ...x, acquired: !x.acquired } : x
        );
        return copy;
      });
    }
  };

  const del = async it => {
    const { error } = await supabase.from('lists').delete().eq('id', it.id);
    if (!error) {
      setItems(p => {
        const copy = { ...p };
        copy[it.list_type] = copy[it.list_type].filter(x => x.id !== it.id);
        return copy;
      });
    }
  };

  /* ─── JSX UI ------------------------------------------------------------ */
  return (
    <>
      <Head><title>Liste Prodotti</title></Head>

      <section className="spese-section">
        {/* === LISTA SUPERMERCATO ========================================= */}
        <div className="spese-box">
          <h2>🛒 Lista Supermercato</h2>

          <textarea
            rows={4}
            value={active === LISTA_SUPER ? input : ''}
            onChange={e => { setActive(LISTA_SUPER); setInput(e.target.value); }}
            placeholder="Aggiungi manualmente…"
          />

          <div className="spese-buttons">
            <button className="btn-add" onClick={() => handleAdd(LISTA_SUPER)}>➕ Aggiungi</button>

            <button
              className="btn-voice"
              onClick={() => (isRec ? stopRec() : startRec(LISTA_SUPER))}
            >
              {isRec ? '⏹ Stop' : '🎙 Vocale'}
            </button>

            <label
              htmlFor="ocr-super"
              className="btn-ocr"
              onClick={() => { ocrTarget.current = LISTA_SUPER; }}
            >
              📷 OCR
            </label>
          </div>

          <input
            id="ocr-super"
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={e => handleOCR(e.target.files?.[0], LISTA_SUPER)}
          />

          <ul className="react-list">
            {items[LISTA_SUPER].map(it => (
              <li key={it.id}>
                <span className={it.acquired ? 'cross' : ''}>{it.name}</span>
                <button onClick={() => toggle(it)}>{it.acquired ? '↩︎' : '✔︎'}</button>
                <button onClick={() => del(it)}>🗑</button>
              </li>
            ))}
            {items[LISTA_SUPER].length === 0 && (
              <li className="placeholder">Nessun prodotto ancora</li>
            )}
          </ul>
        </div>

        {/* === LISTA ONLINE ================================================ */}
        <div className="spese-box">
          <h2>🛍 Lista Spesa Online</h2>

          <textarea
            rows={4}
            value={active === LISTA_ONLINE ? input : ''}
            onChange={e => { setActive(LISTA_ONLINE); setInput(e.target.value); }}
            placeholder="Parla o incolla qui i prodotti…"
          />

          <div className="spese-buttons">
            <button className="btn-add" onClick={() => handleAdd(LISTA_ONLINE)}>➕ Aggiungi</button>

            <button
              className="btn-voice"
              onClick={() => (isRec ? stopRec() : startRec(LISTA_ONLINE))}
            >
              {isRec ? '⏹ Stop' : '🎙 Vocale'}
            </button>

            <label
              htmlFor="ocr-online"
              className="btn-ocr"
              onClick={() => { ocrTarget.current = LISTA_ONLINE; }}
            >
              📷 OCR
            </label>

            <a
              href="https://operator.chatgpt.com/"
              target="_blank"
              rel="noreferrer"
              className="btn-operator"
            >
              🌐 Collega a Operator
            </a>
          </div>

          <input
            id="ocr-online"
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={e => handleOCR(e.target.files?.[0], LISTA_ONLINE)}
          />

          <ul className="react-list">
            {items[LISTA_ONLINE].map(it => (
              <li key={it.id}>
                <span className={it.acquired ? 'cross' : ''}>{it.name}</span>
                <button onClick={() => toggle(it)}>{it.acquired ? '↩︎' : '✔︎'}</button>
                <button onClick={() => del(it)}>🗑</button>
              </li>
            ))}
            {items[LISTA_ONLINE].length === 0 && (
              <li className="placeholder">Nessun prodotto ancora</li>
            )}
          </ul>
        </div>

        {/* === PRODOTTI IN ESAURIMENTO ===================================== */}
        <div className="spese-box">
          <h2>📦 Prodotti in esaurimento / scadenza</h2>
          <ul className="react-list">
            {inEsaurimento.map((p, i) => (
              <li key={i}>
                <span>{p.name}</span>
                <small style={{ opacity: .7 }}>{p.motivo}</small>
                <button className="btn-add" onClick={() => addMany([p.name], LISTA_SUPER)}>➕</button>
              </li>
            ))}
            {!inEsaurimento.length && <li>Nessun prodotto critico</li>}
          </ul>
        </div>

        {/* === STATO SCORTE =============================================== */}
        <div className="spese-box">
          <h2>📊 Stato Scorte</h2>
          <div className="scorte-grid">
            {scorte.map((s, i) => (
              <div key={i}>
                <strong>{s.name}</strong><br />
                Quantità: {s.qty} • Consumo: {s.consumoPct} %<br />
                Scadenza: {s.scadenza}
              </div>
            ))}
            {!scorte.length && <p style={{ opacity: .7 }}>Nessun dato scorte</p>}
          </div>
        </div>

        {/* === REPORT OFFERTE ============================================= */}
        <div className="spese-box">
          <h2>📈 Report Offerte settimanali</h2>
          <p style={{ marginBottom: '1rem' }}>Risultati provenienti da Operator.</p>
          <ul className="react-list">
            {offerte.map((o, i) => (
              <li key={i}>
                <span>{o.name} – € {o.prezzo}</span>
                {o.link && <a href={o.link} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>Vedi</a>}
              </li>
            ))}
            {!offerte.length && <li>Nessuna offerta trovata</li>}
          </ul>
          <div className="spese-buttons">
            <button className="btn-yellow" onClick={() => { /* trigger Operator fetch */ }}>
              🧠 Interroga offerte
            </button>
          </div>
        </div>

        {(loadingVoice || loadingOCR) && <p>Caricamento…</p>}
        {err && <p style={{ color: 'red' }}>{err}</p>}

        <Link href="/" className="btn-operator" style={{ marginTop: '2rem' }}>
          🏠 Home
        </Link>
      </section>

      {/* === STILI IN-LINE (identici all’originale) ====================== */}
      <style jsx>{`
        .spese-section{
          padding:4rem 1rem;
          display:flex;
          flex-direction:column;
          gap:3rem;
          font-family:Inter,sans-serif;
          max-width:1000px;
          margin:auto;
        }
        .spese-box{
          background:rgba(0,0,0,.6);
          padding:2rem;
          border-radius:1rem;
          color:#fff;
          width:100%;
          box-sizing:border-box;
        }
        .spese-box h2{font-size:1.5rem;margin-bottom:1rem}
        textarea{
          width:100%;
          margin-top:1rem;
          padding:.75rem;
          border-radius:.5rem;
          font-size:1rem;
          resize:vertical;
          background:#ffffff10;
          color:#fff;
          border:none;
        }
        .spese-buttons{
          margin-top:1rem;
          display:flex;
          gap:1rem;
          flex-wrap:wrap;
        }
        .spese-buttons button,.spese-buttons a{
          padding:.75rem 1.5rem;
          border-radius:.5rem;
          font-weight:600;
          font-size:1rem;
          box-shadow:0 2px 8px rgba(0,0,0,.2);
          transition:opacity .3s;
          border:none;
          cursor:pointer;
          text-decoration:none;
        }
        .btn-add     {background:#22c55e;color:#fff}
        .btn-voice   {background:#10b981;color:#fff}
        .btn-ocr     {background:#f43f5e;color:#fff}
        .btn-operator{background:#6366f1;color:#fff}
        .btn-alert   {background:#ef4444;color:#fff}
        .btn-yellow  {background:#facc15;color:#000}
        .spese-buttons button:hover,
        .spese-buttons a:hover{opacity:.85}
        .react-list{margin-top:1.2rem;list-style:none;padding:0}
        .react-list li{
          display:flex;
          align-items:center;
          justify-content:space-between;
          background:#ffffff0d;
          margin-bottom:.5rem;
          padding:.5rem .75rem;
          border-radius:.5rem;
        }
        .react-list li span.cross{text-decoration:line-through;opacity:.7}
        .react-list li button{
          background:none;
          border:none;
          color:#fff;
          font-size:1.1rem;
          cursor:pointer;
        }
        .scorte-grid{
          display:flex;
          gap:1rem;
          flex-wrap:wrap;
          margin-top:1rem;
        }
        .scorte-grid>div{
          flex:1 1 200px;
          background:#1f2937;
          padding:1rem;
          border-radius:.5rem;
        }
        @media(max-width:768px){
          .spese-section{padding:2rem 1rem}
          .spese-box{padding:1.5rem}
          textarea{font-size:.95rem}
          .spese-buttons button,
          .spese-buttons a{
            font-size:.95rem;
            padding:.6rem 1rem;
          }
        }
      `}</style>
    </>
  );
}


