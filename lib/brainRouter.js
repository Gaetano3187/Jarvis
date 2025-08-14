import { runQueryFromText as brainQuery } from './brainQuery';

export async function handleVoiceTranscript(text) {
  return handleUserPrompt(text);
}

export async function handleOCR(payload) {
  return handleUserPrompt('ocr', payload);
}

/**
 * Gestione prompt testuale dall'utente
 */
export async function handleUserPrompt(userText, extraData = null) {
  const hub = typeof window !== 'undefined' && window.JARVIS_HUB?.getHub?.()
    ? window.JARVIS_HUB.getHub()
    : {};

  const msg = (userText || '').toLowerCase().trim();

  // === 1) Domanda sulle spese ===
  if (msg.includes('quanto ho speso')) {
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();

    // estrai mese da testo
    const mesiIT = [
      'gennaio','febbraio','marzo','aprile','maggio','giugno',
      'luglio','agosto','settembre','ottobre','novembre','dicembre'
    ];
    for (let i = 0; i < mesiIT.length; i++) {
      if (msg.includes(mesiIT[i])) {
        month = i + 1;
      }
    }
    // estrai anno se indicato
    const annoMatch = msg.match(/\b(20\d{2})\b/);
    if (annoMatch) year = parseInt(annoMatch[1]);

    const expenses = hub.expenses || [];
    const total = typeof window !== 'undefined' && window.JARVIS_HUB?.sumExpensesByMonth
      ? window.JARVIS_HUB.sumExpensesByMonth(year, month, expenses)
      : 0;

    const euro = (n) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    return {
      ok: true,
      result: `Ciao Gaetano, nel mese di ${mesiIT[month - 1]} hai speso ${euro(total)}.`
    };
  }

  // === 2) Domanda su cosa comprare ===
  if (msg.includes('cosa devo comprare') || msg.includes('lista della spesa') || msg.includes('cosa manca')) {
    const daComprare = (hub.lists || []).filter(it => !it.purchased && (it.qty > 0 || it.unitsPerPack > 0));
    if (daComprare.length === 0) {
      return { ok: true, result: 'Non hai articoli da comprare in lista.' };
    }
    const elenco = daComprare
      .map(it => `${it.name}${it.brand ? ' (' + it.brand + ')' : ''} x${it.qty || it.unitsPerPack}`)
      .join(', ');
    return { ok: true, result: `Ciao Gaetano, devi comprare: ${elenco}` };
  }

  // === 3) Altre domande generiche: fallback al cervello AI ===
  return await brainQuery(userText, extraData);
}
