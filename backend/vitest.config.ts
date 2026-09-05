import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // 本番ではTerraformがLambdaに必ず設定する必須環境変数(lib/config.ts参照)を、
    // テスト実行時にも再現しておく。設定し忘れると config.ts の requireEnv() が
    // モジュール読み込み時点で例外を投げ、無関係なテストまで巻き込んで落ちてしまうため。
    env: {
      TABLE_NAME: "TestTable",
      IMAGES_BUCKET_NAME: "test-images-bucket",
      BEDROCK_MODEL_ID: "test-model",
    },
  },
});
