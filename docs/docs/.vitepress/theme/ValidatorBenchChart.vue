<script setup>
import { computed, ref } from 'vue'

import { engines, environment, generated, modes, results, scenarios } from './validatorBenchData'

const props = defineProps({
  initialMode: { type: String, default: 'passthrough' },
  initialScenario: { type: String, default: 'valid-order' },
})

const scenarioInfo = {
  'valid-order': { label: 'Valid order', desc: 'valid order, card payment (first union branch)' },
  'valid-order-paypal': {
    label: 'Valid order (PayPal)',
    desc: 'valid order, PayPal payment (the card branch is tried and fails first)',
  },
  'large-order-50-items': { label: 'Large order', desc: 'valid order with 50 line items' },
  'unknown-props-order': {
    label: 'Unknown props',
    desc: 'valid order plus one undeclared property on each of 6 objects — invalid in strict mode',
  },
  'invalid-order-all-errors': {
    label: 'Invalid, all errors',
    desc: '14 broken fields plus a failed payment union; full error report',
  },
  'invalid-order-first-error': {
    label: 'Invalid, first error',
    desc: 'same invalid order; stop at the first error',
  },
  'union-card': {
    label: 'Union: 1st branch',
    desc: 'just the payment union; the card branch matches',
  },
  'union-paypal': {
    label: 'Union: 2nd branch',
    desc: 'just the payment union; the PayPal branch matches',
  },
  'union-invalid': { label: 'Union: no match', desc: 'just the payment union; no branch matches' },
}

const modeInfo = {
  strip: 'unknown properties are removed',
  passthrough: 'unknown properties are kept',
  strict: 'unknown properties are an error',
}

const mode = ref(props.initialMode)
const scenario = ref(props.initialScenario)

const ALL_ERRORS = new Set(['invalid-order-all-errors', 'union-invalid'])
const INVALID = new Set(['invalid-order-all-errors', 'invalid-order-first-error', 'union-invalid'])

function notRunReason(key, m, sc) {
  if (key === 'ajv' && m === 'strip') {
    return 'removeAdditional deletes keys while ajv tries the union branches'
  }
  if (key.startsWith('arktype') && m === 'strip') {
    return 'ArkType rejects a union of objects that delete undeclared keys'
  }
  if (
    engines[key].booleanOnly &&
    (ALL_ERRORS.has(sc) || (m === 'strict' && sc === 'unknown-props-order'))
  ) {
    return 'boolean only: no error report to compare'
  }
  if (key.startsWith('typebox') && m === 'strip' && INVALID.has(sc)) {
    return 'same work as passthrough (Clean() runs only on valid input)'
  }
  if (sc === 'invalid-order-first-error') {
    return 'no stop-at-first-error option'
  }
  return 'not run'
}

// Log scale: bars start at 100 ops/s; ticks every decade.
const LOG_MIN = 2
const LOG_MAX = 8.9
const ticks = [
  { v: 1e3, label: '1k' },
  { v: 1e4, label: '10k' },
  { v: 1e5, label: '100k' },
  { v: 1e6, label: '1M' },
  { v: 1e7, label: '10M' },
  { v: 1e8, label: '100M' },
]

function pos(v) {
  const l = Math.log10(Math.max(v, 10 ** LOG_MIN))
  return ((l - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100
}

function fmt(v) {
  if (v >= 1e6) {
    return `${(v / 1e6).toFixed(v >= 1e8 ? 0 : v >= 1e7 ? 1 : 2)}M`
  }
  if (v >= 1e3) {
    return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k`
  }
  return String(Math.round(v))
}

function ratioText(v, atscript) {
  if (!atscript) {
    return ''
  }
  const r = v / atscript
  if (Math.abs(r - 1) < 0.005) {
    return 'same as atscript'
  }
  return r > 1
    ? `${r.toFixed(2)}x faster than atscript`
    : `${(1 / r).toFixed(2)}x slower than atscript`
}

const rows = computed(() => {
  const cell = results[mode.value][scenario.value]
  const atscript = cell.atscript
  const ran = Object.entries(cell)
    .sort((a, b) => b[1] - a[1])
    .map(([key, v]) => ({
      key,
      ...engines[key],
      value: v,
      width: pos(v),
      text: fmt(v),
      ns: Math.round(1e9 / v).toLocaleString('en-US'),
      exact: Math.round(v).toLocaleString('en-US'),
      ratio: key === 'atscript' ? '' : ratioText(v, atscript),
    }))
  const skipped = Object.keys(engines)
    .filter(key => !(key in cell))
    .map(key => ({ key, ...engines[key], reason: notRunReason(key, mode.value, scenario.value) }))
  return { ran, skipped }
})

const validity = computed(() => (scenarios[scenario.value].valid[mode.value] ? 'valid' : 'invalid'))

const hover = ref(null)
function show(row, e) {
  const box = e.currentTarget.closest('.vbc').getBoundingClientRect()
  const r = e.currentTarget.getBoundingClientRect()
  hover.value = { row, x: r.left - box.left + 8, y: r.bottom - box.top + 6 }
}
function hide() {
  hover.value = null
}

const generatedDate = generated.slice(0, 10)
</script>

<template>
  <div class="vbc">
    <div class="vbc-controls">
      <div class="vbc-group" role="group" aria-label="Unknown-property mode">
        <span class="vbc-group-label">Mode</span>
        <button
          v-for="m in modes"
          :key="m"
          type="button"
          :class="['vbc-btn', { active: mode === m }]"
          :aria-pressed="mode === m"
          @click="mode = m"
        >
          {{ m }}
        </button>
      </div>
      <div class="vbc-group" role="group" aria-label="Scenario">
        <span class="vbc-group-label">Scenario</span>
        <button
          v-for="(info, key) in scenarioInfo"
          :key="key"
          type="button"
          :class="['vbc-btn', { active: scenario === key }]"
          :aria-pressed="scenario === key"
          @click="scenario = key"
        >
          {{ info.label }}
        </button>
      </div>
    </div>

    <div class="vbc-title">
      <strong>{{ scenarioInfo[scenario].label }}</strong>
      <span class="vbc-sub">
        {{ scenarioInfo[scenario].desc }} · <code>{{ mode }}</code
        >: {{ modeInfo[mode] }} · input is {{ validity }} in this mode
      </span>
    </div>

    <div class="vbc-legend" aria-hidden="true">
      <span><i class="sw sw-atscript"></i>atscript</span>
      <span><i class="sw sw-compiled"></i>compiled / JIT validator</span>
      <span><i class="sw sw-interpreted"></i>other validators</span>
      <span><i class="sw sw-interpreted sw-bool"></i>boolean only (no error details)</span>
    </div>

    <div class="vbc-chart">
      <div class="vbc-axis" aria-hidden="true">
        <div class="vbc-label-col"></div>
        <div class="vbc-track vbc-ticks">
          <span
            v-for="t in ticks"
            :key="t.label"
            class="vbc-tick"
            :style="{ left: pos(t.v) + '%' }"
          >
            {{ t.label }}
          </span>
        </div>
      </div>

      <ul class="vbc-rows">
        <li
          v-for="row in rows.ran"
          :key="row.key"
          :class="['vbc-row', `k-${row.kind}`, { bool: row.booleanOnly }]"
          tabindex="0"
          :aria-label="`${row.label}: ${row.exact} ops/s${row.ratio ? ', ' + row.ratio : ''}`"
          @mouseenter="show(row, $event)"
          @mouseleave="hide"
          @focus="show(row, $event)"
          @blur="hide"
        >
          <div class="vbc-label-col">
            <span class="vbc-name">{{ row.label }}</span>
            <span v-if="row.booleanOnly" class="vbc-tag">boolean</span>
          </div>
          <div class="vbc-track">
            <span
              v-for="t in ticks"
              :key="t.label"
              class="vbc-grid"
              :style="{ left: pos(t.v) + '%' }"
            ></span>
            <span class="vbc-bar" :style="{ width: row.width + '%' }"></span>
            <span class="vbc-value" :style="{ left: row.width + '%' }">{{ row.text }}</span>
          </div>
        </li>
        <li v-for="row in rows.skipped" :key="row.key" class="vbc-row vbc-skipped">
          <div class="vbc-label-col">
            <span class="vbc-name">{{ row.label }}</span>
          </div>
          <div class="vbc-track vbc-reason">not run — {{ row.reason }}</div>
        </li>
      </ul>

      <div v-if="hover" class="vbc-tip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
        <div class="vbc-tip-title">{{ hover.row.label }}</div>
        <div>{{ hover.row.exact }} ops/s · {{ hover.row.ns }} ns/op</div>
        <div v-if="hover.row.ratio" class="vbc-tip-muted">{{ hover.row.ratio }}</div>
        <div class="vbc-tip-muted">{{ hover.row.library }} {{ hover.row.version }}</div>
      </div>
    </div>

    <p class="vbc-foot">
      Median ops/s, higher is better, <strong>log scale</strong>. Indicative estimate: 1 round × 10
      samples per job, {{ environment.cpu }} laptop, Node.js {{ environment.node }},
      {{ generatedDate }}.
    </p>
  </div>
</template>

<style scoped>
.vbc {
  --vbc-atscript: #471aec;
  --vbc-compiled: #eb6834;
  --vbc-interpreted: #83817b;
  --vbc-surface: var(--vp-c-bg-soft);
  --vbc-grid: rgba(0, 0, 0, 0.07);
  position: relative;
  margin: 16px 0 24px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  font-size: 13px;
  line-height: 1.4;
}

.dark .vbc {
  --vbc-atscript: #9085e9;
  --vbc-compiled: #d95926;
  --vbc-interpreted: #7a7873;
  --vbc-grid: rgba(255, 255, 255, 0.08);
}

.vbc-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.vbc-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.vbc-group-label {
  min-width: 64px;
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.vbc-btn {
  padding: 2px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}

.vbc-btn:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-2);
}

.vbc-btn.active {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  font-weight: 600;
}

.vbc-title {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  color: var(--vp-c-text-1);
}

.vbc-sub {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.vbc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 10px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.vbc-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sw {
  display: inline-block;
  width: 14px;
  height: 10px;
  border-radius: 2px;
}

.sw-atscript {
  background: var(--vbc-atscript);
}

.sw-compiled {
  background: var(--vbc-compiled);
}

.sw-interpreted {
  background: var(--vbc-interpreted);
}

.sw-bool,
.vbc-row.bool .vbc-bar {
  background-image: repeating-linear-gradient(45deg, transparent 0 3px, var(--vp-c-bg) 3px 5px);
}

.vbc-chart {
  position: relative;
}

.vbc-axis,
.vbc-row {
  display: grid;
  grid-template-columns: minmax(120px, 40%) 1fr;
  gap: 8px;
  align-items: center;
}

.vbc-axis {
  height: 18px;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.vbc-track {
  position: relative;
  height: 100%;
  min-height: 18px;
}

.vbc-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
}

.vbc-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.vbc-row {
  margin: 0;
  padding: 2px 0;
  min-height: 24px;
  border-radius: 4px;
  outline: none;
}

.vbc-row:not(.vbc-skipped):hover,
.vbc-row:not(.vbc-skipped):focus-visible {
  background: var(--vp-c-bg-soft);
}

.vbc-label-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  text-align: right;
}

.vbc-name {
  overflow: hidden;
  color: var(--vp-c-text-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vbc-row.k-atscript .vbc-name {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.vbc-tag {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-text-3);
  font-size: 10px;
}

.vbc-grid {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 1px;
  background: var(--vbc-grid);
}

.vbc-bar {
  position: absolute;
  top: 50%;
  left: 0;
  height: 14px;
  transform: translateY(-50%);
  border-radius: 0 4px 4px 0;
  background-color: var(--vbc-interpreted);
}

.k-atscript .vbc-bar {
  background-color: var(--vbc-atscript);
}

.k-compiled .vbc-bar {
  background-color: var(--vbc-compiled);
}

.vbc-value {
  position: absolute;
  top: 50%;
  padding-left: 6px;
  transform: translateY(-50%);
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.vbc-reason {
  display: flex;
  align-items: center;
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-style: italic;
}

.vbc-tip {
  position: absolute;
  z-index: 10;
  padding: 8px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-2);
  color: var(--vp-c-text-1);
  font-size: 12px;
  pointer-events: none;
}

.vbc-tip-title {
  font-weight: 600;
}

.vbc-tip-muted {
  color: var(--vp-c-text-2);
}

.vbc-foot {
  margin: 10px 0 0;
  line-height: 1.5;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

@media (max-width: 640px) {
  .vbc {
    padding: 12px;
  }

  .vbc-axis,
  .vbc-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .vbc-axis .vbc-label-col {
    display: none;
  }

  .vbc-row {
    padding: 3px 0;
  }

  .vbc-label-col {
    justify-content: flex-start;
    text-align: left;
  }

  .vbc-name {
    font-size: 12px;
  }

  .vbc-track {
    margin-right: 40px;
  }
}
</style>
