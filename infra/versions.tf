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
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # GitHub Actions(deploy.yml)とローカルの両方からapplyできるよう、
  # stateはS3(+DynamoDBロック)で共有する。バケット/テーブルは
  # このリポジトリの外で一度だけ手動ブートストラップ済み
  # (fridgenote-tfstate-<account_id> / fridgenote-tfstate-lock)。
  backend "s3" {
    bucket         = "fridgenote-tfstate-125192672369"
    key            = "fridgenote/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "fridgenote-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}
