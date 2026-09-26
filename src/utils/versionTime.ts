/**
 * When a version was, as Version History says it: precise while it is recent,
 * coarser as it gets old, never an all-number date (8/25/25 is a different day
 * in another country). The one place the app shows times, because the list is
 * about time.
 *
 *   today            15:48
 *   yesterday        Yesterday 21:40
 *   this week        Tue 10:12
 *   this year        25 Aug
 *   older            25 Aug 2025
 *
 * `hour12` is the Mac's own 24-hour setting where it is set (asked of the main
 * process), else the locale's; the day and month follow the locale.
 */

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function clock(at: number, hour12?: boolean, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12 }).format(at);
}

export function versionTime(at: number, now: number, hour12?: boolean, locale?: string): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return clock(at, hour12, locale);
  if (days === 1) return `Yesterday ${clock(at, hour12, locale)}`;
  if (days < 7) {
    const day = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(at);
    return `${day} ${clock(at, hour12, locale)}`;
  }
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(at);
}

/** The whole moment, for a tooltip: `Tuesday 23 September, 10:12`. */
export function versionMoment(at: number, hour12?: boolean, locale?: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(new Date(at).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  }).format(at);
  return `${date}, ${clock(at, hour12, locale)}`;
}
