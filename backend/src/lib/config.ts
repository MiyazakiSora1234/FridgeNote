import { LOW_CONFIDENCE_THRESHOLD } from "../schemas/aiSchemas.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. This must be set by Terraform (infra/lambda.tf) on the Lambda function.`,
    );
  }
  return value;
}

export const config = {
  tableName: process.env.TABLE_NAME ?? "FridgeNoteTable",
  imagesBucketName: requireEnv("IMAGES_BUCKET_NAME"),
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? "amazon.nova-lite-v1:0",
  aiConfidenceThreshold: Number(process.env.AI_CONFIDENCE_THRESHOLD ?? LOW_CONFIDENCE_THRESHOLD),
};
