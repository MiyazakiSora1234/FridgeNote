# デプロイ前提: `npm run build && npm run package:api && npm run package:worker` を
# backend/ ディレクトリで実行し、dist/api.js, dist/analyzerWorker.js を生成しておくこと
# (GitHub Actionsのデプロイワークフローで自動化している)。

data "archive_file" "api_lambda" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/api.js"
  output_path = "${path.module}/build/api.zip"
}

data "archive_file" "worker_lambda" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/analyzerWorker.js"
  output_path = "${path.module}/build/analyzerWorker.zip"
}

resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "worker_lambda" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-worker"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-${var.environment}-api"
  role             = aws_iam_role.api_lambda.arn
  handler          = "api.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.api_lambda.output_path
  source_code_hash = data.archive_file.api_lambda.output_base64sha256

  memory_size = 256
  timeout     = 10

  # LambdaはVPCに配置しない: DynamoDB/S3/Cognitoへのアクセスに
  # VPCもNAT Gatewayも不要であり、VPC化はコスト(NAT Gateway 月$30超)の
  # 観点から本プロジェクトの予算(月1,000円以下)と両立しないため。
  environment {
    variables = {
      TABLE_NAME         = aws_dynamodb_table.main.name
      IMAGES_BUCKET_NAME = aws_s3_bucket.images.bucket
    }
  }

  depends_on = [aws_cloudwatch_log_group.api_lambda]
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.project_name}-${var.environment}-worker"
  role             = aws_iam_role.worker_lambda.arn
  handler          = "analyzerWorker.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.worker_lambda.output_path
  source_code_hash = data.archive_file.worker_lambda.output_base64sha256

  memory_size = 512 # Bedrockへ送る画像のBase64変換等のメモリを確保
  timeout     = 60  # SQS可視性タイムアウト(90秒)より短く設定

  environment {
    variables = {
      TABLE_NAME              = aws_dynamodb_table.main.name
      IMAGES_BUCKET_NAME      = aws_s3_bucket.images.bucket
      BEDROCK_MODEL_ID        = var.bedrock_model_id
      AI_CONFIDENCE_THRESHOLD = tostring(var.ai_confidence_threshold)
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker_lambda]
}

resource "aws_lambda_event_source_mapping" "worker_sqs" {
  event_source_arn        = aws_sqs_queue.analysis_queue.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
}
