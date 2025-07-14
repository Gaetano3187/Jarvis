import React from 'react'
import Head from 'next/head'

import { useTranslations } from 'next-intl'

const Log = (props) => {
  return (
    <>
      <div className="log-container1">
        <Head>
          <title>log - Jarvis-Assistent</title>
          <meta property="og:title" content="log - Jarvis-Assistent" />
        </Head>
        <div className="bg-hud-900 w-full justify-center items-center flex h-screen flex-col">
          <video
            src="https://cdn.jsdelivr.net/gh/Gaetano3187/jarvis-assistant@main/Public/intro.mp4"
            muted
            autoplay
            aria-label="Animazione olografica del logo Jaster che pulsa su sfondo scuro; dura 3 s e sfuma nella schermata di login."
            playsinline
            className="h-full w-full object-cover absolute inset-0"
          ></video>
          <div className="items-center bg-hud-800/70 flex relative rounded gap-4 flex-col p-8 z-10">
            <img
              alt="Logo Jaster"
              src="/assets/logo.svg"
              className="hud-glow w-32"
            />
            <form className="w-64 flex gap-4 flex-col">
              <input
                type="email"
                placeholder="Email"
                className="input bg-hud-900 p-2 text-hud-100 rounded"
              />
              <input
                type="password"
                placeholder="Password"
                className="input bg-hud-900 p-2 text-hud-100 rounded"
              />
              <button className="hud-glow button text-hud-900 px-4 rounded bg-hud-cyan py-2">
                Entra
              </button>
            </form>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .log-container1 {
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

export default Log
