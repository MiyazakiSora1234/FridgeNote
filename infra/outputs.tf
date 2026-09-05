output "api_base_url" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.mobile.id
}

output "images_bucket_name" {
  value = aws_s3_bucket.images.bucket
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.main.name
}

output "analysis_queue_url" {
  value = aws_sqs_queue.analysis_queue.url
}

output "analysis_dlq_url" {
  value = aws_sqs_queue.analysis_dlq.url
}

output "github_actions_deploy_role_arn" {
  description = "GitHub ActionsのSecrets `AWS_DEPLOY_ROLE_ARN` に設定する値。"
  value       = aws_iam_role.github_actions_deploy.arn
}
