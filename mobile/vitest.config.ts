import { defineConfig } from "vitest/config";

// React Native/Expoのランタイムは対象にせず、依存を持たない純粋なロジック
// (zodスキーマ・ユーティリティ関数)だけをNode環境でテストする。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
