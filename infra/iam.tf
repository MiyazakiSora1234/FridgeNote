data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- API Lambda (Hono) ---
resource "aws_iam_role" "api_lambda" {
  name               = "${var.project_name}-${var.environment}-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "api_lambda_policy" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid = "DynamoDbAccess"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
  statement {
    # Presigned URL署名専用。実際のオブジェクトキーはLambda内でuserIdを埋め込んで
    # 生成するため、ポリシー自体はバケット全体へのPutObjectで最小権限として十分。
    sid       = "PresignUpload"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.images.arn}/*"]
  }
}

resource "aws_iam_role_policy" "api_lambda" {
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_lambda_policy.json
}

# --- Analyzer Worker Lambda ---
resource "aws_iam_role" "worker_lambda" {
  name               = "${var.project_name}-${var.environment}-worker-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "worker_lambda_policy" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    sid = "DynamoDbAccess"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
  statement {
    sid       = "ReadUploadedImage"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.images.arn}/*"]
  }
  statement {
    sid     = "InvokeBedrock"
    actions = ["bedrock:InvokeModel"]
    resources = [
      "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}",
    ]
  }
  statement {
    # レシートOCR用。DetectDocumentTextは同期APIでリソースレベル権限に非対応のため"*"必須。
    sid       = "ExtractReceiptText"
    actions   = ["textract:DetectDocumentText"]
    resources = ["*"]
  }
  statement {
    # 音声入力の文字起こし用。Start/GetいずれもTranscribeはリソースレベル権限に非対応で"*"必須。
    # 出力先はAWS管理のデフォルトバケット(TranscriptFileUriをHTTP経由で取得)を使うため、
    # 追加のS3バケット権限は不要。
    sid       = "TranscribeAudio"
    actions   = ["transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"]
    resources = ["*"]
  }
  statement {
    sid = "ConsumeQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.analysis_queue.arn]
  }
}

resource "aws_iam_role_policy" "worker_lambda" {
  role   = aws_iam_role.worker_lambda.id
  policy = data.aws_iam_policy_document.worker_lambda_policy.json
}
