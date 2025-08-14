// Intents semplici basati su regex + formattazione

function euro(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '€ 0,00';
  return '€ ' + n.toFixed(2).replace('.', ',');
}

function matchSaldoDisponibile(q) {
  const t = (q || '').toLowerCase();
  return /(saldo\s*(disponibile|attuale)|quanto.*saldo|^saldo\??$)/.test(t);
}

function matchSoldiInTasca(q) {
  const t = (q || '').toLowerCase();
  return /(soldi\s*(in\s*)?tasca|quanto ho in tasca|^tasca$)/.test(t);
}

function matchSpesePeriodo(q) {
  const t = (q || '').toLowerCase();
  return /(quanto ho speso|spese.*(periodo|mese)|speso.*(periodo|mese))/.test(t);
}

function answerSaldoDisponibile(metrics) {
  if (!metrics) return null;
  const v = Number(metrics.saldoDisponibile);
  if (!Number.isFinite(v)) return null;
  return `Saldo disponibile: ${euro(v)}.`;
}

function answerSoldiInTasca(metrics) {
  if (!metrics) return null;
  const v = Number(metrics.soldiInTasca);
  if (!Number.isFinite(v)) return null;
  return `Soldi in tasca: ${euro(v)}.`;
}

function answerSpesePeriodo(metrics) {
  if (!metrics) return null;
  const v = Number(metrics.spesePeriodo);
  if (!Number.isFinite(v)) return null;
  const { startDate, endDate } = metrics || {};
  const periodo =
    startDate && endDate ? ` nel periodo ${startDate}–${endDate}` : '';
  return `Hai speso ${euro(v)}${periodo}.`;
}

module.exports = {
  euro,
  matchSaldoDisponibile,
  matchSoldiInTasca,
  matchSpesePeriodo,
  answerSaldoDisponibile,
  answerSoldiInTasca,
  answerSpesePeriodo,
};
