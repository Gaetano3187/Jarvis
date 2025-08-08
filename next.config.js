// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  webpack: (config) => {
    // Evita problemi di build con moduli solo lato server
    config.externals.push({
      formidable: 'commonjs formidable',
      fs: 'commonjs fs',
      os: 'commonjs os',
      path: 'commonjs path',
    })
    return config
  }
}

module.exports = nextConfig
