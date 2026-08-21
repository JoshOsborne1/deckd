module.exports = {
  apps: [
    {
      name: 'deckd-relay',
      script: 'index.js',
      cwd: __dirname,
      env: { PORT: '8083' },
      max_restarts: 10,
      max_memory_restart: '300M',
    },
  ],
};