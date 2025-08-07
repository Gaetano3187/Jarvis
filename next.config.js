// next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config) {
    // tratta tutti i .wasm come asset/resource
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/wasm/[name].[hash][ext]',
      },
    });
    return config;
  },
};
