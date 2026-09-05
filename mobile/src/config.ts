import Constants from "expo-constants";

interface AppExtra {
  apiBaseUrl: string;
  cognitoRegion: string;
  cognitoUserPoolId: string;
  cognitoUserPoolClientId: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppExtra>;

function required(key: keyof AppExtra): string {
  const value = extra[key];
  if (!value || value.startsWith("CHANGE_ME")) {
    console.warn(`[config] app.json の extra.${key} を実際の値に設定してください`);
  }
  return value ?? "";
}

export const config = {
  apiBaseUrl: required("apiBaseUrl"),
  cognitoRegion: required("cognitoRegion"),
  cognitoUserPoolId: required("cognitoUserPoolId"),
  cognitoUserPoolClientId: required("cognitoUserPoolClientId"),
};
