# DynamoDB 設計

5人規模のトラフィックであり、コスト最優先(オンデマンド課金)かつ実装の単純さを優先し、
**シングルテーブル設計**を採用する(GSIは最小限に絞る)。テーブル名: `FridgeNoteTable`。

## 1. アクセスパターン一覧

| # | アクセスパターン | 使用キー |
|---|---|---|
| 1 | ユーザーの冷蔵庫アイテムを一覧取得 | PK=`USER#<userId>`, SK begins_with `ITEM#` |
| 2 | 特定の冷蔵庫アイテムを取得/更新/削除 | PK=`USER#<userId>`, SK=`ITEM#<itemId>` |
| 3 | 賞味期限が近い順にソート(アプリ側 or GSI) | GSI1: PK=`USER#<userId>`, SK=`EXPIRES#<expiresAt>` |
| 4 | 画像解析ジョブの作成・状態更新 | PK=`USER#<userId>`, SK=`ANALYSIS#<analysisId>` |
| 5 | 解析結果を analysisId 単体で取得(所有者チェック込み) | PK=`USER#<userId>`, SK=`ANALYSIS#<analysisId>` |
| 6 | imageKeyから解析ジョブの重複作成を防止(冪等性) | `analysisId`をimageKeyのSHA256から決定論的に導出するため、GSIは不要(PK/SKで直接引ける。以前はGSI2を用意していたが、この方式へ移行済みで実際には使われていなかったため撤去した) |
| 7 | 料理解析(RecipeAnalysis)の一覧・取得 | PK=`USER#<userId>`, SK=`RECIPE#<analysisId>` |
| 8 | 食材マスターをid/名前から引く | PK=`INGREDIENT#<ingredientId>`(別名前引き用GSI3) |
| 9 | 音声解析ジョブの作成・状態更新・取得 | PK=`USER#<userId>`, SK=`VOICE#<analysisId>` |
| 10 | audioKeyから音声解析ジョブの重複作成を防止(冪等性) | `analysisId`を`imageKey`と同じ方式(キーのSHA256決定論的ID)で導出するため、専用GSIは不要(PK/SKで直接引ける) |

## 2. テーブル定義

### プライマリキー
- `PK` (String, Partition Key)
- `SK` (String, Sort Key)

### GSI1: `ExpiryIndex`
- `GSI1PK` = `USER#<userId>`
- `GSI1SK` = `EXPIRES#<expiresAt(ISO8601)>`
- 用途: 賞味期限が近い順に冷蔵庫アイテムをクエリ(`FridgeItem`のみに設定)

### GSI3: `IngredientNameIndex`
- `GSI3PK` = `INGREDIENT_MASTER`(固定値。件数が少ない前提でスキャンに近いが問題ない規模)
- `GSI3SK` = `NAME#<normalizedName>`
- 用途: 正規化名からingredientIdを引く。件数が数百〜数千程度に増えた場合はOpenSearch等への移行を検討するが、MVPでは不要。

## 3. エンティティ別アイテム形状

### FridgeItem
```
PK:    USER#<userId>
SK:    ITEM#<itemId>
GSI1PK: USER#<userId>
GSI1SK: EXPIRES#<expiresAt>
{
  entityType: "FridgeItem",
  userId, itemId, ingredientId, name, category,
  quantity: number, unit: string,
  expiresAt: string | null,   // ISO8601 date
  createdAt, updatedAt,
  source: "manual" | "image_food" | "image_dish_consume" | "receipt" | "voice"
}
```

### ImageAnalysis
```
PK:    USER#<userId>
SK:    ANALYSIS#<analysisId>
{
  entityType: "ImageAnalysis",
  userId, analysisId, imageKey,
  type: "food" | "dish" | "receipt",
  status: "pending" | "processing" | "completed" | "failed",
  result: {
     // type=food の場合
     name, category, quantity, unit, expiresAtEstimate, confidence, ingredientId
  } | {
     // type=dish の場合
     dish: string,
     ingredients: [{ name, ingredientId, confidence }]
  } | {
     // type=receipt の場合(ParsedIngredientItem[]。voiceのresult.itemsと同じ形)
     kind: "receipt",
     items: [{ name, ingredientId, quantity, unit, confidence, belowConfidenceThreshold }]
  } | null,
  errorReason?: string,
  terminallyFailed?: boolean, // trueならリトライしても絶対に成功しない失敗(AiFatalError)。再処理をブロックする
  userFeedback?: object,   // ユーザーが確定/修正した最終値(将来の学習データ用)
  createdAt, updatedAt
}
```

### VoiceAnalysis
画像ではないため `ImageAnalysis` とは別エンティティにしているが、ステータス遷移・冪等性・
`userFeedback`記録の考え方は完全に共通(`analysisId`は`audioKey`から`imageKey`と同じ方式で決定論的に導出)。
```
PK:    USER#<userId>
SK:    VOICE#<analysisId>
{
  entityType: "VoiceAnalysis",
  userId, analysisId, audioKey,
  status: "pending" | "processing" | "completed" | "failed",
  transcript?: string,        // Transcribeによる文字起こし結果(completedになった時点で設定)
  result: { items: [{ name, ingredientId, quantity, unit, confidence, belowConfidenceThreshold }] } | null,
  errorReason?: string,
  terminallyFailed?: boolean, // ImageAnalysisと同じ意味
  userFeedback?: object,
  createdAt, updatedAt,
  ttl?: number                // ImageAnalysisと同じ90日
}
```

### RecipeAnalysis
料理写真解析の履歴として `ImageAnalysis(type=dish)` の結果を確定した際に生成する派生レコード(在庫照合・消費履歴の記録用)。
```
PK:    USER#<userId>
SK:    RECIPE#<analysisId>
{
  entityType: "RecipeAnalysis",
  userId, analysisId, dishName,
  // consumed=falseの項目(在庫に無くskipされた食材)のnameは、AIが候補として提示した
  // 名前(analysis.result.ingredients由来)を使う。FridgeItemを持たないため
  // 実際の登録名は分からず、あくまでAI認識時点の表示名。
  ingredients: [{ ingredientId, name, confidence, consumed: boolean, consumedQuantity, unit }],
  createdAt
}
```

### Ingredient(食材マスター)
```
PK:    INGREDIENT#<ingredientId>
SK:    METADATA
GSI3PK: INGREDIENT_MASTER
GSI3SK: NAME#<normalizedName>
{
  entityType: "Ingredient",
  id: ingredientId, name, category,
  aliases: string[],
  createdAt
}
```
`ingredientId`は正規化名(`normalizeIngredientName`)のSHA256から`ingredient_<hash>`の形で決定論的に導出する
(ImageAnalysis/VoiceAnalysisの`analysisId`と同じ考え方)。ULID等のランダムIDにしていた場合、レシート/音声の
一括正規化のように同じ未登録食材名を複数リクエストが同時に処理すると、それぞれ別IDで重複登録してしまう
競合状態があったため、この方式に変更した。同じ正規化名は必ず同じIDに収束し、後発のPutは
`ConditionExpression: attribute_not_exists(PK)`で弾かれて先着の結果を再利用する。

(別名それぞれについても `GSI3SK = NAME#<normalized alias>` を持つ複製アイテムを `SK: ALIAS#<alias>` で追加登録し、
別名からも1発で引けるようにする方式も可。MVPでは全件ロードしてメモリ内でマッチングする実装(完全一致・alias一致は
Map索引化、部分一致は線形スキャン)を採用し、テーブル設計はそのまま将来のGSI直引きにも対応できる形にしてある。)

## 4. TTLの利用
`ImageAnalysis` は解析完了後も一定期間(例: 90日)保持したのち自動削除してよいため、`ttl` 属性(epoch秒)をDynamoDB TTLに設定しストレージコストを抑制する。`FridgeItem` / `Ingredient` にはTTLを設定しない。
