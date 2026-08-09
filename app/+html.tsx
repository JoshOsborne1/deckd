import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * Root HTML for Deckd web export.
 * Holds the icon set so "Add to Home Screen" on iOS/Android/PWA shows the
 * Deckd logo, and the PWA manifest for installability.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>Deckd</title>
        <meta name="theme-color" content="#F8F6F1" />
        {/* iOS / iPadOS Add to Home Screen */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        {/* Classic favicon */}
        <link rel="icon" href="/favicon.png" type="image/png" />
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
