import appJson from './app.json';

const googleMapsApiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  '';
// Note: Maps key is loaded at build time. Restrict this key in Google Cloud Console
// to your iOS bundle ID and Android package name to prevent unauthorized use.

export default ({ config }: { config: Record<string, any> }) => {
  const base = (appJson as any).expo || {};

  return {
    expo: {
      ...base,
      ios: {
        ...base.ios,
        googleMapsApiKey,
      },
      android: {
        ...base.android,
        config: {
          ...(base.android && base.android.config ? base.android.config : {}),
          googleMaps: {
            ...((base.android && base.android.config && base.android.config.googleMaps)
              ? base.android.config.googleMaps
              : {}),
            apiKey: googleMapsApiKey,
          },
        },
      },
      extra: {
        ...base.extra,
        googleMapsApiKey,
      },
    },
  };
};
