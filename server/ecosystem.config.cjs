module.exports = {
  apps: [
    {
      name: 'deckd-relay',
      script: 'index.js',
      cwd: __dirname,
      env: {
        PORT: '8083',
        // Web IAP is inert (react-native-purchases web stub, fail-closed), so
        // the web build can NEVER mint a masterToken (no EXPO_PUBLIC secret is
        // shipped). Requiring host auth would make hosting impossible on web.
        // ALLOW_UNAUTHENTICATED_HOSTS restores the documented dev-mode hosting
        // path that the P0-3 gate (d07300c) accidentally broke for this
        // deployment: server refuses create_room when neither the secret nor
        // this flag is set. Native builds still use the real SDK + pass.
        ALLOW_UNAUTHENTICATED_HOSTS: 'true',
      },
      max_restarts: 10,
      max_memory_restart: '300M',
    },
  ],
};