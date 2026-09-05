/**
 * catchしたunknown値からユーザーに見せるメッセージ文字列を取り出す。
 * 以前は6画面が個別に `e instanceof Error ? e.message : String(e)` と
 * 書いていたため、ここに一本化する。
 */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
