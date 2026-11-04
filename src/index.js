/**
 * dsh-ide-git — host entry. The implementation lives under src/host/: this file
 * only re-exports the public surface and wires the HTTP route plus the optional
 * llm/sessions services used by the AI commit-message button.
 *
 *   POST /dsh-ide-git/api/<method>   -> { ok: true, data } | { ok: false, error }
 */
import { Config } from './host/config.js'
import { handle, ROUTE_PREFIX } from './host/http.js'
import { setCommitServices } from './host/commit-message.js'

export { Config }
export { repoScanCache, REPOS_CACHE_TTL_MS } from './host/repos.js'

export const name = 'dsh-ide-git'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }),
    'dsh-ide-git: /dsh-ide-git/api git routes',
  )
  /* AI commit message (issue #6). `llm` and `sessions` are injected HERE and not
     in `export const inject`: a composition without them must still load the
     whole plugin, it just answers commit-message with no-host-service. */
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['llm', 'sessions'], (injected) => {
    const llm = injected.get('llm')
    const sessions = injected.get('sessions')
    if (llm === undefined || llm === null || sessions === undefined || sessions === null) return
    injected.effect(() => {
      setCommitServices({ llm: llm, sessions: sessions })
      return () => { setCommitServices(null) }
    }, 'dsh-ide-git: ai commit message')
  })
}
