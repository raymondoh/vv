export type CatalogSearch = { name: string | null; city: string | null };
export type CatalogSearchParams = { q?: string | string[]; city?: string | string[] };

function normalize(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first.trim().slice(0, 120).trim() || null : null;
}

export function normalizeCatalogSearch(params: CatalogSearchParams): CatalogSearch {
  return { name: normalize(params.q), city: normalize(params.city) };
}

/** Escape regex syntax so user input is literal under PostgreSQL regular expressions. */
export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);
}

export function catalogSearchRegex(search: CatalogSearch): CatalogSearch {
  return {
    name: search.name === null ? null : escapeRegexLiteral(search.name),
    city: search.city === null ? null : `^${escapeRegexLiteral(search.city)}$`,
  };
}
