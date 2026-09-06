import { z } from "zod";
import { DateOnlyStringSchema } from "../lib/dateSchema.js";

export const PresignedUrlRequestSchema = z.object({
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "audio/m4a",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/mpeg",
  ]),
});

export const CreateAnalysisRequestSchema = z.object({
  imageKey: z.string().min(1).max(512),
  type: z.enum(["food", "dish", "receipt"]),
});

export const CreateFridgeItemRequestSchema = z.object({
  ingredientName: z.string().min(1).max(100),
  quantity: z.number().finite().positive().max(100000),
  unit: z.string().min(1).max(20),
  expiresAt: DateOnlyStringSchema.nullable().optional(),
  sourceAnalysisId: z.string().min(1).max(64).optional(),
});

/**
 * レシート/音声解析結果の「一括登録」用。単品登録(CreateFridgeItemRequestSchema)を
 * そのまま複数件受け取る形にし、バリデーションルールを重複定義しない。
 */
export const BulkCreateFridgeItemsRequestSchema = z.object({
  /** 一括登録の由来。1リクエストはレシート/音声どちらか一方のフローからのみ呼ばれる想定。 */
  source: z.enum(["receipt", "voice"]),
  sourceAnalysisId: z.string().min(1).max(64).optional(),
  items: z.array(CreateFridgeItemRequestSchema.omit({ sourceAnalysisId: true })).min(1).max(50),
});

export const UpdateFridgeItemRequestSchema = z
  .object({
    quantity: z.number().finite().nonnegative().max(100000).optional(),
    /**
     * 「現在値を読んでから引いた値をquantityとして上書き」だとクライアント側の計算になり、
     * 2つのリクエストが同時に来ると片方の減算が失われる(lost update)。
     * decrementByはサーバー側でDynamoDBのADD式による原子的な減算として処理するための
     * 専用フィールドで、quantityとは併用しない(手動での在庫減算画面が使う)。
     */
    decrementBy: z.number().finite().positive().max(100000).optional(),
    unit: z.string().min(1).max(20).optional(),
    expiresAt: DateOnlyStringSchema.nullable().optional(),
  })
  .refine((data) => !(data.quantity !== undefined && data.decrementBy !== undefined), {
    message: "quantity and decrementBy cannot both be specified",
  });

export const ConsumeRequestSchema = z.object({
  sourceAnalysisId: z.string().min(1).max(64),
  consumedIngredients: z
    .array(
      z.object({
        ingredientId: z.string().min(1).max(64),
        quantity: z.number().finite().positive().max(100000),
        unit: z.string().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
});

export const CreateVoiceTranscriptionRequestSchema = z.object({
  audioKey: z.string().min(1).max(512),
});

export const IngredientSearchRequestSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().positive().max(20).optional().default(5),
});
