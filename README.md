# FridgeNote

食品・料理の写真から食材を認識し、冷蔵庫の在庫を管理するモバイルアプリケーション(iOS / Android)。

- 食材写真 → AIが食材名・カテゴリ・数量・単位・推定賞味期限・confidenceを推定 → ユーザー確認 → 冷蔵庫へ登録
- 料理写真 → AIが料理名と「使用食材候補」をconfidence付きで推定 → 冷蔵庫在庫と照合 → ユーザーが確認したものだけ在庫を減算

設計判断の詳細と、最優先制約(**月額1,000円以下 / 5ユーザー想定 / AI推論はAmazon Bedrockのみ / iOS・Android対応**)を踏まえた
アーキテクチャ上のトレードオフは [docs/architecture.md](docs/architecture.md) にまとめている。合わせて
[docs/dynamodb-design.md](docs/dynamodb-design.md)(DynamoDBのアクセスパターン設計)、
[docs/api-spec.md](docs/api-spec.md)(API仕様)を参照。

## クイックスタート(Makefile)

よく使う操作は `Makefile` にまとめている(`make help` で一覧表示)。TerraformとAWS CLIはネイティブ
インストールせず、すべてDocker経由(`hashicorp/terraform` / `amazon/aws-cli`)で実行するため、
Docker Desktopが起動している必要がある。

```bash
make help            # タスク一覧
make backend-ci       # backendのinstall + build + test
make infra-plan       # terraform plan(Docker経由、~/.awsをread-onlyマウント)
make infra-apply      # terraform apply(要: 事前にplanの内容を確認)
make health           # デプロイ済みAPIの /v1/health を確認
make mobile-typecheck # mobileの型チェック
make eas-build-ios    # iOS向けEASビルド(要: 事前にApple IDでの対話ログイン済み)
```

## リポジトリ構成

```
FridgeNote/
├── docs/                 設計ドキュメント(アーキテクチャ / DynamoDB設計 / API仕様)
├── infra/                Terraform(Cognito / DynamoDB / S3 / SQS / API Gateway / Lambda / IAM)
├── backend/              Hono + AWS Lambda(TypeScript)
│   ├── src/
│   │   ├── app.ts            Honoアプリ本体(ルーティング・エラーハンドリング)
│   │   ├── handlers/         Lambdaエントリポイント(API本体 / Analyzer Worker)
│   │   ├── routes/           /v1/images, /v1/analyses, /v1/fridge
│   │   ├── middleware/       Cognito JWT認証ミドルウェア
│   │   ├── services/         S3 / DynamoDB / 食材マスター正規化 / AI Adapter
│   │   ├── services/ai/      VisionAnalysisAdapter(インターフェース)+ BedrockVisionAdapter(実装)
│   │   └── schemas/          AIレスポンス用Zodスキーマ、APIリクエスト用Zodスキーマ
│   └── test/                 単体テスト・統合テスト(vitest)
├── mobile/               Expo + React Native(TypeScript)
│   └── src/
│       ├── auth/              Cognito認証(amazon-cognito-identity-js)
│       ├── api/                バックエンドAPIクライアント
│       ├── screens/            サインイン/一覧/手動登録/カメラ撮影/AI結果確認
│       └── lib/imagePrep.ts    アップロード前の画像リサイズ・圧縮
└── .github/workflows/    CI(backend/mobile)・手動デプロイ(Terraform)
```

## アーキテクチャ概要

```
React Native (Expo)
   │ 1. presigned URL取得         (JWT付きAPIコール)
   ▼
API Gateway (HTTP API, Cognito JWT Authorizer)
   │
   ▼
Lambda (Hono) ── DynamoDB / S3署名発行
   │
   │ 2. S3へ直接PUT(API/Lambdaは画像本体を経由しない)
   ▼
S3 (Images Bucket)
   │ 3. ObjectCreatedイベント
   ▼
SQS (analysis-queue, DLQ付き)
   │ 4. poll
   ▼
Lambda (Analyzer Worker)
   │ 5. InvokeModel(画像+Tool useで構造化出力を強制)
   ▼
Amazon Bedrock (既定: amazon.nova-lite-v1:0)
   │ 6. Zodで検証 → 食材マスターへ正規化
   ▼
DynamoDB (ImageAnalysis.result を更新)
   ▲
   │ 7. ポーリングで結果取得 → ユーザーが確認・修正
React Native ── 確定後のみ POST /v1/fridge/items or /v1/fridge/consume
```

重要な設計原則(詳細は [docs/architecture.md](docs/architecture.md)):
- **AIの出力を確定データとして直接DBへ書き込む経路は存在しない**。必ずユーザー確認APIを経由する。
- クライアントが送る `userId` は一切信用せず、常にCognito JWTの `sub` をAPI Gateway JWT Authorizer経由で使う。
- 画像はS3へ直接アップロードし、API Gateway/Lambdaは画像バイナリを経由しない。
- Lambdaは**VPCに配置しない**(NAT Gatewayのコストが月予算を超えるため)。

## セットアップ

### 前提

- Node.js 20系
- Terraform >= 1.7 (`infra/`)
- AWSアカウント、Bedrockで使用するモデル(既定 `amazon.nova-lite-v1:0`)が有効なリージョン

### 1. バックエンド

```bash
cd backend
npm install
npm run build          # tsc (dist/ は infra/lambda.tf がzip化する際の入力)
npm run package:api    # esbuildでdist/api.jsをバンドル
npm run package:worker # esbuildでdist/analyzerWorker.jsをバンドル
npm test               # 単体テスト + 統合テスト(vitest)
```

ローカルでDynamoDB Localに対して動作確認したい場合:

```bash
cd backend
docker compose up
```

### 2. インフラ(Terraform)

`backend/dist/*.js` を先に生成しておく必要がある(`terraform apply` はそのzip化を行うだけで、
TypeScriptのビルド自体は行わない)。

```bash
cd infra
terraform init
terraform plan -var="alert_email=you@example.com"
terraform apply -var="alert_email=you@example.com"
```

主な出力値(`terraform output`)を `mobile/app.json` の `expo.extra` に反映する:

- `api_base_url` → `apiBaseUrl`
- `cognito_user_pool_id` → `cognitoUserPoolId`
- `cognito_user_pool_client_id` → `cognitoUserPoolClientId`

### 3. モバイルアプリ

```bash
cd mobile
npm install
npm run typecheck
npm start        # Expo Dev Serverを起動し、Expo Goやシミュレータで確認
```

`app.json` の `expo.extra` を実際のAPI/Cognito情報に書き換えてから起動すること。

## テスト

- `backend/test/unit/`: 正規化ロジック、賞味期限判定、AIレスポンスのZodスキーマ検証、ID生成の冪等性
- `backend/test/integration/`: Honoアプリに対してAPI Gateway JWT Authorizer相当のコンテキストを模した
  リクエストを発行し、DynamoDBはインメモリのフェイク実装(`test/integration/fakeDynamo.ts`)に差し替えて
  ユーザー分離・冪等性・在庫減算ロジックを検証する。
- CI(`.github/workflows/backend-ci.yml`)で型チェックとテストを実行する。

## デプロイ / GitHub Actions × AWS OIDC セットアップ

`.github/workflows/deploy.yml` は**手動実行(workflow_dispatch)専用**にしている。インフラ変更は
元に戻しにくく影響範囲が大きいため、pushへの自動フックはあえて行わない設計。

GitHub ActionsからAWSへは長期アクセスキーを配置せず、OIDCによる一時クレデンシャルで
デプロイする(`infra/github-oidc.tf`)。初回だけ以下の手順が必要:

1. **AWS認証情報を用意する**(自分のPC/CIどちらでもよい)。IAMユーザーのアクセスキー、
   もしくはSSOセッションを `aws configure` / `aws sso login` 等で用意し、
   Terraformが実行できる状態にする(このリポジトリの検証はDockerの`hashicorp/terraform`
   イメージで行った。ローカルにTerraform CLIが無ければ同様にDockerで代用できる)。

2. **初回だけ人間の認証情報で `terraform apply` を実行する**(OIDC Provider/デプロイ用IAM Roleを含む
   全リソースを作成)。

   ```bash
   cd backend && npm ci && npm run build && npm run package:api && npm run package:worker && cd ..
   cd infra
   terraform init
   terraform apply -var="alert_email=you@example.com"
   ```

3. **GitHubリポジトリ側の設定**:
   - Settings → Environments で `production` という名前のEnvironmentを作成し、
     必要に応じて Required reviewers を設定する(`workflow_dispatch` 実行前に承認を挟める)。
   - Settings → Secrets and variables → Actions → Secrets に
     `AWS_DEPLOY_ROLE_ARN` として `terraform output github_actions_deploy_role_arn` の値を登録する。
   - (リージョンを`us-east-1`以外にする場合)Variables に `AWS_REGION` を設定する。

4. 以降のインフラ変更は GitHub の Actions タブから `deploy` ワークフローを
   `workflow_dispatch` で実行する(`apply` 入力を `true` にすると `terraform apply` まで行う。
   `false`(既定)なら `plan` の内容確認のみ)。

`infra/github-oidc.tf` のIAMポリシーは、DynamoDB/S3/SQS/Lambda/API Gateway/Cognito/CloudWatch/SNSへの
アクセスと、IAMは `${project_name}-*` という命名規則のロールのみを操作対象に限定しており、
アカウント全体を操作できる権限(AdministratorAccess等)は付与していない。

## デプロイ状況

2026-09-05時点で、AWSアカウント(`125192672369` / `us-east-1`)に対して `terraform apply` 済み。
`GET {api_base_url}/v1/health` が `{"ok":true}` を返すことを確認済み。Terraform stateは
S3(`fridgenote-tfstate-125192672369`)+ DynamoDBロック(`fridgenote-tfstate-lock`)で管理しており、
ローカル・GitHub Actions(`deploy.yml`)の両方から同じstateに対してplan/applyできる。
GitHub Actions用のOIDC Provider/デプロイRole/`production` Environment/`AWS_DEPLOY_ROLE_ARN` Secretの登録も完了しており、
`deploy.yml` の `workflow_dispatch` 実行(OIDCでのAssumeRole)を実際に動作確認済み。

## 既知の制約・未検証事項

- Terraform CLIはこの開発環境に直接インストールされていないため、公式Dockerイメージ(`hashicorp/terraform`)で
  `fmt` / `init` / `validate` / `plan` / `apply` を実行している(ローカルにTerraformが無い場合の代替コマンド例):
  ```bash
  docker run --rm \
    -v "$(pwd)/..:/workspace" -v ~/.aws:/root/.aws:ro \
    -w /workspace/infra hashicorp/terraform:1.9.0 plan
  ```
- モバイルアプリは実機・シミュレータでの動作確認を行っていない(このサンドボックス環境にはExpo実行環境がない)。
  `npm run typecheck` によるTypeScriptの型検証のみ完了している。カメラ権限まわりや実際のCognito認証フローは
  実機での確認を推奨する。
- Bedrockの実際のモデル出力・料金は本番アカウントでの検証が必要(モデルIDやプロンプトは `BEDROCK_MODEL_ID`
  環境変数で変更可能)。
