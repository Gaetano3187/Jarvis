import Head from 'next/head';
import Link from 'next/link';
// (nessun import di componenti che non esistono)

export default function Custom404() {
  return (
    <>
      <Head>
        <title>404 – Pagina non trovata</title>
      </Head>

      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="text-xl">Oops! Pagina non trovata.</p>
        <Link href="/" className="underline text-blue-600">
          Torna alla home
        </Link>
      </main>
    </>
  );
}
