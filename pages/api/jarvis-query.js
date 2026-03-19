// pages/api/jarvis-query.js
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

function iso(d) { return d.toISOString().slice(0, 10) }
function eur(n) { return (Number(n) || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { type, userId, payload = {} } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId richiesto' })

  try {
    switch (type) {

      // ── BUDGET basato su entrate reali ─────────────────────────────
      case 'budget_status': {
        // Periodo busta paga: dal giorno 10 del mese scorso al 9 del mese corrente
        const now = new Date()
        const d = now.getDate(), y = now.getFullYear(), m = now.getMonth()
        let periodStart, periodEnd
        if (d >= 10) {
          periodStart = new Date(y, m, 10)
          periodEnd   = new Date(y, m + 1, 9)
        } else {
          periodStart = new Date(y, m - 1, 10)
          periodEnd   = new Date(y, m, 9)
        }
        const ps = iso(periodStart), pe = iso(now)

        // Entrate del periodo (escluse riserve/carryover)
        const [{ data: incData }, { data: expData }, { data: coData }] = await Promise.all([
          sb.from('incomes').select('amount,source').eq('user_id', userId)
            .gte('received_date', ps).lte('received_date', pe),
          sb.from('expenses').select('amount,category').eq('user_id', userId)
            .gte('purchase_date', ps).lte('purchase_date', pe),
          sb.from('carryovers').select('amount,note').eq('user_id', userId),
        ])

        const entrate  = (incData  || []).reduce((t, r) => t + Number(r.amount || 0), 0)
        const spese    = (expData  || []).reduce((t, r) => t + Number(r.amount || 0), 0)
        const riserve  = (coData   || []).reduce((t, r) => t + Number(r.amount || 0), 0)
        const disponibile = entrate - spese  // riserve ESCLUSE dal disponibile corrente
        const pct      = entrate > 0 ? Math.round((spese / entrate) * 100) : 0

        const byCat = {}
        ;(expData || []).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0) })
        const catIcons = { casa: '🏠', cene: '🍽️', vestiti: '👗', varie: '🧰' }
        const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1])
          .map(([c, v]) => `  ${catIcons[c] || '📦'} ${c}: ${eur(v)}`).join('\n')

        let alertMsg = null
        if (pct >= 90)
          alertMsg = `⚠️ ATTENZIONE: hai usato il ${pct}% delle entrate!\nTi restano solo ${eur(disponibile)} disponibili.\n💰 Hai inoltre ${eur(riserve)} di riserve separate.`
        else if (pct >= 80)
          alertMsg = `⚡ Stai per esaurire le disponibilità mensili.\nHai ancora ${eur(disponibile)} (${100 - pct}% delle entrate).\n💰 Riserve: ${eur(riserve)}`

        const summary = `💰 Periodo: ${ps} → ${pe}\n• Entrate: ${eur(entrate)}\n• Spese: ${eur(spese)} (${pct}%)\n• Disponibile: ${eur(disponibile)}\n• Riserve (carryover): ${eur(riserve)}\n\nDettaglio:\n${catLines || '  nessuna spesa'}`

        return res.status(200).json({
          entrate, spese, disponibile, riserve, pct, byCat,
          alert: alertMsg,
          text: alertMsg ? `${alertMsg}\n\n${summary}` : summary
        })
      }

      // ── CONFRONTO MESI ─────────────────────────────────────────────
      case 'compare_months': {
        const now = new Date()
        const thisStart = iso(new Date(now.getFullYear(), now.getMonth(), 1))
        const thisEnd   = iso(now)
        const prevStart = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))
        const prevEnd   = iso(new Date(now.getFullYear(), now.getMonth(), 0))
        const thisLabel = now.toLocaleString('it-IT', { month: 'long' })
        const prevLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('it-IT', { month: 'long' })

        const [{ data: thisExp }, { data: prevExp }, { data: thisInc }, { data: prevInc }] = await Promise.all([
          sb.from('expenses').select('amount,category').eq('user_id', userId).gte('purchase_date', thisStart).lte('purchase_date', thisEnd),
          sb.from('expenses').select('amount,category').eq('user_id', userId).gte('purchase_date', prevStart).lte('purchase_date', prevEnd),
          sb.from('incomes').select('amount').eq('user_id', userId).gte('received_date', thisStart).lte('received_date', thisEnd),
          sb.from('incomes').select('amount').eq('user_id', userId).gte('received_date', prevStart).lte('received_date', prevEnd),
        ])

        const sum = arr => (arr || []).reduce((t, r) => t + Number(r.amount || 0), 0)
        const byCat = arr => {
          const m = {}; (arr || []).forEach(e => { m[e.category] = (m[e.category] || 0) + Number(e.amount || 0) }); return m
        }

        const cTot = sum(thisExp), pTot = sum(prevExp)
        const cInc = sum(thisInc), pInc = sum(prevInc)
        const diff = cTot - pTot
        const pct  = pTot > 0 ? Math.round((diff / pTot) * 100) : 0
        const cCat = byCat(thisExp), pCat = byCat(prevExp)
        const catIcons = { casa: '🏠', cene: '🍽️', vestiti: '👗', varie: '🧰' }
        const allCats = [...new Set([...Object.keys(cCat), ...Object.keys(pCat)])]
        const catLines = allCats.map(c => {
          const cv = cCat[c] || 0, pv = pCat[c] || 0, delta = cv - pv
          const sign = delta > 0 ? '+' : ''
          return `  ${catIcons[c] || '📦'} ${c}: ${eur(cv)} vs ${eur(pv)} (${sign}${eur(delta)})`
        }).join('\n')

        const trend = diff > 0
          ? `📈 Hai speso ${eur(Math.abs(diff))} IN PIÙ (+${pct}%) rispetto a ${prevLabel}`
          : diff < 0
          ? `📉 Hai speso ${eur(Math.abs(diff))} IN MENO (${pct}%) rispetto a ${prevLabel}`
          : `→ Hai speso uguale a ${prevLabel}`

        return res.status(200).json({
          current:  { month: thisLabel, expenses: cTot, incomes: cInc },
          previous: { month: prevLabel, expenses: pTot, incomes: pInc },
          diff, pct,
          text: `📅 ${trend}\n\n${thisLabel}: ${eur(cTot)} spese · ${eur(cInc)} entrate\n${prevLabel}:  ${eur(pTot)} spese · ${eur(pInc)} entrate\n\nDettaglio categorie:\n${catLines}`
        })
      }

      // ── RICETTE CON DISPENSA ───────────────────────────────────────
      case 'recipes': {
        if (!openai) return res.status(500).json({ error: 'OpenAI non configurato' })
        const { data: inv } = await sb.from('inventory')
          .select('product_name,brand,qty,unit_label,unit').eq('user_id', userId).gt('qty', 0)
        if (!inv?.length) return res.status(200).json({ text: '📦 Dispensa vuota — nessun ingrediente disponibile.' })

        const ingredienti = inv.map(i =>
          `${i.product_name}${i.brand ? ' (' + i.brand + ')' : ''}: ${i.qty} ${i.unit_label || i.unit || 'pz'}`
        ).join(', ')
        const pref = payload.preference ? ` (preferenza: ${payload.preference})` : ''

        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 900,
          messages: [{
            role: 'user',
            content: `Sei uno chef italiano pratico. Ingredienti in dispensa: ${ingredienti}\n\nSuggerisci 3 ricette${pref} fattibili con questi ingredienti. Per ciascuna:\n- Nome della ricetta\n- Ingredienti usati (quelli che ho)\n- Ingredienti mancanti (massimo 2-3, comuni)\n- Tempo: XX minuti\n- Procedimento: 3 passaggi rapidi\n\nRispondi in italiano, tono pratico e diretto.`
          }]
        })
        return res.status(200).json({ text: '🍳 ' + (resp.choices?.[0]?.message?.content || 'Nessuna ricetta trovata.') })
      }

      // ── STORICO PREZZI ─────────────────────────────────────────────
      case 'price_history': {
        const { product } = payload
        if (!product?.trim()) return res.status(400).json({ error: 'product richiesto' })

        const [{ data: items }, { data: ph }] = await Promise.all([
          sb.from('receipt_items')
            .select('name,brand,unit_price,purchase_date,receipt_id,receipts!inner(store)')
            .eq('user_id', userId).ilike('name', `%${product}%`)
            .order('purchase_date', { ascending: false }).limit(15),
          sb.from('price_history')
            .select('product_name,brand,store,price,unit,purchase_date')
            .eq('user_id', userId).ilike('product_name', `%${product}%`)
            .order('purchase_date', { ascending: false }).limit(15),
        ])

        const allPrices = [
          ...(items || []).filter(i => Number(i.unit_price) > 0).map(i => ({
            name: i.name, store: i.receipts?.store || '—',
            price: Number(i.unit_price), date: i.purchase_date
          })),
          ...(ph || []).map(p => ({
            name: p.product_name, store: p.store || '—',
            price: Number(p.price), date: p.purchase_date
          }))
        ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

        if (!allPrices.length) return res.status(200).json({ text: `📊 Nessun prezzo trovato per "${product}".` })

        const prices = allPrices.map(p => p.price)
        const minP = Math.min(...prices), maxP = Math.max(...prices), avgP = prices.reduce((a, b) => a + b, 0) / prices.length
        const last = allPrices[0], oldest = allPrices[allPrices.length - 1]
        const trend = last.price > oldest.price ? '📈 in aumento' : last.price < oldest.price ? '📉 in calo' : '→ stabile'

        const list = allPrices.slice(0, 8).map(p => `  ${p.date} @ ${p.store}: ${eur(p.price)}`).join('\n')

        return res.status(200).json({
          prices: allPrices, min: minP, max: maxP, avg: avgP,
          text: `📊 Storico prezzi "${product}":\n\n• Ultimo: ${eur(last.price)} il ${last.date} @ ${last.store}\n• Min: ${eur(minP)} · Max: ${eur(maxP)} · Media: ${eur(avgP)}\n• Tendenza: ${trend}\n\nUltimi acquisti:\n${list}`
        })
      }

      // ── REPORT A RICHIESTA ─────────────────────────────────────────
      case 'report': {
        const { period = 'month' } = payload
        const now = new Date()
        let dateFrom, dateTo, label

        if (period === 'week') {
          const lun = new Date(now); lun.setDate(now.getDate() - ((now.getDay() || 7) - 1))
          dateFrom = iso(lun); dateTo = iso(now); label = 'questa settimana'
        } else if (period === 'year') {
          dateFrom = `${now.getFullYear()}-01-01`; dateTo = iso(now); label = `anno ${now.getFullYear()}`
        } else {
          dateFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1)); dateTo = iso(now)
          label = now.toLocaleString('it-IT', { month: 'long', year: 'numeric' })
        }

        const [{ data: exps }, { data: incs }, { data: inv }, { data: billsDue }] = await Promise.all([
          sb.from('expenses').select('amount,category,store,purchase_date').eq('user_id', userId)
            .gte('purchase_date', dateFrom).lte('purchase_date', dateTo).order('amount', { ascending: false }),
          sb.from('incomes').select('amount,source').eq('user_id', userId)
            .gte('received_date', dateFrom).lte('received_date', dateTo),
          sb.from('inventory').select('product_name,qty,expiry_date').eq('user_id', userId),
          sb.from('bills').select('type,amount,due_date').eq('user_id', userId).eq('paid', false)
            .lte('due_date', iso(new Date(Date.now() + 14 * 86400000))),
        ])

        const totExp = (exps  || []).reduce((t, e) => t + Number(e.amount || 0), 0)
        const totInc = (incs  || []).reduce((t, i) => t + Number(i.amount || 0), 0)
        const byCat  = {}; (exps || []).forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0) })
        const topStores = Object.entries((exps || []).reduce((acc, e) => {
          if (e.store) acc[e.store] = (acc[e.store] || 0) + Number(e.amount || 0); return acc
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
        const catIcons = { casa: '🏠', cene: '🍽️', vestiti: '👗', varie: '🧰' }
        const expScad = (inv || []).filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now() + 7 * 86400000))

        let txt = `📊 REPORT ${label.toUpperCase()}\n${'─'.repeat(32)}\n\n`
        txt += `💰 FINANZIARIO\n• Entrate: ${eur(totInc)}\n• Spese:   ${eur(totExp)}\n• Saldo:   ${eur(totInc - totExp)}\n\n`
        txt += `📦 CATEGORIE\n${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
          `  ${catIcons[c] || '📦'} ${c}: ${eur(v)} (${totExp > 0 ? Math.round(v / totExp * 100) : 0}%)`).join('\n') || '  nessuna'}\n\n`
        if (topStores.length) txt += `🏪 TOP NEGOZI\n${topStores.map(([s, v]) => `  ${s}: ${eur(v)}`).join('\n')}\n\n`
        if (expScad.length)   txt += `⚠️ IN SCADENZA (7gg)\n${expScad.map(i => `  ${i.product_name} → ${i.expiry_date}`).join('\n')}\n\n`
        if (billsDue?.length) txt += `📋 BOLLETTE IN SCADENZA (14gg)\n${billsDue.map(b => `  ${b.type}: ${eur(b.amount)} scad. ${b.due_date}`).join('\n')}\n\n`

        return res.status(200).json({ text: txt, totExp, totInc, byCat })
      }

      // ── SALVA BOLLETTA (da OCR) ────────────────────────────────────
      case 'save_bill': {
        const { billData } = payload
        if (!billData?.amount) return res.status(400).json({ error: 'billData.amount richiesto' })

        const today = new Date().toISOString().slice(0, 10)
        const desc  = `Bolletta ${billData.type || ''}${billData.period_from ? ' (' + billData.period_from + ' / ' + (billData.period_to || '') + ')' : ''}`

        const { data: exp, error: eErr } = await sb.from('expenses').insert({
          user_id: userId, category: 'casa',
          store: billData.provider || 'Bolletta',
          description: desc,
          amount: Number(billData.amount),
          purchase_date: billData.due_date || today,
          source: 'ocr'
        }).select('id').single()
        if (eErr) throw eErr

        const { data: bill, error: bErr } = await sb.from('bills').insert({
          user_id:     userId,
          type:        billData.type || 'altro',
          provider:    billData.provider || null,
          amount:      Number(billData.amount),
          period_from: billData.period_from || null,
          period_to:   billData.period_to   || null,
          due_date:    billData.due_date     || null,
          paid:        false,
          expense_id:  exp.id,
          raw_text:    (billData.raw_text || '').slice(0, 3000),
        }).select().single()
        if (bErr) throw bErr

        return res.status(200).json({
          bill, expense_id: exp.id,
          text: `✅ Bolletta ${billData.type || ''} salvata!\n• Fornitore: ${billData.provider || '—'}\n• Importo: ${eur(billData.amount)}${billData.due_date ? '\n• Scadenza: ' + billData.due_date : ''}`
        })
      }

      default:
        return res.status(400).json({ error: `Tipo non supportato: ${type}` })
    }
  } catch (e) {
    console.error('[jarvis-query]', type, e?.message)
    return res.status(500).json({ error: e?.message || 'Errore interno' })
  }
}