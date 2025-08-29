// pages/api/sommelier.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || '';
const SOMMELIER_SYSTEM = process.env.SOMMELIER_SYSTEM_PROMPT || `
Sei “Sommelier di Jarvis”. Rispondi SOLO in JSON.
Se è presente "wine_list" o "wine_list_candidates", proponi PRIORITARIAMENTE vini presi da quella lista (campo "from_list" nell'output). 
Interpreta aggettivi/indicazioni gusto:
- "non troppo aspro", "morbido", "rotondo", "poco acido" → acidity:low; 
- "fresco", "tagliente" → acidity:high;
- "morbido", "setoso", "poco tannico" → tannin:low; "tannico", "astringente" → tannin:high;
- "beverino", "leggero", "snello" → body:light; "strutturato", "corposo", "pieno" → body:full;
- "secco" → sweetness:dry; "amabile/abboccato/dolce" → sweetness:sweet.
Schema risposta:
{
  "intent": "from_list|alternative|recommend|pairing|retailers",
  "criteria": {
    "query": string,
    "budget_eur": {"min": number|null, "max": number|null},
    "region": string|null,
    "taste": {"acidity":"low|med|high"|null, "tannin":"low|med|high"|null, "body":"light|med|full"|null, "sweetness":"dry|off-dry|sweet"|null, "tags": [string]}
  },
  "from_list_candidates": [
    {"name":string,"winery":string|null,"denomination":string|null,"vintage":number|null,"abv":number|null,"raw":string}
  ],
  "recommendations": [
    {
      "name": "string",
      "winery": "string|null",
      "denomination": "string|null",
      "region": "string|null",
      "grapes": ["Nebbiolo"]|[],
      "vintage_suggestion": [2019,2020]|[],
      "style": "rosso|bianco|rosé|frizzante|fortificato|null",
      "abv": number|null,
      "typical_price_eur": number|null,
      "why": "string (perché è adatto/a cosa somiglia)",
      "links": [{"title":"string","url":"string"}]
    }
  ],
  "notes": "string|null",
  "provider_used": "operator|serpapi|bing|none"
}
Regole:
- Se wine_list è presente, “intent” deve essere "from_list"; non suggerire vini assenti dalla lista, salvo *pari alternative* esplicitamente richieste.
- Budget: se non specificato, mantieni fascia coerente.
- Includi 3–5 proposte ordinate per aderenza ai gusti e reperibilità. Usa "why".
- Mantieni sempre JSON valido.
`;

// ================= Helpers compat Assistants API (firme diverse SDK) =================
async function runsCreateCompat(threadId, body) {
  const runs = (openai).beta.threads.runs;
  if (typeof runs.create === 'function' && runs.create.length >= 2) {
    return runs.create(threadId, body);
  }
  return runs.create({ thread_id: threadId, ...body });
}
async function runsRetrieveCompat(threadId, runId) {
  const runs = (openai).beta.threads.runs;
  if (typeof runs.retrieve === 'function' && runs.retrieve.length >= 2) {
    return runs.retrieve(threadId, runId);
  }
  return runs.retrieve({ thread_id: threadId, run_id: runId });
}
async function messagesListCompat(threadId, params = {}) {
  const msgs = (openai).beta.threads.messages;
  if (typeof msgs.list === 'function' && msgs.list.length >= 2) {
    return msgs.list(threadId, params);
  }
  return msgs.list({ thread_id: threadId, ...params });
}

// ================= Helpers locali =================
function normTasteHints(h) {
  if (!h) return null;
  const map = (v, low='low', med='med', high='high') => {
    if (!v) return null;
    const t = String(v).toLowerCase();
    if (/(basso|poco|legger|morbido|soft|light)/.test(t)) return low;
    if (/(alto|marcato|tagliente|strong|high)/.test(t)) return high;
    return med;
  };
  return {
    acidity:  map(h.acidity),
    tannin:   map(h.tannin),
    body:     map(h.body, 'light', 'med', 'full'),
    sweetness: h.sweetness ? String(h.sweetness) : null,
    tags: Array.isArray(h.tags) ? h.tags : []
  };
}

function parseWineList(wineListText) {
  if (!wineListText) return [];
  const lines = String(wineListText)
    .split(/\r?\n/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const out = [];
  for (const raw of lines) {
    // Estrai vintage, denom, abv basico
    const vintage = (() => { const m = /\b(19|20)\d{2}\b/.exec(raw); return m ? Number(m[0]) : null; })();
    const denom = (() => { const m = /\b(DOCG|DOC|IGT)\b/i.exec(raw); return m ? m[1].toUpperCase() : null; })();
    const abv = (() => { const m = /(alc\.?\s*)?(\d{1,2}(?:[.,]\d)?)\s*%/i.exec(raw); return m ? Number(m[2].replace(',','.')) : null; })();

    // Greedy name/winery split: "Barolo 2019 - Vietti" / "Vietti Barolo 2019"
    let name = null, winery = null;
    const dash = raw.split(/\s+-\s+/);
    if (dash.length === 2) {
      // "A - B" → infer
      const left = dash[0], right = dash[1];
      // se la parte destra contiene parole tipo "Cantina/Azienda/Vietti", trattala come winery
      if (/(cantina|azienda|produttore|tenuta|vinicola)/i.test(right) || right.split(' ').length <= 3) {
        winery = right;
        name = left.replace(/\b(19|20)\d{2}\b/g,'').replace(/\b(DOCG|DOC|IGT)\b/ig,'').trim();
      } else {
        name = left;
        winery = right;
      }
    } else {
      // prova "Winery Nome 2019"
      const m = /^([A-Z][\w'À-ÖØ-öø-ÿ ]{2,20})\s+(.+)$/.exec(raw);
      if (m) {
        winery = m[1].trim();
        name = m[2].replace(/\b(19|20)\d{2}\b/g,'').replace(/\b(DOCG|DOC|IGT)\b/ig,'').trim();
      } else {
        name = raw; // fallback
      }
    }
    out.push({
      name: name || raw,
      winery: winery || null,
      denomination: denom || null,
      vintage: vintage,
      abv: abv,
      raw
    });
  }
  return out;
}

function buildProviderHint() {
  return {
    operator: !!(process.env.OPERATOR_BASE_URL && process.env.OPERATOR_API_KEY),
    serpapi:  !!process.env.SERPAPI_API_KEY,
    bing:     !!process.env.BING_SEARCH_API_KEY
  };
}

// ================= Handler =================
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
      query,
      budget,
      region,
      wineList,
      qrLinks,
      tasteHints
    } = req.body || {};

    if (!query && !wineList) {
      return res.status(400).json({ error: 'Missing query or wineList' });
    }

    const provider_hint = buildProviderHint();
    const taste = normTasteHints(tasteHints);
    const candidates = parseWineList(wineList || '');

    const payload = {
      mode: 'sommelier',
      provider_hint,
      query: query || 'Consigliami il migliore in base ai miei gusti',
      wine_list: wineList || null,
      wine_list_candidates: candidates.length ? candidates : null,
      qr_links: Array.isArray(qrLinks) && qrLinks.length ? qrLinks : null,
      taste_hints: taste,
      criteria: {
        budget,
        region
      }
    };

    // ====== STRADA 1: Assistant (threads/runs) ======
    if (ASSISTANT_ID) {
      const thread = await (openai).beta.threads.create({
        messages: [{ role: 'user', content: JSON.stringify(payload) }]
      });

      const run = await runsCreateCompat(thread.id, {
        assistant_id: ASSISTANT_ID,
        ...(SOMMELIER_SYSTEM ? { instructions: SOMMELIER_SYSTEM } : {})
      });

      // Poll veloce
      let status = run.status;
      let tries = 0;
      while ((status === 'queued' || status === 'in_progress') && tries < 30) {
        await new Promise(r => setTimeout(r, 500));
        const r2 = await runsRetrieveCompat(thread.id, run.id);
        status = r2.status;
        tries++;
      }

      if (status !== 'completed') {
        return res.status(200).json({
          intent: 'from_list',
          criteria: { query, budget_eur: {min: null, max: budget ?? null}, region: region || null, taste },
          from_list_candidates: candidates,
          recommendations: [],
          notes: 'Assistant non ha completato in tempo. Riprova.',
          provider_used: provider_hint.operator ? 'operator' : (provider_hint.serpapi ? 'serpapi' : (provider_hint.bing ? 'bing' : 'none'))
        });
      }

      const msgs = await messagesListCompat(thread.id, { order: 'desc', limit: 1 });
      const content = msgs.data?.[0]?.content?.[0];
      const text = content && content.type === 'text' ? content.text?.value : '';

      // parse JSON robusto
      let json = null;
      try { json = JSON.parse(text || '{}'); }
      catch {
        const m = /{[\s\S]*}/.exec(text || '');
        if (m) { try { json = JSON.parse(m[0]); } catch {} }
      }
      if (!json) json = { recommendations: [], notes: text || 'Risposta non in JSON', provider_used: 'none' };

      return res.status(200).json(json);
    }

    // ====== STRADA 2: Fallback Chat Completions (JSON mode) ======
    const system = SOMMELIER_SYSTEM;
    const chat = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) }
      ],
      temperature: 0.2
    });

    const text = chat.choices?.[0]?.message?.content || '{}';
    let json = null;
    try { json = JSON.parse(text); } catch { json = { recommendations: [], notes: text, provider_used: 'none' }; }
    return res.status(200).json(json);
  } catch (e) {
    console.error('sommelier error', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
  function WinesSection({ data, loading, onOpenMap }) {
  const [q, setQ] = useState('');
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierData, setSommelierData] = useState(null);
  const fileRef = useRef(null);
  const [showQrScanner, setShowQrScanner] = useState(false);

  async function askSommelier(payload = {}) {
    const r = await fetch('/api/sommelier', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        query: q || 'Consigliami il migliore in base al mio gusto',
        ...payload
      })
    });
    const j = await r.json();
    setSommelierData(j); setSommelierOpen(true);
  }

  async function findRetailers(name, region, budget) {
    const r = await fetch('/api/retailers', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ productName: name, region, budget })
    });
    const j = await r.json();
    alert(JSON.stringify(j, null, 2));
  }

  async function setRating(id, n) {
    const { error } = await supabase.from('wines').update({ rating_5: n }).eq('id', id);
    if (error) { alert('Errore voto: ' + error.message); return; }
    location.reload();
  }

  // ---------------- Sommelier (OCR immagine lista) ----------------
  function extractTasteHints(text) {
    const t = (q + ' ' + (text||'')).toLowerCase();
    const hints = { tags: [] };
    if (/\b(non troppo aspro|poco aspro|morbido|rotondo)\b/.test(t)) hints.acidity = 'low';
    else if (/\bmolto fresco|tagliente|acido\b/.test(t)) hints.acidity = 'high';
    if (/\bmorbido|setoso|poco tannico\b/.test(t)) hints.tannin = 'low';
    else if (/\btannico|ruvido|astringente\b/.test(t)) hints.tannin = 'high';
    if (/\bleggero|fresco beverino|snello\b/.test(t)) hints.body = 'light';
    else if (/\bstrutturato|corposo|pieno\b/.test(t)) hints.body = 'full';
    if (/\bsecco\b/.test(t)) hints.sweetness = 'dry';
    else if (/\bdolce|abboccato|amabile\b/.test(t)) hints.sweetness = 'sweet';
    if (/\bfruttato\b/.test(t))  hints.tags.push('fruttato');
    if (/\bspeziato\b/.test(t))  hints.tags.push('speziato');
    if (/\bminerale\b/.test(t))  hints.tags.push('minerale');
    if (/\baromatico\b/.test(t)) hints.tags.push('aromatico');
    return hints;
  }

  async function dataUrlFromFile(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  async function handleSommelierOcrFile(file) {
    try {
      const dataUrl = await dataUrlFromFile(file);
      const r1 = await fetch('/api/ocr', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dataUrl })
      });
      const j1 = await r1.json();
      const listText = (j1?.text || '').trim();
      if (!listText) { alert('OCR: nessun testo letto dalla foto.'); return; }

      const tasteHints = extractTasteHints(listText);
      await askSommelier({ wineList: listText, qrLinks: [], tasteHints });
    } catch (e) {
      alert('Errore Sommelier OCR: ' + (e.message || e));
    }
  }

  // ---------------- Scanner QR (fotocamera) ----------------
  async function handleQrResult(url) {
    try {
      const isUrl = /^https?:\/\//i.test(url || '');
      const qrLinks = isUrl ? [url] : [];
      let pageText = '';
      if (isUrl) {
        const r = await fetch('/api/qr-text', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url }) });
        const j = await r.json();
        pageText = j?.text || '';
      }
      const tasteHints = extractTasteHints(pageText);
      await askSommelier({ wineList: pageText, qrLinks, tasteHints });
    } catch (e) {
      alert('Errore lettura QR: ' + (e.message || e));
    }
  }

  // ---------------- “Dove l’ho bevuto” (pin blu) ----------------
  async function reverseGeocode(lat, lng) {
    try {
      const u = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`;
      const r = await fetch(u, { headers:{ 'Accept':'application/json' } });
      const j = await r.json();
      return j?.display_name || null;
    } catch { return null; }
  }
  async function searchGeocode(query) {
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=0`;
      const r = await fetch(u, { headers:{ 'Accept':'application/json' } });
      const j = await r.json();
      if (Array.isArray(j) && j.length) {
        return { name: j[0].display_name || query, lat: Number(j[0].lat), lng: Number(j[0].lon) };
      }
    } catch {}
    return null;
  }
  async function markDrankHere(row) {
    try {
      let lat=null, lng=null, place_name=null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy:true, timeout:10000 })
        );
        lat = pos.coords.latitude; lng = pos.coords.longitude;
        place_name = await reverseGeocode(lat, lng);
      } catch {
        const manual = prompt('Inserisci il luogo (es. "Enoteca X, Alba")');
        if (!manual) return;
        const hit = await searchGeocode(manual);
        if (!hit) { alert('Impossibile geocodificare.'); return; }
        lat = hit.lat; lng = hit.lng; place_name = hit.name;
      }
      const { error } = await supabase.from('product_places').insert([{
        item_type:'wine', item_id: row.id, kind:'purchase',
        place_name: place_name || `(${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        lat, lng, is_primary:true
      }]);
      if (error) { alert('Errore salvataggio luogo: ' + error.message); return; }
      alert('Luogo aggiunto! (pin blu)'); location.reload();
    } catch (e) { alert('Errore: ' + (e.message || e)); }
  }

  return (
    <section>
      <div style={{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 12px', flexWrap:'wrap' }}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder='Es: "Barolo non troppo aspro" • "bianco fresco <€20"'
          style={{ flex:1, minWidth:280, padding:'10px 12px', borderRadius:12, border:'1px solid #243246', background:'#0b0f14', color:'#e5eeff' }}
        />
        <button onClick={()=>askSommelier()} style={btn(true)}>Sommelier</button>
        <button onClick={()=>fileRef.current?.click()} style={btn(false)}>Sommelier (OCR)</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
               onChange={e=> e.target.files?.[0] && handleSommelierOcrFile(e.target.files[0])}/>
        <button onClick={()=>setShowQrScanner(true)} style={btn(false)}>Scanner QR (camera)</button>
      </div>

      {/* Scanner QR modal */}
      {showQrScanner && (
        <LiveQrScanner
          onClose={()=>setShowQrScanner(false)}
          onResult={async (code) => {
            setShowQrScanner(false);
            await handleQrResult(code);
          }}
        />
      )}

      <Table>
        <thead>
          <tr>
            <th style={{ textAlign:'left',  padding:10 }}>Vino</th>
            <th style={{ textAlign:'left',  padding:10 }}>Cantina</th>
            <th style={{ textAlign:'left',  padding:10 }}>Denominazione</th>
            <th style={{ textAlign:'right', padding:10 }}>Grad.</th>
            <th style={{ textAlign:'left',  padding:10 }}>Vitigni / Blend</th>
            <th style={{ textAlign:'left',  padding:10 }}>Regione</th>
            <th style={{ textAlign:'right', padding:10 }}>Annata</th>
            <th style={{ textAlign:'right', padding:10 }}>Budget</th>
            <th style={{ textAlign:'left',  padding:10 }}>Voto</th>
            <th style={{ textAlign:'left',  padding:10 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><TCell>Caricamento…</TCell></tr>}
          {!loading && data.length===0 && <tr><TCell>Nessun elemento</TCell></tr>}
          {data.map(row => {
            const blend = Array.isArray(row.grape_blend) && row.grape_blend.length
              ? row.grape_blend.map(b => (b.pct != null ? `${b.pct}% ${b.name}` : b.name)).join(', ')
              : (Array.isArray(row.grapes) ? row.grapes.join(', ') : '—');
            return (
              <tr key={row.id}>
                <TCell>{row.name}</TCell>
                <TCell>{row.winery || '—'}</TCell>
                <TCell>{row.denomination || '—'}</TCell>
                <TCell style={{ textAlign:'right' }}>{row.alcohol != null ? `${Number(row.alcohol).toFixed(1)}%` : '—'}</TCell>
                <TCell>{blend}</TCell>
                <TCell>{row.region || '—'}</TCell>
                <TCell style={{ textAlign:'right' }}>{row.vintage || '—'}</TCell>
                <TCell style={{ textAlign:'right' }}>{row.price_target != null ? `€ ${Number(row.price_target).toFixed(2)}` : '—'}</TCell>
                <TCell><Stars value={row.rating_5 || 0} onChange={(n)=>setRating(row.id, n)} /></TCell>
                <TCell>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button style={btn(false)} onClick={()=>markDrankHere(row)}>Dove l’ho bevuto</button>
                    <button style={btn(false)} onClick={()=>onOpenMap('wine', row.id, 'origin')}>Apri mappa (Origine)</button>
                    <button style={btn(false)} onClick={()=>onOpenMap('wine', row.id, 'purchase')}>Apri mappa (Acquisto)</button>
                    <button style={btn(false)} onClick={()=>findRetailers(row.name, row.region || undefined, row.price_target || undefined)}>Trova rivenditori</button>
                    <button style={btn(false)} onClick={()=>navigator.clipboard.writeText(row.name)}>Copia nome</button>
                  </div>
                </TCell>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {sommelierOpen && <SommelierDrawer data={sommelierData} onClose={()=>setSommelierOpen(false)} />}
    </section>
  );
}

}
