terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # 状態管理はチーム利用時にS3+DynamoDBロックへ切り替える想定。
  # 個人/5ユーザー規模のMVPではローカルstateでも運用可能なため、
  # ここでは明示的なbackend設定を行わずデフォルト(local)のままとする。
}

provider "aws" {
  region = var.aws_region
}
