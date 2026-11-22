/**
 * Babel config for the Expo app.
 *
 * In this npm-workspaces monorepo `babel-preset-expo` is hoisted to the root
 * node_modules while npm keeps `expo-router` inside apps/mobile/node_modules.
 * The preset only enables its expo-router plugin when it can `require.resolve`
 * expo-router from its own location, so we add that plugin explicitly.
 * Without it the bundle fails with "Invalid call … EXPO_ROUTER_APP_ROOT".
 */
// Babel loads this file as CommonJS, so require() is the only option here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [expoRouterBabelPlugin],
  };
};
