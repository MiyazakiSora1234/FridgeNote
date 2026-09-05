import { z } from "zod";

export const PresignedUrlRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const CreateAnalysisRequestSchema = z.object({
  imageKey: z.string().min(1).max(512),
  type: z.enum(["food", "dish"]),
});

export const CreateFridgeItemRequestSchema = z.object({
  ingredientName: z.string().min(1).max(100),
  quantity: z.number().finite().positive().max(100000),
  unit: z.string().min(1).max(20),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sourceAnalysisId: z.string().min(1).max(64).optional(),
});

export const UpdateFridgeItemRequestSchema = z.object({
  quantity: z.number().finite().nonnegative().max(100000).optional(),
  unit: z.string().min(1).max(20).optional(),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
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
