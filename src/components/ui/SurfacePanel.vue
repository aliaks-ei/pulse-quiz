<script setup lang="ts">
import { computed } from "vue"

import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    strong?: boolean
    padded?: "none" | "sm" | "lg"
  }>(),
  {
    strong: false,
    padded: "sm",
  },
)

const classes = computed(() =>
  cn(
    "border text-card-foreground backdrop-blur-[12px]",
    props.strong
      ? "rounded-[calc(var(--radius)+14px)] border-white/80 bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(252,246,239,0.94))] shadow-[0_24px_60px_rgba(116,72,45,0.14)]"
      : "rounded-[calc(var(--radius)+12px)] border-white/75 bg-[linear-gradient(180deg,rgba(255,253,249,0.97),rgba(253,248,242,0.92))] shadow-[0_18px_44px_rgba(116,72,45,0.11)]",
    props.padded === "sm" &&
      "p-[var(--space-surface-mobile)] md:p-[var(--space-surface-tablet)]",
    props.padded === "lg" &&
      "p-[var(--space-surface-tablet)] md:p-[var(--space-surface-large)]",
  ),
)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
