export function parsePositiveQuantity(input: string): number | null {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isNonEmptyUnit(unit: string): boolean {
  return unit.trim().length > 0;
}
