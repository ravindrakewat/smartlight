import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Key-value storage. On phones this is the OS keychain/keystore (expo-secure-store).
 * The browser build (used only to try the app on a computer) has no keystore, so it
 * falls back to localStorage; it is not a production target.
 */
const isWeb = Platform.OS === 'web';

export const storage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Storage blocked (private window): the session simply is not remembered.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (isWeb) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Nothing stored.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
