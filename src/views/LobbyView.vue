<script setup lang="ts">
import { toDataURL } from "qrcode"
import { computed, ref, watch } from "vue"
import { useI18n } from "vue-i18n"

import AvatarPortrait from "@/components/avatars/AvatarPortrait.vue"
import PageShell from "@/components/layout/PageShell.vue"
import LobbyPlayersSkeleton from "@/components/lobby/LobbyPlayersSkeleton.vue"
import Button from "@/components/ui/Button.vue"
import Kicker from "@/components/ui/Kicker.vue"
import LanguageSwitcher from "@/components/ui/LanguageSwitcher.vue"
import Skeleton from "@/components/ui/Skeleton.vue"
import SurfacePanel from "@/components/ui/SurfacePanel.vue"
import { useCopyToClipboard } from "@/composables/useCopyToClipboard"
import { useSessionLifecycle } from "@/composables/useSessionLifecycle"
import { localizedText } from "@/i18n"
import { buildInviteUrl } from "@/lib/utils"
import { gameService } from "@/services/gameService"

const { sessionStore } = useSessionLifecycle()
const { copied: inviteCopied, copy: copyToClipboard } = useCopyToClipboard(1800)
const qrCodeDataUrl = ref("")
const { t } = useI18n()

const isHost = computed(() => sessionStore.viewerRole === "host")
const visiblePlayers = computed(() =>
  sessionStore.players.filter((player) => player.role === "player"),
)
const questionCount = computed(() => sessionStore.game?.questionCount ?? 0)
const sectionCount = computed(() => sessionStore.game?.sectionCount ?? 0)
const localizedGameTitle = computed(() => {
  const game = sessionStore.game
  if (!game) return sessionStore.session?.title ?? ""
  return localizedText(game.title, game.titleI18n, game.primaryLocale)
})
const inviteUrl = computed(() => {
  if (!sessionStore.session) return ""
  return buildInviteUrl(sessionStore.session.inviteCode)
})

watch(
  inviteUrl,
  async (nextInviteUrl) => {
    if (!nextInviteUrl) {
      qrCodeDataUrl.value = ""
      return
    }

    try {
      qrCodeDataUrl.value = await toDataURL(nextInviteUrl, {
        margin: 1,
        width: 180,
        color: {
          dark: "#2D3436",
          light: "#FFFDF8",
        },
      })
    } catch {
      qrCodeDataUrl.value = ""
    }
  },
  { immediate: true },
)

async function startGame() {
  if (!sessionStore.session) return
  await gameService.startGameplay(sessionStore.session.id)
}

async function copyInvite() {
  if (!inviteUrl.value) return
  await copyToClipboard(inviteUrl.value)
}
</script>

<template>
  <PageShell
    class="grid gap-[var(--space-section-mobile)] py-4 md:min-h-[calc(100svh-8rem)] md:content-center md:gap-[var(--space-section-desktop)] md:py-0"
  >
    <SurfacePanel
      v-if="sessionStore.error"
      role="alert"
      class="text-sm text-error"
    >
      {{ sessionStore.error }}
    </SurfacePanel>

    <section
      class="family-stage lobby-stage p-0 md:p-[var(--space-surface-large)]"
    >
      <div class="stage-grid absolute inset-0 hidden opacity-45 md:block" />
      <div class="relative grid gap-4 md:gap-6 xl:grid-cols-[1.14fr_0.86fr]">
        <div class="order-2 xl:order-1">
          <div class="text-center md:text-left">
            <h1
              class="font-display text-[2rem] font-semibold leading-[0.96] tracking-[-0.04em] text-white md:text-[clamp(2rem,5vw,3rem)] md:tracking-[-0.055em]"
            >
              {{ t("lobbyView.waitingRoom") }}
            </h1>
          </div>

          <LobbyPlayersSkeleton
            v-if="!sessionStore.session && !sessionStore.error"
          />
          <div
            v-else
            class="mt-4 grid gap-3 sm:grid-cols-2 md:mt-8 xl:grid-cols-3"
          >
            <article
              v-for="player in visiblePlayers"
              :key="player.id"
              class="relative flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/10 p-3 pr-20 backdrop-blur-md md:gap-4 md:rounded-[1.4rem] md:p-4"
            >
              <AvatarPortrait
                :avatar-key="player.avatarKey"
                :avatar-asset-path="player.avatarAssetPath"
                :alt="player.displayName"
                size="lg"
                class="shrink-0"
              />

              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <p
                    class="min-w-0 truncate text-base font-semibold text-white md:text-lg"
                  >
                    {{ player.displayName }}
                  </p>
                  <span
                    v-if="player.role === 'host'"
                    class="inline-flex rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-inverse-muted)]"
                  >
                    {{ t("lobbyView.hostBadge") }}
                  </span>
                </div>
                <span
                  class="absolute right-3 top-3 inline-flex rounded-full border px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.16em] md:static md:mt-2"
                  :class="
                    player.isConnected
                      ? 'border-[rgba(129,148,121,0.28)] bg-[rgba(129,148,121,0.18)] text-[#c7dec1]'
                      : 'border-white/12 bg-white/8 text-[color:var(--text-inverse-muted)]'
                  "
                >
                  {{
                    player.isConnected
                      ? t("lobbyView.here")
                      : t("lobbyView.away")
                  }}
                </span>
              </div>
            </article>
          </div>
        </div>

        <aside
          class="relative order-1 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.08))] p-4 shadow-[0_18px_44px_rgba(35,22,17,0.18)] backdrop-blur-md md:rounded-[1.65rem] md:p-5 xl:order-2"
        >
          <div
            v-if="sessionStore.realtimeStatus !== 'connected'"
            role="status"
            aria-live="polite"
            :aria-label="t('common.reconnecting')"
            class="absolute right-4 top-4 md:right-5 md:top-5"
          >
            <Skeleton
              tone="dark"
              width="8rem"
              height="1.25rem"
              rounded="full"
            />
          </div>

          <div>
            <div>
              <Kicker class="!text-[color:var(--text-inverse-muted)]">
                {{ t("lobbyView.thisRoom") }}
              </Kicker>
              <p
                class="mt-2 text-lg font-semibold leading-snug text-white md:text-xl"
              >
                {{ localizedGameTitle }}
              </p>
            </div>
          </div>

          <div class="mt-4 border-t border-white/10 pt-4 md:mt-6 md:pt-5">
            <div
              class="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border border-white/10 bg-white/8 px-3 py-3"
            >
              <Kicker class="!text-[color:var(--text-inverse-muted)]">
                {{ t("lobbyView.language") }}
              </Kicker>
              <LanguageSwitcher inverted />
            </div>
          </div>

          <dl
            class="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 md:mt-6 md:gap-4 md:pt-5"
          >
            <div>
              <dt>
                <Kicker class="!text-[color:var(--text-inverse-muted)]">
                  {{ t("lobbyView.sectionCount") }}
                </Kicker>
              </dt>
              <dd
                class="mt-2 text-2xl font-semibold text-[#f2a272] md:mt-3 md:text-3xl"
              >
                {{ sectionCount }}
              </dd>
            </div>
            <div>
              <dt>
                <Kicker class="!text-[color:var(--text-inverse-muted)]">
                  {{ t("lobbyView.questions") }}
                </Kicker>
              </dt>
              <dd
                class="mt-2 text-2xl font-semibold text-[#f2a272] md:mt-3 md:text-3xl"
              >
                {{ questionCount }}
              </dd>
            </div>
          </dl>

          <div
            v-if="isHost"
            class="mt-4 border-t border-white/10 pt-4 md:mt-6 md:pt-5"
          >
            <Kicker class="!text-[color:var(--text-inverse-muted)]">
              {{ t("lobbyView.shareRoom") }}
            </Kicker>
            <div
              class="mt-3 grid gap-4 rounded-[1.15rem] border border-white/10 bg-white/8 p-3 md:mt-4 md:grid-cols-[10.5rem_minmax(0,1fr)] md:items-center md:p-4"
            >
              <div class="mx-auto md:mx-0">
                <img
                  v-if="qrCodeDataUrl"
                  :src="qrCodeDataUrl"
                  :alt="t('lobbyView.qrAlt')"
                  class="size-40 rounded-[1rem] bg-[#fffdf8] object-contain p-2 shadow-[0_16px_32px_rgba(35,22,17,0.16)]"
                />
                <div
                  v-else
                  class="grid size-40 place-items-center rounded-[1rem] bg-white/8 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/46"
                >
                  {{ t("lobbyView.join") }}
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <p
                  class="truncate rounded-[1rem] border border-white/12 bg-white/10 px-3 py-2.5 text-sm font-semibold text-[color:var(--text-inverse-body)] md:rounded-[1.2rem] md:px-4 md:py-3"
                >
                  {{ inviteUrl }}
                </p>
                <div class="mt-3 flex">
                  <Button
                    block
                    variant="secondary"
                    class="!border-white/14 !bg-white/10 !text-white !shadow-none hover:!bg-white/14"
                    aria-live="polite"
                    @click="copyInvite"
                  >
                    {{
                      inviteCopied
                        ? t("common.linkCopied")
                        : t("common.copyLink")
                    }}
                  </Button>
                </div>
              </div>
            </div>

            <div class="mt-3 md:mt-4">
              <Button
                block
                size="lg"
                :disabled="sessionStore.isSyncing"
                @click="startGame"
              >
                {{ t("common.startGame") }}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </PageShell>
</template>

<style scoped>
.lobby-stage {
  overflow: visible;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  box-shadow: none;
}

@media (min-width: 768px) {
  .lobby-stage {
    overflow: hidden;
    border-color: rgba(255, 255, 255, 0.1);
    border-radius: 2rem;
    background:
      radial-gradient(
        circle at top left,
        rgba(255, 228, 206, 0.1),
        transparent 28%
      ),
      radial-gradient(
        circle at 85% 18%,
        rgba(180, 191, 178, 0.08),
        transparent 18%
      ),
      linear-gradient(180deg, rgba(70, 50, 42, 0.82), rgba(54, 40, 34, 0.72));
    backdrop-filter: blur(12px);
    box-shadow: var(--paper-shadow);
  }
}
</style>
