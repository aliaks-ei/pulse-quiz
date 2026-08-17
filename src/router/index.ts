import { createRouter, createWebHistory } from "vue-router"

import { translate } from "@/i18n"
import { getCanonicalSessionRoute } from "@/lib/sessionHelpers"
import { pageTitleKeys, type PageTitleKey } from "@/lib/uiCopy"
import { normalizeNextPath } from "@/lib/utils"
import { withTimeout } from "@/lib/withTimeout"
import { gameService } from "@/services/gameService"
import { useAuthStore } from "@/stores/auth"
import { usePlayerStore } from "@/stores/player"
import { primeSessionSnapshot, useSessionStore } from "@/stores/session"

const HomeView = () => import("@/views/HomeView.vue")
const AuthView = () => import("@/views/AuthView.vue")
const AuthCallbackView = () => import("@/views/AuthCallbackView.vue")
const LibraryView = () => import("@/views/LibraryView.vue")
const PastSessionsView = () => import("@/views/PastSessionsView.vue")
const JoinRoomView = () => import("@/views/JoinRoomView.vue")
const JoinSessionView = () => import("@/views/JoinSessionView.vue")
const GameBuilderView = () => import("@/views/GameBuilderView.vue")
const GameManageView = () => import("@/views/GameManageView.vue")
const WalkthroughView = () => import("@/views/WalkthroughView.vue")
const LobbyView = () => import("@/views/LobbyView.vue")
const PlayView = () => import("@/views/PlayView.vue")
const SessionUnavailableView = () =>
  import("@/views/SessionUnavailableView.vue")
const NotFoundView = () => import("@/views/NotFoundView.vue")

declare module "vue-router" {
  interface RouteMeta {
    requiresHostAuth?: boolean
    shell?: "landing" | "immersive" | "product"
    titleKey?: PageTitleKey
    sessionRoute?: boolean
    hideTopChrome?: boolean
    fullViewport?: boolean
  }
}

const SESSION_SNAPSHOT_TIMEOUT_MS = 8000

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomeView, meta: { shell: "landing" } },
    {
      path: "/auth",
      component: AuthView,
      meta: { shell: "immersive", titleKey: pageTitleKeys.auth },
    },
    {
      path: "/auth/callback",
      component: AuthCallbackView,
      meta: { shell: "product", titleKey: pageTitleKeys.authCallback },
    },
    {
      path: "/library",
      component: LibraryView,
      meta: {
        requiresHostAuth: true,
        shell: "product",
        titleKey: pageTitleKeys.library,
      },
    },
    {
      path: "/sessions/history",
      component: PastSessionsView,
      meta: {
        requiresHostAuth: true,
        shell: "product",
        titleKey: pageTitleKeys.history,
      },
    },
    {
      path: "/games/new",
      component: GameBuilderView,
      meta: {
        requiresHostAuth: true,
        shell: "product",
        titleKey: pageTitleKeys.newQuiz,
      },
    },
    {
      path: "/games/:gameId/edit",
      component: GameBuilderView,
      props: true,
      meta: {
        requiresHostAuth: true,
        shell: "product",
        titleKey: pageTitleKeys.editQuiz,
      },
    },
    {
      path: "/games/:gameId",
      component: GameManageView,
      props: true,
      meta: {
        requiresHostAuth: true,
        shell: "product",
        titleKey: pageTitleKeys.quiz,
      },
    },
    {
      path: "/games/:gameId/walkthrough",
      component: WalkthroughView,
      props: true,
      meta: {
        requiresHostAuth: true,
        shell: "immersive",
        titleKey: pageTitleKeys.walkthrough,
        hideTopChrome: true,
      },
    },
    {
      path: "/join",
      component: JoinRoomView,
      meta: { shell: "immersive", titleKey: pageTitleKeys.join },
    },
    {
      path: "/join/:inviteCode",
      component: JoinSessionView,
      props: true,
      meta: {
        shell: "immersive",
        titleKey: pageTitleKeys.join,
        hideTopChrome: true,
        fullViewport: true,
      },
    },
    {
      path: "/session/:sessionId/unavailable",
      component: SessionUnavailableView,
      props: true,
      meta: { shell: "immersive", titleKey: pageTitleKeys.roomUnavailable },
    },
    {
      path: "/session/:sessionId/lobby",
      component: LobbyView,
      props: true,
      meta: {
        shell: "immersive",
        sessionRoute: true,
        titleKey: pageTitleKeys.lobby,
      },
    },
    {
      path: "/session/:sessionId/play",
      component: PlayView,
      props: true,
      meta: {
        shell: "immersive",
        sessionRoute: true,
        titleKey: pageTitleKeys.play,
      },
    },
    {
      path: "/session/:sessionId/results",
      component: PlayView,
      props: true,
      meta: {
        shell: "immersive",
        sessionRoute: true,
        titleKey: pageTitleKeys.results,
      },
    },
    {
      path: "/:pathMatch(.*)*",
      component: NotFoundView,
      meta: { shell: "immersive", titleKey: pageTitleKeys.notFound },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.bootstrap()

  if (to.path === "/auth" && authStore.isHostAuthenticated) {
    return {
      path: normalizeNextPath(
        to.query.next as string | string[] | undefined,
        "/library",
      ),
    }
  }

  if (to.meta.requiresHostAuth && !authStore.isHostAuthenticated) {
    return {
      path: "/auth",
      query: {
        next: to.fullPath,
      },
    }
  }

  if (!to.meta.sessionRoute) return true

  const sessionId = to.params.sessionId as string
  const playerStore = usePlayerStore()
  const sessionStore = useSessionStore()

  if (sessionStore.session?.id === sessionId) {
    const canonicalRoute = getCanonicalSessionRoute(
      sessionId,
      sessionStore.session.phase,
    )

    if (to.path !== canonicalRoute) {
      return {
        path: canonicalRoute,
      }
    }

    return true
  }

  try {
    const snapshot = await withTimeout(
      gameService.getSessionSnapshot(sessionId),
      SESSION_SNAPSHOT_TIMEOUT_MS,
      "session snapshot",
    )
    playerStore.syncFromSnapshot(snapshot)

    const canonicalRoute = getCanonicalSessionRoute(
      sessionId,
      snapshot.session.phase,
    )
    if (to.path !== canonicalRoute) {
      return {
        path: canonicalRoute,
      }
    }

    primeSessionSnapshot(sessionId, snapshot)
    return true
  } catch (error) {
    const reason =
      error instanceof Error && error.message
        ? error.message
        : translate("sessionUnavailableView.openRoomError")

    return {
      path: `/session/${sessionId}/unavailable`,
      query: {
        reason,
      },
    }
  }
})
