import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const first = await freshModule();
    first.cognitoStorage.setItem("token", "abc123");
    await new Promise((r) => setTimeout(r, 0));

    vi.resetModules();
    const second = await freshModule();
    expect(second.cognitoStorage.getItem("token")).toBeNull();

    await second.hydrateCognitoStorage();
    expect(second.cognitoStorage.getItem("token")).toBe("abc123");
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
