/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        events: false,
        crypto: false,
      };
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'node:fs': false,
        'node:path': false,
        'node:events': false,
        'node:crypto': false,
        formidable: false,
      };
    }
    return config;
  },
};
module.exports = nextConfig;
