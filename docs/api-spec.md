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
`type`: `"food"`(食材写真) | `"dish"`(料理写真) | `"receipt"`(レシート写真)

Response 201:
```json
{ "analysisId": "a1b2c3", "status": "pending" }
```

`type=receipt` の場合、完了後の `GET /v1/analyses/:id` の `result` は以下の形になる
(voiceの`result.items`と同じ`ParsedIngredientItem[]`形式。専用のレシート確認APIは作らず、
既存の解析ジョブAPIをそのまま再利用している):
```json
{
  "kind": "receipt",
  "items": [
    { "name": "鶏もも肉", "ingredientId": "ingredient_010", "quantity": 1, "unit": "pack", "confidence": 0.96, "belowConfidenceThreshold": false },
    { "name": "玉ねぎ", "ingredientId": "ingredient_005", "quantity": 1, "unit": "個", "confidence": 0.3, "belowConfidenceThreshold": true }
  ]
}
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

## POST /v1/fridge/items/bulk
レシート/音声の確認画面で「すべて追加」を押したときに呼ぶ一括登録。
単品登録(`POST /v1/fridge/items`)のバリデーションルールをそのまま複数件に適用するだけの
シンプルな責務(「渡されたものは全部登録する」)で、チェックを外した項目は呼び出し側(モバイル)が
`items`に含めない前提。

Request:
```json
{
  "source": "receipt",
  "sourceAnalysisId": "a1b2c3",
  "items": [
    { "ingredientName": "鶏もも肉", "quantity": 1, "unit": "pack" },
    { "ingredientName": "卵", "quantity": 1, "unit": "pack" }
  ]
}
```
`source`: `"receipt" | "voice"`。`sourceAnalysisId`は任意(渡された場合、対応する解析ジョブに
`userFeedback`として一括確定内容を記録する)。`items`は1〜50件。

Response 201:
```json
{ "items": [ /* 作成されたFridgeItemの配列 */ ] }
```

## POST /v1/voice/transcriptions
音声入力の解析ジョブを作成する。`POST /v1/analyses` の音声版(エンティティが異なるため別エンドポイント)。

Request:
```json
{ "audioKey": "users/abc123/audio/uuid.m4a" }
```
`audioKey`が呼び出しユーザーの名前空間(`users/{sub}/audio/`)以外を指す場合は403。

Response 201:
```json
{ "analysisId": "v1a2b3", "status": "pending" }
```

## GET /v1/voice/transcriptions/:id
音声解析結果を取得(ポーリング用)。`GET /v1/analyses/:id` の音声版。

Response 200:
```json
{
  "analysisId": "v1a2b3",
  "audioKey": "users/abc123/audio/uuid.m4a",
  "status": "completed",
  "transcript": "鶏もも肉300グラムと卵6個を追加",
  "result": {
    "items": [
      { "name": "鶏もも肉", "ingredientId": "ingredient_010", "quantity": 300, "unit": "g", "confidence": 0.95, "belowConfidenceThreshold": false }
    ]
  },
  "createdAt": "...", "updatedAt": "..."
}
```
他人の`analysisId`を指定した場合は404(`GET /v1/analyses/:id`と同じ考え方)。

## POST /v1/ingredients/search
食材マスターのあいまい検索。手動入力時のサジェスト、およびレシート/音声結果を食材マスターへ
正規化する際に内部的に使っているのと同じロジックを、モバイル側からも呼べるようにしたもの。

Request:
```json
{ "query": "とまと", "limit": 5 }
```
`limit`は省略可(既定5、最大20)。

Response 200:
```json
{
  "candidates": [
    { "ingredientId": "ing_tomato", "name": "トマト", "category": "vegetable", "score": 1 }
  ]
}
```
`score`は完全一致=1、別名一致=0.9、部分一致=0.5×文字列の重なり度合い、として計算される
(OpenSearch/ベクターDBは本規模では導入せず、食材マスター全件をメモリ上でマッチングする実装)。

## PATCH /v1/fridge/items/:id
数量・賞味期限などの部分更新。

Request例(絶対値で上書き):
```json
{ "quantity": 250, "expiresAt": "2026-09-12" }
```

Request例(手動で減らす。`decrementBy`は`quantity`と同時指定不可):
```json
{ "decrementBy": 50 }
```
`quantity`は「渡した値で上書き」だが、`decrementBy`はサーバー側でDynamoDBのADD式により
原子的に減算する。複数端末から同時に呼ばれても減算が失われない(lost updateを起こさない)ようにするため、
手動での在庫減算画面はこちらを使う。減算した結果が負になる場合(在庫不足、他端末での操作等で
表示していた在庫が古くなっていた場合)は409を返す。

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
- `sourceAnalysisId` が指す解析が `status=completed` かつ `type=dish` でない場合は400。
- `consumedIngredients` の各 `ingredientId` は、その解析結果(`result.ingredients`)にAIが実際に候補として挙げたものだけを許可する。候補外のIDが1つでも含まれていれば400(「使用食材候補の確認」という機能の意図から外れた消費を防ぐガード)。
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
`POST /v1/analyses` は `imageKey` から決定論的に `analysisId` を導出するため、
再送信しても既存レコードがそのまま返るだけで自然に冪等(クライアント側でIdempotency-Keyを
発行する必要はない)。`POST /v1/voice/transcriptions` も同じ方式(`audioKey`から導出)で冪等。

`POST /v1/fridge/consume` は `sourceAnalysisId` 自体が冪等性キーを兼ねる。
DynamoDBの条件付き書き込みで「このsourceAnalysisIdに対する消費」を最初の1回だけ受け付け、
同じ `sourceAnalysisId` での2回目以降の呼び出しは在庫を一切変更せず、
1回目の処理結果をそのまま返す(二重タップやネットワーク再送で在庫が二重に減算されることはない)。
