// next.config.js
/** @type {import('next').NextConfig} */
module.exports = {
  // rimuovi entirely la sezione experimental.wasm
  webpack(config) {
    return config
  }
}
