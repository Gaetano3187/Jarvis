// lib/brainHub.js
// Wrapper *safe* lato client: niente styled-jsx, niente esecuzioni top-level,
// solo funzioni pure che chiamano le tue API.

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  return data || {};
}

function safeParseAnswer(answer) {
  if (answer == null) return 'Nessuna risposta.';
  if (typeof answer === 'object') return answer;
  if (typeof answer === 'string') {
    try { return JSON.parse(answer); } catch { return answer; }
  }
  return String(answer);
}

export async function runQueryFromTextLocal(text, { first } = {}) {
  const payload = { prompt: String(text || '') };
  if (first) payload.first = true;
  const data = await postJSON('/api/assistant', payload);
  const answer = data?.answer ?? data?.data ?? null;
  const result = safeParseAnswer(answer);
  return { ok: true, result };
}

export async function ingestOCRLocal({ files, base64 } = {}) {
  let ocrText = '';

  if (Array.isArray(files) && files.length) {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    const res = await fetch('/api/ocr', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `OCR HTTP ${res.status}`);
    ocrText = String(data?.text || '').trim();
  } else if (base64) {
    ocrText = `[BASE64_IMAGE]\n${base64}`;
  } else {
    throw new Error('Nessun file/immagine valido.');
  }

  const prompt = [
    'Analizza questo scontrino OCR e dammi una risposta utile per la chat.',
    'Se hai un riepilogo strutturato, restituisci JSON; altrimenti una frase.',
    '',
    'TESTO_OCR:',
    ocrText,
  ].join('\n');

  const data = await postJSON('/api/assistant', { prompt });
  const answer = data?.answer ?? data?.data ?? null;
  const result = safeParseAnswer(answer);
  return { ok: true, result };
}

export async function ingestSpokenLocal(spokenText) {
  const prompt = [
    'Interpreta il seguente comando vocale legato a finanze/liste/scorte.',
    'Se serve, rispondi con testo naturale; se strutturato, in JSON.',
    '',
    'TESTO_VOCE:',
    String(spokenText || ''),
  ].join('\n');

  const data = await postJSON('/api/assistant', { prompt });
  const answer = data?.answer ?? data?.data ?? null;
  const result = safeParseAnswer(answer);
  return { ok: true, result };
}

// default nominato (zittisce lint e non crea pattern strani in minify)
const brain = { runQueryFromTextLocal, ingestOCRLocal, ingestSpokenLocal, __ts: Date.now() };
export default brain;
