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
