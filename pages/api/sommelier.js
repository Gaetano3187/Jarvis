// pages/api/sommelier.js — SOMMELIER PERSONALE v2
// Consiglia vini in base a:
//   1. Piatti che l'utente mangerà (input testuale libero)
//   2. Gusti personali (vini salvati con rating)
//   3. Carta del ristorante (opzionale, da OCR o QR)

import OpenAI from 'openai'

export const config = { api: { bodyParser: true } }

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

/* ─── Classificatore piatti → stile vino ideale ──────────────────── */
function classifyDishes(dishText) {
  const s = dishText.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const signals = {
    rosso_potente: /\b(bistecca|fiorentina|tagliata|manzo|bue|brasato|arrosto|cacciagione|cinghiale|lepre|cervo|capriolo|agnello|castrato|scottadito|rosbif|costata|filetto di manzo|carne rossa|selvaggina)\b/,
    rosso_medio:   /\b(agnello|maiale|salsiccia|ragù|amatriciana|bolognese|lasagne|pappardelle|ribollita|ossobuco|pollo arrosto|coniglio|anatra|piccione|quaglia|faraona|trippa|coda alla vaccinara|abbacchio)\b/,
    rosso_leggero: /\b(pizza|pasta al pomodoro|pasta semplice|margherita|prosciutto|salumi|tagliere|affettati|mortadella|bruschetta|antipasto di terra|focaccia)\b/,
    bianco_strutturato: /\b(aragosta|astice|branzino al forno|orata|spigola|rombo|dentice|cernia|brodetto|zuppa di pesce|risotto al pesce|spaghetti allo scoglio|tagliolini al granchio|linguine all.astice)\b/,
    bianco_fresco:  /\b(vongole|cozze|ostriche|crudi di mare|carpaccio di pesce|sashimi|polpo|polipetti|baccala|frittura di pesce|calamari|gamberi|scampi|insalata di mare|seppie|totani)\b/,
    bianco_aromatico: /\b(pesce spada|tonno|caprese|mozzarella|burrata|formaggi freschi|ricotta|insalata|verdure grigliate|zucchine|melanzane|peperoni)\b/,
    bollicine:     /\b(fritto misto|frittura|tempura|aperitivo|stuzzichini|tartine|finger food|sushi|poke|crudite|ostriche)\b/,
    rosato:        /\b(antipasto misto|insalata nizzarda|ratatouille|pasta al pesto|trofie|trenette|focaccia genovese|pesto)\b/,
  }

  const matches = {}
  for (const [style, rx] of Object.entries(signals)) {
    const m = s.match(new RegExp(rx.source, 'g'))
    matches[style] = m ? m.length : 0
  }

  // Determina stile prevalente
  const sorted = Object.entries(matches).sort((a, b) => b[1] - a[1])
  const dominant = sorted[0][0]
  const hasAny = sorted[0][1] > 0

  if (!hasAny) return { primary: 'rosso_medio', secondary: 'bianco_fresco', confidence: 'low' }

  const secondary = sorted[1][1] > 0 ? sorted[1][0] : null
  return { primary: dominant, secondary, confidence: 'high' }
}

/* ─── Costruisce profilo gusti utente ─────────────────────────────── */
function buildUserProfile(wines) {
  if (!wines?.length) return null

  const ratedWines = wines.filter(w => w.rating_5 >= 4)
  const allWines   = wines.slice(0, 20)

  // Pesi per stili, regioni, vitigni — rating alto = peso maggiore
  const styles = {}, regions = {}, grapes = {}
  // Profilo sensoriale aggregato dalle note di degustazione
  const aromas = {}, tanninsSum = [], aciditySum = [], bodySum = []
  const occasions = {}

  for (const w of allWines) {
    const weight = w.rating_5 ? w.rating_5 : 3
    if (w.style)  styles[w.style]   = (styles[w.style]   || 0) + weight
    if (w.region) regions[w.region] = (regions[w.region] || 0) + weight
    if (Array.isArray(w.grapes)) {
      for (const g of w.grapes) grapes[g] = (grapes[g] || 0) + weight
    }

    // Note di degustazione (se presenti)
    const tn = w.tasting_note
    if (tn) {
      if (tn.tannins)  tanninsSum.push(tn.tannins)
      if (tn.acidity)  aciditySum.push(tn.acidity)
      if (tn.body)     bodySum.push(tn.body)
      if (Array.isArray(tn.aromas)) {
        for (const a of tn.aromas) aromas[a] = (aromas[a] || 0) + weight
      }
      if (tn.occasion) {
        occasions[tn.occasion] = (occasions[tn.occasion] || 0) + 1
      }
    }
  }

  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null

  const topStyles  = Object.entries(styles).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0])
  const topRegions = Object.entries(regions).sort((a,b)=>b[1]-a[1]).slice(0,4).map(e=>e[0])
  const topGrapes  = Object.entries(grapes).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0])
  const topAromas  = Object.entries(aromas).sort((a,b)=>b[1]-a[1]).slice(0,5).map(e=>e[0])
  const topOccasions = Object.entries(occasions).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0])

  const favorites = ratedWines.slice(0,5).map(w => {
    const tn = w.tasting_note
    const tastingStr = tn ? ` [${[
      tn.body    ? `corpo ${tn.body}/5`    : null,
      tn.tannins ? `tannini ${tn.tannins}/5` : null,
      tn.finish  ? `finale ${tn.finish}/5` : null,
      tn.aromas?.length ? tn.aromas.slice(0,2).join(', ') : null,
    ].filter(Boolean).join(', ')}]` : ''
    return `${w.name}${w.vintage?' '+w.vintage:''} (${w.style||'?'}, ${w.region||'?'}, ★${w.rating_5})${tastingStr}`
  })

  // Descrizione sensoriale preferita
  const sensory = []
  const avgBody    = avg(bodySum)
  const avgTannins = avg(tanninsSum)
  const avgAcidity = avg(aciditySum)
  if (avgBody !== null)    sensory.push(avgBody >= 4 ? 'preferisce vini corposi' : avgBody <= 2 ? 'preferisce vini leggeri' : 'gradisce corpo medio')
  if (avgTannins !== null) sensory.push(avgTannins >= 4 ? 'ama i tannini decisi' : avgTannins <= 2 ? 'preferisce vini morbidi e poco tannici' : 'tannini equilibrati')
  if (avgAcidity !== null) sensory.push(avgAcidity >= 4 ? 'apprezza alta acidità/freschezza' : avgAcidity <= 2 ? 'preferisce vini meno acidi' : '')

  return {
    topStyles, topRegions, topGrapes, topAromas, topOccasions,
    favorites, sensory: sensory.filter(Boolean),
    avgBody, avgTannins, avgAcidity,
    totalWines: wines.length,
    hasRatings: ratedWines.length > 0,
    hasTastingNotes: tanninsSum.length > 0 || Object.keys(aromas).length > 0,
  }
}

/* ─── Handler ────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })

  const {
    query      = '',      // es. "bistecca alla brace con patate" o query generica
    dishes     = '',      // campo dedicato ai piatti (alternativo a query)
    wineLists  = [],      // testi OCR carta vini
    qrLinks    = [],      // link QR carta vini
    userWines  = [],      // vini salvati dall'utente con rating
    userId,
    budget,               // es. "sotto 30€" o numero
    preferences = '',     // preferenze extra es. "vino locale", "biologico"
  } = req.body

  // Testo piatti: usa dishes se presente, altrimenti query
  const dishText = (dishes || query || '').trim()

  // ── Fetch carta QR se presente ──────────────────────────────────
  const qrTexts = []
  for (const url of (qrLinks || []).slice(0, 3)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) })
      const text = await r.text()
      // Estrai solo testo leggibile, max 2000 chars
      const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)
      if (clean.length > 50) qrTexts.push(clean)
    } catch {}
  }

  // ── Determina contesto piatti ────────────────────────────────────
  const dishSignals = dishText ? classifyDishes(dishText) : null

  // ── Profilo utente ───────────────────────────────────────────────
  const profile = buildUserProfile(userWines)

  // ── Costruisce il prompt ─────────────────────────────────────────
  const hasCard = wineLists.length > 0 || qrTexts.length > 0
  const hasDishes = dishText.length > 2

  let systemPrompt = `Sei un sommelier esperto e personale. Parli italiano.
Il tuo obiettivo è consigliare i vini PERFETTI per l'occasione specifica dell'utente,
tenendo conto dei suoi gusti personali documentati e dei piatti che mangerà.

REGOLE:
- Consiglia sempre vini italiani a meno che la carta non li abbia
- Sii specifico: nome, denominazione, produttore se possibile
- Spiega BREVEMENTE (1-2 righe) perché quel vino si abbina a QUEI piatti specifici
- Se hai la carta del ristorante, consiglia SOLO vini presenti in carta
- Se non hai la carta, consiglia vini del territorio/stile adatto
- Tono: amichevole, diretto, da esperto fidato — non accademico
- Massimo 4 consigli (meno se la carta è limitata)
- Indica sempre fascia prezzo: low (<20€), med (20-50€), high (>50€)`

  let userPrompt = ''

  // Sezione piatti
  if (hasDishes) {
    userPrompt += `## PIATTI ORDINATI\n${dishText}\n\n`
    if (dishSignals) {
      const styleMap = {
        rosso_potente:      'rosso strutturato e corposo (Barolo, Brunello, Montepulciano, Primitivo, Aglianico)',
        rosso_medio:        'rosso di medio corpo (Chianti, Montepulciano, Nero d\'Avola, Barbera)',
        rosso_leggero:      'rosso leggero e fresco (Lambrusco, Bardolino, Cerasuolo)',
        bianco_strutturato: 'bianco strutturato (Verdicchio, Greco di Tufo, Fiano, Vernaccia)',
        bianco_fresco:      'bianco fresco e minerale (Vermentino, Soave, Pinot Grigio, Pecorino)',
        bianco_aromatico:   'bianco aromatico (Gewürztraminer, Müller-Thurgau, Viognier)',
        bollicine:          'bollicine secche (Franciacorta, Trento DOC, Prosecco Extra Brut)',
        rosato:             'rosato fresco (Cerasuolo d\'Abruzzo, Bardolino Chiaretto)',
      }
      userPrompt += `Abbinamento ideale suggerito: ${styleMap[dishSignals.primary] || dishSignals.primary}`
      if (dishSignals.secondary) {
        userPrompt += ` + ${styleMap[dishSignals.secondary] || dishSignals.secondary} (per altri piatti)`
      }
      userPrompt += '\n\n'
    }
  } else {
    userPrompt += `## RICHIESTA\n${dishText || 'Consiglio generale'}\n\n`
  }

  // Sezione profilo utente
  if (profile) {
    userPrompt += `## PROFILO GUSTI DELL'UTENTE\n`
    if (profile.hasRatings && profile.favorites.length) {
      userPrompt += `Vini preferiti (★4-5):\n${profile.favorites.map(f => '- ' + f).join('\n')}\n`
    }
    if (profile.topStyles.length) {
      userPrompt += `Stili preferiti: ${profile.topStyles.join(', ')}\n`
    }
    if (profile.topRegions.length) {
      userPrompt += `Regioni preferite: ${profile.topRegions.join(', ')}\n`
    }
    if (profile.topGrapes.length) {
      userPrompt += `Vitigni apprezzati: ${profile.topGrapes.join(', ')}\n`
    }
    // Note sensoriali — il tiebreaker chiave
    if (profile.hasTastingNotes) {
      userPrompt += `\n### PROFILO SENSORIALE (dalle sue note di degustazione)\n`
      if (profile.sensory.length) {
        userPrompt += `${profile.sensory.join('; ')}\n`
      }
      if (profile.topAromas.length) {
        userPrompt += `Aromi che apprezza: ${profile.topAromas.join(', ')}\n`
      }
      if (profile.topOccasions.length) {
        userPrompt += `Occasioni di consumo frequenti: ${profile.topOccasions.join(', ')}\n`
      }
      userPrompt += `⚠️ Quando due vini hanno abbinamento simile, preferisci quello più in linea\n`
      userPrompt += `   con il profilo sensoriale sopra (corpo, tannini, acidità, aromi).\n`
    }
    if (!profile.hasRatings && !profile.hasTastingNotes) {
      userPrompt += `(${profile.totalWines} vini salvati ma senza voti né note — usa stili e regioni disponibili)\n`
    }
    userPrompt += '\n'
  } else {
    userPrompt += `## GUSTI DELL'UTENTE\nNessun dato — consiglia in base ai piatti e al budget\n\n`
  }

  // Sezione budget
  if (budget) {
    userPrompt += `## BUDGET\n${budget}\n\n`
  }

  // Sezione preferenze extra
  if (preferences?.trim()) {
    userPrompt += `## PREFERENZE EXTRA\n${preferences}\n\n`
  }

  // Sezione carta vini
  if (hasCard) {
    const cardText = [
      ...wineLists.map((t, i) => `[Carta pag.${i+1}]\n${t}`),
      ...qrTexts.map((t, i) => `[Carta online ${i+1}]\n${t}`)
    ].join('\n\n---\n\n').slice(0, 6000)

    userPrompt += `## CARTA DEI VINI DEL RISTORANTE\n⚠️ Consiglia SOLO vini presenti in questa carta!\n\n${cardText}\n\n`
  }

  // Istruzione output
  userPrompt += `## OUTPUT RICHIESTO
Rispondi con un JSON valido:
{
  "recommendations": [
    {
      "name": "Nome vino",
      "winery": "Produttore o null",
      "denomination": "DOC/DOCG/IGT o null",
      "region": "Regione italiana",
      "style": "rosso|bianco|rosé|frizzante",
      "vintage": 2020,
      "why": "Perché si abbina a QUESTI piatti specifici (1-2 frasi dirette)",
      "pairing_score": 95,
      "personal_match": true,
      "price_band": "low|med|high",
      "typical_price_eur": 25,
      "in_card": ${hasCard},
      "links": []
    }
  ],
  "sommelier_note": "Nota introduttiva breve del sommelier (1 frase)",
  "source": "${hasCard ? 'list' : 'offline'}"
}

Ordina per pairing_score decrescente.
personal_match=true se si avvicina ai gusti documentati dell'utente.
SOLO JSON, nessun testo extra.`

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ]
    })

    const raw = resp.choices?.[0]?.message?.content || '{}'
    let parsed
    try { parsed = JSON.parse(raw) }
    catch { return res.status(422).json({ error: 'Risposta GPT non valida', raw }) }

    // Normalizza
    if (!Array.isArray(parsed.recommendations)) parsed.recommendations = []
    parsed.source = parsed.source || (hasCard ? 'list' : 'offline')
    parsed.dish_signals = dishSignals
    parsed.has_card = hasCard
    parsed.has_profile = !!profile

    return res.status(200).json(parsed)

  } catch (err) {
    console.error('[sommelier]', err?.message)
    return res.status(500).json({ error: 'Errore sommelier: ' + (err?.message || 'errore') })
  }
}