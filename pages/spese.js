import React from 'react'
import Head from 'next/head'

import { useTranslations } from 'next-intl'

const Spese = (props) => {
  return (
    <>
      <div className="spese-container1">
        <Head>
          <title>spese - Jarvis-Assistent</title>
          <meta property="og:title" content="spese - Jarvis-Assistent" />
        </Head>
        <div className="min-h-screen bg-hud-900 w-full items-center flex text-hud-100 pt-20 flex-col">
          <h1 className="font-orbitron text-3xl mb-8 text-hud-cyan">Spese</h1>
          <ul
            id="expense-list"
            className="w-full max-w-lg list flex gap-4 flex-col"
          ></ul>
          <button className="h-16 rounded-full hud-glow w-16 button voice-fab bottom-4 right-4 fixed bg-hud-cyan">
            🎤
          </button>
        </div>
      </div>
      <style jsx>
        {`
          .spese-container1 {
            width: 100%;
            display: flex;
            min-height: 100vh;
            align-items: center;
            flex-direction: column;
          }
        `}
      </style>
    </>
  )
}

export default Spese

export async function getServerSideProps() {
  return { props: {} }
}
