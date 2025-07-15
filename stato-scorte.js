import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function StatoScorte() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('scorte')
          .select('*')
          .order('data_acquisto', { ascending: false });
        if (error) throw error;
        setItems(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  const consumoPercent = (item) => {
    if (!item.quantita_iniziale || !item.quantita_attuale) return 0;
    return Math.round(
      ((item.quantita_iniziale - item.quantita_attuale) / item.quantita_iniziale) * 100
    );
  };
  return (
    <>
      <Head>
        <title>Stato Scorte</title>
      </Head>
      <main className="container">
        <h1>Stato Scorte</h1>
        {loading && <p>Caricamento…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <table>
          <thead>
            <tr>
              <th>Prodotto</th>
              <th>Quantità</th>
              <th>Acquistato il</th>
              <th>Scadenza</th>
              <th>Consumo %</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const perc = consumoPercent(i);
              const nearExpire =
                i.data_scadenza &&
                new Date(i.data_scadenza) - new Date() < 10 * 24 * 60 * 60 * 1000;
              return (
                <tr key={i.id} style={{ color: perc > 80 || nearExpire ? 'red' : undefined }}>
                  <td>{i.prodotto}</td>
                  <td>{i.quantita_attuale ?? '-'} / {i.quantita_iniziale ?? '-'}</td>
                  <td>{i.data_acquisto}</td>
                  <td>{i.data_scadenza ?? '-'}</td>
                  <td>{perc}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Link href="/">← Torna alla Home</Link>
      </main>
    </>
  );
}
