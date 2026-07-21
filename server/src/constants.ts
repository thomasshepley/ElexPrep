/** Safety cap on copies per label so a typo (e.g. "50" instead of "5") can't be confirmed blind. */
export const MAX_COPIES_WITHOUT_OVERRIDE = 10;
