import { z } from "zod";

// 正規表現だけだと"2026-13-45"のような実在しない日付も通ってしまう(Dateへの変換時に
// 自動繰り上げされるだけでエラーにならない)ため、変換結果を往復チェックする。
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
