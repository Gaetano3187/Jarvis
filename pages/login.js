import React, { Fragment, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

import SignIn1 from '../components/sign-in1';

const Login = () => {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
await signIn({ email, password });
      router.push('/home');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Fragment>
      <Head>
        <title>Login - Jarvis</title>
      </Head>

      <form id="loginform" onSubmit={handleSubmit}>
        <SignIn1 />
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </Fragment>
  );
};

export default Login;
