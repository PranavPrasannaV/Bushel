/** Fetch a static artifact under public/data. No backend: these are plain files. */
export async function getData<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { signal })
  // The dev server answers a missing file with index.html, so check the type as well as the status.
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    const why = res.ok ? 'was not found' : `failed to load (HTTP ${res.status})`
    throw new Error(`data/${path} ${why}. Run the pipeline build to produce it.`)
  }
  return (await res.json()) as T
}

/** Live-built fires are served by `python -m bushel.serve`, not bundled: their ids start with `live-`. */
export const isLive = (id: string) => id.startsWith('live-')

/** A fire's record or geometry, from the static bundle or, for a live-built fire, from the API. */
export function getFireData<T>(id: string, ext: 'json' | 'geojson', signal?: AbortSignal): Promise<T> {
  return isLive(id) ? getApi<T>(`data/fires/${id}.${ext}`, { signal }) : getData<T>(`fires/${id}.${ext}`, signal)
}

/** JSON from the local live-build server. Throws with the server's own error text when it gives one. */
export async function getApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, init)
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error(`/api/${path}: no live-build server answered`)
  }
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `/api/${path} failed (HTTP ${res.status})`)
  return body as T
}
