import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const getProjectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || undefined;

export const configureForegroundNotificationHandling = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

export const registerAdminPushToken = async (
  apiUrl: string,
  authToken: string
): Promise<{ expoPushToken: string | null; reason?: string }> => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('omniwatch-alerts', {
        name: 'OmniWatch Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ef4444',
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    let finalStatus = permissions.status;

    if (finalStatus !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      finalStatus = request.status;
    }

    if (finalStatus !== 'granted') {
      return { expoPushToken: null, reason: 'permission_denied' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      return { expoPushToken: null, reason: 'missing_project_id' };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;

    if (!expoPushToken) {
      return { expoPushToken: null, reason: 'token_unavailable' };
    }

    const registerResponse = await fetch(`${apiUrl}/admin/push-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expo_push_token: expoPushToken,
        platform: Platform.OS,
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.warn('[Push] Failed to register push token:', registerResponse.status, errorText);
      return { expoPushToken: null, reason: 'backend_registration_failed' };
    }

    return { expoPushToken };
  } catch (error: any) {
    console.error('[Push] registerAdminPushToken failed:', error?.message || error);
    return { expoPushToken: null, reason: 'unexpected_error' };
  }
};

export const unregisterAdminPushToken = async (apiUrl: string, authToken: string) => {
  try {
    await fetch(`${apiUrl}/admin/push-token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.warn('[Push] Failed to unregister push token:', error?.message || error);
  }
};
