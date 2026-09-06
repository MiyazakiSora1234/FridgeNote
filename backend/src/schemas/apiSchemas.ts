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

export const BulkCreateFridgeItemsRequestSchema = z.object({
  source: z.enum(["receipt", "voice"]),
  sourceAnalysisId: z.string().min(1).max(64).optional(),
  items: z.array(CreateFridgeItemRequestSchema.omit({ sourceAnalysisId: true })).min(1).max(50),
});

export const UpdateFridgeItemRequestSchema = z
  .object({
    quantity: z.number().finite().nonnegative().max(100000).optional(),
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
