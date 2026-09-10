export type CatalogSearch = { name: string | null; city: string | null; guests: number | null };
export type CatalogSearchParams = { q?: string | string[]; city?: string | string[]; guests?: string | string[] };

function normalize(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim().slice(0, 120).trim() || null : null;
}

function normalizeGuests(value: string | string[] | undefined): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const text = first.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const guests = Number(text);
  return Number.isSafeInteger(guests) && guests >= 1 && guests <= 100000 ? guests : null;
}

export function normalizeCatalogSearch(params: CatalogSearchParams): CatalogSearch {
  return { name: normalize(params.q), city: normalize(params.city), guests: normalizeGuests(params.guests) };
}

/** Escape regex syntax so user input is literal under PostgreSQL regular expressions. */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
}

export function catalogSearchRegex(search: Pick<CatalogSearch, 'name' | 'city'>): Pick<CatalogSearch, 'name' | 'city'> {
  return {
    name: search.name === null ? null : escapeRegexLiteral(search.name),
    city: search.city === null ? null : `^${escapeRegexLiteral(search.city)}$`,
  };
}
