#!/usr/bin/env node
/**
 * backend と ios で独立に定義している「本来は共有すべき定数」が
 * ズレていないかをCIで検知するためのスクリプト。
 *
 * 背景: backend(TypeScript)とiOS(Swift)は言語が異なり定数を共有できないため、
 * 値がズレたら気づけるよう、このスクリプトで機械的に突き合わせる。
 *
 * 新しく「backendとiosの両方に存在すべき定数」が増えたら CHECKS 配列に追記すること。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

function extractNumberConst(filePath, constName, keyword) {
  const src = readFileSync(join(REPO_ROOT, filePath), "utf8");
  const pattern = new RegExp(`${keyword} ${constName}\\s*=\\s*([0-9.]+)`);
  const match = pattern.exec(src);
  if (!match) {
    throw new Error(`could not find "${keyword} ${constName} = <number>" in ${filePath}`);
  }
  return Number(match[1]);
}

const CHECKS = [
  {
    name: "LOW_CONFIDENCE_THRESHOLD",
    backend: { file: "backend/src/schemas/aiSchemas.ts", constName: "LOW_CONFIDENCE_THRESHOLD" },
    ios: { file: "ios/FridgeNote/Support/Constants.swift", constName: "LOW_CONFIDENCE_THRESHOLD" },
  },
];

let ok = true;
for (const check of CHECKS) {
  try {
    const backendValue = extractNumberConst(check.backend.file, check.backend.constName, "export const");
    const mobileValue = extractNumberConst(check.ios.file, check.ios.constName, "let");
    if (backendValue !== mobileValue) {
      ok = false;
      console.error(
        `✗ ${check.name}: backend(${check.backend.file})=${backendValue} !== ios(${check.ios.file})=${mobileValue}`,
      );
    } else {
      console.log(`✓ ${check.name}: ${backendValue} (backend/iosで一致)`);
    }
  } catch (err) {
    ok = false;
    console.error(`✗ ${check.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (!ok) {
  console.error("\n共有すべき定数がbackend/iosでズレています。両方の値を揃えてください。");
  process.exit(1);
}
