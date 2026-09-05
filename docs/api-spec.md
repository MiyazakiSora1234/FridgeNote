# API仕様

Base URL: `https://{api-id}.execute-api.{region}.amazonaws.com`
すべてのエンドポイントは Cognito JWT Authorizer による認証必須(`Authorization: Bearer <idToken>`)。

共通エラーレスポンス:
```json
{ "error": { "code": "STRING_CODE", "message": "human readable" } }
```

## POST /v1/images/presigned-url
画像アップロード用のPresigned URLを取得する。

Request:
```json
{ "contentType": "image/jpeg" }
```

Response 200:
```json
{
  "imageKey": "users/abc123/uploads/uuid.jpg",
  "uploadUrl": "https://s3...",
  "expiresIn": 60
}
```

## POST /v1/analyses
画像解析ジョブを作成する(SQSへは直接投げず、S3イベント駆動が正のトリガーだが、
アプリ側からのアップロード完了通知としてジョブレコードを先に`pending`で作成し、UX上すぐに`analysisId`を払い出す)。

Request:
```json
{ "imageKey": "users/abc123/uploads/uuid.jpg", "type": "food" }
```
`type`: `"food"`(食材写真) | `"dish"`(料理写真)

Response 201:
```json
{ "analysisId": "a1b2c3", "status": "pending" }
```

## GET /v1/analyses/:id
解析結果を取得(ポーリング用)。

Response 200:
```json
{
  "analysisId": "a1b2c3",
  "type": "dish",
  "status": "completed",
  "result": {
    "dish": "親子丼",
    "ingredients": [
      { "name": "鶏肉", "ingredientId": "ingredient_010", "confidence": 0.94 },
      { "name": "卵", "ingredientId": "ingredient_002", "confidence": 0.98 },
      { "name": "玉ねぎ", "ingredientId": "ingredient_005", "confidence": 0.87 }
    ]
  },
  "createdAt": "...", "updatedAt": "..."
}
```
`status=failed` の場合は `errorReason` を含む。他人の`analysisId`を指定した場合は404(存在有無を漏らさないため403ではなく404)。

## GET /v1/fridge/items
冷蔵庫在庫一覧。クエリパラメータ `sort=expiresAt` で賞味期限昇順(デフォルト)。

Response 200:
```json
{
  "items": [
    {
      "itemId": "item_1", "ingredientId": "ingredient_010", "name": "鶏肉",
      "category": "meat", "quantity": 300, "unit": "g",
      "expiresAt": "2026-09-08", "createdAt": "...", "updatedAt": "...",
      "expiryStatus": "soon"
    }
  ]
}
```
`expiryStatus`: `"expired" | "soon"(3日以内) | "ok" | "none"` をバックエンドで算出して返す。

## POST /v1/fridge/items
食材を手動登録、または画像解析結果を確定して登録する。

Request:
```json
{
  "ingredientName": "トマト",
  "quantity": 2, "unit": "個",
  "expiresAt": "2026-09-10",
  "sourceAnalysisId": "a1b2c3"
}
```
`ingredientName`は食材マスターへ正規化(既存になければ新規Ingredientとして自動登録)。`sourceAnalysisId`は任意(画像由来の場合に紐付け)。

Response 201: 作成された `FridgeItem`

## PATCH /v1/fridge/items/:id
数量・賞味期限などの部分更新。

Request例:
```json
{ "quantity": 250, "expiresAt": "2026-09-12" }
```

## DELETE /v1/fridge/items/:id
在庫から削除。

## POST /v1/fridge/consume
料理写真解析の「使用食材候補」をユーザーが確認した上で在庫を減算する。

Request:
```json
{
  "sourceAnalysisId": "a1b2c3",
  "consumedIngredients": [
    { "ingredientId": "ingredient_010", "quantity": 300, "unit": "g" },
    { "ingredientId": "ingredient_002", "quantity": 2, "unit": "個" }
  ]
}
```
挙動:
- 各 `ingredientId` について該当ユーザーの `FridgeItem` を検索し、数量を減算。
- 減算後の数量が0以下になった場合は `quantity=0` として保持(削除はしない。表示上は在庫切れとして扱う運用とし、ユーザーが明示的にDELETEするまで消さない)。
- 対応する在庫が存在しない場合はスキップし、レスポンスの `skipped` に含める(エラーにはしない)。
- 処理結果として `RecipeAnalysis` レコードを作成し、消費履歴として保存。

Response 200:
```json
{
  "consumed": [{ "ingredientId": "ingredient_010", "newQuantity": 0 }],
  "skipped": [{ "ingredientId": "ingredient_099", "reason": "not_in_fridge" }]
}
```

## 冪等性について
`POST /v1/analyses` と `POST /v1/fridge/consume` は `Idempotency-Key` ヘッダ(クライアント生成UUID)を受け付け、
同一キーでの再送信は最初の結果をそのまま返す(DynamoDB条件付き書き込みで実現)。
