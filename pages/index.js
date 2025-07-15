// pages/index.js
import React, { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

import { useAuth } from '../context/AuthContext'
import SignIn1 from '../components/sign-in1'

export default function Login () {
  const router = useRouter()
  const { signIn } = useAuth()
  const [error, setError] = useState(null)

  /*──────── SUBMIT ────────*/
  const handleSubmit = async (e) => {
    e.preventDefault()
    const email = e.target['thq-sign-in-1-email']?.value
    const password = e.target['thq-sign-in-1-password']?.value

    try {
      await signIn(email, password)     // Supabase auth
      router.push('/home')              // redirect
    } catch (err) {
      setError(err.message)
    }                         //  ← chiude il catch
  };                          //  ← chiude l’arrow-function

  /*──────── UI ────────*/
  return (
    <>
      <Head>
        <title>Login - Jarvis</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="login-page hud-bg">
        {/* video di sfondo */}
        <video
          className="bg-video"
          src="/intro.mp4"
          autoPlay
          muted
          playsInline
          poster="https://play.teleporthq.io/static/svg/videoposter.svg"
        />

        {/* wrapper centrale */}
        <div className="form-wrapper">
          <form id="loginform" onSubmit={handleSubmit}>
            <SignIn1 action1={<span>Sign&nbsp;In</span>} />
            {error && <p style={{ color: 'red' }}>{error}</p>}
          </form>
        </div>
      </div>

      {/*──────── STILI LOCALI ────────*/}
      <style jsx>{`
        .login-page {
          position: relative;
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .bg-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }

        .form-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 600px;
          padding: 2rem;
        }

        @media (max-width: 767px) {
          .form-wrapper {
            padding: 1rem;
          }
        }
      `}</style>
    </>
  )
}
