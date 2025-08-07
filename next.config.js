webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      fs: false,
      'fs/promises': false,
      events: false,
      crypto: false,
      path: false,
    };
  }
  return config;
}
