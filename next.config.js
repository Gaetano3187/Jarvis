// next.config.js
const path = require('path')

/** @type {import('next').NextConfig} */
module.exports = {
  // abilitare il WASM sperimentale
  experimental: {
    wasm: true,
    esmExternals: true,  // necessario per alcune dipendenze ESM-only
  },

  webpack(config, { isServer }) {
    // 1) consentiamo l'import di .wasm
    config.resolve.extensions.push('.wasm')

    // 2) regola per emettere i .wasm come asset in /_next/static/wasm
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      include: /node_modules[\\/]tesseract\.js-core/,  // basta puntare alla cartella core
      generator: {
        filename: 'static/wasm/[name][ext]',  // /_next/static/wasm/…
      },
    })

    // 3) in produzione, Next.js di default ignora .wasm nei lambda se isServer,
    //    ma asset/resource lo include comunque nel dist
    return config
  },
}
