/**
 * 数量・単位の入力欄で共通のバリデーション。
 * 「文字列が正の数値として解釈できるか」「単位が空でないか」という同じチェックを
 * AddItemManualScreen・FoodConfirmForm・DishConfirmForm・ParsedItemsBulkFormが
 * それぞれ個別に(微妙に異なる書き方で)重複実装していたため、ここに一本化する。
 */

/** 文字列を正の数値としてパースする。数値でない・0以下の場合はnullを返す。 */
export function parsePositiveQuantity(input: string): number | null {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isNonEmptyUnit(unit: string): boolean {
  return unit.trim().length > 0;
}
