/**
 * Lambda環境変数の読み取りを一箇所に集約する。
 * 以前は各serviceが個別に `process.env.X ?? Y` していたため、
 * IMAGES_BUCKET_NAME のように「未設定でも空文字列で静かに動き出し、
 * Presigned URL発行時まで気づけない」ような不具合が起きやすかった。
 * 必須の環境変数はコールドスタート時点(このモジュールの初回読み込み時)に
 * 例外を投げ、デプロイ後すぐに気づけるようにする。
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. This must be set by Terraform (infra/lambda.tf) on the Lambda function.`,
    );
  }
  return value;
}

export const config = {
  /** ローカル開発・単体テストではテーブルが未作成でも動かせるよう、デフォルト値を許容する。 */
  tableName: process.env.TABLE_NAME ?? "FridgeNoteTable",

  /** 未設定のまま動くとオブジェクトキーの宛先が空文字列になり実害が出るため必須。 */
  imagesBucketName: requireEnv("IMAGES_BUCKET_NAME"),

  /** コスト最優先の既定モデルがあるため未設定でも動作してよい。 */
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0",

  /**
   * AI認識結果の確信度がこの値未満の場合、「認識結果を確認してください」扱いにする閾値。
   * コードにハードコードせず環境変数で調整できるようにする(実際の認識精度を見ながら
   * 現場でチューニングできるように)。モバイル側にも同名の閾値があるが、モバイルは
   * ビルド時定数のため実行時には同期されない -> scripts/check-shared-constants.mjs で
   * ドリフトを検知する運用(README参照)。
   */
  aiConfidenceThreshold: Number(process.env.AI_CONFIDENCE_THRESHOLD ?? "0.6"),
};
