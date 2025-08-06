/** next.config.js */
module.exports = {
  experimental: { wasm: true },
  webpack(config) {
    // permette di importare .wasm da node_modules
    config.resolve.extensions.push('.wasm');
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource'
    });
    return config;
  }
};
