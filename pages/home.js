// pages/home.js
import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import withAuth from '../hoc/withAuth'
import { supabase } from '../lib/supabaseClient'
import '../styles/home.css'

/* --- Utility --- */
function iso(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function eur(n){return(Number(n)||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}

/* --- Normalizza categoria spesa --- */
function normCat(raw) {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(orsini|coop|esselunga|conad|carrefour|lidl|aldi|eurospin|penny|pam|interspar|spar|sigma|naturasi|bennet|unes|famila|tigros|despar|iper|ipercoop|prix|dok|gigante|simply|mercatone|tuodi)\b/.test(s)) return 'casa'
  if (/\b(supermercat|spesa|alimentar|cibo|frutta|verdura|carne|pesce|pane|latte|uova|pasta|riso|olio|acqua|bibite|bevande|detersiv|pulizia|ammorbident|candeggina|bolletta|luce|gas|internet|affitto|mutuo|condomin|manutenzione|arredo|mobile|cucina|elettrodomest|lavatrice|frigorifero|ferramenta|giardinaggio|asporto|porta.?via|take.?away|deliveroo|glovo|just.?eat)\b/.test(s)) return 'casa'
  if (/\b(vestit|abbigliam|scarpe|camicia|pantalon|maglion|giacca|cappotto|borsa|cintura|cravatta|calze|intimo|pigiama|costume|sciarpa|guanti|cappello|gioiell|orologio|zaino|valigia|moda|boutique|abbigliamento)\b/.test(s)) return 'vestiti'
  if (/\b(ristorante|pizzeria|trattoria|osteria|braceria|sushi|kebab|hamburgeria|bistrot|pub|birreria|enoteca|bar|caffe|caffetteria|colazione|pranzo|cena|aperitiv|spritz|cocktail|gelateria|pasticceria|paninoteca|fast.?food)\b/.test(s)) return 'cene'
  return null
}
function catFromStore(store, storeType) {
  return normCat([store, storeType].filter(Boolean).join(' '))
}

/* ─── Audio helpers ─────────────────────────────────────────────── */
function getBestMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'])
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch {}
  return ''
}
function extForMime(m = '') {
  if (m.includes('mp4')) return 'voice.mp4'
  if (m.includes('ogg')) return 'voice.ogg'
  return 'voice.webm'
}

/* ─── Query dati locali ──────────────────────────────────────────── */
async function queryData(text, userId) {
  if (!userId) return null
  const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')

  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  let dateFrom = null, dateTo = null, periodoLabel = ''

  if (/\b(oggi|giornata di oggi)\b/.test(s)) {
    dateFrom = dateTo = iso(now); periodoLabel = 'oggi'
  } else if (/\b(ieri)\b/.test(s)) {
    const ieri = new Date(y,m,d-1); dateFrom = dateTo = iso(ieri); periodoLabel = 'ieri'
  } else if (/\b(questa\s+settimana|settimana\s+(corrente|in corso))\b/.test(s)) {
    const lunedi = new Date(y,m,d - ((now.getDay()||7)-1))
    dateFrom = iso(lunedi); dateTo = iso(now); periodoLabel = 'questa settimana'
  } else if (/\b(settimana\s+scorsa)\b/.test(s)) {
    const lun = new Date(y,m,d - ((now.getDay()||7)-1) - 7)
    const dom = new Date(lun); dom.setDate(dom.getDate()+6)
    dateFrom = iso(lun); dateTo = iso(dom); periodoLabel = 'settimana scorsa'
  } else if (/\b(questo\s+mese|mese\s+(corrente|in corso))\b/.test(s) || /\bmese\b/.test(s)) {
    dateFrom = iso(new Date(y,m,1)); dateTo = iso(now); periodoLabel = 'questo mese'
  } else if (/\b(mese\s+scorso|scorso\s+mese)\b/.test(s)) {
    dateFrom = iso(new Date(y,m-1,1)); dateTo = iso(new Date(y,m,0)); periodoLabel = 'mese scorso'
  } else if (/\b(quest[o']?\s+anno|anno\s+(corrente|in corso))\b/.test(s) || /\banno\b/.test(s)) {
    dateFrom = `${y}-01-01`; dateTo = iso(now); periodoLabel = `nel ${y}`
  } else if (/\b(anno\s+scorso|scorso\s+anno)\b/.test(s)) {
    dateFrom = `${y-1}-01-01`; dateTo = `${y-1}-12-31`; periodoLabel = `nel ${y-1}`
  }

  const isSpesa = /\b(speso|spesa|costi|quanto|spese|acquistato|comprato|pagato)\b/.test(s)
  const isCosa  = /\b(cosa|quali?|elenco|lista|mostra|dimmi|ho comprato|ho acquistato)\b/.test(s)
  const isVino  = /\b(vino|vini|bottigl|cantina|cellar|etichett)\b/.test(s)
  const isDispensa = /\b(dispensa|scorte|inventario|scadenz|cosa ho in casa|frigo)\b/.test(s)
  const isSommelier = /\b(consiglia|abbina|sommelier|cosa bevo|quale vino|vino per|abbinamento)\b/.test(s)

  if (!dateFrom && !isVino && !isDispensa && !isSommelier) return null

  try {
    if (/\b(budget|disponib|quanto\s+mi\s+rest|bast|finit|stai\s+per|esaurit|entrate\s+del\s+mese)\b/.test(s)) {
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'budget_status', userId }) })
      const d = await r.json()
      return d.text || null
    }

    if (/\b(rispetto\s+al\s+mese\s+scorso|confronto|di\s+più\s+questo\s+mese|di\s+meno|mese\s+scorso\s+vs|trend\s+spese)\b/.test(s)) {
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'compare_months', userId }) })
      const d = await r.json()
      return d.text || null
    }

    if (/\b(ricett|cucinare|cosa\s+(posso\s+)?fare\s+(da\s+mangiar|con\s+quello|con\s+quel)|cuoco|pranzo\s+con|cena\s+con)\b/.test(s)) {
      const pref = s.match(/\b(veloce|facile|vegetariano|senza\s+carne|pasta|risotto|zuppa|insalata)\b/)?.[0] || ''
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'recipes', userId, payload:{ preference: pref } }) })
      const d = await r.json()
      return d.text || null
    }

    if (/\b(cost[ao]\s+(il|la|il)?|prezzo\s+(del|della|di)|quanto\s+ho\s+pagato\s+(il|la)|storico\s+prezz)\b/.test(s)) {
      const m = text.match(/(?:costava?|pagato|prezzo\s+(?:del|della|di))\s+(?:il|la|lo|gli|le|l')?\s*([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{2,30})/i)
      const product = m?.[1]?.trim() || text.replace(/quanto|costava?|il|la|lo|prezzo|del|della|di|mesi\s+fa/gi,'').trim()
      if (product.length > 2) {
        const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'price_history', userId, payload:{ product } }) })
        const d = await r.json()
        return d.text || null
      }
    }

    if (/\b(report|resoconto|riepilogo|sommario|bilancio\s+(mensile|settimanale|annuale))\b/.test(s)) {
      const period = /\b(settiman)\b/.test(s)?'week': /\b(anno|annuale)\b/.test(s)?'year':'month'
      const r = await fetch('/api/jarvis-query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'report', userId, payload:{ period } }) })
      const d = await r.json()
      return d.text || null
    }

    if (isVino && !isSommelier) {
      const { data: wineData } = await supabase.from('wines')
        .select('name,winery,style,region,vintage,rating_5').eq('user_id', userId)
        .order('created_at', {ascending:false}).limit(20)
      if (!wineData?.length) return '🍷 Non hai ancora vini registrati.'
      const list = wineData.slice(0,8).map(w =>
        `• ${w.name}${w.vintage?' '+w.vintage:''}${w.winery?' — '+w.winery:''}${w.rating_5?' ('+w.rating_5+'★)':''}`
      ).join('\n')
      return `🍷 Hai ${wineData.length} vini registrati:\n${list}${wineData.length>8?'\n…e altri '+( wineData.length-8):''}`
    }

    if (isDispensa && !dateFrom) {
      const { data: inv } = await supabase.from('inventory')
        .select('product_name,qty,unit_label,expiry_date,consumed_pct').eq('user_id', userId)
        .order('product_name', {ascending:true})
      if (!inv?.length) return '📦 La dispensa è vuota.'
      const inScadenza = inv.filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now()+7*86400000))
      const list = inv.slice(0,8).map(i =>
        `• ${i.product_name}: ${i.qty} ${i.unit_label||'pz'}${i.expiry_date?' (scade '+i.expiry_date+')':''}`
      ).join('\n')
      let reply = `📦 In dispensa hai ${inv.length} prodotti:\n${list}${inv.length>8?'\n…e altri '+(inv.length-8):''}`
      if (inScadenza.length) reply += `\n\n⚠️ In scadenza entro 7 giorni: ${inScadenza.map(i=>i.product_name).join(', ')}`
      return reply
    }

    if (!dateFrom) return null

    if (isSpesa && !isCosa) {
      let catFilter = null
      if (/\b(supermercat|supermercato|alimentar|casa)\b/.test(s)) catFilter = 'casa'
      else if (/\b(cena|cene|ristorante|bar|aperitiv)\b/.test(s)) catFilter = 'cene'
      else if (/\b(vestit|abbigliament|scarpe|moda)\b/.test(s)) catFilter = 'vestiti'
      else if (/\b(varie|farmacia|benzina|parrucchiere)\b/.test(s)) catFilter = 'varie'

      let q = supabase.from('expenses').select('amount,category,store').eq('user_id', userId)
        .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
      if (catFilter) q = q.eq('category', catFilter)
      const { data: exps } = await q

      if (!exps?.length) return `💸 Nessuna spesa registrata ${periodoLabel}${catFilter?' in categoria '+catFilter:''}.`
      const tot = exps.reduce((t,e) => t+Number(e.amount||0), 0)

      if (catFilter) return `💸 Hai speso ${eur(tot)} in "${catFilter}" ${periodoLabel} (${exps.length} acquisti).`

      const byCat = {}
      exps.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + Number(e.amount||0) })
      const catIcons = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}
      const breakdown = Object.entries(byCat).sort((a,b)=>b[1]-a[1])
        .map(([c,v]) => `  ${catIcons[c]||'📦'} ${c}: ${eur(v)}`).join('\n')
      return `💸 Hai speso ${eur(tot)} ${periodoLabel}:\n${breakdown}`
    }

    if (isCosa) {
      let q = supabase.from('expenses').select('store,amount,purchase_date,category,description')
        .eq('user_id', userId).gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
        .order('purchase_date', {ascending:false}).limit(15)
      const { data: exps } = await q
      if (!exps?.length) return `🛒 Nessun acquisto registrato ${periodoLabel}.`
      const tot = exps.reduce((t,e) => t+Number(e.amount||0), 0)
      const catIcons = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}
      const list = exps.map(e =>
        `${catIcons[e.category]||'📦'} ${e.store||e.description||'Acquisto'} — ${eur(e.amount)} (${e.purchase_date})`
      ).join('\n')
      return `🛒 ${exps.length} acquisti ${periodoLabel} — totale ${eur(tot)}:\n${list}`
    }

  } catch(e) { console.error('[queryData]', e) }
  return null
}

async function executeAction(action, userId, router) {
  if (!action || !userId) return null
  try {
    const today = new Date().toISOString().slice(0, 10)
    switch (action.type) {
      case 'add_expense': {
        const rawCat = catFromStore(action.category, action.store_type)
          || (['casa','vestiti','cene','varie'].includes(action.category) ? action.category : null)
          || 'varie'
        const storeVal = action.store || action.store_name || null
        const descVal  = action.description || storeVal || 'Spesa'

        const { data: newExp, error } = await supabase.from('expenses').insert({
          user_id: userId, category: rawCat,
          store: storeVal, description: descVal,
          amount: Number(action.amount || 0),
          purchase_date: action.date || today,
          payment_method: action.payment_method || 'cash',
          source: 'voice',
        }).select('id').single()
        if (error) throw error

        const items = Array.isArray(action.items) ? action.items.filter(i => i?.name?.trim()) : []
        if (items.length && newExp?.id) {
          await supabase.from('purchase_items').insert(
            items.map(i => ({
              user_id:      userId,
              expense_id:   newExp.id,
              category:     rawCat,
              name:         String(i.name).trim(),
              qty:          Number(i.qty || 1),
              unit_price:   Number(i.unit_price || 0),
              price:        parseFloat((Number(i.unit_price || 0) * Number(i.qty || 1)).toFixed(2)),
              purchase_date: action.date || today,
              store:        storeVal,
            }))
          )
        }

        // ── Aggiorna tasca (voce) ──────────────────────────────────────────
        const pmAction = action.payment_method || 'cash'
        if (pmAction !== 'card' && pmAction !== 'transfer' && Number(action.amount) > 0)
          await supabase.from('pocket_cash').insert({
            user_id: userId, note: descVal,
            delta: -Number(action.amount), moved_at: new Date().toISOString(),
          })

        const catIcon = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}[rawCat] || '📦'
        const itemsStr = items.length
          ? '\n' + items.map(i => `  • ${i.qty||1}x ${i.name}${i.unit_price?' @ €'+Number(i.unit_price).toFixed(2)+'/cad':''}`).join('\n')
          : ''
        return `${catIcon} €${Number(action.amount).toFixed(2)} salvati${storeVal?' @ '+storeVal:''}${itemsStr}`
      }
      case 'add_income': {
        const { error } = await supabase.from('incomes').insert({
          user_id: userId, source: action.source || 'Entrata',
          description: action.description || 'Entrata vocale',
          amount: Number(action.amount || 0),
          received_date: action.date || today,
        })
        if (error) throw error
        return `✓ Entrata €${Number(action.amount).toFixed(2)} salvata`
      }
      case 'add_to_list': {
        const itemName = (action.name || action.item || action.product || action.product_name || '').trim()
        if (!itemName) return '⚠️ Non ho capito il prodotto da aggiungere, riprova'
        const { error } = await supabase.from('shopping_list').insert({
          user_id: userId,
          name: itemName,
          qty: Number(action.qty || action.quantity || 1),
          unit_label: action.unit || action.unit_label || 'pz',
          list_type: action.list_type || 'supermercato',
          category: action.category || 'alimentari',
        })
        if (error) throw error
        return `✓ "${itemName}" aggiunto alla lista della spesa`
      }
      case 'add_wine': {
        const { error } = await supabase.from('wines').insert({
          user_id: userId, name: action.name, winery: action.winery || null,
          region: action.region || null, vintage: action.vintage || null,
          style: action.style || 'rosso', source: 'voice',
        })
        if (error) throw error
        return `✓ Vino "${action.name}" aggiunto`
      }
      case 'navigate':
        if (action.path) router.push(action.path)
        return null
      default: return null
    }
  } catch (e) { return '⚠️ ' + (e.message || e) }
}

/* ═══════════════════════════════════════════════════════════════════
   HOME PAGE
══════════════════════════════════════════════════════════════════ */
const Home = () => {
  const router = useRouter()
  const [userId,      setUserId]      = useState(null)
  const [pocketBal,   setPocketBal]   = useState(null)
  const [alertItems,  setAlertItems]  = useState([])
  const [listaSpesa,  setListaSpesa]  = useState([])
  const [showLista,   setShowLista]   = useState(false)
  const [loadingOCR,  setLoadOCR]     = useState(false)
  const [ocrResult,   setOcrResult]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState(null)

  const mediaRef    = useRef(null)
  const chunksRef   = useRef([])
  const streamRef   = useRef(null)
  const [isRec,     setIsRec]     = useState(false)
  const [aibusy,    setAiBusy]    = useState(false)
  const [jarvisOpen, setJarvisOpen] = useState(false)
  const [messages,  setMessages]  = useState([
    { role: 'assistant', text: 'Ciao! Sono Jarvis. Puoi chiedermi:\n💸 "Quanto mi resta questo mese?" · "Ho speso di più a marzo o aprile?"\n🍳 "Cosa posso cucinare con quello che ho?"\n📊 "Report mensile" · "Quanto costava il latte?"\n🍷 "Consiglimi un vino rosso per la bistecca"\n🧾 Usa il tasto Bolletta per scansionare fatture gas/luce\n🔔 Tasto Alert per notifiche push' }
  ])
  const [textInput, setTextInput] = useState('')
  const messagesEndRef = useRef(null)

  const [pushEnabled,   setPushEnabled]   = useState(false)
  const [pendingVote,   setPendingVote]   = useState(null)
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [wineVote,      setWineVote]      = useState({ ratingWine: 0, ratingAdvice: 0, notes: '' })

  const billOcrRef = useRef(null)
  const [billBusy, setBillBusy] = useState(false)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const canvas = document.getElementById('logo-canvas')
    if (!canvas) return
    const wrap = canvas.parentElement
    if (!wrap) return

    function resize() { canvas.width = wrap.offsetWidth; canvas.height = wrap.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')

    function buildLightning(x1,y1,x2,y2,depth,maxD,segs) {
      if (depth > maxD) { segs.push([x1,y1,x2,y2,depth]); return }
      const len  = Math.hypot(x2-x1, y2-y1)
      const disp = len * (.46 - depth * .05)
      const mx   = (x1+x2)/2 + (Math.random()-.5)*disp
      const my   = (y1+y2)/2 + (Math.random()-.5)*disp
      buildLightning(x1,y1,mx,my,depth+1,maxD,segs)
      buildLightning(mx,my,x2,y2,depth+1,maxD,segs)
      if (depth < maxD-1 && Math.random() > .55) {
        const a  = Math.atan2(y2-y1,x2-x1) + (Math.random()-.5)*1.5
        const bl = len*(.15+Math.random()*.28)
        buildLightning(mx,my,mx+Math.cos(a)*bl,my+Math.sin(a)*bl,depth+2,maxD,segs)
      }
    }

    const bolts = []

    function getTextRect() {
      const core = wrap.querySelector('.logo-core')
      if (!core) return null
      const wr = wrap.getBoundingClientRect()
      const cr = core.getBoundingClientRect()
      return { x:cr.left-wr.left, y:cr.top-wr.top, w:cr.width, h:cr.height,
               cx:cr.left-wr.left+cr.width/2, cy:cr.top-wr.top+cr.height/2 }
    }

    function spawnBolt() {
      const b = getTextRect(); if (!b) return
      const side = Math.floor(Math.random()*4)
      let ox, oy
      if (side===0)      { ox=b.x+Math.random()*b.w; oy=b.y }
      else if (side===1) { ox=b.x+Math.random()*b.w; oy=b.y+b.h }
      else if (side===2) { ox=b.x;      oy=b.y+Math.random()*b.h }
      else               { ox=b.x+b.w;  oy=b.y+Math.random()*b.h }
      const angle  = Math.atan2(oy-b.cy, ox-b.cx) + (Math.random()-.5)*.75
      const length = 60 + Math.random()*130
      const segs   = []
      buildLightning(ox,oy, ox+Math.cos(angle)*length, oy+Math.sin(angle)*length, 0, 4, segs)
      bolts.push({ segs, life:1.0, decay:.008+Math.random()*.006, flash:1.0, purple:Math.random()>.42 })
    }

    let animId = null
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height)
      ctx.lineCap = 'round'
      for (let i = bolts.length-1; i >= 0; i--) {
        const bolt = bolts[i]
        bolt.life  -= bolt.decay
        bolt.flash *= .87
        if (bolt.life <= 0) { bolts.splice(i,1); continue }
        const a = Math.max(0, bolt.life)
        const fa = Math.min(1, a*(1+bolt.flash*1.3))
        for (const [x1,y1,x2,y2,d] of bolt.segs) {
          const t=1-d/5, w=Math.max(.3,t*2.1)
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2)
          ctx.strokeStyle = bolt.purple?`rgba(100,30,180,${fa*.16})`:`rgba(0,150,90,${fa*.16})`
          ctx.lineWidth = w*13; ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2)
          ctx.strokeStyle = bolt.purple?`rgba(160,80,255,${fa*.52})`:`rgba(0,210,130,${fa*.52})`
          ctx.lineWidth = w*3.8; ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2)
          ctx.strokeStyle = `rgba(240,220,255,${Math.min(1,fa*.92)})`
          ctx.lineWidth = w*.65; ctx.stroke()
        }
        const root = bolt.segs[0]
        if (root) {
          const r=15*a, g=ctx.createRadialGradient(root[0],root[1],0,root[0],root[1],r)
          g.addColorStop(0, bolt.purple?`rgba(200,140,255,${a*.72})`:`rgba(80,255,180,${a*.72})`)
          g.addColorStop(1,'rgba(0,0,0,0)')
          ctx.beginPath(); ctx.arc(root[0],root[1],r,0,Math.PI*2)
          ctx.fillStyle=g; ctx.fill()
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()

    let spawnTimer = null
    function scheduleSpawn() {
      spawnTimer = setTimeout(() => {
        const n = Math.random()>.65 ? Math.floor(Math.random()*2)+2 : 1
        for (let i=0;i<n;i++) setTimeout(spawnBolt, i*65)
        scheduleSpawn()
      }, 250+Math.random()*270)
    }
    for (let i=0;i<5;i++) setTimeout(spawnBolt, i*120)
    scheduleSpawn()

    return () => {
      window.removeEventListener('resize', resize)
      if (animId) cancelAnimationFrame(animId)
      if (spawnTimer) clearTimeout(spawnTimer)
    }
  }, [])

  async function checkPendingNotifications(uid) {
    try {
      const r = await fetch('/api/push-notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', userId: uid })
      })
      const { pending } = await r.json()
      if (!pending?.length) return
      for (const notif of pending) {
        if (notif.type === 'wine_vote' && notif.payload?.feedback_id) {
          setPendingVote({ feedbackId: notif.payload.feedback_id, wineName: notif.payload.wine_name })
          setShowVoteModal(true)
          setJarvisOpen(true)
          setMessages(p => [...p, {
            role: 'assistant',
            text: `⏰ È passata mezz'ora — com'era ${notif.payload.wine_name}? Votalo! 🍷`
          }])
          break
        }
        if (notif.type === 'budget_alert') {
          setMessages(p => [...p, { role: 'assistant', text: notif.payload.message || '⚠️ Alert budget!' }])
          setJarvisOpen(true)
        }
        if (notif.type === 'expiry_alert') {
          setMessages(p => [...p, { role: 'assistant', text: `📦 Attenzione: ${notif.payload.products?.join(', ')} stanno per scadere!` }])
          setJarvisOpen(true)
        }
      }
    } catch(e) { console.warn('[poll notif]', e) }
  }

  async function enablePushNotifications(uid) {
    try {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission()
        if (perm === 'granted') {
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.register('/sw.js')
              const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
              if (vapidKey) {
                const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey })
                await fetch('/api/push-notify', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'subscribe', userId: uid, subscription: sub.toJSON() })
                })
              }
            } catch(swErr) {
              console.warn('[push] Service Worker non disponibile, uso solo polling:', swErr.message)
            }
          }
          setPushEnabled(true)
          setMessages(p => [...p, { role:'assistant', text:'🔔 Alert attivati! Riceverai notifiche per scadenze, budget e vini.\n\n(Il polling controlla ogni 5 minuti — nessuna configurazione aggiuntiva necessaria.)' }])
          setJarvisOpen(true)
          return
        } else {
          setMessages(p => [...p, { role:'assistant', text:'❌ Permesso notifiche negato. Puoi abilitarlo dalle impostazioni del browser.\n\nIl polling in-app (ogni 5 min) è comunque attivo.' }])
          setJarvisOpen(true)
          return
        }
      }
      setPushEnabled(true)
      setMessages(p => [...p, { role:'assistant', text:'🔔 Alert attivati in modalità polling. Jarvis controllerà ogni 5 minuti.' }])
      setJarvisOpen(true)
    } catch(e) {
      console.error('[push]', e)
      setPushEnabled(true)
      setMessages(p => [...p, { role:'assistant', text:'🔔 Alert attivati (modalità polling).' }])
      setJarvisOpen(true)
    }
  }

  async function handleBillOcr(file) {
    if (!file || !userId) return
    setBillBusy(true)
    setMessages(p => [...p, { role:'assistant', text:'🧾 Analizzo la bolletta… (15-20 secondi)' }])
    setJarvisOpen(true)
    try {
      const fd = new FormData(); fd.append('image', file, file.name || 'bolletta.jpg')
      const r = await fetch('/api/ocr-bill', { method:'POST', body: fd })
      const data = await r.json()
      if (!r.ok || !data.ok) throw new Error(data.error || 'OCR fallito')
      const r2 = await fetch('/api/jarvis-query', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'save_bill', userId, payload:{ billData: data } })
      })
      const saved = await r2.json()
      setMessages(p => [...p.slice(0,-1), { role:'assistant', text: saved.text || '✅ Bolletta salvata!' }])
      if (userId) loadData(userId)
    } catch(e) {
      setMessages(p => [...p.slice(0,-1), { role:'assistant', text:'⚠️ OCR bolletta: ' + e.message }])
    } finally { setBillBusy(false) }
  }

  async function submitWineVote() {
    if (!pendingVote || !userId) return
    try {
      const r = await fetch('/api/wine-pairing-flow', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'submit_feedback', userId,
          feedbackId: pendingVote.feedbackId,
          ratingWine:   wineVote.ratingWine,
          ratingAdvice: wineVote.ratingAdvice,
          notes:        wineVote.notes,
        })
      })
      const d = await r.json()
      setMessages(p => [...p, { role:'assistant', text: d.text || '✅ Voto salvato!' }])
      setShowVoteModal(false); setPendingVote(null); setWineVote({ ratingWine:0, ratingAdvice:0, notes:'' })
    } catch(e) { setMessages(p => [...p, { role:'assistant', text:'⚠️ ' + e.message }]) }
  }

  useEffect(() => {
    let poll = null
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadData(user.id)
      poll = setInterval(() => checkPendingNotifications(user.id), 5 * 60 * 1000)
      setTimeout(() => checkPendingNotifications(user.id), 35 * 60 * 1000)
    })
    return () => {
      if (poll) clearInterval(poll)
      try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    }
  }, [])

  async function loadData(uid) {
    const today = new Date(); const in10 = new Date(); in10.setDate(today.getDate() + 10)
    const [{ data: inv }, { data: lista }, { data: pocket }] = await Promise.all([
      supabase.from('inventory').select('id,product_name,qty,initial_qty,consumed_pct,expiry_date').eq('user_id', uid),
      supabase.from('shopping_list').select('id,name,qty,unit_label,list_type,store,price').eq('user_id', uid).eq('purchased', false).order('added_at', { ascending: true }),
      supabase.from('pocket_cash').select('delta').eq('user_id', uid),
    ])
    setPocketBal((pocket || []).reduce((t, r) => t + Number(r.delta || 0), 0))
    const scorteAlert = (inv || []).filter(item => {
      const pct = item.consumed_pct ?? (item.initial_qty > 0 ? ((item.initial_qty - item.qty) / item.initial_qty) * 100 : 0)
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      return pct >= 80 || (exp && exp <= in10)
    }).map(item => {
      const pct = item.consumed_pct ?? 0
      const exp = item.expiry_date ? new Date(item.expiry_date) : null
      const gg  = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null
      return { id: 'inv-' + item.id, name: item.product_name ?? 'Prodotto', tag: gg !== null && gg <= 10 ? `scade in ${gg}g` : `consumato ${Math.round(pct)}%`, type: 'scorta' }
    })
    const daComprare = (lista || []).map(p => ({ id: 'shop-' + p.id, name: p.name, tag: 'da comprare', type: 'lista' }))
    setAlertItems([...scorteAlert, ...daComprare])
    setListaSpesa(lista || [])
  }

  // ── Particles background ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const canvas = document.getElementById('bg-particles')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId = null
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const pts = Array.from({length:60}, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * .8 + .3,
      dx: (Math.random() - .5) * .22,
      dy: (Math.random() - .5) * .22,
      a: Math.random() * Math.PI * 2,
    }))
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pts.forEach(p => {
        p.x += p.dx; p.y += p.dy; p.a += .007
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        const a = .35 + .28 * Math.sin(p.a)
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,255,180,${a * .48})`; ctx.fill()
      })
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 70) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(0,255,180,${(1 - d / 70) * .09})`; ctx.lineWidth = .4; ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      window.removeEventListener('resize', resize)
      if (animId) cancelAnimationFrame(animId)
    }
  }, [])

  const historyRef = useRef([])
  useEffect(() => { historyRef.current = messages.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })) }, [messages])

  const send = useCallback(async (text) => {
    if (!text.trim() || !userId) return
    setAiBusy(true)
    setMessages(p => [...p, { role: 'user', text }])
    try {
      const s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')

      const localReply = await queryData(text, userId)
      if (localReply) {
        setMessages(p => [...p, { role: 'assistant', text: localReply }])
        return
      }

      if (/\b(consiglia|abbina|sommelier|cosa bevo|quale vino|vino per|abbinamento vino|suggerisci un vino)\b/.test(s)) {
        setMessages(p => [...p, { role: 'assistant', text: '🍷 Consulto il sommelier…' }])
        const { data: winePrefs } = await supabase.from('wines')
          .select('name,style,region,denomination,rating_5').eq('user_id', userId)
          .gte('rating_5', 4).limit(10)
        const prefsText = winePrefs?.length
          ? 'Vini che mi piacciono (voto ≥4): ' + winePrefs.map(w=>`${w.name} (${w.style||'rosso'}, ${w.region||'—'}, ★${w.rating_5})`).join('; ')
          : ''
        const sr = await fetch('/api/sommelier', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text + (prefsText ? '\n\nI miei gusti: '+prefsText : ''), wineLists: [], qrLinks: [], userId })
        })
        const sData = await sr.json()
        const recs = sData?.recommendations || []
        if (!recs.length) {
          setMessages(p => [...p.slice(0,-1), { role: 'assistant', text: '🍷 Nessun risultato. Prova: "vino rosso corposo per bistecca sotto 20€".' }])
          return
        }
        const recText = recs.slice(0,4).map((r,i) =>
          `${i+1}. **${r.name}**${r.denomination?' — '+r.denomination:''}\n   ${r.why||''}${r.typical_price_eur?' · ~€'+r.typical_price_eur:''}`
        ).join('\n\n')
        window.__jarvisWineRecs = recs
        window.__jarvisWineQuery = text
        setMessages(p => [...p.slice(0,-1), { role: 'assistant', text: `🍷 Ecco i miei consigli:\n\n${recText}\n\n💡 Scrivi "prendo il 1" (o 2, 3, 4) per aggiungerlo ai tuoi vini!` }])
        return
      }

      if (/\b(prendo|scelgo|lo\s+prendo|prender[oò]|ordino)\b/.test(s) && window.__jarvisWineRecs?.length) {
        const numMatch = text.match(/\b([1-4])\b/)
        const rec = window.__jarvisWineRecs[numMatch ? Number(numMatch[1])-1 : 0]
        if (rec) {
          setMessages(p => [...p, { role:'assistant', text:`✅ ${rec.name} — acquisisco posizione…` }])
          let lat = null, lng = null
          try {
            const pos = await new Promise((ok,ko) => navigator.geolocation.getCurrentPosition(ok, ko, { timeout:8000, enableHighAccuracy:true }))
            lat = pos.coords.latitude; lng = pos.coords.longitude
          } catch { /* GPS non disponibile */ }
          const wr = await fetch('/api/wine-pairing-flow', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ action:'confirm_take', userId, wineRec: rec, lat, lng, sommelierQuery: window.__jarvisWineQuery })
          })
          const wd = await wr.json()
          setMessages(p => [...p.slice(0,-1), { role:'assistant', text: wd.text || '✅ Vino aggiunto!' }])
          window.__jarvisWineRecs = null
          return
        }
      }

      if (/\b(attiva|abilita|voglio)\s+.*(notifich|push|avvisi)\b/.test(s)) {
        await enablePushNotifications(userId)
        return
      }

      if (/\b(bolletta|fattura|luce|gas|acqua|internet)\b/.test(s) && /\b(carica|scansiona|ocr|aggiungi|inserisci)\b/.test(s)) {
        setMessages(p => [...p, { role:'assistant', text:'📷 Usa il tasto 🧾 Bolletta nella barra in alto per scansionare!' }])
        return
      }

      // ── Lista spesa multipla (intercettata prima di assistant-v2) ─────────
      // Frasi: "devo comprare X, Y e Z" / "aggiungi X, Y e Z alla lista"
      const _isLista = /\b(devo\s+comprare|devo\s+prendere|aggiungi|metti\s+in\s+lista|lista\s+della\s+spesa|compra)\b/.test(s)
      if (_isLista) {
        // Estrae la parte dopo il verbo
        const _dopoVerbo = text
          .replace(/^.*?(?:devo\s+comprare|devo\s+prendere|aggiungi|metti\s+in\s+lista|compra)\s*/i, '')
          .replace(/\s+alla\s+(lista|spesa).*$/i, '')
          .replace(/\s+in\s+lista.*$/i, '')
        // Split per virgola, "e", "ed", punto e virgola
        const _prodotti = _dopoVerbo
          .split(/,|;|\s+e\s+|\s+ed\s+/)
          .map(p => p.trim().replace(/^(del|della|dello|degli|dei|le|il|lo|la|un|una|uno)\s+/i, '').trim())
          .filter(p => p.length > 1)
        if (_prodotti.length > 0) {
          const inseriti = []
          const falliti  = []
          for (const prodotto of _prodotti) {
            const { error } = await supabase.from('shopping_list').insert({
              user_id: userId,
              name: prodotto,
              qty: 1,
              unit_label: 'pz',
              list_type: 'supermercato',
              category: 'alimentari',
            })
            if (error) falliti.push(prodotto)
            else inseriti.push(prodotto)
          }
          let risposta = ''
          if (inseriti.length) risposta += `✅ Aggiunto alla lista: ${inseriti.join(', ')}`
          if (falliti.length)  risposta += `\n⚠️ Non aggiunto: ${falliti.join(', ')}`
          setMessages(p => [...p, { role: 'assistant', text: risposta }])
          if (userId) loadData(userId)
          return
        }
      }

      // ── Ricarica contanti in tasca (intercettato prima di assistant-v2) ──
      // Frasi: "ho preso 300 euro", "prelevato 200", "messo in tasca 150", ecc.
      // Riconosce ricarica tasca — NON "ho preso X euro" da solo (quello è stipendio)
      // Riconosce: "ho preso X euro e li ho messi in tasca", "prelevato X", "messo in tasca X", ecc.
      const _ricText = text.toLowerCase()
      const _hasInTasca = /in\s+tasca|messi?\s+in\s+tasca/.test(_ricText)
      const _hasPreso   = /\bpres[oa]\b/.test(_ricText)
      const _hasAltroVerbo = /\b(prelevat[oa]|ritira[to]{2}|messo\s+in\s+tasca|mett[oi]\s+in\s+tasca|ricaric[ao]|aggiungi|aggiungo)\b/.test(_ricText)
      const _importoM   = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euro|€)?/)
      // Trigger: (preso + in tasca) OPPURE (altro verbo da lista)
      const _isRicarica = (_hasPreso && _hasInTasca) || _hasAltroVerbo
      const ricarikaMatch = _isRicarica ? _importoM : null
      if (ricarikaMatch) {
        const importo = parseFloat(ricarikaMatch[1].replace(',','.'))
        if (importo > 0 && userId) {
          await supabase.from('pocket_cash').insert({
            user_id: userId,
            note: 'Ricarica contanti (voce)',
            delta: importo,
            moved_at: new Date().toISOString(),
          })
          await loadData(userId)
          setMessages(p => [...p, { role: 'assistant', text: `💵 €${importo.toFixed(2)} aggiunti in tasca!` }])
          return
        }
      }

      const r = await fetch('/api/assistant-v2', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, userId, conversationHistory: historyRef.current }),
      })
      const data = await r.json()
      let reply = data.text || 'Non ho capito, puoi ripetere?'
      if (data.action) { const res = await executeAction(data.action, userId, router); if (res) reply += '\n' + res }
      if (data.navigate) { setTimeout(() => router.push(data.navigate), 800); reply += '\n→ Navigo…' }
      setMessages(p => [...p, { role: 'assistant', text: reply }])
    } catch(e) {
      console.error('[send]', e)
      setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (e?.message || 'Errore di connessione.') }])
    } finally {
      setAiBusy(false)
    }
  }, [userId, router])

  const isRecRef = useRef(false)
  const toggleRec = useCallback(async () => {
    if (isRecRef.current) {
      isRecRef.current = false
      setIsRec(false)
      try { if (mediaRef.current?.state === 'recording') { mediaRef.current.requestData?.(); mediaRef.current.stop() } } catch {}
      try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; chunksRef.current = []
      const mime = getBestMimeType()
      mediaRef.current = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRef.current.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      mediaRef.current.onstop = async () => {
        try {
          const t0 = Date.now()
          while (!chunksRef.current.length && Date.now() - t0 < 1500) await new Promise(r => setTimeout(r, 60))
          if (!chunksRef.current.length) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Nessun audio registrato' }]); return }
          const am = mediaRef.current?.mimeType || mime || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: am })
          if (blob.size < 500) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Audio troppo corto, riprova' }]); return }
          const fd = new FormData(); fd.append('audio', blob, extForMime(am))
          const r = await fetch('/api/stt', { method: 'POST', body: fd })
          const j = await r.json().catch(() => ({}))
          if (!r.ok || !j?.text) { setMessages(p => [...p, { role:'assistant', text:'⚠️ Trascrizione fallita — riprova' }]); return }
          await send(String(j.text || '').trim())
        } catch (e) {
          setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (e.message || 'Errore audio') }])
        } finally {
          try { streamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
          streamRef.current = null
        }
      }
      isRecRef.current = true
      mediaRef.current.start(250); setIsRec(true); setJarvisOpen(true)
    } catch (err) {
      isRecRef.current = false; setIsRec(false)
      setMessages(p => [...p, { role: 'assistant', text: '⚠️ ' + (err?.name === 'NotAllowedError' ? 'Microfono non autorizzato' : 'Microfono non disponibile') }])
    }
  }, [send])

  useEffect(() => { if (!isRec) return; return () => { try { if (mediaRef.current?.state === 'recording') mediaRef.current.stop() } catch {} } }, [isRec])

  const onSubmit = e => { e.preventDefault(); if (!textInput.trim() || aibusy) return; const t = textInput.trim(); setTextInput(''); send(t) }

  function resizeImage(file, maxPx = 1500, q = .88) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const s = Math.min(1, maxPx / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', q)
      }
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')) }
      img.src = url
    })
  }

  async function handleOCR(file) {
    if (!file) return
    setLoadOCR(true); setErr(null); setOcrResult(null)
    setJarvisOpen(true)
    setMessages(p => [...p, { role: 'assistant', text: '📷 Analizzo lo scontrino… (10-20 secondi)' }])
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.endsWith('.pdf')
      const pl = isPdf ? file : await resizeImage(file)

      const fd1 = new FormData(); fd1.append('image', pl, file.name || 'foto.jpg')
      const ctrl1 = new AbortController(); const t1 = setTimeout(() => ctrl1.abort(), 65000)
      let r1; try { r1 = await fetch('/api/ocr-universal', { method: 'POST', body: fd1, signal: ctrl1.signal }) } finally { clearTimeout(t1) }
      if (!r1.ok) { const e = await r1.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r1.status}`) }
      const universal = await r1.json()

      if (universal.doc_type === 'wine_label') {
        if (universal.confidence === 'low') setErr('⚠️ Immagine poco nitida — controlla i dati')
        setOcrResult(universal)
        return
      }

      if (universal.doc_type === 'receipt' || universal.doc_type === 'invoice') {
        console.log('[OCR] universal data:', JSON.stringify({ store: universal.store, price_total: universal.price_total, categoria: universal.categoria, items_count: universal.items?.length, confidence: universal.confidence }))
        if (!universal.store && !universal.price_total) {
          throw new Error('OCR non ha estratto dati — riprova con foto più nitida e in buona luce')
        }
        if (universal.confidence === 'low') setErr('⚠️ Immagine poco nitida — controlla i dati')
        await _salvaRicevuta(universal)
        return
      }

      throw new Error('Documento non riconoscibile — riprova con una foto più nitida')

    } catch (e) { setErr(e.name === 'AbortError' ? '⏱ Timeout — riprova' : 'OCR: ' + e.message) }
    finally { setLoadOCR(false) }
  }

  // ── _salvaRicevuta — versione con tutti i fix ───────────────────────────
  async function _salvaRicevuta(data) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')

      const pd  = data.purchase_date ?? new Date().toISOString().slice(0, 10)
      const st  = data.store ?? 'Generico'
      const sa  = data.store_address ?? null   // indirizzo/città
      const im  = parseFloat(data.price_total ?? 0)
      const cat = catFromStore(data.store, data.store_type)
        || (['casa','vestiti','cene','varie'].includes(data.categoria) ? data.categoria : 'varie')
      const pm  = data.payment_method ?? 'cash'
      const items = Array.isArray(data.items) ? data.items : []

      // ── FIX description: include città ─────────────────────────────────
      const desc = sa ? `${st} — ${sa}` : st

      // Salva spesa
      const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
        user_id: user.id, category: cat, store: st,
        store_address: sa,
        description: desc,
        purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)

      // Salva receipt
      let recId = null
      try {
        const { data: rr } = await supabase.from('receipts').insert([{
          user_id: user.id, expense_id: expRow?.id, store: st,
          store_address: sa,
          purchase_date: pd, price_total: im, payment_method: pm,
          raw_text: data.raw_text ?? null, confidence: data.confidence ?? 'medium',
        }]).select('id').single()
        recId = rr?.id ?? null
      } catch {}

      // Salva receipt_items per TUTTE le categorie
      if (recId && items.length) {
        try {
          await supabase.from('receipt_items').insert(items.map(it => ({
            receipt_id: recId, user_id: user.id, name: it.name,
            brand: it.brand ?? null,
            packs: it.packs ?? 1,
            units_per_pack: it.units_per_pack ?? 1,
            unit_per_pack_label: it.unit_per_pack_label ?? 'pz',
            qty: it.qty ?? 1, unit: it.unit ?? 'pz',
            unit_price: it.unit_price ?? it.price ?? 0,
            price: it.price ?? 0,
            category_item: it.category_item ?? 'alimentari',
            expiry_date: it.expiry_date ?? null,
            purchase_date: pd,
          })))
        } catch {}
      }

      // Aggiorna inventario SOLO per "casa"
      if (cat === 'casa' && items.length) {
        for (const item of items.filter(it => it.name && it.category_item !== 'altro')) {
          try {
            const tot = Number(item.qty || 1)
            const perishable = item.perishable_type || 'standard'
            const catItem = item.category_item || 'alimentari'
            const expiryAuto = perishable === 'fresh' && !item.expiry_date
              ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
              : (item.expiry_date ?? null)
            const searchKey = item.name.split(' ').slice(0,2).join(' ')
            const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
              .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()
            if (ex) {
              await supabase.from('inventory').update({
                qty: Number(ex.qty || 0) + tot,
                initial_qty: Number(ex.initial_qty || 0) + tot,
                consumed_pct: 0, avg_price: item.unit_price || item.price || 0,
                last_updated: new Date().toISOString(), perishable_type: perishable,
                ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
              }).eq('id', ex.id)
            } else {
              await supabase.from('inventory').insert({
                user_id: user.id, product_name: item.name, brand: item.brand ?? null,
                category: catItem, qty: tot, initial_qty: tot,
                packs: item.packs ?? 1, units_per_pack: item.units_per_pack ?? 1,
                unit_label: item.unit_per_pack_label ?? item.unit ?? 'pz',
                unit: item.unit ?? 'pz',
                avg_price: item.unit_price || item.price || 0,
                purchase_date: pd, expiry_date: expiryAuto, consumed_pct: 0,
                perishable_type: perishable,
              })
            }
          } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
        }
      }

      // Spunta lista spesa
      if (items.length) {
        try {
          const { data: lista } = await supabase.from('shopping_list').select('id,name')
            .eq('user_id', user.id).eq('purchased', false)
          if (lista?.length) {
            const ids = []
            for (const item of items) {
              if (!item.name) continue
              const parola = item.name.split(' ')[0].toLowerCase()
              const match = lista.find(l =>
                l.name.toLowerCase().includes(parola) ||
                parola.includes(l.name.toLowerCase().split(' ')[0])
              )
              if (match && !ids.includes(match.id)) ids.push(match.id)
            }
            if (ids.length) await supabase.from('shopping_list')
              .update({ purchased: true, updated_at: new Date().toISOString() }).in('id', ids)
          }
        } catch {}
      }

      // ── Aggiorna tasca (solo contanti, non carta/bonifico) ─────────────
      // Il trigger DB blocca eventuali duplicati automaticamente
      if (pm !== 'card' && pm !== 'transfer' && im > 0) {
        try {
          await supabase.from('pocket_cash').insert({
            user_id: user.id,
            note: sa ? `${st} — ${sa} (${pd})` : `${st} (${pd})`,
            delta: -im, moved_at: new Date().toISOString(),
          })
        } catch {}
      }

      const nItems = items.length
      const catIcon = {casa:'🏠',cene:'🍽️',vestiti:'👗',varie:'🧰'}[cat] || '📦'
      const catLabel = {casa:'Casa/Dispensa',cene:'Cene & Aperitivi',vestiti:'Vestiti & Moda',varie:'Spese Varie'}[cat] || cat
      setMessages(p => [...p, { role: 'assistant', text: `✅ Scontrino salvato!\n🏪 ${st}${sa?' — '+sa:''} — ${eur(im)}\n${catIcon} Categoria: ${catLabel}\n📦 ${nItems} prodotti registrati${cat === 'casa' && nItems ? ' in dispensa' : ''}` }])
      setJarvisOpen(true)
      if (userId) await loadData(userId)

    } catch (e) {
      setErr('Salvataggio: ' + e.message)
    }
  }

  async function salvaRisultato() {
    if (!ocrResult || saving) return; setSaving(true); setErr(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessione scaduta')
      const docType = ocrResult.doc_type || 'receipt'

      if (docType === 'wine_label') {
        const { data: newWine, error: wErr } = await supabase.from('wines').insert([{
          user_id: user.id,
          name: ocrResult.name || 'Vino (da etichetta)',
          winery: ocrResult.winery || null,
          denomination: ocrResult.denomination || null,
          region: ocrResult.region || null,
          vintage: ocrResult.vintage || null,
          alcohol: ocrResult.alcohol || null,
          style: ocrResult.style || 'rosso',
          grapes: ocrResult.grapes?.length ? ocrResult.grapes : null,
          source: 'ocr',
        }]).select().single()
        if (wErr) throw new Error(wErr.message)
        try {
          const geoQ = [ocrResult.locality, ocrResult.winery, ocrResult.region].filter(Boolean).join(' ')
          if (geoQ.trim()) {
            const geoR = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQ)}&limit=1`)
            const geoJ = await geoR.json()
            if (Array.isArray(geoJ) && geoJ.length) {
              await supabase.from('product_places').insert([{
                user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'origin',
                place_name: ocrResult.locality || geoJ[0].display_name,
                lat: Number(geoJ[0].lat), lng: Number(geoJ[0].lon), is_primary: true,
              }])
            }
          }
        } catch {}
        try {
          const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 }))
          await supabase.from('product_places').insert([{
            user_id: user.id, item_type: 'wine', item_id: newWine.id, kind: 'purchase',
            place_name: null, lat: pos.coords.latitude, lng: pos.coords.longitude, is_primary: true,
          }])
        } catch {}
        setOcrResult(null)
        alert(`✅ Vino salvato!\n🍷 ${ocrResult.name || 'Vino'}${ocrResult.winery ? '\n🏠 ' + ocrResult.winery : ''}${ocrResult.vintage ? '\n📅 ' + ocrResult.vintage : ''}`)
        return
      }

      const pd = ocrResult.purchase_date ?? new Date().toISOString().slice(0, 10)
      const st = ocrResult.store ?? 'Generico'
      const sa = ocrResult.store_address ?? null
      const im = parseFloat(ocrResult.price_total ?? 0)
      const cat = catFromStore(ocrResult.store, ocrResult.store_type)
        || (['casa','vestiti','cene','varie'].includes(ocrResult.categoria) ? ocrResult.categoria : 'varie')
      const pm = ocrResult.payment_method ?? 'cash'
      const items = Array.isArray(ocrResult.items) ? ocrResult.items : []

      // ── FIX description con città ───────────────────────────────────────
      const desc = sa ? `${st} — ${sa}` : st

      const { data: expRow, error: expErr } = await supabase.from('expenses').insert([{
        user_id: user.id, category: cat, store: st,
        store_address: sa,
        description: desc,
        purchase_date: pd, amount: im, payment_method: pm, source: 'ocr',
      }]).select('id').single()
      if (expErr) throw new Error(expErr.message)

      let recId = null
      try {
        const { data: rr } = await supabase.from('receipts').insert([{
          user_id: user.id, expense_id: expRow?.id, store: st,
          store_address: sa,
          purchase_date: pd, price_total: im, payment_method: pm,
          raw_text: ocrResult.raw_text ?? null, confidence: ocrResult.confidence ?? 'medium',
        }]).select('id').single(); recId = rr?.id ?? null
      } catch {}

      // Salva receipt_items per tutte le categorie
      if (recId && items.length) try {
        await supabase.from('receipt_items').insert(items.map(it => ({
          receipt_id: recId, user_id: user.id, name: it.name,
          brand: it.brand ?? null, qty: it.qty ?? 1, unit: it.unit ?? 'pz',
          unit_price: it.unit_price ?? it.price ?? 0, price: it.price ?? 0,
          category_item: it.category_item ?? 'alimentari',
          expiry_date: it.expiry_date ?? null, purchase_date: pd,
        })))
      } catch {}

      // Inventario solo per casa
      const itemsForInventory = items.filter(it => it.name && it.category_item !== 'altro')
      if (cat === 'casa' && itemsForInventory.length) for (const item of itemsForInventory) {
        try {
          const tot          = Number(item.qty || 1)
          const perishable   = item.perishable_type || 'standard'
          const catItem      = item.category_item   || 'alimentari'
          const expiryAuto   = perishable === 'fresh' && !item.expiry_date
            ? (() => { const d = new Date(pd); d.setDate(d.getDate()+2); return d.toISOString().slice(0,10) })()
            : (item.expiry_date ?? null)
          const searchKey = item.name.split(' ').slice(0,2).join(' ')
          const { data: ex } = await supabase.from('inventory').select('id,qty,initial_qty')
            .eq('user_id', user.id).ilike('product_name', `%${searchKey}%`).maybeSingle()
          if (ex) {
            await supabase.from('inventory').update({
              qty: Number(ex.qty || 0) + tot, initial_qty: Number(ex.initial_qty || 0) + tot,
              consumed_pct: 0, avg_price: item.unit_price || item.price || 0,
              last_updated: new Date().toISOString(), perishable_type: perishable,
              ...(expiryAuto ? { expiry_date: expiryAuto } : {}),
            }).eq('id', ex.id)
          } else {
            await supabase.from('inventory').insert({
              user_id: user.id, product_name: item.name, brand: item.brand ?? null,
              category: catItem, qty: tot, initial_qty: tot,
              avg_price: item.unit_price || item.price || 0,
              purchase_date: pd, expiry_date: expiryAuto, consumed_pct: 0,
              perishable_type: perishable,
            })
          }
        } catch (invErr) { console.warn('[inv] skip', item.name, invErr?.message) }
      }

      // Spunta lista spesa
      if (items.length) {
        try {
          const { data: listaAperta } = await supabase
            .from('shopping_list').select('id, name')
            .eq('user_id', user.id).eq('purchased', false)
          if (listaAperta?.length) {
            const daSpuntare = []
            for (const item of items) {
              if (!item.name) continue
              const parola = item.name.split(' ')[0].toLowerCase()
              const match = listaAperta.find(l =>
                l.name.toLowerCase().includes(parola) ||
                parola.includes(l.name.toLowerCase().split(' ')[0])
              )
              if (match && !daSpuntare.includes(match.id)) daSpuntare.push(match.id)
            }
            if (daSpuntare.length) {
              await supabase.from('shopping_list')
                .update({ purchased: true, updated_at: new Date().toISOString() })
                .in('id', daSpuntare)
            }
          }
        } catch (listErr) { console.warn('[lista] spunta skip:', listErr?.message) }
      }

      // ── Aggiorna tasca ────────────────────────────────────────────────
      if (pm !== 'card' && pm !== 'transfer' && im > 0) try {
        await supabase.from('pocket_cash').insert({
          user_id: user.id,
          note: sa ? `${st} — ${sa} (${pd})` : `${st} (${pd})`,
          delta: -im, moved_at: new Date().toISOString(),
        })
      } catch {}

      setOcrResult(null); if (userId) loadData(userId)
      alert(`✅ Salvato!\n🏪 ${st}${sa?' — '+sa:''}\n💶 €${im.toFixed(2)}${items.length ? `\n🛒 ${items.length} prodotti` : ''}`)

    } catch (e) { setErr('❌ ' + (e.message || 'Errore')) }
    finally { setSaving(false) }
  }

  const nAlert = alertItems.length

  /* ══ RENDER ══ */
  return (
    <>
      <Head>
        <title>Home – Jarvis</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Exo+2:ital,wght@0,300;0,400;1,900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>
      </Head>

      {/* ── OCR OVERLAY ── */}
      {loadingOCR && (
        <div className="ocr-overlay">
          <div className="scan-frame">
            <span className="sf-tl"/><span className="sf-tr"/>
            <span className="sf-bl"/><span className="sf-br"/>
            <div className="sf-beam"/>
          </div>
          <div className="ocr-title">ANALISI IN CORSO</div>
          <div className="ocr-sub">Riconoscimento documento · GPT-4o</div>
          <div className="ocr-prog"><div className="ocr-fill"/></div>
        </div>
      )}

      {/* ── SFONDO ── */}
      <div className="teal-bg" aria-hidden="true">
        <div className="bg-void"/>
        <canvas id="bg-particles" className="bg-particles"/>
        <div className="hex-grid"/>
        <div className="e-beam"/>
        <div className="scanlines"/>
      </div>

      <div className="home-wrap">

        {/* ── TOPBAR ── */}
        <div className="topbar">
          <div className="tb-id">SYS://JARVIS.4.0</div>
          <div className="tb-live">
            <div className="live-ring"><div className="live-dot"/></div>
            LIVE
          </div>
        </div>

        {/* ── ① LOGO ── */}
        <header className="hero">
          <div className="orbit-system">
            <div className="or or1"><div className="od od1"/></div>
            <div className="or or2"><div className="od od2"/></div>
            <div className="orbit-core"><div className="core-dot"/></div>
          </div>
          <div className="logo-title">JARVIS</div>
          <div className="logo-bar"/>
          <div className="logo-sub">NEURAL&nbsp;&nbsp;INTELLIGENCE</div>
        </header>

        {/* ── ② ORB BUTTONS — Voce · Scrivi · OCR · Bolletta ── */}
        <div className="cmd-zone">

          {/* Voce */}
          <button
            className={`orb ${isRec ? 'orb-rec' : ''} ${aibusy && !isRec ? 'orb-busy' : ''}`}
            onClick={toggleRec} disabled={aibusy && !isRec}
            title={isRec ? 'Ferma registrazione' : 'Parla con Jarvis'}>
            <span className="p1"/><span className="p2"/><span className="p3"/>
            <span className="oi">
              {isRec
                ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="#ff4d4d"/></svg>
                : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
              }
            </span>
            <span className="ol">{isRec ? 'Stop' : aibusy ? '…' : 'Voce'}</span>
          </button>

          {/* Scrivi */}
          <button
            className={`orb ${jarvisOpen ? 'orb-on' : ''}`}
            onClick={() => setJarvisOpen(v => !v)}
            title="Scrivi a Jarvis">
            <span className="p1"/><span className="p2"/><span className="p3"/>
            <span className="oi">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </span>
            <span className="ol">Scrivi</span>
          </button>

          {/* OCR */}
          <label
            className={`orb orb-g ${loadingOCR ? 'orb-busy' : ''}`}
            style={{cursor: loadingOCR ? 'wait' : 'pointer'}}
            title="Scansiona scontrino o etichetta">
            <span className="p1"/><span className="p2"/><span className="p3"/>
            <span className="oi">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </span>
            <span className="ol">{loadingOCR ? '…' : 'OCR'}</span>
            {!loadingOCR && (
              <input type="file" accept="image/*" style={{display:'none'}}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleOCR(f) }}/>
            )}
          </label>

          {/* Bolletta */}
          <label
            className={`orb ${billBusy ? 'orb-busy' : ''}`}
            style={{cursor: billBusy ? 'wait' : 'pointer'}}
            title="Scansiona bolletta gas/luce">
            <span className="p1"/><span className="p2"/><span className="p3"/>
            <span className="oi">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </span>
            <span className="ol">{billBusy ? '…' : 'Bolletta'}</span>
            {!billBusy && (
              <input ref={billOcrRef} type="file" accept="image/*,application/pdf" style={{display:'none'}}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleBillOcr(f) }}/>
            )}
          </label>

        </div>{/* /cmd-zone */}

        {/* ── DIVIDER ── */}
        <div className="sec-div">
          <div className="sdiv-line"/><div className="sdiv-dot"/><div className="sdiv-line"/>
        </div>

        {/* ── ③ KPI RINGS centrati ── */}
        <div className="kpi-row">

          {/* In Tasca */}
          <div className="ring-card">
            <svg className="ring-svg r-cw" viewBox="0 0 118 118" fill="none">
              <circle cx="59" cy="59" r="52" stroke="rgba(0,255,180,0.06)" strokeWidth="10"/>
              <circle cx="59" cy="59" r="52" stroke="rgba(0,255,180,0.5)" strokeWidth="1.2" strokeDasharray="238 88" strokeDashoffset="-24" strokeLinecap="round"/>
              <circle cx="59" cy="59" r="44" stroke="rgba(0,255,180,0.1)" strokeWidth="0.4" strokeDasharray="2 8"/>
            </svg>
            <svg className="ring-svg r-ccw" viewBox="0 0 118 118" fill="none">
              <circle cx="59" cy="7"   r="3" fill="#00ffb4" style={{filter:'drop-shadow(0 0 6px #00ffb4)'}}/>
              <circle cx="111" cy="59" r="2" fill="rgba(0,255,180,0.4)"/>
              <circle cx="59" cy="111" r="3" fill="#00ffb4" style={{filter:'drop-shadow(0 0 6px #00ffb4)'}}/>
              <circle cx="7" cy="59"  r="2" fill="rgba(0,255,180,0.4)"/>
            </svg>
            <div className="ring-data">
              <div className="ring-val">
                {pocketBal !== null ? `€ ${Math.round(pocketBal)}` : '—'}
              </div>
              <div className="ring-lbl">IN TASCA</div>
              <div className="ring-tick">▲ stabile</div>
            </div>
          </div>

          {/* Scorte / Alert */}
          <button
            className={`ring-card ring-btn ${nAlert > 0 ? 'ring-alert' : ''}`}
            onClick={() => setShowLista(v => !v)}>
            <svg className="ring-svg r-cw" viewBox="0 0 118 118" fill="none">
              <circle cx="59" cy="59" r="52" stroke={nAlert > 0 ? 'rgba(255,60,60,0.06)' : 'rgba(0,255,180,0.06)'} strokeWidth="10"/>
              <circle cx="59" cy="59" r="52" stroke={nAlert > 0 ? 'rgba(255,60,60,0.6)' : 'rgba(0,255,180,0.5)'} strokeWidth="1.2"
                strokeDasharray={nAlert > 0 ? '165 162' : '327 0'} strokeDashoffset="-24" strokeLinecap="round"/>
              <circle cx="59" cy="59" r="44" stroke={nAlert > 0 ? 'rgba(255,60,60,0.1)' : 'rgba(0,255,180,0.1)'} strokeWidth="0.4" strokeDasharray="2 8"/>
            </svg>
            <svg className="ring-svg r-ccw" viewBox="0 0 118 118" fill="none">
              {nAlert > 0 ? <>
                <circle cx="59" cy="7"   r="3" fill="#ff4d4d" style={{filter:'drop-shadow(0 0 6px #ff4d4d)'}}/>
                <circle cx="111" cy="59" r="2" fill="rgba(255,77,77,0.4)"/>
                <circle cx="59" cy="111" r="3" fill="#ff4d4d" style={{filter:'drop-shadow(0 0 6px #ff4d4d)'}}/>
                <circle cx="7" cy="59"  r="2" fill="rgba(255,77,77,0.4)"/>
              </> : <>
                <circle cx="59" cy="7"   r="3" fill="#00ffb4" style={{filter:'drop-shadow(0 0 6px #00ffb4)'}}/>
                <circle cx="111" cy="59" r="2" fill="rgba(0,255,180,0.4)"/>
                <circle cx="59" cy="111" r="3" fill="#00ffb4" style={{filter:'drop-shadow(0 0 6px #00ffb4)'}}/>
                <circle cx="7" cy="59"  r="2" fill="rgba(0,255,180,0.4)"/>
              </>}
            </svg>
            <div className="ring-data">
              <div className={`ring-val ${nAlert > 0 ? 'ring-val-r' : ''}`}>
                {nAlert > 0 ? `${nAlert} alert` : 'OK'}
              </div>
              <div className="ring-lbl">SCORTE</div>
              <div className={`ring-tick ${nAlert > 0 ? 'ring-tick-r' : ''}`}>
                {nAlert > 0 ? '⚠ attenzione' : '✓ tutto ok'}
              </div>
            </div>
          </button>

        </div>{/* /kpi-row */}

        {/* ── DROPDOWN SCORTE ── */}
        {showLista && (
          <div className="lista-drop">
            {alertItems.length === 0
              ? <div className="lista-empty">Nessun alert — tutto OK</div>
              : alertItems.map(item => (
                <div key={item.id} className={`lista-row ${item.type === 'lista' ? 'row-buy' : 'row-alert'}`}>
                  <span className="lista-name">{item.name}</span>
                  <span className="lista-tag">{item.tag}</span>
                </div>
              ))
            }
            <Link href="/liste-prodotti" className="lista-cta">Lista completa →</Link>
          </div>
        )}

        {/* ── ④ JARVIS TALK + CHAT ── */}
        <div className="jt-header">
          <div className="jt-left">
            <div className="jt-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,180,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <circle cx="9" cy="10" r="1" fill="rgba(0,255,180,0.8)"/>
                <circle cx="12" cy="10" r="1" fill="rgba(0,255,180,0.8)"/>
                <circle cx="15" cy="10" r="1" fill="rgba(0,255,180,0.8)"/>
              </svg>
            </div>
            <div>
              <div className="jt-title">PARLA CON JARVIS</div>
              <div className="jt-sub">Neural Interface · v4.0</div>
            </div>
          </div>
          <button className="jt-toggle" onClick={() => setJarvisOpen(v => !v)} title={jarvisOpen ? 'Minimizza' : 'Apri'}>
            {jarvisOpen
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            }
          </button>
        </div>

        {jarvisOpen && (
          <div className="chat-panel">
            <div className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
                  {m.role === 'assistant' && <span className="chat-av">J</span>}
                  <div className="chat-bubble">
                    {m.text.split('\n').map((l, li) => <p key={li} style={{margin: li > 0 ? '3px 0 0' : 0}}>{l}</p>)}
                  </div>
                </div>
              ))}
              {aibusy && (
                <div className="chat-msg msg-ai">
                  <span className="chat-av">J</span>
                  <div className="chat-bubble chat-typing"><span/><span/><span/></div>
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>

            <div className="chat-sugs">
              {[
                'Quanto mi resta questo mese?',
                'Quanto ho speso questo mese?',
                'Ho speso di più questo mese o il mese scorso?',
                'Cosa posso cucinare con quello che ho?',
                'Report mensile',
                'Cosa ho in dispensa?',
                'Consiglimi un vino rosso',
                'Vino per una bistecca',
                'Quanto costava il latte?',
              ].map(s => (
                <button key={s} className="sug-pill" onClick={() => !aibusy && send(s)} disabled={aibusy}>{s}</button>
              ))}
            </div>

            <form className="chat-form" onSubmit={onSubmit}>
              <button type="button" className={`chat-mic-btn ${isRec ? 'mic-rec' : ''}`}
                onClick={toggleRec} disabled={aibusy && !isRec}>
                {isRec
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                }
              </button>
              <input className="chat-inp" value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="JARVIS, dimmi…"
                disabled={aibusy || isRec}/>
              <button type="submit" className="chat-send"
                disabled={!textInput.trim() || aibusy || isRec}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(0,255,180,0.2)" stroke="rgba(0,255,180,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </div>
        )}

        {/* ── OCR PREVIEW ── */}
        {ocrResult && (
          <div className="ocr-prev">
            <div className="ocr-prev-head">
              <span>{ocrResult.doc_type === 'wine_label' ? '🍷 Etichetta vino' : `📋 ${ocrResult.doc_type === 'invoice' ? 'Fattura' : 'Scontrino'}`}</span>
              {ocrResult.confidence && (
                <span className={`conf conf-${ocrResult.confidence === 'high' ? 'hi' : ocrResult.confidence === 'medium' ? 'md' : 'lo'}`}>
                  {ocrResult.confidence === 'high' ? '✓ Alta' : ocrResult.confidence === 'medium' ? '~ Media' : '⚠ Bassa'}
                </span>
              )}
            </div>
            <div className="ocr-prev-rows">
              {ocrResult.doc_type === 'wine_label' ? <>
                <div className="ocr-row"><span>Vino</span><strong>{ocrResult.name ?? '—'}</strong></div>
                <div className="ocr-row"><span>Cantina</span><strong>{ocrResult.winery ?? '—'}</strong></div>
                <div className="ocr-row"><span>Località</span><strong>{ocrResult.locality ?? ocrResult.region ?? '—'}</strong></div>
                {ocrResult.vintage && <div className="ocr-row"><span>Annata</span><strong>{ocrResult.vintage}</strong></div>}
                {ocrResult.alcohol && <div className="ocr-row"><span>Alcol</span><strong>{ocrResult.alcohol}%</strong></div>}
                {ocrResult.denomination && <div className="ocr-row"><span>Denominazione</span><strong>{ocrResult.denomination}</strong></div>}
              </> : <>
                <div className="ocr-row"><span>Negozio</span><strong>{ocrResult.store ?? '—'}</strong></div>
                {ocrResult.store_address && <div className="ocr-row"><span>Indirizzo</span><strong>{ocrResult.store_address}</strong></div>}
                <div className="ocr-row"><span>Data</span><strong>{ocrResult.purchase_date ?? '—'}</strong></div>
                <div className="ocr-row"><span>Totale</span><strong style={{color:'#00ffb4'}}>€ {parseFloat(ocrResult.price_total ?? 0).toFixed(2)}</strong></div>
                <div className="ocr-row"><span>Pagamento</span><strong>{ocrResult.payment_method === 'card' ? '💳 Carta' : ocrResult.payment_method === 'transfer' ? '🏦 Bonifico' : '💵 Contanti'}</strong></div>
                <div className="ocr-row"><span>Categoria</span><strong>{ocrResult.categoria ?? '—'}</strong></div>
                {Array.isArray(ocrResult.items) && ocrResult.items.length > 0 && (
                  <div className="ocr-row"><span>Prodotti</span><strong>{ocrResult.items.length} articoli</strong></div>
                )}
              </>}
            </div>
            <div className="ocr-prev-btns">
              <button className="ocr-save" onClick={salvaRisultato} disabled={saving}>
                {saving ? '⏳ Salvataggio…' : ocrResult.doc_type === 'wine_label' ? '🍷 Salva vino' : '✅ Conferma e salva'}
              </button>
              <button className="ocr-cancel" onClick={() => !saving && setOcrResult(null)} disabled={saving}>✕</button>
            </div>
          </div>
        )}

        {err && <div className="err-box">{err}<button onClick={() => setErr(null)} style={{background:'none',border:'none',color:'inherit',cursor:'pointer',marginLeft:'8px',fontSize:'14px'}}>✕</button></div>}

        <div className="btm-bar">
          <span className="btm-t">0x4A4256 · BUILD 2026.03</span>
          <span className="btm-t">◈ SECURE</span>
        </div>

      </div>{/* /home-wrap */}

      {/* ── WINE VOTE MODAL ── */}
      {showVoteModal && pendingVote && (
        <div className="vote-overlay" onClick={e => e.target === e.currentTarget && setShowVoteModal(false)}>
          <div className="vote-modal">
            <div className="vote-header">
              <span>🍷 Com&apos;era <strong>{pendingVote.wineName}</strong>?</span>
              <button onClick={() => setShowVoteModal(false)}
                style={{background:'none',border:'none',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:'1rem'}}>✕</button>
            </div>
            <p className="vote-hint">Il feedback migliora i prossimi consigli</p>
            <div className="vote-section">
              <div className="vote-label">⭐ Voto al vino</div>
              <div className="vote-stars">
                {[1,2,3,4,5].map(n => (
                  <span key={n} onClick={() => setWineVote(v => ({...v, ratingWine: n}))}
                    style={{fontSize:'2rem',cursor:'pointer',color: n <= wineVote.ratingWine ? '#00ffb4' : 'rgba(255,255,255,.15)',transition:'color .1s'}}>
                    {n <= wineVote.ratingWine ? '★' : '☆'}
                  </span>
                ))}
              </div>
            </div>
            <div className="vote-section">
              <div className="vote-label">🎯 Consiglio azzeccato?</div>
              <div className="vote-stars">
                {[1,2,3,4,5].map(n => (
                  <span key={n} onClick={() => setWineVote(v => ({...v, ratingAdvice: n}))}
                    style={{fontSize:'2rem',cursor:'pointer',color: n <= wineVote.ratingAdvice ? '#00ffb4' : 'rgba(255,255,255,.15)',transition:'color .1s'}}>
                    {n <= wineVote.ratingAdvice ? '★' : '☆'}
                  </span>
                ))}
              </div>
              <div className="vote-labels-row"><span>Pessimo</span><span>Ottimo</span></div>
            </div>
            <input className="vote-notes" placeholder="Note (sapore, abbinamento, occasione…)"
              value={wineVote.notes} onChange={e => setWineVote(v => ({...v, notes: e.target.value}))}/>
            <button className="vote-submit" onClick={submitWineVote}
              disabled={!wineVote.ratingWine || !wineVote.ratingAdvice}>✓ Invia feedback</button>
          </div>
        </div>
      )}

      {/* styles moved to home.module.css */}

{/* particles init moved to useEffect below */}

    </>
  )
}

export default withAuth(Home)
export async function getServerSideProps() { return { props: {} } }