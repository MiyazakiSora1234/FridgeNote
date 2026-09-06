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

  imageKey: (imageKey: string) => `IMAGEKEY#${imageKey}`,

  expires: (expiresAt: string | null) => `EXPIRES#${expiresAt ?? "9999-99-99"}`,

  ingredientMasterPartition: () => "INGREDIENT_MASTER",
  ingredientName: (normalizedName: string) => `NAME#${normalizedName}`,
} as const;
