<script setup lang="ts">
import { computed } from "vue"
import { RouterLink } from "vue-router"
import type { RouteLocationRaw } from "vue-router"

import { cn } from "@/lib/utils"

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger"
    size?: "sm" | "md" | "lg"
    type?: "button" | "submit" | "reset"
    disabled?: boolean
    block?: boolean
    tone?: "default" | "warm"
    to?: RouteLocationRaw
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    disabled: false,
    block: false,
    tone: "default",
    to: undefined,
  },
)

const classes = computed(() => {
  const isWarm = props.tone === "warm"
  return cn(
    "inline-flex max-w-full shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border font-semibold leading-none transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55",
    props.block && "w-full",
    props.size === "sm" && "h-10 px-4 text-sm",
    props.size === "md" && "h-11 px-5 text-sm",
    props.size === "lg" && "h-12.5 px-6 text-[0.96rem]",
    props.variant === "primary" &&
      "border-[rgba(207,123,82,0.42)] bg-[linear-gradient(180deg,#d78a62,#bf6f47)] text-white shadow-[0_14px_28px_rgba(142,82,49,0.2)] hover:-translate-y-0.5 hover:brightness-105",
    props.variant === "secondary" &&
      (isWarm
        ? "border-warm-border-strong bg-white/94 text-foreground shadow-[0_8px_18px_rgba(73,48,31,0.06)] hover:-translate-y-0.5 hover:border-[rgba(207,123,82,0.28)] hover:bg-white"
        : "border-warm-border-strong bg-white/92 text-foreground shadow-[0_8px_18px_rgba(73,48,31,0.06)] hover:-translate-y-0.5 hover:border-[rgba(207,123,82,0.28)] hover:bg-white"),
    props.variant === "ghost" &&
      (isWarm
        ? "border-transparent bg-transparent text-[var(--color-warm-ink)] hover:border-warm-border hover:bg-white/72 hover:text-foreground"
        : "border-transparent bg-transparent text-[color:var(--text-muted)] hover:border-warm-border hover:bg-white/72 hover:text-foreground"),
    props.variant === "danger" &&
      "border-destructive/25 bg-destructive text-white shadow-[0_10px_22px_rgba(163,78,78,0.18)] hover:-translate-y-0.5 hover:brightness-105",
  )
})
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes" v-bind="$attrs">
    <slot />
  </RouterLink>
  <button
    v-else
    :type="type"
    :disabled="disabled"
    :class="classes"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>
