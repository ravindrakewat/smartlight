/**
 * Babel config for the Expo app. Since SDK 58, babel-preset-expo resolves
 * expo-router from the project root (apps/mobile), so it enables the
 * expo-router transform by itself in this monorepo.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
