<script setup lang="ts">
import { computed } from "vue"

import { translate } from "@/i18n"
import { appLocaleOptions, type AppLocale } from "@/i18n/locale"
import StaleBadge from "@/components/gameBuilder/StaleBadge.vue"

const props = defineProps<{
  activeLocale: AppLocale
  primaryLocale: AppLocale
  staleByLocale: Record<AppLocale, boolean>
  emptyByLocale: Record<AppLocale, number>
  pendingItemByLocale: Record<AppLocale, number>
  staleCountByLocale: Record<AppLocale, number>
}>()

const emit = defineEmits<{
  select: [locale: AppLocale]
  translate: []
  clear: []
}>()

const isPrimary = computed(() => props.activeLocale === props.primaryLocale)
const bulkLabel = computed(() => {
  const stale = props.staleCountByLocale[props.activeLocale] ?? 0
  const empty = props.emptyByLocale[props.activeLocale] ?? 0

  if (stale > 0) {
    return translate("builder.translations.bulkRetranslate", { count: stale })
  }
  if (empty > 0) {
    return translate("builder.translations.bulkEmpty", { count: empty })
  }
  return translate("builder.translations.bulkAllDone")
})
const bulkDisabled = computed(() => {
  if (isPrimary.value) return true

  return (props.pendingItemByLocale[props.activeLocale] ?? 0) === 0
})
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 rounded-[1.6rem] border border-warm-border-soft bg-white/74 p-3"
  >
    <div role="tablist" class="flex flex-wrap gap-2">
      <button
        v-for="option in appLocaleOptions"
        :key="option.code"
        type="button"
        role="tab"
        :aria-selected="option.code === activeLocale"
        class="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition"
        :class="
          option.code === activeLocale
            ? 'border-[rgba(207,123,82,0.38)] bg-primary text-white shadow-[0_12px_24px_rgba(158,83,48,0.18)]'
            : 'border-warm-border bg-white/86 text-foreground hover:-translate-y-0.5 hover:bg-white'
        "
        @click="emit('select', option.code)"
      >
        <span>{{ option.shortLabel }}</span>
        <span
          v-if="option.code === primaryLocale"
          class="rounded-full bg-white/20 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.14em]"
        >
          {{ translate("builder.translations.primaryShort") }}
        </span>
        <StaleBadge v-if="staleByLocale[option.code]" />
      </button>
    </div>

    <div v-if="!isPrimary" class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-10 items-center rounded-full border border-warm-border bg-white/90 px-4 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:bg-white disabled:pointer-events-none disabled:opacity-50"
        :disabled="bulkDisabled"
        @click="emit('translate')"
      >
        {{ bulkLabel }}
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 items-center rounded-full border border-warm-border bg-white/66 px-4 py-2 text-sm font-semibold text-[color:var(--warm-ink-soft)] transition hover:bg-white"
        @click="emit('clear')"
      >
        {{ translate("builder.translations.clearLocale") }}
      </button>
    </div>
  </div>
</template>
