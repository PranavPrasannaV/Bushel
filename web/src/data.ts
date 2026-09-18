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
