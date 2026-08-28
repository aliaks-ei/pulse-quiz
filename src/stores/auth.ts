import type { Session } from "@supabase/supabase-js"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

import { translate } from "@/i18n"
import { restoreAuthSession, signInAnonymously } from "@/lib/authBootstrap"
import { getCaptchaToken } from "@/lib/turnstile"
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
  let restorePromise: Promise<void> | null = null
  let identityPromise: Promise<void> | null = null
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

  function bindAuthListener() {
    if (hasBoundAuthListener) return

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncSession(nextSession)
    })
    hasBoundAuthListener = true
  }

  // Adopts an existing session without creating one. Every route runs this.
  async function restoreSession() {
    if (isReady.value) return
    if (restorePromise) return restorePromise

    restorePromise = (async () => {
      try {
        const result = await restoreAuthSession(supabase.auth)
        syncSession(result.session as Session | null)
        bindAuthListener()
        isReady.value = true
      } finally {
        restorePromise = null
      }
    })()

    return restorePromise
  }

  // Guarantees a user id. Only routes that call an RPC need this, because the
  // whole RPC surface is granted to `authenticated` and nothing to `anon`.
  async function ensureIdentity() {
    await restoreSession()
    if (session.value) return
    if (identityPromise) return identityPromise

    identityPromise = (async () => {
      try {
        const captchaToken = await getCaptchaToken()
        const result = await signInAnonymously(supabase.auth, captchaToken)
        syncSession(result.session as Session | null)
      } finally {
        identityPromise = null
      }
    })()

    return identityPromise
  }

  async function signInWithMagicLink(email: string, next = "/library") {
    const normalizedEmail = email.trim().toLowerCase()
    const captchaToken = await getCaptchaToken()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(next),
        captchaToken,
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

  // Drops the session outright. The next route that needs an identity mints a
  // fresh anonymous user; signing out should not mint one on its own.
  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    syncSession(null)
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
    restoreSession,
    ensureIdentity,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
    waitForHostSession,
  }
})
