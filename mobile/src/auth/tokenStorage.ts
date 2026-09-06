import AsyncStorage from "@react-native-async-storage/async-storage";

// amazon-cognito-identity-jsはStorageを同期API(getItem/setItem)として呼ぶため、非同期な
// AsyncStorageをそのまま渡せない。同期の読み書きはこのメモリキャッシュに対して行い、
// AsyncStorageへは非同期で反映する(fire-and-forget)。アプリ起動時にhydrateCognitoStorage()で
// キャッシュへ復元しておかないと、有効なRefresh Tokenが端末にあっても毎回サインイン画面に戻る。
const KEY_PREFIX = "@FridgeNoteAuth:";
const cache = new Map<string, string>();
let hydratePromise: Promise<void> | null = null;

export const cognitoStorage = {
  setItem(key: string, value: string): string {
    cache.set(key, value);
    AsyncStorage.setItem(KEY_PREFIX + key, value).catch((err: unknown) =>
      console.warn("[auth] failed to persist auth token to AsyncStorage (non-fatal)", err),
    );
    return value;
  },
  getItem(key: string): string | null {
    return cache.get(key) ?? null;
  },
  removeItem(key: string): boolean {
    const existed = cache.delete(key);
    AsyncStorage.removeItem(KEY_PREFIX + key).catch((err: unknown) =>
      console.warn("[auth] failed to remove auth token from AsyncStorage (non-fatal)", err),
    );
    return existed;
  },
  clear(): void {
    cache.clear();
    AsyncStorage.getAllKeys()
      .then((keys) => keys.filter((k) => k.startsWith(KEY_PREFIX)))
      .then((keys) => (keys.length > 0 ? AsyncStorage.multiRemove(keys) : undefined))
      .catch((err: unknown) => console.warn("[auth] failed to clear auth tokens from AsyncStorage (non-fatal)", err));
  },
};

export function hydrateCognitoStorage(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const prefixedKeys = keys.filter((k) => k.startsWith(KEY_PREFIX));
        if (prefixedKeys.length === 0) return;

        const entries = await AsyncStorage.multiGet(prefixedKeys);
        for (const [key, value] of entries) {
          if (value !== null) cache.set(key.slice(KEY_PREFIX.length), value);
        }
      } catch (err) {
        console.warn("[auth] failed to hydrate auth tokens from AsyncStorage (non-fatal)", err);
      }
    })();
  }
  return hydratePromise;
}

export function __resetCognitoStorageForTests(): void {
  cache.clear();
  hydratePromise = null;
}
