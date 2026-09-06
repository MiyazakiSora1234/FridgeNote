/**
 * 賞味期限未設定(expiresAt=null)のFridgeItemを、GSI1SKの昇順ソートで
 * 常に最後尾に来させるためのセンチネル値。実在しない日付(9999年99月99日)を
 * 使うことで「文字列としての辞書順ソート」でも確実に他の実在日付より後ろに来る。
 */
const NO_EXPIRY_SORT_SENTINEL = "9999-99-99";

/**
 * DynamoDBのPK/SK/GSIキー文字列を一箇所に集約する。
 * 各serviceがテンプレートリテラルで直接組み立てていると、
 * タイポ1つでクエリがサイレントに空振りするため、生成ロジックをここに寄せる。
 * (docs/dynamodb-design.md のキー設計と対応)
 */
export const Keys = {
  user: (userId: string) => `USER#${userId}`,

  item: (itemId: string) => `ITEM#${itemId}`,
  itemPrefix: () => "ITEM#",

  analysis: (analysisId: string) => `ANALYSIS#${analysisId}`,

  voiceAnalysis: (analysisId: string) => `VOICE#${analysisId}`,

  recipe: (analysisId: string) => `RECIPE#${analysisId}`,

  ingredient: (ingredientId: string) => `INGREDIENT#${ingredientId}`,
  ingredientMetadata: () => "METADATA",

  expires: (expiresAt: string | null) => `EXPIRES#${expiresAt ?? NO_EXPIRY_SORT_SENTINEL}`,

  ingredientMasterPartition: () => "INGREDIENT_MASTER",
  ingredientName: (normalizedName: string) => `NAME#${normalizedName}`,
} as const;
