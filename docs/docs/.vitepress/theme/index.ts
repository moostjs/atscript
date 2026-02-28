import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { nextTick } from 'vue'
import HomeLayout from './HomeLayout.vue'

import './style.css'

function colorizeAtscriptAnnotations() {
  if (typeof window === 'undefined') { return }
  const lines = window.document.querySelectorAll('.language-atscript code .line')
  lines.forEach((line: Element) => {
    const spans = line.querySelectorAll('span')
    spans.forEach((span: HTMLElement) => {
      if (span.textContent && span.textContent.trim().startsWith('@')) {
        span.style.color = '#2baac4ff'
        span.style.fontWeight = '600'
      }
    })
  })
}

export default {
  extends: DefaultTheme,
  Layout: HomeLayout,
  enhanceApp({ app }) {
    app.mixin({
      mounted() {
        nextTick(colorizeAtscriptAnnotations)
      },
      updated() {
        nextTick(colorizeAtscriptAnnotations)
      },
    })
  },
} satisfies Theme
