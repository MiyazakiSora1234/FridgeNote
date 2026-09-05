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
