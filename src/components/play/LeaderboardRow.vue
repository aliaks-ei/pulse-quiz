<script setup lang="ts">
import AvatarPortrait from "@/components/avatars/AvatarPortrait.vue"
import type { AvatarKey } from "@/types/domain"

withDefaults(
  defineProps<{
    name: string
    avatarKey?: AvatarKey | null
    avatarAssetPath?: string | null
    primary: number | string
    secondary?: string | null
    fillWidth: string
    accent: string
    primaryClass?: string
    rank?: number | null
    compact?: boolean
    isCurrent?: boolean
    currentLabel?: string
  }>(),
  {
    avatarKey: null,
    avatarAssetPath: null,
    secondary: null,
    primaryClass: "text-3xl font-semibold text-foreground",
    rank: null,
    compact: false,
    isCurrent: false,
    currentLabel: "",
  },
)
</script>

<template>
  <div>
    <div
      class="flex items-center justify-between"
      :class="compact ? 'gap-3' : 'gap-4'"
    >
      <div
        class="flex min-w-0 items-center"
        :class="compact ? 'gap-2.5' : 'gap-3'"
      >
        <span
          v-if="rank != null"
          class="shrink-0 text-xs font-semibold text-[color:var(--text-muted)]"
          :class="compact ? 'w-7 text-center' : 'w-8 text-center'"
        >
          #{{ rank }}
        </span>
        <AvatarPortrait
          v-if="avatarKey"
          :avatar-key="avatarKey"
          :avatar-asset-path="avatarAssetPath"
          :alt="name"
          :size="compact ? 'sm' : 'md'"
        />
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-2">
            <p
              class="truncate font-semibold text-foreground"
              :class="compact ? 'text-base' : 'text-xl'"
            >
              {{ name }}
            </p>
            <span
              v-if="isCurrent && currentLabel"
              class="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-primary"
            >
              {{ currentLabel }}
            </span>
          </div>
          <p
            v-if="secondary"
            class="mt-1 text-xs uppercase tracking-[0.16em] text-foreground/48"
          >
            {{ secondary }}
          </p>
        </div>
      </div>
      <p class="shrink-0" :class="primaryClass">{{ primary }}</p>
    </div>
    <div
      class="rounded-full bg-score-track"
      :class="compact ? 'mt-3 h-1.5' : 'mt-4 h-2.5'"
    >
      <div
        class="h-full rounded-full"
        :style="{ width: fillWidth, backgroundColor: accent }"
      />
    </div>
  </div>
</template>
