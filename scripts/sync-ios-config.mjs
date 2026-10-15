#!/usr/bin/env node
/**
 * `terraform output -json` の結果を標準入力から受け取り、
 * ios/FridgeNote/Config/AppConfig.swift の接続情報をデプロイ内容で更新する。
 *
 * terraform apply のたびに api_base_url 等を手作業でコピペすると更新し忘れに気づけないため、
 * このスクリプトで機械的に反映する。
 *
 * 使い方 (リポジトリルートで): `make sync-ios-config`
 *   または `terraform output -json | node scripts/sync-ios-config.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "ios", "FridgeNote", "Config", "AppConfig.swift");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    throw new Error(
      "標準入力からterraform outputのJSONを受け取れませんでした。" +
        "`terraform output -json | node scripts/sync-ios-config.mjs` の形で実行してください。",
    );
  }
}

function outputValue(tfOutputs, key) {
  const entry = tfOutputs[key];
  if (!entry || entry.value === undefined || entry.value === null) {
    throw new Error(`terraform outputに "${key}" が見つかりません`);
  }
  return String(entry.value);
}

const stdin = readStdin();
let tfOutputs;
try {
  tfOutputs = JSON.parse(stdin);
} catch {
  console.error(
    "標準入力をJSONとして解釈できませんでした。`terraform output -json` がエラーを" +
      "出力していないか確認してください(terraform initが必要な場合があります)。受け取った内容:",
  );
  console.error(stdin.slice(0, 2000));
  process.exit(1);
}

const updates = {
  apiBaseUrl: outputValue(tfOutputs, "api_base_url"),
  cognitoUserPoolId: outputValue(tfOutputs, "cognito_user_pool_id"),
  cognitoUserPoolClientId: outputValue(tfOutputs, "cognito_user_pool_client_id"),
};

let source = readFileSync(CONFIG_PATH, "utf8");
console.log("ios/FridgeNote/Config/AppConfig.swift を更新しました:");
for (const [key, newValue] of Object.entries(updates)) {
  const pattern = new RegExp(`(static let ${key} = ")([^"]*)(")`);
  const match = pattern.exec(source);
  if (!match) throw new Error(`AppConfig.swift に "static let ${key} = \\"...\\"" が見つかりません`);
  source = source.replace(pattern, `$1${newValue}$3`);
  console.log(`  ${match[2] === newValue ? "  " : "→ "}${key}: ${newValue}`);
}
writeFileSync(CONFIG_PATH, source);
