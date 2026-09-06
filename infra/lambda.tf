# dist/api.js, dist/analyzerWorker.js は事前に backend/ で build & package 済みであること。
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

  # VPCには置かない: DynamoDB/S3/Cognitoアクセスに不要で、NAT Gatewayのコストを避けるため。
  environment {
    variables = {
      TABLE_NAME         = aws_dynamodb_table.main.name
      IMAGES_BUCKET_NAME = aws_s3_bucket.images.bucket
      LOG_LEVEL          = var.log_level
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

  memory_size = 512
  timeout     = 60 # infra/sqs.tf の visibility_timeout_seconds より短くすること。

  environment {
    # null(未指定)ならAI_CONFIDENCE_THRESHOLD自体を設定しない -> config.tsのコード側デフォルトを使う。
    variables = merge(
      {
        TABLE_NAME         = aws_dynamodb_table.main.name
        IMAGES_BUCKET_NAME = aws_s3_bucket.images.bucket
        BEDROCK_MODEL_ID   = var.bedrock_model_id
        LOG_LEVEL          = var.log_level
      },
      var.ai_confidence_threshold != null ? { AI_CONFIDENCE_THRESHOLD = tostring(var.ai_confidence_threshold) } : {}
    )
  }

  depends_on = [aws_cloudwatch_log_group.worker_lambda]
}

resource "aws_lambda_event_source_mapping" "worker_sqs" {
  event_source_arn        = aws_sqs_queue.analysis_queue.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 5
  function_response_types = ["ReportBatchItemFailures"]
}
