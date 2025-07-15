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
        const { data, error } = await supabase.from('scorte').select('*');
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

  return (
    <>
      <Head>
        <title>Stato Scorte</title>
      </Head>
      <main className="container">
        <h1>Stato Scorte</h1>
        {loading && <p>Caricamento…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <pre>{JSON.stringify(items, null, 2)}</pre>
        <Link href="/">&larr; Torna alla Home</Link>
      </main>
    </>
  );
}
