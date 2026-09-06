variable "aws_region" {
  description = "デプロイ先リージョン。Bedrockで使用するモデルが利用可能なリージョンを選ぶこと。"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "fridgenote"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "bedrock_model_id" {
  description = "画像解析に使用するBedrockモデルID。コスト最優先で軽量マルチモーダルモデルを既定値とする。"
  type        = string
  default     = "amazon.nova-lite-v1:0"
}

variable "log_retention_days" {
  description = "CloudWatch Logsの保持期間。ログ蓄積によるコスト増を避けるため短めに設定。"
  type        = number
  default     = 14
}

variable "image_expiration_days" {
  description = "S3にアップロードされた画像を自動削除するまでの日数。"
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "DLQ滞留やAPIエラーのアラーム通知先メールアドレス。空の場合はSNSサブスクリプションを作成しない。"
  type        = string
  default     = ""
}

variable "cors_allowed_origins" {
  description = "API Gateway / S3 CORSで許可するオリジン(Expo Web/開発用)。"
  type        = list(string)
  default     = ["*"]
}

variable "github_repository" {
  description = "GitHub Actions OIDCでのデプロイを許可するリポジトリ(\"owner/repo\"形式)。"
  type        = string
  default     = "MiyazakiSora1234/FridgeNote"
}

variable "github_actions_environment" {
  description = "deploy.ymlのjobが指定するGitHub Environment名。OIDCトークンのsubクレーム検証に使う。"
  type        = string
  default     = "production"
}

variable "ai_confidence_threshold" {
  description = "レシート/音声解析でAIが返す各食材候補のconfidenceがこの値未満の場合、一括追加チェックリストで既定非選択とする閾値。未指定(null)の場合はAI_CONFIDENCE_THRESHOLD環境変数自体を設定せず、backend/src/lib/config.tsのコード側デフォルト(LOW_CONFIDENCE_THRESHOLD、aiSchemas.ts)をそのまま使う。ここにも同じ数値をハードコードすると、片方だけ変更されて値がズレる(このTerraform変数が常にコードのデフォルトを上書きしてしまう)ため。"
  type        = number
  default     = null
}

variable "cloudtrail_log_retention_days" {
  description = "CloudTrail証跡ログ(S3)を自動削除するまでの日数。監査目的の最小限の保持とし、ストレージコストを抑える。"
  type        = number
  default     = 90
}

variable "log_level" {
  description = "backend/src/lib/logger.ts のログレベル(debug/info/warn/error)。障害調査時にコード変更・再デプロイなしで一時的にdebugへ上げられるよう、Terraform変数として外出しする。"
  type        = string
  default     = "info"
  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.log_level)
    error_message = "log_level must be one of: debug, info, warn, error."
  }
}
