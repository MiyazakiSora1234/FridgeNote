data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

locals {
  github_repository_owner = split("/", var.github_repository)[0]
  github_repository_name  = split("/", var.github_repository)[1]
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_repository_owner}@*/${local.github_repository_name}@*:environment:${var.github_actions_environment}",
        "repo:${var.github_repository}:environment:${var.github_actions_environment}",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_name}-${var.environment}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
}

locals {
  name_prefix = "${var.project_name}-*"
  account_id  = data.aws_caller_identity.current.account_id
}

data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid     = "ManageDynamoDb"
    actions = ["dynamodb:*"]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${local.name_prefix}",
      "arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${local.name_prefix}/index/*",
    ]
  }

  statement {
    sid     = "ManageS3"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::${local.name_prefix}",
      "arn:aws:s3:::${local.name_prefix}/*",
    ]
  }

  statement {
    sid       = "ManageSqs"
    actions   = ["sqs:*"]
    resources = ["arn:aws:sqs:${var.aws_region}:${local.account_id}:${local.name_prefix}"]
  }

  statement {
    sid       = "ManageLambda"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${local.name_prefix}"]
  }

  statement {
    sid     = "ManageLogs"
    actions = ["logs:*"]
    resources = [
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}",
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}:*",
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}",
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}:*",
    ]
  }

  statement {
    sid       = "ManageSns"
    actions   = ["sns:*"]
    resources = ["arn:aws:sns:${var.aws_region}:${local.account_id}:${local.name_prefix}"]
  }

  statement {
    sid       = "ManageCloudTrail"
    actions   = ["cloudtrail:*"]
    resources = ["arn:aws:cloudtrail:${var.aws_region}:${local.account_id}:trail/${local.name_prefix}"]
  }

  statement {
    sid       = "ManageCloudWatchAlarms"
    actions   = ["cloudwatch:*"]
    resources = ["arn:aws:cloudwatch:${var.aws_region}:${local.account_id}:alarm:${local.name_prefix}"]
  }

  statement {
    sid = "ManageApiGatewayAndCognitoAndReadBedrock"
    actions = [
      "apigateway:*",
      "cognito-idp:*",
      "bedrock:GetFoundationModel",
      "bedrock:ListFoundationModels",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ManageAppIamRoles"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:PassRole",
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*",
    ]
  }

  statement {
    sid     = "ManageOwnOidcProviderAndDeployRole"
    actions = ["iam:GetOpenIDConnectProvider", "iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy"]
    resources = [
      aws_iam_openid_connect_provider.github.arn,
      aws_iam_role.github_actions_deploy.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
