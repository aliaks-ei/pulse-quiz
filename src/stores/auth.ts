import type { Session } from "@supabase/supabase-js"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

import { translate } from "@/i18n"
import { bootstrapAuthSession } from "@/lib/authBootstrap"
import { supabase } from "@/services/supabase"

function resolveAppUrl() {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "")
  }

  if (typeof window !== "undefined") {
    return window.location.origin
  }

  return "http://localhost:5175"
}

function buildAuthCallbackUrl(next = "/library") {
  const url = new URL("/auth/callback", resolveAppUrl())
  url.searchParams.set("next", next)
  return url.toString()
}

export const useAuthStore = defineStore("auth", () => {
  const session = ref<Session | null>(null)
  const isReady = ref(false)
  let hasBoundAuthListener = false
  let bootstrapPromise: Promise<void> | null = null
  let hostSessionWaiters: Array<{
    resolve: () => void
    reject: (reason?: unknown) => void
    timeoutId: number
  }> = []

  function resolveHostSessionWaiters() {
    for (const waiter of hostSessionWaiters) {
      window.clearTimeout(waiter.timeoutId)
      waiter.resolve()
    }

    hostSessionWaiters = []
  }

  function syncSession(nextSession: Session | null) {
    session.value = nextSession

    if (nextSession?.user && !nextSession.user.is_anonymous) {
      resolveHostSessionWaiters()
    }
  }

  async function ensureAnonymousSession() {
    const result = await bootstrapAuthSession(supabase.auth)
    syncSession(result.session as Session | null)
  }

  async function bootstrap() {
    if (isReady.value) return
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = (async () => {
      try {
        await ensureAnonymousSession()

        if (!hasBoundAuthListener) {
          supabase.auth.onAuthStateChange((_event, nextSession) => {
            syncSession(nextSession)
          })
          hasBoundAuthListener = true
        }

        isReady.value = true
      } finally {
        bootstrapPromise = null
      }
    })()

    return bootstrapPromise
  }

  async function signInWithMagicLink(email: string, next = "/library") {
    const normalizedEmail = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(next),
      },
    })

    if (error) throw error
  }

  async function signInWithGoogle(next = "/library") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: buildAuthCallbackUrl(next),
      },
    })

    if (error) throw error
  }

  async function signOutToAnonymous() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    await ensureAnonymousSession()
  }

  async function waitForHostSession(timeoutMs = 10000) {
    if (isHostAuthenticated.value) return

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        hostSessionWaiters = hostSessionWaiters.filter(
          (waiter) => waiter.timeoutId !== timeoutId,
        )
        reject(new Error(translate("storeErrors.finishSignInTimeout")))
      }, timeoutMs)

      hostSessionWaiters.push({
        resolve,
        reject,
        timeoutId,
      })
    })
  }

  const user = computed(() => session.value?.user ?? null)
  const userId = computed(() => user.value?.id ?? null)
  const userEmail = computed(() => user.value?.email ?? null)
  const isAnonymous = computed(() => Boolean(user.value?.is_anonymous))
  const isHostAuthenticated = computed(() =>
    Boolean(user.value && !user.value.is_anonymous),
  )

  return {
    session,
    user,
    userId,
    userEmail,
    isAnonymous,
    isHostAuthenticated,
    isReady,
    bootstrap,
    signInWithMagicLink,
    signInWithGoogle,
    signOutToAnonymous,
    waitForHostSession,
  }
})
