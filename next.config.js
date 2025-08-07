// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    // permetti di importare .wasm facendo in modo che venga copiato in .next/static/
    config.module.rules.push({
      test: /\.wasm$/,
      // Next >12.0 supporta asset modules, ma per compatibilità usiamo file-loader
      type: 'javascript/auto',
      use: [
        {
          loader: require.resolve('file-loader'),
          options: {
            publicPath: '/_next/static/wasm/',
            outputPath: 'static/wasm/',
            name: '[name].[hash].[ext]',
          },
        },
      ],
    });

    return config;
  },
};

module.exports = nextConfig;
