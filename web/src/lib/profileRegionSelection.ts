export function nextRegionSelection(selected: string[], key: string, additive: boolean): string[] {
  if (additive) return selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
  return selected.length === 1 && selected[0] === key ? [] : [key];
}

export function profileRegionsLabel(selected: number, total: number): string {
  if (selected === 0) return total > 1 ? `Весь эскиз · регионов ${total}` : "Весь эскиз";
  return `Выбрано регионов: ${selected} из ${total}`;
}
