/**
 * Ambient module declarations for static asset imports.
 *
 * Metro resolves `import x from '*.wav'` to a numeric asset module id on
 * native and a URL string on web; expo-audio's `createAudioPlayer` accepts
 * both (`AudioSource | string | number`). Declaring the union keeps the
 * static-import pattern type-safe without `require()`.
 */
declare module '*.wav' {
  const source: number | string;
  export default source;
}
