import { supabase } from '../supabase/supabaseClient.js';
import OpenAI from 'openai';
import { callAssistant } from '../lib/openaiAssistant.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ============================================================
   LISTA SPESA
============================================================ */

export async function aggiungiProdotto({
  nome_prodotto = '',
  lista = 'supermercato',
  quantita = 1,
  testo = '',
} = {}) {
  // Se arriva solo testo, chiediamo all’Assistant di estrarre i dati
  if (testo && !nome_prodotto) {
    const messages = [
      {
        role: 'system',
        content:
          'Estrai un JSON { "nome": string, "quantita": number } dal testo.',
      },
      { role: 'user', content: testo },
    ];

    const assistantResponse = await askAssistant(messages);

    try {
      const parsed = JSON.parse(assistantResponse);
      nome_prodotto = parsed.nome || parsed.prodotto || nome_prodotto;
      quantita = parsed.quantita || quantita;
    } catch (e) {
      // fallback: usa direttamente il testo come nome prodotto
      nome_prodotto = testo;
    }
  }

  if (!nome_prodotto) throw new Error('Nome prodotto mancante');

  const { error } = await supabase
    .from('shopping_list')
    .insert([{ nome_prodotto, lista, quantita, acquistato: false }]);
  if (error) throw new Error(error.message);

  return { ok: true, nome_prodotto, quantita };
}

export async function rimuoviProdottoLista({ nome_prodotto, lista }) {
  const { error } = await supabase
    .from('shopping_list')
    .delete()
    .eq('nome_prodotto', nome_prodotto)
    .eq('lista', lista);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function segnaProdottoAcquistato({
  nome_prodotto,
  lista,
  quantita,
  prezzo,
  data_acquisto = new Date().toISOString(),
}) {
  const { error: updErr } = await supabase
    .from('shopping_list')
    .update({ acquistato: true })
    .eq('nome_prodotto', nome_prodotto)
    .eq('lista', lista);
  if (updErr) throw new Error(updErr.message);

  const { error: finErr } = await supabase.from('expenses').insert([
    {
      descrizione: nome_prodotto,
      importo: prezzo * quantita,
      categoria: lista === 'supermercato' ? 'varie' : 'online',
      data: data_acquisto,
    },
  ]);

  const { error: scorteErr } = await supabase
    .from('scorte')
    .upsert(
      {
        nome_prodotto,
        quantita,
        quantita_iniziale: quantita,
        ultima_rilevazione: data_acquisto,
      },
      { onConflict: 'nome_prodotto' }
    );

  if (finErr || scorteErr) throw new Error(finErr?.message || scorteErr?.message);
  return { ok: true };
}

export async function getListaProdotti(lista) {
  const { data, error } = await supabase
    .from('shopping_list')
    .select('*')
    .eq('lista', lista)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/* ============================================================
   VOCALE
============================================================ */

export async function vocale({ audioBase64, testo = '' } = {}) {
  // Se non abbiamo testo, trascriviamo l'audio con Whisper
  if (!testo && audioBase64) {
    const transcript = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioBase64,
      response_format: 'text',
    });
    testo = transcript.text || transcript;
  }

  if (!testo) throw new Error('Nessun testo o audio fornito');

  // Riutilizziamo la logica di aggiungiProdotto
  return await aggiungiProdotto({ testo });
}

/* ============================================================
   OCR
============================================================ */

export async function analizzaScontrinoOCR({
  nome_file,
  origine,
  lista_destinazione,
}) {
  const prodottiEstratti = await fakeOcrService(nome_file);

  const finanzaRows = prodottiEstratti.map((p) => ({
    descrizione: p.nome,
    importo: p.prezzo * p.quantita,
    categoria: lista_destinazione === 'supermercato' ? 'varie' : 'online',
    data: new Date().toISOString(),
  }));

  const scorteRows = prodottiEstratti.map((p) => ({
    nome_prodotto: p.nome,
    quantita: p.quantita,
    quantita_iniziale: p.quantita,
    data_scadenza: p.scadenza,
  }));

  const listaRows = prodottiEstratti.map((p) => ({
    nome_prodotto: p.nome,
    lista: lista_destinazione,
    quantita: p.quantita,
    acquistato: true,
  }));

  const [finErr, scorteErr, listaErr] = await Promise.all([
    supabase.from('expenses').insert(finanzaRows),
    supabase.from('scorte').upsert(scorteRows, { onConflict: 'nome_prodotto' }),
    supabase.from('shopping_list').insert(listaRows),
  ]).then((res) => res.map((r) => r.error));

  if (finErr || scorteErr || listaErr) {
    throw new Error(finErr?.message || scorteErr?.message || listaErr?.message);
  }

  return { ok: true, prodottiEstratti };
}

/* ============================================================
   CONSUMO SCORTE
============================================================ */

export async function aggiornaConsumoProdotto({
  nome_prodotto,
  quantita_utilizzata,
  data_rilevazione = new Date().toISOString(),
}) {
  const { data: scorta, error } = await supabase
    .from('scorte')
    .select('*')
    .eq('nome_prodotto', nome_prodotto)
    .single();
  if (error || !scorta) throw new Error(error?.message || 'Prodotto non trovato');

  const nuovaQuantita = scorta.quantita - quantita_utilizzata;
  const consumoPercent = 1 - nuovaQuantita / scorta.quantita_iniziale;

  const { error: updErr } = await supabase
    .from('scorte')
    .update({ quantita: nuovaQuantita, ultima_rilevazione: data_rilevazione })
    .eq('id', scorta.id);
  if (updErr) throw new Error(updErr.message);

  const inScadenza =
    scorta.data_scadenza &&
    (new Date(scorta.data_scadenza) - Date.now()) / 86_400_000 <= 10;

  if (consumoPercent >= 0.8 || inScadenza) {
    await supabase.from('prodotti_da_ricomprare').upsert({
      nome_prodotto,
      data_scadenza: scorta.data_scadenza,
      quantita_rimasta: nuovaQuantita,
    });
  }

  return { ok: true, nuovaQuantita };
}

/* ============================================================
   HELPER FINTA OCR
============================================================ */

async function fakeOcrService(file) {
  // Simula un OCR: restituisce dati fittizi dopo 400 ms
  await new Promise((r) => setTimeout(r, 400));
  return [
    { nome: 'Latte', quantita: 2, prezzo: 1.25, scadenza: '2025-07-20' },
    { nome: 'Pasta', quantita: 1, prezzo: 0.89, scadenza: '2026-01-15' },
  ];
}
