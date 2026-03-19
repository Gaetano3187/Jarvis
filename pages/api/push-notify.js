// pages/api/push-notify.js
// subscribe / check (polling) / send_pending
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action, userId } = req.body || {}

  // ── Subscribe ──────────────────────────────────────────────────
  if (action === 'subscribe') {
    const { subscription } = req.body
    if (!userId || !subscription?.endpoint) return res.status(400).json({ error: 'Dati mancanti' })
    const { error } = await sb.from('push_subscriptions').upsert({
      user_id:    userId,
      endpoint:   subscription.endpoint,
      p256dh:     subscription.keys?.p256dh  || '',
      auth_key:   subscription.keys?.auth    || '',
      user_agent: (req.headers['user-agent'] || '').slice(0, 200),
    }, { onConflict: 'endpoint' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── Check notifiche pending (polling ogni 5 min dal client) ────
  if (action === 'check') {
    if (!userId) return res.status(400).json({ error: 'userId richiesto' })
    const { data: pending } = await sb.from('notification_queue')
      .select('*').eq('user_id', userId)
      .is('sent_at', null)
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
    return res.status(200).json({ pending: pending || [] })
  }

  // ── Mark sent (segnala che la notifica è stata mostrata) ────────
  if (action === 'mark_sent') {
    const { notificationId } = req.body
    if (!notificationId) return res.status(400).json({ error: 'notificationId richiesto' })
    await sb.from('notification_queue')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', notificationId).eq('user_id', userId)
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'action non supportata' })
}