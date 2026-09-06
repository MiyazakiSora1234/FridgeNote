import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AsyncStorageの実体(ネイティブモジュール)には依存せず、インメモリの
 * フェイク実装に差し替えてテストする(vitest.config.tsの方針: RN依存の
 * 実行環境なしに動く純粋なロジックだけをテストする、に沿う)。
 */
const fakeAsyncStorage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn(async (key: string, value: string) => {
      fakeAsyncStorage.set(key, value);
    }),
    getItem: vi.fn(async (key: string) => fakeAsyncStorage.get(key) ?? null),
    removeItem: vi.fn(async (key: string) => {
      fakeAsyncStorage.delete(key);
    }),
    getAllKeys: vi.fn(async () => [...fakeAsyncStorage.keys()]),
    multiGet: vi.fn(async (keys: string[]) => keys.map((k) => [k, fakeAsyncStorage.get(k) ?? null] as const)),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const k of keys) fakeAsyncStorage.delete(k);
    }),
  },
}));

describe("tokenStorage (Cognito Storage adapter)", () => {
  beforeEach(() => {
    fakeAsyncStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function freshModule() {
    return import("./tokenStorage.js");
  }

  it("setItem is readable synchronously right away (no need to await AsyncStorage)", async () => {
    const { cognitoStorage } = await freshModule();
    cognitoStorage.setItem("foo", "bar");
    expect(cognitoStorage.getItem("foo")).toBe("bar");
  });

  it("persists writes to AsyncStorage under a namespaced key", async () => {
    const { cognitoStorage } = await freshModule();
    cognitoStorage.setItem("CognitoIdentityServiceProvider.client.LastAuthUser", "user@example.com");

    // AsyncStorageへの書き込みはfire-and-forgetのため、マイクロタスクの完了を待つ。
    await new Promise((r) => setTimeout(r, 0));
    expect(fakeAsyncStorage.get("@FridgeNoteAuth:CognitoIdentityServiceProvider.client.LastAuthUser")).toBe(
      "user@example.com",
    );
  });

  it("removeItem deletes from both the memory cache and AsyncStorage", async () => {
    const { cognitoStorage } = await freshModule();
    cognitoStorage.setItem("foo", "bar");
    await new Promise((r) => setTimeout(r, 0));

    cognitoStorage.removeItem("foo");
    expect(cognitoStorage.getItem("foo")).toBeNull();

    await new Promise((r) => setTimeout(r, 0));
    expect(fakeAsyncStorage.has("@FridgeNoteAuth:foo")).toBe(false);
  });

  it("hydrateCognitoStorage() restores previously persisted values into a fresh in-memory cache", async () => {
    // 1回目のモジュールインスタンスで書き込み、AsyncStorageへの反映を待つ
    const first = await freshModule();
    first.cognitoStorage.setItem("token", "abc123");
    await new Promise((r) => setTimeout(r, 0));

    // アプリ再起動を模して、モジュールを読み直す(=メモリキャッシュが空の状態に戻る)
    vi.resetModules();
    const second = await freshModule();
    expect(second.cognitoStorage.getItem("token")).toBeNull(); // hydrate前は空

    await second.hydrateCognitoStorage();
    expect(second.cognitoStorage.getItem("token")).toBe("abc123"); // hydrate後は復元されている
  });

  it("hydrateCognitoStorage() only reads AsyncStorage once even when called concurrently", async () => {
    const { cognitoStorage, hydrateCognitoStorage } = await freshModule();
    const asyncStorageModule = await import("@react-native-async-storage/async-storage");
    cognitoStorage.setItem("token", "abc123");
    await new Promise((r) => setTimeout(r, 0));

    const getAllKeysSpy = vi.mocked(asyncStorageModule.default.getAllKeys);
    getAllKeysSpy.mockClear();

    await Promise.all([hydrateCognitoStorage(), hydrateCognitoStorage(), hydrateCognitoStorage()]);

    expect(getAllKeysSpy).toHaveBeenCalledTimes(1);
  });
});
