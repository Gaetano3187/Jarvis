/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Evita che il client provi a bundlare moduli Node
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        events: false,
        crypto: false,
      };
      // Gestisce anche la sintassi "node:xxx"
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'node:fs': false,
        'node:path': false,
        'node:events': false,
        'node:crypto': false,
        // se per caso qualcosa tira dentro formidable dal client, stoppiamolo
        formidable: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
