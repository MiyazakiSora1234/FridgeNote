const NO_EXPIRY_SORT_SENTINEL = "9999-99-99";

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
