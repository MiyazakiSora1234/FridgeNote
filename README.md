# FridgeNote

食品・料理の写真から食材を認識し、冷蔵庫の在庫を管理するモバイルアプリケーション(iOS / Android)。

- 食材写真 → AIが食材名・カテゴリ・数量・単位・推定賞味期限・confidenceを推定 → ユーザー確認 → 冷蔵庫へ登録
- 料理写真 → AIが料理名と「使用食材候補」をconfidence付きで推定 → 冷蔵庫在庫と照合 → ユーザーが確認したものだけ在庫を減算

設計判断の詳細と、最優先制約(**月額1,000円以下 / 5ユーザー想定 / AI推論はAmazon Bedrockのみ / iOS・Android対応**)を踏まえた
アーキテクチャ上のトレードオフは [docs/architecture.md](docs/architecture.md) にまとめている。合わせて
[docs/dynamodb-design.md](docs/dynamodb-design.md)(DynamoDBのアクセスパターン設計)、
[docs/api-spec.md](docs/api-spec.md)(API仕様)を参照。

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

## デプロイ

`.github/workflows/deploy.yml` は**手動実行(workflow_dispatch)専用**にしている。インフラ変更は
元に戻しにくく影響範囲が大きいため、pushへの自動フックはあえて行わない設計。事前にAWS側でGitHub Actions用の
OIDC IAM Role(`AWS_DEPLOY_ROLE_ARN`)を作成し、リポジトリのSecretsに登録すること。

## 既知の制約・未検証事項

- この環境にはTerraform CLIが直接インストールされていないため、公式Dockerイメージ(`hashicorp/terraform`)で
  `fmt` / `init` / `validate` / `plan` を実行して検証済み(`terraform fmt` で検出された整形差分は反映済み)。
  `plan` はダミーの認証情報でAWSのSTS呼び出しに到達するところまで進行することを確認しており、設定自体に
  構文・参照エラーがないことは確認できている。ただし**実際のAWSアカウントに対する `plan`/`apply` は未実施**なので、
  デプロイ前に必ず自分のAWS認証情報で `terraform plan` を確認すること。ローカルにTerraformが無い場合は例えば
  次のようにDockerで代替できる:
  ```bash
  docker run --rm -v "$(pwd)/..:/workspace" -w /workspace/infra \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
    hashicorp/terraform:1.9.0 plan
  ```
- モバイルアプリは実機・シミュレータでの動作確認を行っていない(このサンドボックス環境にはExpo実行環境がない)。
  `npm run typecheck` によるTypeScriptの型検証のみ完了している。カメラ権限まわりや実際のCognito認証フローは
  実機での確認を推奨する。
- Bedrockの実際のモデル出力・料金は本番アカウントでの検証が必要(モデルIDやプロンプトは `BEDROCK_MODEL_ID`
  環境変数で変更可能)。
