// Sentry's Metro config replaces Expo's, then NativeWind wraps the result.
// Order matters: getSentryExpoConfig is getDefaultConfig plus the source-map
// handling Sentry needs, so it has to be the base rather than something
// applied afterwards.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: './src/global.css' });
