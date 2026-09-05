#!/usr/bin/env node
/**
 * `terraform output -json` の結果を標準入力から受け取り、
 * mobile/app.json の expo.extra を実際のデプロイ内容で更新する。
 *
 * これまでは `terraform apply` のたびに api_base_url 等を
 * 手作業でコピペしていたため、更新し忘れるとアプリが古い
 * エンドポイントを向いたまま気づけない、という運用ミスが起きやすかった。
 *
 * 使い方 (リポジトリルートで):
 *   docker run --rm -v "$(pwd):/workspace" -v ~/.aws:/root/.aws:ro \
 *     -w /workspace/infra hashicorp/terraform:1.9.0 output -json \
 *     | node scripts/sync-mobile-config.mjs
 * もしくは `make sync-mobile-config`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const APP_JSON_PATH = join(REPO_ROOT, "mobile", "app.json");

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    throw new Error(
      "標準入力からterraform outputのJSONを受け取れませんでした。" +
        "`terraform output -json | node scripts/sync-mobile-config.mjs` の形で実行してください。",
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

const appJsonRaw = readFileSync(APP_JSON_PATH, "utf8");
const appJson = JSON.parse(appJsonRaw);

const before = { ...appJson.expo.extra };
appJson.expo.extra = {
  ...appJson.expo.extra,
  apiBaseUrl: outputValue(tfOutputs, "api_base_url"),
  cognitoUserPoolId: outputValue(tfOutputs, "cognito_user_pool_id"),
  cognitoUserPoolClientId: outputValue(tfOutputs, "cognito_user_pool_client_id"),
};

writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + "\n");

console.log("mobile/app.json の expo.extra を更新しました:");
for (const key of Object.keys(appJson.expo.extra)) {
  const oldValue = before[key];
  const newValue = appJson.expo.extra[key];
  const marker = oldValue === newValue ? "  " : "→ ";
  console.log(`  ${marker}${key}: ${newValue}`);
}
