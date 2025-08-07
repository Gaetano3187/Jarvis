// next.config.js
const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    // 1) Copia tesseract-core-simd.wasm in public/
    if (!isServer) {
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.resolve(
                __dirname,
                'node_modules/tesseract.js-core/tesseract-core-simd.wasm'
              ),
              to: path.resolve(__dirname, 'public', 'tesseract-core-simd.wasm'),
            },
          ],
        })
      )
    }

    // 2) (Opzionale) Se importi altri .wasm, usarli come asset/resource
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/wasm/[name].[hash][ext]',
      },
    })

    return config
  },
}

module.exports = nextConfig
