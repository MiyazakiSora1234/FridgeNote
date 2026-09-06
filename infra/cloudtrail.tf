# コスト最優先の監査証跡: 管理イベント(誰が/いつ/どのAPIを呼んだか)のみを記録する
# 単一リージョンのTrailを1つだけ作成する。AWSは「リージョンごとに1つの証跡までの
# 管理イベント記録」を無料枠として提供しているため、追加コストなしで最低限の
# 監査ログを確保できる(参照: AWS CloudTrailの料金ページ)。
# データイベント(S3オブジェクトごとのGetObject/PutObject、Lambda呼び出し等)は
# 呼び出し回数に応じて課金されるうえ本プロジェクトの規模(5ユーザー)では
# 監査上の必要性も薄いため、有効化しない。
resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "${var.project_name}-${var.environment}-cloudtrail-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# ログの無期限蓄積によるストレージコスト増を避けるため、一定期間で自動削除する。
resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    id     = "expire-cloudtrail-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.cloudtrail_log_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "cloudtrail_bucket_policy" {
  statement {
    sid = "AWSCloudTrailAclCheck"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail_logs.arn]
  }
  statement {
    sid = "AWSCloudTrailWrite"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  policy = data.aws_iam_policy_document.cloudtrail_bucket_policy.json
}

resource "aws_cloudtrail" "main" {
  name                          = "${var.project_name}-${var.environment}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail         = false # 単一リージョン運用。管理イベントの無料枠を活かしコストを増やさない。
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
    # data_resourceブロックを指定しない = データイベントは記録しない(課金対象のため)。
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]
}
