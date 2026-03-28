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

/* ─── Analizzatore piatti avanzato ───────────────────────────────── */
// Ogni piatto viene analizzato singolarmente per ingredienti e tecniche
// poi viene calcolato il profilo vino per l'intero pasto

const DISH_SIGNALS = {
  // Carne rossa intensa
  rosso_potente: {
    weight: 5,
    rx: /\b(bistecca|fiorentina|tagliata|manzo|bue|brasato|arrosto di manzo|cacciagione|cinghiale|lepre|cervo|capriolo|selvaggina|rosbif|costata|entrecote|t.bone|controfiletto|filetto di manzo|carne rossa|scottadito|abbacchio|castrato|agnello al forno|agnello alla griglia)\b/,
    style: 'rosso strutturato corposo',
    examples: ['Barolo','Brunello','Amarone','Montepulciano d\'Abruzzo','Aglianico del Vulture'],
  },
  // Carne rossa media / maiale / pollame saporito
  rosso_medio: {
    weight: 4,
    rx: /\b(maiale|lonza|arista|costine|salsiccia|ragù|amatriciana|carbonara|gricia|coda alla vaccinara|ossobuco|stinco|pollo arrosto|pollo alla cacciatora|anatra|piccione|quaglia|faraona|coniglio|lepre in salmi|trippa|pajata|guanciale|pancetta|speck|porchetta)\b/,
    style: 'rosso di medio corpo',
    examples: ['Chianti Classico','Montepulciano','Nero d\'Avola','Barbera d\'Asti'],
  },
  // Formaggio / latticini / uova come protagonisti
  rosso_leggero_o_bianco: {
    weight: 3,
    rx: /\b(pecorino|parmigiano|gorgonzola|taleggio|fontina|formaggio|fonduta|fondua|flan di formaggio|stick di formaggio|soufflé|uova|frittata|carbonara di uova|cacio e pepe|pasta al formaggio|mac and cheese)\b/,
    style: 'bianco strutturato o rosso leggero',
    examples: ['Verdicchio','Fiano di Avellino','Dolcetto','Pinot Nero leggero'],
    note: 'Formaggi stagionati e sapidi → rosso tannico; formaggi cremosi/fondute → bianco strutturato'
  },
  // Noci / frutta secca (accompagnamento o protagonista)
  noci_fruttasecca: {
    weight: 2,
    rx: /\b(noci|nocciole|mandorle|pinoli|pistacchi|castagne|frutta secca|noce)\b/,
    style: 'preferisce vini con tannini morbidi e leggera nota ossidativa',
    examples: ['Barbera','Dolcetto','Vernaccia','Vermentino'],
  },
  // Tuberi / verdure dolci e terrose
  tuberi_verdure: {
    weight: 2,
    rx: /\b(topinam|topinambur|patate|patata|tartufo|funghi|porcini|ovoli|finferli|carciofi|barbabietola|zucca|pastinaca|rapa|cicoria|radicchio)\b/,
    style: 'rosso terroso o bianco minerale',
    examples: ['Pinot Nero','Dolcetto','Verdicchio dei Castelli di Jesi','Etna Bianco'],
    note: 'Tartufo e funghi → Nebbiolo o Pinot Nero; carciofi → sfida classica, Vermentino o Vernaccia'
  },
  // Pesce grasso / strutturato
  pesce_strutturato: {
    weight: 4,
    rx: /\b(branzino al forno|orata|spigola|rombo|dentice|cernia|rana pescatrice|tonno|pesce spada|salmone|aragosta|astice|granchio|scampi al forno|brodetto|zuppa di pesce|cacciucco|risotto ai frutti di mare|spaghetti allo scoglio|tagliolini al granchio|linguine all.astice|seppie in umido)\b/,
    style: 'bianco strutturato o rosato',
    examples: ['Greco di Tufo','Fiano di Avellino','Vermentino di Sardegna','Etna Bianco'],
  },
  // Pesce crudo / molluschi freschi
  pesce_fresco: {
    weight: 4,
    rx: /\b(vongole|cozze|ostriche|crudi di mare|carpaccio di pesce|tartare di pesce|polpo|polipetti|frittura|calamari|gamberi|scampi crudi|insalata di mare|totani|alici|acciughe|baccalà mantecato|sashimi|crudo di gamberi)\b/,
    style: 'bianco fresco e sapido',
    examples: ['Vermentino','Pecorino Abruzzese','Soave Classico','Pinot Grigio Collio'],
  },
  // Pasta / riso con condimenti leggeri
  pasta_leggera: {
    weight: 2,
    rx: /\b(pasta al pomodoro|pasta al basilico|pesto|trofie|trenette|pasta alla norma|amatriciana|puttanesca|spaghetti al pomodoro|risotto al parmigiano|risotto bianco|pasta e patate|minestrone|pasta e fagioli)\b/,
    style: 'rosso leggero o bianco medio',
    examples: ['Lambrusco','Barbera giovane','Verdicchio','Soave'],
  },
  // Fritti
  fritti: {
    weight: 3,
    rx: /\b(fritto|fritta|frittura|tempura|dorato|in pastella|supplì|arancini|crocchette|panzarotti|mozzarella in carrozza|battered|chips)\b/,
    style: 'bollicine secche o bianco ad alta acidità',
    examples: ['Franciacorta Brut','Trento DOC','Prosecco Extra Brut','Vermentino vivace'],
  },
  // Salumi / antipasti di terra
  salumi: {
    weight: 2,
    rx: /\b(prosciutto|mortadella|salame|coppa|bresaola|culatello|lardo|guanciale|pancetta|speck|cotechino|zampone|tagliere di salumi|affettati)\b/,
    style: 'rosso leggero fresco o lambrusco',
    examples: ['Lambrusco di Sorbara','Barbera d\'Asti','Sangiovese giovane'],
  },
}

function classifyDishes(dishText) {
  const s = dishText.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Split per separatori comuni
  const dishes = s.split(/[,;\n\|]+|\b(e poi|poi|seguito da|con contorno di|accompagnato da)\b/)
    .map(d => d?.trim()).filter(d => d && d.length > 2)

  const scores = {}
  const matchedDishes = []  // per debug e prompt

  for (const [key, signal] of Object.entries(DISH_SIGNALS)) {
    scores[key] = 0
    for (const dish of dishes) {
      if (signal.rx.test(dish)) {
        scores[key] += signal.weight
        matchedDishes.push({ dish, signal: key, style: signal.style })
      }
    }
    // Cerca anche nel testo completo per piatti non separati
    const fullMatch = s.match(new RegExp(signal.rx.source, 'g'))
    if (fullMatch) scores[key] += fullMatch.length * signal.weight
    // Deduplication: conta max 1x per tipo
    if (scores[key] > signal.weight * 2) scores[key] = signal.weight * 2
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const dominant = sorted[0]
  const secondary = sorted.find(([k,v]) => v > 0 && k !== dominant[0])

  const hasAny = dominant[1] > 0

  return {
    primary:    hasAny ? dominant[0] : 'rosso_medio',
    secondary:  secondary?.[0] || null,
    scores,
    matchedDishes,
    confidence: hasAny ? 'high' : 'low',
    dishCount:  dishes.length,
  }
}

// Costruisce il testo di analisi piatti da includere nel prompt
function buildDishAnalysis(dishText, signals) {
  if (!signals || signals.confidence === 'low') return null

  const lines = []

  if (signals.matchedDishes.length) {
    lines.push('Piatti riconosciuti e loro profilo:')
    const seen = new Set()
    for (const { dish, signal } of signals.matchedDishes) {
      if (seen.has(signal)) continue
      seen.add(signal)
      const s = DISH_SIGNALS[signal]
      lines.push(`  • ${dish.trim()} → ${s.style}`)
      if (s.note) lines.push(`    (${s.note})`)
    }
  }

  // Conflitti (es. fonduta formaggio + carne rossa)
  const hasRosso = (signals.scores.rosso_potente||0) + (signals.scores.rosso_medio||0) > 0
  const hasBianco = (signals.scores.pesce_strutturato||0) + (signals.scores.pesce_fresco||0) > 0
  if (hasRosso && hasBianco) {
    lines.push('⚠️ Pasto misto carne+pesce: considera 2 bottiglie o un rosato strutturato')
  }
  const hasFormaggio = signals.scores.rosso_leggero_o_bianco > 0
  if (hasFormaggio && hasRosso) {
    lines.push('Nota fonduta/formaggio: se cremoso → bianco strutturato; se stagionato → rosso')
  }
  const hasNoci = signals.scores.noci_fruttasecca > 0
  if (hasNoci) {
    lines.push('Noci/frutta secca: preferisci tannini morbidi, evita vini molto tannici')
  }
  const hasTopinambur = /topinambur|topinam/.test(dishText.toLowerCase())
  if (hasTopinambur) {
    lines.push('Topinambur: dolcezza terrosa → ottimo con Chardonnay o Pinot Nero')
  }

  return lines.join('\n')
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
  const dishSignals   = dishText ? classifyDishes(dishText) : null
  const dishAnalysis  = dishText ? buildDishAnalysis(dishText, dishSignals) : null

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
    if (dishAnalysis) {
      userPrompt += `### ANALISI AUTOMATICA DEI PIATTI\n${dishAnalysis}\n\n`
    }
    userPrompt += `### ISTRUZIONI ABBINAMENTO\n`
    userPrompt += `Considera TUTTI i piatti sopra come un pasto unico.\n`
    userPrompt += `Se ci sono ingredienti insoliti o complessi (fonduta, topinambur, noci, formaggio stagionato),\n`
    userPrompt += `spiega esplicitamente come il vino consigliato si comporta con QUELL'ingrediente specifico.\n`
    userPrompt += `Se il pasto è misto (es. antipasto pesce + secondo carne), suggerisci la bottiglia\n`
    userPrompt += `più versatile O proponi due opzioni (una per antipasto, una per secondo).\n\n`
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
      "why": "Abbinamento principale in 1-2 frasi dirette e concrete",
      "pairing_notes": "Note specifiche su ingredienti complessi (es. come si comporta con la fonduta, le noci, il topinambur) — ometti se non rilevante",
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