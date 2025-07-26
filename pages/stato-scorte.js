// pages/stato-scorte.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function StatoScorte() {
  const [scorte,  setScorte]  = useState([]);
  const [critici, setCritici] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // lista completa
        const { data: all, error: err1 } = await supabase
          .from('inventory')                 // <‑‑ cambia in 'scorte' se il tuo schema è diverso
          .select('*')
          .order('expiry_date', { ascending: true });
        if (err1) throw err1;

        // prodotti in esaurimento / in scadenza
        const { data: warn, error: err2 } = await supabase
          .from('inventory')
          .select('*')
          .or('consumed_pct.gte.80,days_to_expiry.lte.10')
          .order('days_to_expiry', { ascending: true });
        if (err2) throw err2;

        setScorte(all);
        setCritici(warn);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <>
      <Head><title>Stato Scorte</title></Head>

      <main className="container">
        <h1>Stato Scorte</h1>

        {loading && <p>Caricamento…</p>}
        {error   && <p style={{ color: 'red' }}>{error}</p>}

        {/* -------- TABELLONE COMPLETO -------- */}
        {!loading && !error && (
          <>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Prodotto</th><th>Qtà</th><th>% Consumo</th><th>Scade fra (gg)</th>
                </tr>
              </thead>
              <tbody>
                {scorte.map(p => (
                  <tr key={p.id}>
                    <td>{p.product}</td>
                    <td>{p.current_qty}</td>
                    <td>{p.consumed_pct?.toFixed(0)}%</td>
                    <td>{p.days_to_expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* -------- SEZIONE CRITICA -------- */}
            <h3 style={{ marginTop: '2rem' }}>Prodotti in esaurimento / in scadenza</h3>

            <table className="custom-table">
              <thead>
                <tr>
                  <th>Prodotto</th><th>Qtà</th><th>% Consumo</th><th>Scade fra (gg)</th>
                </tr>
              </thead>
              <tbody>
                {critici.map(p => (
                  <tr key={p.id}>
                    <td>{p.product}</td>
                    <td>{p.current_qty}</td>
                    <td>
                      <div style={{ width:'100%', background:'#333', borderRadius:4 }}>
                        <div style={{
                          width: `${p.consumed_pct}%`,
                          background: p.consumed_pct >= 80 ? '#ef4444' : '#22c55e',
                          height: 8,
                          borderRadius: 4
                        }} />
                      </div>
                      {p.consumed_pct?.toFixed(0)}%
                    </td>
                    <td>{p.days_to_expiry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <Link href="/" style={{ display:'inline-block', marginTop:'1.5rem' }}>
          &larr; Torna alla Home
        </Link>
      </main>

      {/* ---- stile tabella minimale, riutilizzabile ---- */}
      <style jsx global>{`
        .container { max-width: 900px; margin: 2rem auto; padding: 0 1rem; font-family: Inter, sans-serif; }
        table.custom-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        table.custom-table th, table.custom-table td {
          padding: .65rem 1rem; border: 1px solid #ddd; text-align: left;
        }
        table.custom-table thead { background: #f3f4f6; }
        table.custom-table tbody tr:nth-child(odd) { background: #fafafa; }
      `}</style>
    </>
  );
}
