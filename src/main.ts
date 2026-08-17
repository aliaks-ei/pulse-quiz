import "./assets/main.css"

import { createPinia } from "pinia"
import { createApp, watch } from "vue"

import App from "./App.vue"
import { currentAppLocale, i18n, translate } from "./i18n"
import { router } from "./router"
import { type PageTitleKey } from "./lib/uiCopy"

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)

function syncDocumentTitle() {
  const titleKey = router.currentRoute.value.meta.titleKey as
    | PageTitleKey
    | undefined
  const title = titleKey ? translate(titleKey) : translate("app.name")
  document.title =
    title === translate("app.name")
      ? translate("app.name")
      : `${title} ${translate("app.titleSeparator")} ${translate("app.name")}`
}

async function mountApp() {
  await router.isReady()
  watch(
    () => [router.currentRoute.value.fullPath, currentAppLocale.value],
    syncDocumentTitle,
    { immediate: true },
  )
  app.mount("#app")
}

void mountApp()
