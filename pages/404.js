// pages/404.js
import Head from 'next/head';
import Link from 'next/link';

export default function Custom404() {
  return (
    <>
      <Head>
        <title>404 – Pagina non trovata</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="text-xl">Oops! Pagina non trovata.</p>

        {/* Link interno conforme a ESLint */}
        <Link href="/" className="underline text-blue-600">
          Torna alla home
        </Link>
      </main>
    </>
  );
}

export async function getServerSideProps() {
  return { props: {} }
}
