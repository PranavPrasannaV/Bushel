// Where the person works, kept on their own device. No account, no server: Bushel is a static site, and this
// is the only thing it remembers. Every read and write is guarded, because storage can be blocked or full.
const KEY = 'bushel.home-county'

export function getHomeCounty(): string | null {
  try {
    const fips = window.localStorage.getItem(KEY)
    return fips && /^\d{5}$/.test(fips) ? fips : null
  } catch {
    return null
  }
}

export function setHomeCounty(fips: string): void {
  try {
    window.localStorage.setItem(KEY, fips)
  } catch {
    // A device that won't store it still works; it just asks again next time.
  }
}

export function clearHomeCounty(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignored: see setHomeCounty
  }
}

/** True once the person has answered, even by skipping: the question is asked once. */
const ASKED = 'bushel.asked-home-county'

export function hasBeenAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED) === 'yes'
  } catch {
    return false
  }
}

export function markAsked(): void {
  try {
    window.localStorage.setItem(ASKED, 'yes')
  } catch {
    // ignored: see setHomeCounty
  }
}
