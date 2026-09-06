# GitHub Actionsからのデプロイに長期的なIAMアクセスキーを使わないため、
# OIDC連携でワークフロー実行時だけ有効な一時クレデンシャルを払い出す構成にする。
#
# 注意: このファイル自体は「デプロイ役割(github_actions_deploy)」を作るための
# ブートストラップであり、初回だけは人間が自分のAWS認証情報で
# `terraform apply -target=aws_iam_openid_connect_provider.github
#                  -target=aws_iam_role.github_actions_deploy
#                  -target=aws_iam_role_policy.github_actions_deploy` のように
# 適用するか、通常のapply一括実行で問題ない(このリソース群はAWSアカウントに
# 依存するだけで他リソースの作成を待たないため)。以後はGitHub Actionsが
# このロールを引き受けてapplyできるようになる。

data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

# deploy.ymlは `environment: production` を指定しているため、OIDCトークンのsubクレームは
# `repo:<owner>/<repo>:environment:<environment_name>` の形式になる想定だったが、
# 実際にCloudTrailで観測したsubは `repo:<owner>@<ownerId>/<repo>@<repoId>:environment:<env>` という、
# owner/repo名に不変ID(GitHubがリポジトリのrename/transfer対策として付与)を含む形式だった。
# IDは環境依存の値なのでハードコードせず、StringLikeでワイルドカードマッチさせる。
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

# Terraformが本プロジェクトのリソース(dynamodb.tf, s3.tf, sqs.tf, iam.tf, lambda.tf,
# apigateway.tf, cognito.tf, sqs.tf内のSNS)を作成・更新・削除できる範囲に絞った権限。
#
# サービスごとに、ARNがプロジェクト名プレフィックス("fridgenote-*")で予測可能なものは
# Resourceを絞り込む。一方でAPI Gateway(API ID)・Cognito(User Pool ID)は
# 作成時にAWSが採番するIDがARNに含まれるため名前プレフィックスでの事前制限ができず、
# かつ多くのアクションがそもそもResource-levelパーミッションに未対応(Resource: "*" 必須)
# なので、その2つとBedrockの読み取り専用APIのみ明示的にワイルドカードのままにしている。
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

  # CloudTrail証跡の作成・更新用。証跡ログの保存先S3バケットは"ManageS3"の
  # name_prefix("fridgenote-*")に一致するため別途の許可は不要。
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

  # API Gateway・Cognitoは採番されるリソースIDが事前に分からずARNを絞れないため、
  # またBedrockの読み取り専用API(モデル一覧取得)はそもそもリソースを指定できないため、
  # この3つのみアカウント全体に対する権限のまま残す。
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
