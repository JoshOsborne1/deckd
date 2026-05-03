module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@lib': './lib',
            '@components': './components',
            '@hooks': './src/hooks',
            '@assets': './assets',
            '@theme': './src/lib/theme',
            '@store': './src/store',
            '@engine': './src/engine',
          },
          extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.jsx', '.js', '.json'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
