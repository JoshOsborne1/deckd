// Web-only stub for react-native-purchases.
// IAP is inert on web by design (RevenueCat web SDK has no deckd usage; the
// store fails closed with "not configured"). Metro resolves this file for
// platform=web only (see metro.config.js), so the ~1.5MB+ RC web paywall SDK
// never enters the web bundle. Native builds keep the real module.
module.exports = {
  default: undefined,
  LOG_LEVEL: {},
};
