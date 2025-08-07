// next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config) {
    // abilita il supporto a WebAssembly e lo tratta come asset
    config.experiments = config.experiments || {};
    config.experiments.asyncWebAssembly = true;

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
