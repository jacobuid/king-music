export function createApiClient({ baseUrl = '', getToken, getAccessToken, getProfileToken = () => '', getManageToken = () => '', requireBaseUrl = false, fetchImpl = fetch }) {
  return async function request(path, options = {}) {
    if (requireBaseUrl && !baseUrl.trim()) {
      throw new Error('The music API is not configured. Set VITE_API_URL to the deployed API URL and rebuild the web app.')
    }
    const headers = new Headers(options.headers)
    const confirmation = options.method?.toUpperCase() === 'POST' && ['/api/manage/unlock', '/api/manage/profiles/unlock', '/api/profiles'].includes(path) && headers.has('X-Reauthentication-Proof')
    const token = confirmation ? await getToken() : await getAccessToken()
    if (!token) throw new Error('Sign in to continue.')
    let response
    try {
      response = await fetchImpl(`${baseUrl.trim().replace(/\/$/, '')}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Profile-Token': getProfileToken(), 'X-Manage-Token': getManageToken(), ...Object.fromEntries(headers) },
      })
    } catch {
      throw new Error('Cannot reach the music API. Check the API URL and connection. For local development, start npm run dev:api.')
    }
    if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('Content-Type') || '')) {
      throw new Error('The music API returned a web page or an invalid response instead of JSON. Check VITE_API_URL; locally, make sure npm run dev:api is running.')
    }
    let data
    try { data = await response.json() } catch { throw new Error('The music API returned invalid JSON. Please try again.') }
    if (!response.ok) throw new Error(data?.error || `Music API request failed (${response.status}).`)
    return data
  }
}
