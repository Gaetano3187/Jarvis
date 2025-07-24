import React, { Fragment, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

export const dynamic = 'force-dynamic';      // ← disabilita prerender SSG
// in alternativa:
// export async function getServerSideProps() { return { props: {} }; }

const Register = () => {
  const router = useRouter();
  const { signUp } = useAuth();
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const email    = e.target.email.value;
    const password = e.target.password.value;

    try {
      await signUp(email, password);
      router.push('/home');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Fragment>
      <Head>
        <title>Registrati - Jarvis</title>
      </Head>

      <form onSubmit={handleSubmit} style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h2>Registrati</h2>

        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          style={{ display: 'block', width: '100%', marginBottom: '10px' }}
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          style={{ display: 'block', width: '100%', marginBottom: '10px' }}
        />

        <button type="submit" style={{ width: '100%' }}>
          Crea account
        </button>

        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </Fragment>
  );
};

export default Register;
