// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    // gestisci i .wasm come asset/resource, così verranno emessi in /_next/static/
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        // dove vengono scritti in output: .next/static/wasm/
        filename: 'static/wasm/[name].[hash][ext]',
        publicPath: '/_next/',
      },
    })

    return config
  },
}

module.exports = nextConfig
