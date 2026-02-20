import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { h, nextTick } from 'vue'

import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // Add custom slots if needed
    }),
  enhanceApp({ app }) {
    // Add a global mixin to handle annotation coloring after mount
    app.mixin({
      mounted() {
        this.colorizeAnnotations()
      },
      updated() {
        this.colorizeAnnotations()
      },
      methods: {
        colorizeAnnotations() {
          nextTick(() => {
            // Only run in browser environment
            if (typeof window === 'undefined') {
              return
            }

            // Find all atscript code blocks
            const codeBlocks = window.document.querySelectorAll('.language-atscript code .line')
            codeBlocks.forEach((line: Element) => {
              // Find spans that contain text starting with @
              const spans = line.querySelectorAll('span')
              spans.forEach((span: HTMLElement) => {
                if (span.textContent && span.textContent.trim().startsWith('@')) {
                  // Force blue-ish color for annotations
                  span.style.color = '#2baac4ff'
                  span.style.fontWeight = '600'
                }
              })
            })
          })
        },
      },
    })
  },
} satisfies Theme
