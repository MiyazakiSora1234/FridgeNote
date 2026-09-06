import { z } from "zod";

/**
 * "YYYY-MM-DD" 形式かつ実在するカレンダー上の日付であることを検証するZodスキーマ。
 * 単純な正規表現(/^\d{4}-\d{2}-\d{2}$/)だけだと "2026-13-45" や "2026-02-30" のような
 * 実在しない日付も通ってしまう(Dateへの変換時に自動繰り上げされて別の日付になるだけで、
 * エラーにはならない)ため、変換結果を往復チェックして本当に同じ日付かを確認する。
 */
export const DateOnlyStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected date in YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year === undefined || month === undefined || day === undefined) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    );
  }, "not a valid calendar date");
