// 実在しない日付にして「常に最後尾」に来させ、文字列の辞書順ソートでも成立させる。
const NO_EXPIRY_SORT_SENTINEL = "9999-99-99";

export const Keys = {
  // 在庫・解析結果のパーティションは「世帯ID」で決まる(個人世帯のIDはCognito subと同一)。
  // 引数名がuserIdのままの各serviceには世帯IDを渡す。
  user: (userId: string) => `USER#${userId}`,

  profile: () => "PROFILE",
  member: (userId: string) => `MEMBER#${userId}`,
  memberPrefix: () => "MEMBER#",
  invite: (code: string) => `INVITE#${code}`,
  inviteMetadata: () => "METADATA",

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
