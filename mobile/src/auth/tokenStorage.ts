import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 毎回サインイン画面に戻ってしまう不具合の原因と対処。
 *
 * amazon-cognito-identity-js は Storage を同期API(getItem/setItem/removeItem)として
 * 呼び出すため、非同期な AsyncStorage をそのまま渡すことはできない。ライブラリ同梱の
 * React Native用Storage実装(StorageHelper-rn.js)はAsyncStorageへの書き込みは行うが、
 * 読み込みは起動時に空になるメモリキャッシュだけを参照しており、そのキャッシュを
 * AsyncStorageから事前に復元(hydrate)する処理を呼び出し側(このアプリ)で
 * 行っていなかった。そのため、トークン自体はAsyncStorageに正しく保存されているにも
 * かかわらず、アプリを再起動するたびに `CognitoUserPool.getCurrentUser()` が
 * 「ログイン中のユーザーなし」を返し、毎回サインイン画面に戻っていた。
 *
 * ここでは Storage を自前実装に差し替えることで、ライブラリ内部の実装詳細に
 * 依存せず明示的に制御する:
 * - 同期の読み書きはメモリキャッシュに対して行う(ライブラリの要求を満たす)
 * - 書き込み/削除はAsyncStorageへも非同期で反映する(fire-and-forget)
 * - アプリ起動時に一度だけ `hydrateCognitoStorage()` を呼び、AsyncStorageの内容を
 *   メモリキャッシュへ読み込んでおく(AuthProviderが最初のセッション確認を
 *   行う前に完了させる。auth/AuthContext.tsx 参照)
 *
 * Cognito自体は既にRefresh Token(有効期限30日、infra/cognito.tfのrefresh_token_validity)
 * によって「一定期間サインインし続ける」機能を持っている。今回の問題はCognito側の設定
 * 不足ではなく、モバイルアプリ側でその仕組みを正しく永続化・復元できていなかったこと。
 */
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

/**
 * アプリ起動時に一度だけ呼び、永続化済みのトークンをメモリキャッシュへ復元する。
 * 複数回呼ばれても実際の読み込みは初回の1回だけ行う(同時に複数呼ばれても
 * 同じPromiseを共有させ、二重読み込みを避ける)。
 */
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

/** テスト用: モジュールレベルの状態(キャッシュ・hydrate済みフラグ)をリセットする。 */
export function __resetCognitoStorageForTests(): void {
  cache.clear();
  hydratePromise = null;
}
