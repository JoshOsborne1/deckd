// Metro web-only resolver: react-native-purchases ships a huge web paywall
// SDK (checkout UI + ~35-language i18n, ~3MB in the bundle) that deckd never
// uses — on web IAP is inert by design (lib/revenuecat.ts fails closed with
// "not configured"). Resolve it to a stub for platform=web only; native
// builds keep the real module untouched.
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const purchasesStub = path.join(__dirname, 'stubs', 'react-native-purchases.web.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-purchases') {
    return { type: 'sourceFile', filePath: purchasesStub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Terser with deeper compression: the web preview ships one ~3.3MB entry;
// extra compress passes + dropped prod debug calls reclaim the last few
// hundred KB without touching the native builds (Metro web only).
// console.error stays: the QA gate counts browser console errors.
config.transformer.minifierConfig = {
  compress: {
    passes: 5,
    drop_console: false,
    pure_funcs: ['console.debug', 'console.log', 'console.warn'],
  },
  mangle: true,
};

module.exports = config;
