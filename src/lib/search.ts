/**
 * Matching text the way someone types it rather than the way it is spelled.
 *
 * Every list filtered on `name.toLowerCase().includes(needle)`, which means
 * "malardalen" found no *Mälardalens*, "angelholm" no *Ängelholm* and
 * "hogalid" no *Högalid*. People type school names from memory, from a phone,
 * from a keyboard that has no å — and the register is full of words that need
 * all three letters.
 *
 * **This is for matching only.** Å, Ä and Ö are letters of the Swedish
 * alphabet, not accented A and O, and they sort after Z: `localeCompare(…,
 * "sv")` in `sort-rows.ts` gets that right and must keep getting it right.
 * Folding them here is a deliberate widening of what counts as a hit, and it
 * stops at the comparison — nothing that reaches the screen goes through it.
 */

/**
 * Folded values, kept because the same strings are folded over and over.
 *
 * `selectSchools` runs its search test once per row per exclusion pass, which
 * is seven passes over the whole register for a single keystroke — roughly
 * 45 000 folds each time somebody types a letter. The cache makes all but the
 * first free. It is bounded by the register's own vocabulary plus whatever
 * has been typed in one session, so it needs no eviction.
 */
const cache = new Map<string, string>();

/**
 * Lower case, and Latin diacritics removed.
 *
 * NFD splits a composed letter into its base and its combining marks — Ä
 * becomes A plus U+0308, Å becomes A plus U+030A — and dropping the combining
 * block leaves the base letter. That covers é, ü and the rest of the accented
 * spellings that turn up in huvudman names as well.
 */
export function fold(value: string): string {
  const memo = cache.get(value);
  if (memo !== undefined) return memo;
  const folded = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  cache.set(value, folded);
  return folded;
}

/**
 * The search term as the filters use it: folded, and trimmed because a term
 * of nothing but spaces is not a filter.
 *
 * The term is *not* trimmed where it is parsed — the field is controlled by
 * that value, and stripping the space as it is typed makes the field
 * impossible to type two words into. See `parseSchoolQuery`.
 */
export function needle(query: string): string {
  return fold(query.trim());
}

/** Whether `haystack` contains the already-folded `needle`. */
export function matches(haystack: string, folded: string): boolean {
  return fold(haystack).includes(folded);
}
