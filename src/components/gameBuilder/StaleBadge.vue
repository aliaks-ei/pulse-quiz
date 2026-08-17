<script setup lang="ts">
import { translate } from "@/i18n"

defineProps<{ size?: "sm" | "md" }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full bg-amber-200/85 px-2 py-0.5 text-xs font-semibold text-amber-950"
    :title="translate('builder.translations.staleBadge')"
    role="status"
  >
    <span aria-hidden="true">!</span>
    {{ translate("builder.translations.staleBadge") }}
  </span>
</template>
