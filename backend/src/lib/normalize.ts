/**
 * 食材名の表記ゆれ吸収用の正規化。
 * 自前MLは使わず、シンプルな文字種変換 + トリムのみで
 * 「トマト」「とまと」「tomato」「Tomato」等を同一キーに寄せる。
 * (英語の別名はIngredientマスターのaliasesに個別登録する前提)
 */
export function normalizeIngredientName(input: string): string {
  return katakanaToHiragana(fullWidthToHalfWidth(input.trim())).toLowerCase().replace(/\s+/g, "");
}

function katakanaToHiragana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function fullWidthToHalfWidth(str: string): string {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}
