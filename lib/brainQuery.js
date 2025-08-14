// lib/brainQuery.js
async function callBrain(kind, payload) {
  const res = await fetch('/api/brain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ kind, ...payload }),
  });
  if (!res.ok) {
    let msg = `Brain ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg += `: ${j.error}`; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// === Wrapper che usi da React ===
export async function handleVoiceTranscript(text) {
  return callBrain('voiceIngest', { text });
}

export async function handleOCR({ base64, raw }) {
  return callBrain('ocrIngest', { base64, raw });
}

export async function runQueryFromText(text) {
  return callBrain('query', { text });
}
