import { onMounted, onUnmounted, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

import { getCanonicalSessionRoute } from "@/lib/sessionHelpers"
import { usePlayerStore } from "@/stores/player"
import { useSessionStore } from "@/stores/session"

/**
 * Handles the repeating session-route plumbing:
 *  - hydrates the player store for the current session id,
 *  - loads the session snapshot + realtime subscription,
 *  - watches phase changes and pushes to the canonical route,
 *  - tears down the session store on unmount.
 *
 * The pattern was duplicated in LobbyView, PlayView, and ResultsView.
 */
export function useSessionLifecycle() {
  const route = useRoute()
  const router = useRouter()
  const playerStore = usePlayerStore()
  const sessionStore = useSessionStore()

  const sessionId = () => route.params.sessionId as string
  const mountedSessionId = sessionId()

  onMounted(async () => {
    playerStore.hydrateForSession(mountedSessionId)
    await sessionStore.loadSession(mountedSessionId)
  })

  onUnmounted(() => {
    window.setTimeout(() => {
      const activeSessionId = router.currentRoute.value.params.sessionId as
        | string
        | undefined
      if (
        router.currentRoute.value.meta.sessionRoute &&
        activeSessionId === mountedSessionId
      ) {
        return
      }

      sessionStore.teardown(mountedSessionId)
    }, 0)
  })

  watch(
    () => sessionStore.session?.phase,
    async (phase) => {
      if (!sessionStore.session || !phase) return
      const canonicalRoute = getCanonicalSessionRoute(
        sessionStore.session.id,
        phase,
      )
      if (canonicalRoute !== route.path) {
        await router.push(canonicalRoute)
      }
    },
  )

  return { sessionStore, playerStore, sessionId }
}
