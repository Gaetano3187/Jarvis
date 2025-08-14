// lib/brainQuery.js

/**
 * Ritorna i dati calcolati dalla pagina Entrate.
 * Evita qualunque ricalcolo o query: legge SOLO dal bridge globale creato in pages/entrate.js.
 */
function getEntrateDataSafe() {
  if (typeof window === 'undefined') return null;
  return window.__JARVIS_DATA__?.entrate || null;
}

const fmtMoney = (v) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));

const fmtDateIT = (iso) => {
  if (!iso) return '';
  // Supporta "YYYY-MM-DD" e ISO con orario
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT');
};

/**
 * Riconosce intent semplici per saldo/contanti/entrate/spese/periodo.
 * Restituisce { ok: boolean, result: string }
 */
export async function runBrainQuery(text) {
  try {
    const q = String(text || '').toLowerCase().trim();
    const d = getEntrateDataSafe();

    // Se i dati non sono presenti (pagina non caricata), fallback gentile
    if (!d) {
      return {
        ok: false,
        result:
          'Per rispondere con i numeri esatti devo leggere i dati già calcolati nella pagina Entrate. Apri la pagina e riprova.'
      };
    }

    // Alias intent
    const askSaldo =
      /(saldo( disponibile)?|quanto.*(saldo|disponibile)|quanti soldi( ho)? (disponibili|rimangono)|quanto mi resta)/i.test(q);
    const askContanti =
      /(soldi in tasca|contanti|quanti contanti|cash|quanto ho in tasca)/i.test(q);
    const askEntrate =
      /(entrate|incassi|quanto ho guadagnato|quanto è entrato|entrate del periodo)/i.test(q);
    const askSpese =
      /(spese|quanto ho speso|uscite del periodo|spesa totale)/i.test(q);
    const askCarry =
      /(carryover|avanzo precedente|rimanenza precedente|perdita precedente)/i.test(q);
    const askPeriodo =
      /(periodo( corrente)?|da quando a quando|date del periodo|inizio.*fine)/i.test(q);

    // Risposte (SOLO con i valori calcolati dalla pagina)
    if (askSaldo) {
      return {
        ok: true,
        result: `Saldo disponibile: € ${fmtMoney(d.saldoDisponibile)}.`
      };
    }

    if (askContanti) {
      return {
        ok: true,
        result: `Soldi in tasca (contanti): € ${fmtMoney(d.soldiInTasca)}.`
      };
    }

    if (askEntrate) {
      const periodo = d.startDate && d.endDate ? ` (${fmtDateIT(d.startDate)} – ${fmtDateIT(d.endDate)})` : '';
      return {
        ok: true,
        result: `Entrate del periodo${periodo}: € ${fmtMoney(d.entratePeriodo)}.`
      };
    }

    if (askSpese) {
      const periodo = d.startDate && d.endDate ? ` (${fmtDateIT(d.startDate)} – ${fmtDateIT(d.endDate)})` : '';
      return {
        ok: true,
        result: `Spese del periodo${periodo}: € ${fmtMoney(d.spesePeriodo)}.`
      };
    }

    if (askCarry) {
      return {
        ok: true,
        result: `Carryover del mese precedente: € ${fmtMoney(d.carryoverMese)}.`
      };
    }

    if (askPeriodo) {
      if (d.startDate && d.endDate) {
        return {
          ok: true,
          result: `Periodo corrente: ${fmtDateIT(d.startDate)} – ${fmtDateIT(d.endDate)}.`
        };
      }
      return { ok: true, result: 'Periodo corrente non disponibile in questo momento.' };
    }

    // Nessun intent riconosciuto
    return {
      ok: false,
      result:
        "Posso dirti: saldo disponibile, soldi in tasca, entrate del periodo, spese del periodo, carryover o il periodo corrente. Prova a chiedere, ad esempio: 'Quanto ho di saldo disponibile?'"
    };
  } catch (e) {
    return {
      ok: false,
      result: 'Ops, qualcosa è andato storto nel brain. Riprova tra un attimo.'
    };
  }
}
