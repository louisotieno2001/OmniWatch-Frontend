import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'user_token';
const USER_DATA_KEY = 'user_data';
const LAST_ACTIVE_KEY = 'last_active';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const saveUserSession = async (token: string, userData: any): Promise<void> => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(userData));
    await SecureStore.setItemAsync(LAST_ACTIVE_KEY, Date.now().toString());
  } catch (error) {
    console.error('Failed to save user session:', error);
    throw error;
  }
};

export const getUserSession = async (): Promise<{ token: string | null; userData: any | null }> => {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userDataJson = await SecureStore.getItemAsync(USER_DATA_KEY);
    const userData = userDataJson ? JSON.parse(userDataJson) : null;

    const lastActive = await SecureStore.getItemAsync(LAST_ACTIVE_KEY);

    if (token && userData && lastActive) {
      const lastActiveMs = Number(lastActive);
      if (isNaN(lastActiveMs)) {
        await clearUserSession();
        return { token: null, userData: null };
      }
      const elapsed = Date.now() - lastActiveMs;
      if (elapsed > THIRTY_DAYS_MS) {
        await clearUserSession();
        return { token: null, userData: null };
      }
    }

    return { token, userData };
  } catch (error) {
    console.error('Failed to retrieve user session:', error);
    return { token: null, userData: null };
  }
};

export const touchLastActive = async (): Promise<void> => {
  try {
    await SecureStore.setItemAsync(LAST_ACTIVE_KEY, Date.now().toString());
  } catch (error) {
    console.error('Failed to update last active timestamp:', error);
  }
};

export const clearUserSession = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_DATA_KEY);
    await SecureStore.deleteItemAsync(LAST_ACTIVE_KEY);
  } catch (error) {
    console.error('Failed to clear user session:', error);
    throw error;
  }
};
