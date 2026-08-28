<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { ArrowRight, Clock3, Play, Sparkles, Users } from "lucide-vue-next"
import { useI18n } from "vue-i18n"

import MobileNavMenu from "@/components/layout/MobileNavMenu.vue"
import LanguageSwitcher from "@/components/ui/LanguageSwitcher.vue"
import PageShell from "@/components/layout/PageShell.vue"
import Badge from "@/components/ui/Badge.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import PaperCard from "@/components/ui/PaperCard.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { formatTimestamp } from "@/lib/sessionHelpers"
import { gameService } from "@/services/gameService"
import { useAuthStore } from "@/stores/auth"
import type { PastSessionSummary } from "@/types/domain"

const authStore = useAuthStore()
const recentSessions = ref<PastSessionSummary[]>([])
const { t } = useI18n()

const primaryCta = computed(() =>
  authStore.isHostAuthenticated ? "/library" : "/auth",
)
const secondaryCta = computed(() =>
  authStore.isHostAuthenticated ? "/games/new" : "/join",
)

function mobileNavLinkClasses(solid = false) {
  return [
    "inline-flex w-full justify-start rounded-full border px-4 py-3 text-sm font-semibold leading-none transition",
    solid
      ? "border-[rgba(207,123,82,0.24)] bg-[rgba(207,123,82,0.1)] text-primary hover:bg-[rgba(207,123,82,0.14)]"
      : "border-warm-border bg-white/72 text-foreground/74 hover:-translate-y-0.5 hover:border-primary/25",
  ]
}

onMounted(async () => {
  await authStore.restoreSession()

  if (!authStore.isHostAuthenticated) return

  try {
    recentSessions.value = (
      await gameService.listPastSessions({ limit: 4 })
    ).slice(0, 4)
  } catch {
    recentSessions.value = []
  }
})
</script>

<template>
  <PageShell class="min-h-[100svh] py-3 md:py-4 xl:py-6">
    <section
      class="min-h-[calc(100svh-1.5rem)] overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(180deg,rgba(255,251,246,0.94),rgba(248,240,230,0.9))] shadow-[0_24px_60px_rgba(56,38,28,0.1)] md:min-h-[calc(100svh-2rem)] xl:min-h-[calc(100svh-3rem)]"
    >
      <div
        class="grid min-h-[calc(100svh-1.5rem)] md:min-h-[calc(100svh-2rem)] lg:grid-cols-[0.98fr_1.02fr] xl:min-h-[calc(100svh-3rem)]"
      >
        <div
          class="flex flex-col px-4 py-4 md:px-6 md:py-5 lg:px-7 lg:py-5 xl:px-10 xl:py-8"
        >
          <header class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                class="font-display text-[1.55rem] font-semibold tracking-[-0.05em] text-foreground md:text-[1.9rem]"
              >
                Homebase Trivia
              </p>
              <p
                class="mt-1 hidden text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-foreground/42 md:block"
              >
                {{ t("homeView.subtitle") }}
              </p>
            </div>

            <MobileNavMenu
              :open-label="t('nav.openMenu')"
              :close-label="t('nav.closeMenu')"
              :title-label="t('nav.menu')"
            >
              <template #default>
                <nav class="flex min-w-0 flex-col items-stretch gap-2">
                  <div
                    class="flex items-center justify-between gap-3 rounded-[1.15rem] border border-warm-border bg-white/76 px-3 py-3"
                  >
                    <span
                      class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground/42"
                    >
                      {{ t("locale.switcher.label") }}
                    </span>
                    <LanguageSwitcher />
                  </div>
                  <RouterLink
                    v-if="authStore.isHostAuthenticated"
                    to="/library"
                    :class="mobileNavLinkClasses()"
                  >
                    {{ t("nav.library") }}
                  </RouterLink>
                  <RouterLink
                    v-if="authStore.isHostAuthenticated"
                    to="/sessions/history"
                    :class="mobileNavLinkClasses()"
                  >
                    {{ t("nav.sessions") }}
                  </RouterLink>
                  <RouterLink
                    :to="authStore.isHostAuthenticated ? '/games/new' : '/auth'"
                    :class="mobileNavLinkClasses(true)"
                  >
                    {{
                      authStore.isHostAuthenticated
                        ? t("common.createQuiz")
                        : t("nav.hostSignIn")
                    }}
                  </RouterLink>
                </nav>
              </template>
            </MobileNavMenu>

            <nav
              class="hidden min-w-0 flex-wrap items-center justify-end gap-2 md:flex"
            >
              <LanguageSwitcher />
              <RouterLink
                v-if="authStore.isHostAuthenticated"
                to="/library"
                class="inline-flex whitespace-nowrap rounded-full border border-warm-border bg-white/72 px-4 py-2 text-sm font-semibold leading-none text-foreground/74 transition hover:-translate-y-0.5 hover:border-primary/25"
              >
                {{ t("nav.library") }}
              </RouterLink>
              <RouterLink
                v-if="authStore.isHostAuthenticated"
                to="/sessions/history"
                class="inline-flex whitespace-nowrap rounded-full border border-warm-border bg-white/72 px-4 py-2 text-sm font-semibold leading-none text-foreground/74 transition hover:-translate-y-0.5 hover:border-primary/25"
              >
                {{ t("nav.sessions") }}
              </RouterLink>
              <RouterLink
                :to="authStore.isHostAuthenticated ? '/games/new' : '/auth'"
                class="inline-flex whitespace-nowrap rounded-full border border-[rgba(207,123,82,0.24)] bg-[rgba(207,123,82,0.1)] px-4 py-2 text-sm font-semibold leading-none text-primary transition hover:-translate-y-0.5 hover:bg-[rgba(207,123,82,0.14)]"
              >
                {{
                  authStore.isHostAuthenticated
                    ? t("common.createQuiz")
                    : t("nav.hostSignIn")
                }}
              </RouterLink>
            </nav>
          </header>

          <div
            class="flex flex-1 flex-col justify-center py-6 md:py-7 lg:py-5 xl:py-10 2xl:py-14"
          >
            <div>
              <Badge tone="accent">{{ t("homeView.heroBadge") }}</Badge>
            </div>

            <h1
              class="mt-5 max-w-[34rem] text-balance font-display text-[clamp(2.5rem,min(6.2vw,7.4svh),4.5rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-foreground md:mt-6 xl:mt-8"
            >
              {{ t("homeView.heroTitle") }}
            </h1>

            <p
              class="mt-3 max-w-[31rem] text-[0.95rem] leading-6 text-body-strong md:text-base xl:mt-5 xl:text-lg xl:leading-7"
            >
              {{ t("homeView.heroBody") }}
            </p>

            <div class="mt-5 flex flex-col gap-3 sm:flex-row xl:mt-8">
              <Button :to="primaryCta" size="lg">
                {{
                  authStore.isHostAuthenticated
                    ? t("homeView.primaryCtaHost")
                    : t("homeView.primaryCtaGuest")
                }}
                <ArrowRight class="size-4" />
              </Button>
              <Button :to="secondaryCta" size="lg" variant="secondary">
                {{
                  authStore.isHostAuthenticated
                    ? t("homeView.secondaryCtaHost")
                    : t("homeView.secondaryCtaGuest")
                }}
              </Button>
            </div>

            <div class="mt-6 grid gap-2 sm:grid-cols-3 xl:mt-10 xl:gap-3">
              <PaperCard class="p-3 xl:p-4">
                <Play class="size-4 text-primary" />
                <p class="mt-3 text-sm font-semibold text-foreground xl:mt-4">
                  {{ t("homeView.easyJoinTitle") }}
                </p>
                <p
                  class="mt-1 text-[0.82rem] leading-5 text-[color:var(--text-muted)] xl:mt-2 xl:text-sm xl:leading-6"
                >
                  {{ t("homeView.easyJoinBody") }}
                </p>
              </PaperCard>
              <PaperCard class="p-3 xl:p-4">
                <Users class="size-4 text-primary" />
                <p class="mt-3 text-sm font-semibold text-foreground xl:mt-4">
                  {{ t("homeView.clearScreenTitle") }}
                </p>
                <p
                  class="mt-1 text-[0.82rem] leading-5 text-[color:var(--text-muted)] xl:mt-2 xl:text-sm xl:leading-6"
                >
                  {{ t("homeView.clearScreenBody") }}
                </p>
              </PaperCard>
              <PaperCard class="p-3 xl:p-4">
                <Clock3 class="size-4 text-primary" />
                <p class="mt-3 text-sm font-semibold text-foreground xl:mt-4">
                  {{ t("homeView.playAgainTitle") }}
                </p>
                <p
                  class="mt-1 text-[0.82rem] leading-5 text-[color:var(--text-muted)] xl:mt-2 xl:text-sm xl:leading-6"
                >
                  {{ t("homeView.playAgainBody") }}
                </p>
              </PaperCard>
            </div>
          </div>

          <SurfacePanel v-if="recentSessions.length">
            <div class="flex items-center justify-between gap-4">
              <div>
                <Kicker>
                  {{ t("homeView.recentRoomsKicker") }}
                </Kicker>
                <p class="mt-2 text-sm text-[color:var(--text-muted)]">
                  {{ t("homeView.recentRoomsBody") }}
                </p>
              </div>
              <RouterLink
                to="/sessions/history"
                class="text-sm font-semibold text-primary"
              >
                {{ t("common.seeAll") }}
              </RouterLink>
            </div>

            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <article
                v-for="session in recentSessions"
                :key="session.sessionId"
                class="rounded-[1.25rem] border border-warm-border-soft bg-[rgba(255,251,247,0.94)] p-4 shadow-[0_8px_20px_rgba(55,37,26,0.06)] backdrop-blur-[8px]"
              >
                <div class="flex items-center justify-between gap-4">
                  <p class="font-semibold text-foreground">
                    {{ session.title }}
                  </p>
                  <span
                    class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground/42"
                    >{{ session.inviteCode }}</span
                  >
                </div>
                <p class="mt-2 text-sm text-[color:var(--text-muted)]">
                  {{ formatTimestamp(session.finishedAt) }}
                </p>
              </article>
            </div>
          </SurfacePanel>
        </div>

        <div
          class="relative min-h-[34rem] overflow-hidden bg-[linear-gradient(180deg,#352821,#241a16)] px-5 py-5 md:min-h-[38rem] md:px-6 md:py-6 lg:min-h-0"
        >
          <div
            class="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(242,196,168,0.24),transparent_22%),radial-gradient(circle_at_82%_16%,rgba(178,194,188,0.16),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]"
          />
          <div
            class="absolute left-[10%] top-[10%] size-20 rounded-full border border-[#e6c4ad]/40 bg-[#f7e7d9]/70 blur-[1px] md:size-28"
          />
          <div
            class="absolute right-[12%] top-[7%] size-26 rounded-full border border-[#c88f72]/35 bg-[#cc7f5d]/82 shadow-[0_24px_40px_rgba(94,51,29,0.24)] md:size-36"
          />
          <div
            class="absolute left-[14%] top-[28%] size-16 rounded-full bg-[#9c9188]/28 blur-[8px] md:size-24"
          />
          <div
            class="absolute inset-x-[18%] bottom-[16%] h-20 rounded-full bg-[linear-gradient(180deg,#bf7652,#90573d)] shadow-[0_24px_50px_rgba(21,13,10,0.44)] md:h-26"
          />
          <div
            class="absolute inset-x-[12%] bottom-[11%] h-8 rounded-full bg-[#16110f] blur-[2px] md:h-10"
          />
          <div
            class="absolute right-[14%] bottom-[24%] rounded-[1.8rem] border border-white/10 bg-white/8 px-5 py-4 backdrop-blur-md"
          >
            <p class="text-sm font-semibold text-white">
              {{ t("homeView.hostScreenTitle") }}
            </p>
            <p class="mt-2 max-w-[16rem] text-sm leading-6 text-white/62">
              {{ t("homeView.hostScreenBody") }}
            </p>
          </div>

          <div
            class="relative flex h-full min-h-0 flex-col justify-between rounded-[2rem] border border-white/10 bg-white/8 p-5 backdrop-blur-md md:p-6"
          >
            <div class="flex items-center justify-between gap-4">
              <span
                class="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/64"
              >
                {{ t("homeView.bigScreenView") }}
              </span>
              <Sparkles class="size-5 text-[#efc6af]" />
            </div>

            <div class="space-y-4">
              <p
                class="max-w-[20rem] font-display text-[2.3rem] font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-[2.8rem]"
              >
                {{ t("homeView.sideTitle") }}
              </p>
              <p
                class="max-w-[20rem] text-sm leading-6 text-[color:var(--text-inverse-body)] md:text-base"
              >
                {{ t("homeView.sideBody") }}
              </p>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <div
                class="rounded-[1.6rem] border border-white/10 bg-white/10 p-4"
              >
                <p
                  class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/54"
                >
                  {{ t("homeView.joinFastKicker") }}
                </p>
                <p class="mt-3 text-lg font-semibold text-white">
                  {{ t("homeView.joinFastTitle") }}
                </p>
                <p class="mt-2 text-sm leading-6 text-white/62">
                  {{ t("homeView.joinFastBody") }}
                </p>
              </div>
              <div
                class="rounded-[1.6rem] border border-white/10 bg-white/10 p-4"
              >
                <p
                  class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/54"
                >
                  {{ t("homeView.hostEaseKicker") }}
                </p>
                <p class="mt-3 text-lg font-semibold text-white">
                  {{ t("homeView.hostEaseTitle") }}
                </p>
                <p class="mt-2 text-sm leading-6 text-white/62">
                  {{ t("homeView.hostEaseBody") }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </PageShell>
</template>
