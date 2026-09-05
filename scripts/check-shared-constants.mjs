#!/usr/bin/env node
/**
 * backend と mobile で独立に定義している「本来は共有すべき定数」が
 * ズレていないかをCIで検知するためのスクリプト。
 *
 * 背景: 型/定数をnpm workspacesで共有するモノレポ構成も検討したが、
 * Expo/Metro側のモノレポ対応(symlink解決・watchFolders設定)を
 * 実機で検証できる環境がなかったため、現時点では見送っている
 * (docs/architecture.md 等は参照せず、このスクリプトが唯一のガード)。
 * 値がズレたら気づけるよう、ここで機械的に突き合わせる。
 *
 * 新しく「backendとmobileの両方に存在すべき定数」が増えたら CHECKS 配列に追記すること。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

function extractNumberConst(filePath, constName) {
  const src = readFileSync(join(REPO_ROOT, filePath), "utf8");
  const pattern = new RegExp(`export const ${constName}\\s*=\\s*([0-9.]+)`);
  const match = pattern.exec(src);
  if (!match) {
    throw new Error(`could not find "export const ${constName} = <number>" in ${filePath}`);
  }
  return Number(match[1]);
}

const CHECKS = [
  {
    name: "LOW_CONFIDENCE_THRESHOLD",
    backend: { file: "backend/src/schemas/aiSchemas.ts", constName: "LOW_CONFIDENCE_THRESHOLD" },
    mobile: { file: "mobile/src/constants.ts", constName: "LOW_CONFIDENCE_THRESHOLD" },
  },
];

let ok = true;
for (const check of CHECKS) {
  try {
    const backendValue = extractNumberConst(check.backend.file, check.backend.constName);
    const mobileValue = extractNumberConst(check.mobile.file, check.mobile.constName);
    if (backendValue !== mobileValue) {
      ok = false;
      console.error(
        `✗ ${check.name}: backend(${check.backend.file})=${backendValue} !== mobile(${check.mobile.file})=${mobileValue}`,
      );
    } else {
      console.log(`✓ ${check.name}: ${backendValue} (backend/mobileで一致)`);
    }
  } catch (err) {
    ok = false;
    console.error(`✗ ${check.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (!ok) {
  console.error("\n共有すべき定数がbackend/mobileでズレています。両方の値を揃えてください。");
  process.exit(1);
}
