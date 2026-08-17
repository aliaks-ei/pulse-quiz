<script setup lang="ts">
import { computed } from "vue"

import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    stack?: boolean
    padded?: boolean
  }>(),
  {
    stack: false,
    padded: false,
  },
)

const classes = computed(() =>
  cn(
    "mx-auto w-[min(100%,96rem)] px-[var(--space-page-x-mobile)] md:px-[var(--space-page-x-tablet)] xl:px-[var(--space-page-x-desktop)]",
    props.stack &&
      "flex flex-col gap-[var(--space-section-mobile)] md:gap-[var(--space-section-desktop)]",
    props.padded && "py-8 md:py-10",
  ),
)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
