// pages/spese-casa.js
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

import withAuth from '../hoc/withAuth';
import { insertExpense } from '../lib/dbHelpers';
import { supabase } from '../lib/supabaseClient';
// import { askAssistant } from '../lib/assistant';  // ← ora la chiamata passa da /api/assistant

function SpeseCasa() {
  /* ---------- STATE ---------- */
  const [spese, setSpese] = useState([]);
  const [nuovaSpesa, setNuovaSpesa] = useState({
    puntoVendita: '',
    dettaglio: '',
    prezzoTotale: '',
    quantita: '1',
    spentAt: '',
  });
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const [recBusy, setRecBusy]   = useState(false);

  /* ---------- REFS ---------- */
  const ocrInputRef    = useRef(null);
  const formRef        = useRef(null);
  const mediaRecRef    = useRef(null);
  const recordedChunks = useRef([]);

  /* ---------- EFFECT ---------- */
  useEffect(() => { fetchSpese(); }, []);

  /* ---------- LOAD ---------- */
  const fetchSpese = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('finances')
      .select('id, description, amount, qty, spent_at')
      .eq('category_id', '4cfaac74-aab4-4d96-b335-6cc64de59afc')
      .order('created_at', { ascending: false });

    if (!error) setSpese(data);
    else        setError(error.message);
    setLoading(false);
  };

  /* ---------- ADD ---------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Sessione scaduta'); return; }

    const description = `[${nuovaSpesa.puntoVendita}] ${nuovaSpesa.dettaglio}`;
    const { data, error } = await insertExpense({
      userId: user.id,
      categoryName: 'casa',
      description,
      amount: Number(nuovaSpesa.prezzoTotale),
      spentAt: nuovaSpesa.spentAt || new Date().toISOString(),
      qty: parseInt(nuovaSpesa.quantita, 10) || 1,
    });

    if (!error) {
      setSpese([...spese, data]);
      setNuovaSpesa({ puntoVendita: '', dettaglio: '', prezzoTotale: '', quantita: '1', spentAt: '' });
    } else setError(error.message);
  };

  /* ---------- DELETE ---------- */
  const handleDelete = async (id) => {
    const { error } = await supabase.from('finances').delete().eq('id', id);
    if (!error) setSpese(spese.filter(s => s.id !== id));
    else        setError(error.message);
  };

  /* ---------- OCR ---------- */
  const handleOCR = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append('image', file);
    try {
      const { text } = await (await fetch('/api/ocr', { method: 'POST', body: fd })).json();
      const sysPrompt = 'Analizza lo scontrino e restituisci JSON con: puntoVendita, dettaglio, prezzoTotale, quantita, data';
      await parseAssistantPrompt(`${sysPrompt}\n${text}`);
    } catch { setError('OCR fallito'); }
  };

  /* ---------- VOICE ---------- */
  const toggleRec = async () => {
    if (recBusy) {
      mediaRecRef.current?.stop();
      setRecBusy(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecRef.current = new MediaRecorder(stream);
      recordedChunks.current = [];
      mediaRecRef.current.ondataavailable = e => e.data.size && recordedChunks.current.push(e.data);
      mediaRecRef.current.onstop = processVoice;
      mediaRecRef.current.start();
      setRecBusy(true);
    } catch { setError('Microfono non disponibile'); }
  };

  const processVoice = async () => {
    const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
    const fd = new FormData(); fd.append('audio', blob, 'voice.webm');
    try {
      const { text } = await (await fetch('/api/stt', { method: 'POST', body: fd })).json();
      const sysPrompt = 'Estrai puntoVendita, dettaglio, prezzoTotale, quantita, data da questa frase e restituisci JSON.';
      await parseAssistantPrompt(`${sysPrompt}\n${text}`);
    } catch { setError('STT fallito'); }
  };

  /* ---------- GPT PARSER ---------- */
  const parseAssistantPrompt = async (prompt) => {
    try {
      // ---- chiamata al backend /api/assistant (server-side) ----
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { answer } = await res.json();

      const parsed  = JSON.parse(answer);
      const expenses = [];

      /* schema 1: { type:'expense', items:[...] } */
      if (parsed.type === 'expense' && Array.isArray(parsed.items)) {
        parsed.items.forEach(it => expenses.push({
          puntoVendita: it.puntoVendita || it.esercente || 'Sconosciuto',
          dettaglio:    it.dettaglio    || it.descrizione || 'spesa',
          prezzoTotale: it.prezzoTotale || it.importo     || 0,
          quantita:     it.quantita     || 1,
          spentAt:      it.data         || new Date().toISOString(),
        }));
      }

      /* schema 2: array semplice */
      if (!parsed.type && Array.isArray(parsed)) {
        parsed.forEach(r => expenses.push({
          puntoVendita: r.puntoVendita || r.store || 'Sconosciuto',
          dettaglio:    r.dettaglio    || r.item  || 'spesa',
          prezzoTotale: r.prezzoTotale || r.importo || r.prezzo || 0,
          quantita:     r.quantita     || r.qty || 1,
          spentAt:      r.data         || new Date().toISOString(),
        }));
      }

      if (!expenses.length) { setError('Risposta assistant non valida'); return; }

      /* popola form con la prima spesa */
      setNuovaSpesa({
        puntoVendita: expenses[0].puntoVendita,
        dettaglio:    expenses[0].dettaglio,
        prezzoTotale: expenses[0].prezzoTotale,
        quantita:     String(expenses[0].quantita),
        spentAt:      expenses[0].spentAt.slice(0, 10),
      });

      /* inserisce su Supabase */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const insertRows = expenses.map(r => ({
        userId: user.id,
        categoryName: 'casa',
        description: `[${r.puntoVendita}] ${r.dettaglio}`,
        amount: Number(r.prezzoTotale),
        spent_at: r.spentAt,
        qty: parseInt(r.quantita, 10),
      }));

      await supabase.from('finances').insert(insertRows);
      fetchSpese();
    } catch (err) {
      console.error(err);
      setError('Risposta assistant non valida');
    }
  };

  /* ---------- RENDER ---------- */
  /* ... TUTTO IL RESTO INVARIATO ... */
}

export default withAuth(SpeseCasa);

export async function getServerSideProps() {
  return { props: {} }
}
