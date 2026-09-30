/**
 * The lines of a diff size in words, for assistive technology: "162 lines
 * added and 29 removed". `diffSizeText` in `@utils/diff-size` calls it for
 * the contributions subpage and its markdown twin.
 *
 * A leaf on purpose, like `home-facts.ts`: it imports nothing, so the unit
 * test loads the composition the site runs instead of a copy of it. The
 * caller passes in the translation lookup, the plural rule and the number
 * format, which live behind the project's path aliases.
 *
 * @module
 */

/** The `pages.projectsContributions` keys the spoken size is built from. */
export type DiffSpokenKey =
  | "diffSpoken"
  | "diffAdded"
  | "diffAddedOne"
  | "diffRemoved"
  | "diffRemovedOne";

/** What the composition needs from the page locale. */
export interface DiffSpokenLocale {
  /** The translation for a key, with its `{placeholders}` filled. */
  readonly text: (key: DiffSpokenKey, params: Record<string, string>) => string;
  /** Picks the form a count takes, as `pluralize` does. */
  readonly plural: (
    count: number,
    forms: { readonly one: string; readonly other: string },
  ) => string;
  /** A count as the locale writes it. */
  readonly format: (count: number) => string;
}

/**
 * The added and removed line counts in words. Each count takes its own
 * plural form: one sentence template with both numbers read "1 lines added",
 * and the Spanish one failed the same way on both counts (GEO audit #11,
 * B5).
 *
 * @param additions - Lines added.
 * @param deletions - Lines removed.
 * @param locale - The lookup, plural rule and number format to use.
 * @returns The sentence a screen reader hears.
 */
export function diffSpoken(
  additions: number,
  deletions: number,
  locale: DiffSpokenLocale,
): string {
  const counted = (
    value: number,
    one: DiffSpokenKey,
    other: DiffSpokenKey,
  ): string => {
    const count = locale.format(value);
    return locale.plural(value, {
      one: locale.text(one, { count }),
      other: locale.text(other, { count }),
    });
  };
  return locale.text("diffSpoken", {
    added: counted(additions, "diffAddedOne", "diffAdded"),
    removed: counted(deletions, "diffRemovedOne", "diffRemoved"),
  });
}
