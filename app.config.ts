import { ExpoConfig, ConfigContext } from 'expo/config';

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  '';
// Note: Maps key is loaded at build time. Restrict this key in Google Cloud Console
// to your iOS bundle ID and Android package name to prevent unauthorized use.

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: config.name || 'PatrolLink',
    slug: config.slug || 'patrollink',
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
    },
    extra: {
      ...config.extra,
      googleMapsApiKey,
    },
  } as ExpoConfig;
};
