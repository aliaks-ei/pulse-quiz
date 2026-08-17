<script setup lang="ts">
import { useEventListener, useResizeObserver } from "@vueuse/core"
import { computed, nextTick, onMounted, ref, watch } from "vue"
import { motion, useScroll, useSpring } from "motion-v"
import { useI18n } from "vue-i18n"
import { useRoute, useRouter } from "vue-router"

import MobileNavMenu from "@/components/layout/MobileNavMenu.vue"
import PageShell from "@/components/layout/PageShell.vue"
import LanguageSwitcher from "@/components/ui/LanguageSwitcher.vue"
import { useMotionPreferences } from "@/composables/useMotionPreferences"
import { getPhaseLabel } from "@/lib/uiCopy"
import { cn } from "@/lib/utils"
import { isSupabaseConfigured } from "@/services/supabase"
import { useAuthStore } from "@/stores/auth"
import { useSessionStore } from "@/stores/session"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const sessionStore = useSessionStore()
const shellVariant = computed(
  () =>
    (route.meta.shell as "landing" | "immersive" | "product" | undefined) ??
    "product",
)
const isSessionRoute = computed(() => route.path.startsWith("/session/"))
const showTopChrome = computed(
  () => !isSessionRoute.value && route.meta.hideTopChrome !== true,
)
const isSigningOut = ref(false)
const topChrome = ref<HTMLElement | null>(null)
const topChromeHeight = ref(0)
const motionPreferences = useMotionPreferences()
const { t } = useI18n()
const { scrollYProgress } = useScroll()
const scrollProgress = useSpring(scrollYProgress, {
  stiffness: 160,
  damping: 28,
  mass: 0.2,
})

const routeLabel = computed(() => {
  if (isSessionRoute.value && sessionStore.session?.phase) {
    return getPhaseLabel(sessionStore.session.phase)
  }
  if (isSessionRoute.value) return t("shell.room")
  if (route.meta.titleKey) return t(route.meta.titleKey)
  return t("shell.triviaNight")
})

const isLibraryActive = computed(
  () => route.path === "/library" || /^\/games\/[^/]+$/.test(route.path),
)
const isSessionsActive = computed(() =>
  route.path.startsWith("/sessions/history"),
)
const isCreateGameActive = computed(
  () =>
    route.path === "/games/new" || /^\/games\/[^/]+\/edit$/.test(route.path),
)
const isSignInActive = computed(() => route.path.startsWith("/auth"))

function navLinkClasses(active = false, solid = false) {
  return cn(
    "inline-flex max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold leading-none transition",
    solid
      ? "bg-white/92 text-foreground shadow-[0_8px_18px_rgba(58,38,28,0.06)] hover:-translate-y-0.5 hover:border-primary/28 hover:bg-white"
      : "hover:-translate-y-0.5 hover:border-warm-border-strong hover:bg-white/80 hover:text-foreground",
    active
      ? solid
        ? "border-primary/22 bg-[linear-gradient(180deg,rgba(207,123,82,0.14),rgba(255,255,255,0.98))] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_18px_rgba(58,38,28,0.06)]"
        : "border-primary/18 bg-primary/8 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
      : solid
        ? "border-warm-border-strong"
        : "border-transparent text-[color:var(--text-muted)]",
  )
}

function mobileNavLinkClasses(active = false, solid = false) {
  return cn(navLinkClasses(active, solid), "w-full justify-start py-3")
}

function syncTopChromeHeight() {
  topChromeHeight.value = topChrome.value?.offsetHeight ?? 0
}

onMounted(() => {
  syncTopChromeHeight()
})

useResizeObserver(topChrome, syncTopChromeHeight)
useEventListener("resize", syncTopChromeHeight)

watch(showTopChrome, async () => {
  await nextTick()
  syncTopChromeHeight()
})

async function signOut() {
  isSigningOut.value = true

  try {
    await authStore.signOutToAnonymous()
    await router.push("/")
  } finally {
    isSigningOut.value = false
  }
}

function signOutFromMenu(close: () => void) {
  close()
  signOut()
}
</script>

<template>
  <div class="relative min-h-screen overflow-hidden">
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        class="absolute inset-0"
        :class="
          shellVariant === 'immersive'
            ? 'bg-[radial-gradient(circle_at_18%_18%,rgba(245,214,193,0.1),transparent_22%),radial-gradient(circle_at_82%_14%,rgba(163,176,160,0.08),transparent_18%),linear-gradient(180deg,rgba(54,39,33,0.96),rgba(41,30,25,0.94))]'
            : 'bg-[radial-gradient(circle,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:38px_38px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.4),transparent_88%)] opacity-45'
        "
      />
      <div
        class="absolute inset-0"
        :class="
          shellVariant === 'immersive'
            ? 'bg-[radial-gradient(circle_at_16%_26%,rgba(207,123,82,0.16),transparent_22%),radial-gradient(circle_at_84%_18%,rgba(214,232,227,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]'
            : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.45),rgba(252,248,242,0)),radial-gradient(circle_at_top_left,rgba(232,188,156,0.28),transparent_24%),radial-gradient(circle_at_78%_14%,rgba(207,123,82,0.16),transparent_20%)]'
        "
      />
      <template v-if="motionPreferences.allowAmbientMotion.value">
        <div
          class="absolute left-[-6rem] top-14 h-[16rem] w-[16rem] rounded-full bg-[rgba(255,238,224,0.48)] opacity-[0.72] shadow-[80px_24px_0_10px_rgba(255,240,230,0.42),34px_-22px_0_6px_rgba(255,255,255,0.34)] blur-[10px]"
        />
        <div
          class="absolute bottom-[-5rem] right-[-4rem] h-[14rem] w-[14rem] rounded-full bg-[rgba(255,238,224,0.48)] opacity-[0.72] shadow-[80px_24px_0_10px_rgba(255,240,230,0.42),34px_-22px_0_6px_rgba(255,255,255,0.34)] blur-[10px]"
        />
        <motion.div
          class="absolute -left-12 top-[24rem] h-[18rem] w-[18rem] rounded-full bg-[rgba(232,188,156,0.26)] blur-[90px]"
          :animate="{ x: [0, 28, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }"
          :transition="{ duration: 16, ease: 'easeInOut', repeat: Infinity }"
        />
        <motion.div
          class="absolute right-[-4rem] top-[12rem] h-[16rem] w-[16rem] rounded-full bg-[rgba(207,123,82,0.08)] blur-[90px]"
          :animate="{
            x: [0, -22, 0],
            y: [0, 24, 0],
            scale: [1.02, 0.96, 1.02],
          }"
          :transition="{ duration: 20, ease: 'easeInOut', repeat: Infinity }"
        />
      </template>
    </div>

    <div class="relative z-10">
      <div
        v-show="showTopChrome"
        ref="topChrome"
        class="fixed inset-x-0 top-0 z-50"
      >
        <div
          v-if="!isSupabaseConfigured"
          class="border-b border-[rgba(229,142,38,0.18)] bg-[rgba(255,241,207,0.94)] px-5 py-3 text-center text-sm text-[color:var(--text-muted)] md:backdrop-blur-xl md:bg-[rgba(255,241,207,0.88)]"
        >
          {{ t("shell.previewOnly") }}
        </div>

        <header
          v-if="shellVariant !== 'landing'"
          class="border-b md:backdrop-blur-xl"
          :class="
            shellVariant === 'immersive'
              ? 'border-[rgba(255,255,255,0.08)] bg-[rgba(47,34,29,0.72)] text-white md:bg-[rgba(47,34,29,0.64)]'
              : 'border-[rgba(90,80,56,0.08)] bg-[rgba(255,253,248,0.98)] md:bg-[rgba(255,253,248,0.9)]'
          "
        >
          <motion.div
            v-if="shellVariant === 'product'"
            class="absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-primary via-[rgba(214,167,142,0.82)] to-transparent"
            :style="{ scaleX: scrollProgress }"
          />

          <PageShell
            class="py-4"
            :class="shellVariant === 'immersive' ? 'py-3' : ''"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-3 md:items-start"
            >
              <RouterLink
                to="/"
                class="group flex min-w-0 items-center gap-3 md:gap-4"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-[1.1rem] border text-sm font-black transition md:size-11"
                  :class="
                    shellVariant === 'immersive'
                      ? 'border-white/14 bg-white/10 text-white'
                      : 'border-warm-border-strong bg-white/92 text-primary shadow-[0_8px_18px_rgba(58,38,28,0.06)] group-hover:-translate-y-0.5 group-hover:border-primary/28'
                  "
                >
                  HQ
                </span>
                <div class="min-w-0">
                  <p
                    class="truncate font-display text-[1.05rem] font-semibold tracking-[-0.04em] md:text-[1.3rem]"
                    :class="
                      shellVariant === 'immersive'
                        ? 'text-white'
                        : 'text-foreground'
                    "
                  >
                    Homebase Trivia
                  </p>
                  <p
                    class="hidden text-[0.68rem] font-semibold uppercase tracking-[0.28em] md:block"
                    :class="
                      shellVariant === 'immersive'
                        ? 'text-[color:var(--text-inverse-muted)]'
                        : 'text-[color:var(--text-subtle)]'
                    "
                  >
                    {{ routeLabel }}
                  </p>
                </div>
              </RouterLink>

              <MobileNavMenu
                :open-label="t('nav.openMenu')"
                :close-label="t('nav.closeMenu')"
                :title-label="t('nav.menu')"
                :inverted="shellVariant === 'immersive'"
              >
                <template #default="{ close }">
                  <nav
                    v-if="shellVariant === 'product'"
                    class="flex min-w-0 flex-col items-stretch gap-2 text-sm"
                  >
                    <div
                      class="flex items-center justify-between gap-3 rounded-[1.15rem] border border-warm-border bg-white/76 px-3 py-3"
                    >
                      <span
                        class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-subtle)]"
                      >
                        {{ t("locale.switcher.label") }}
                      </span>
                      <LanguageSwitcher />
                    </div>
                    <RouterLink
                      v-if="!isSessionRoute && authStore.isHostAuthenticated"
                      to="/library"
                      :class="mobileNavLinkClasses(isLibraryActive)"
                    >
                      {{ t("nav.myQuizzes") }}
                    </RouterLink>
                    <RouterLink
                      v-if="!isSessionRoute && authStore.isHostAuthenticated"
                      to="/sessions/history"
                      :class="mobileNavLinkClasses(isSessionsActive)"
                    >
                      {{ t("nav.pastRooms") }}
                    </RouterLink>
                    <RouterLink
                      v-if="!isSessionRoute"
                      :to="
                        authStore.isHostAuthenticated
                          ? '/games/new'
                          : { path: '/auth', query: { next: '/games/new' } }
                      "
                      :class="mobileNavLinkClasses(isCreateGameActive, true)"
                    >
                      {{ t("nav.newQuiz") }}
                    </RouterLink>
                    <RouterLink
                      v-if="!isSessionRoute && !authStore.isHostAuthenticated"
                      :to="{ path: '/auth', query: { next: '/library' } }"
                      :class="mobileNavLinkClasses(isSignInActive)"
                    >
                      {{ t("nav.hostSignIn") }}
                    </RouterLink>
                    <div
                      v-else-if="
                        !isSessionRoute && authStore.isHostAuthenticated
                      "
                      class="rounded-[1.15rem] border border-warm-border-strong bg-white/86 px-4 py-3"
                    >
                      <p
                        class="truncate text-sm font-semibold text-[color:var(--text-muted)]"
                      >
                        {{ authStore.userEmail ?? t("shell.hostAccount") }}
                      </p>
                      <button
                        type="button"
                        class="mt-3 inline-flex w-full items-center justify-center rounded-full border border-primary/18 bg-primary/8 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/12"
                        :disabled="isSigningOut"
                        @click="signOutFromMenu(close)"
                      >
                        {{
                          isSigningOut
                            ? t("shell.signingOut")
                            : t("shell.signOut")
                        }}
                      </button>
                    </div>
                  </nav>

                  <div v-else class="flex flex-col items-stretch gap-2">
                    <div
                      class="rounded-[1.15rem] border border-white/10 bg-white/8 px-4 py-3"
                    >
                      <p class="text-sm font-semibold text-white">
                        {{ routeLabel }}
                      </p>
                    </div>
                    <div
                      class="flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/10 bg-white/8 px-3 py-3"
                    >
                      <span
                        class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-inverse-muted)]"
                      >
                        {{ t("locale.switcher.label") }}
                      </span>
                      <LanguageSwitcher inverted />
                    </div>
                    <RouterLink
                      to="/"
                      class="inline-flex w-full justify-start rounded-full border border-white/12 bg-white/10 px-4 py-3 text-sm font-semibold leading-none text-white transition hover:bg-white/14"
                    >
                      {{ t("shell.home") }}
                    </RouterLink>
                  </div>
                </template>
              </MobileNavMenu>

              <nav
                v-if="shellVariant === 'product'"
                class="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-2 text-sm md:flex"
              >
                <LanguageSwitcher />
                <RouterLink
                  v-if="!isSessionRoute && authStore.isHostAuthenticated"
                  to="/library"
                  :class="navLinkClasses(isLibraryActive)"
                >
                  {{ t("nav.myQuizzes") }}
                </RouterLink>
                <RouterLink
                  v-if="!isSessionRoute && authStore.isHostAuthenticated"
                  to="/sessions/history"
                  :class="navLinkClasses(isSessionsActive)"
                >
                  {{ t("nav.pastRooms") }}
                </RouterLink>
                <RouterLink
                  v-if="!isSessionRoute"
                  :to="
                    authStore.isHostAuthenticated
                      ? '/games/new'
                      : { path: '/auth', query: { next: '/games/new' } }
                  "
                  :class="navLinkClasses(isCreateGameActive, true)"
                >
                  {{ t("nav.newQuiz") }}
                </RouterLink>
                <RouterLink
                  v-if="!isSessionRoute && !authStore.isHostAuthenticated"
                  :to="{ path: '/auth', query: { next: '/library' } }"
                  :class="navLinkClasses(isSignInActive)"
                >
                  {{ t("nav.hostSignIn") }}
                </RouterLink>
                <div
                  v-else-if="!isSessionRoute && authStore.isHostAuthenticated"
                  class="flex min-w-0 items-center gap-2 rounded-full border border-warm-border-strong bg-white/92 px-3 py-2"
                >
                  <span
                    class="max-w-44 truncate text-sm font-semibold text-[color:var(--text-muted)]"
                    >{{ authStore.userEmail ?? t("shell.hostAccount") }}</span
                  >
                  <button
                    type="button"
                    class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary transition hover:bg-primary/8"
                    :disabled="isSigningOut"
                    @click="signOut"
                  >
                    {{
                      isSigningOut ? t("shell.signingOut") : t("shell.signOut")
                    }}
                  </button>
                </div>
              </nav>

              <div
                v-else
                class="hidden flex-wrap items-center justify-end gap-2 md:flex"
              >
                <span
                  class="soft-pill border-white/12 bg-white/12 text-[color:var(--text-inverse-body)]"
                  >{{ routeLabel }}</span
                >
                <LanguageSwitcher inverted />
                <RouterLink
                  to="/"
                  class="inline-flex whitespace-nowrap rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold leading-none text-white transition hover:bg-white/14"
                >
                  {{ t("shell.home") }}
                </RouterLink>
              </div>
            </div>
          </PageShell>
        </header>
      </div>

      <main
        :class="
          route.meta.fullViewport === true
            ? 'relative w-full'
            : isSessionRoute
              ? 'relative w-full'
              : shellVariant === 'landing'
                ? 'relative'
                : shellVariant === 'immersive'
                  ? 'relative w-full py-5 md:py-6'
                  : 'relative w-full py-5 md:py-8'
        "
        :style="{ paddingTop: showTopChrome ? `${topChromeHeight}px` : '0px' }"
      >
        <slot />
      </main>
    </div>
  </div>
</template>
