/**
 * Whether this session has already watched the intro.
 *
 * Session-scoped on purpose: a returning visitor who reloads the page gets
 * straight to the particle world, but a genuinely new visit still gets the film.
 * Reads and writes are guarded because `sessionStorage` throws in a few privacy
 * configurations, and "the intro plays again" is a far better failure than a
 * page that will not load.
 */
const INTRO_FLAG = "edgesense.intro.v1";

export function introSeen(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_FLAG, "1");
  } catch {
    /* private mode — the intro simply plays again */
  }
}
