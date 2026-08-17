<script setup lang="ts">
import { computed } from "vue"

import { translate } from "@/i18n"
import { appLocaleOptions, type AppLocale } from "@/i18n/locale"

const props = defineProps<{
  primaryLocale: AppLocale
  locked: boolean
}>()

const emit = defineEmits<{ change: [locale: AppLocale] }>()

const tooltip = computed(() =>
  props.locked
    ? translate("builder.translations.primaryPickerLockedTooltip")
    : "",
)
</script>

<template>
  <label
    class="flex flex-col gap-2 text-sm font-semibold text-inverse-body"
    :title="tooltip"
  >
    <span
      class="text-chip font-semibold uppercase tracking-[0.28em] text-inverse-muted"
    >
      {{ translate("builder.translations.primaryPicker") }}
    </span>
    <select
      class="h-12 rounded-[1.35rem] border border-white/14 bg-white/94 px-4 text-sm text-foreground outline-none transition focus:border-primary focus:bg-white disabled:opacity-60"
      :disabled="locked"
      :value="primaryLocale"
      @change="
        emit('change', ($event.target as HTMLSelectElement).value as AppLocale)
      "
    >
      <option
        v-for="option in appLocaleOptions"
        :key="option.code"
        :value="option.code"
      >
        {{ option.nativeLabel }}
      </option>
    </select>
  </label>
</template>
