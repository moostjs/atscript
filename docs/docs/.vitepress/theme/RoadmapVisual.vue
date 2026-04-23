<script setup>
import { asLogoSvg, roadmapIcons } from './roadmapIcons'

const todayItems = [
  {
    icon: 'typescript',
    title: 'TypeScript plugin',
    desc: 'Full code generation, runtime validation, metadata export, and JSON Schema.',
  },
  {
    icon: 'visualstudiocode',
    title: 'VSCode tooling',
    desc: 'Syntax highlighting, diagnostics, and go-to-definition for .as files.',
  },
  {
    icon: 'postgresql',
    title: 'PostgreSQL adapter',
    desc: 'Production relational workflows with schema sync, fulltext, and vector search.',
    badge: 'Experimental',
  },
  {
    icon: 'mysql',
    title: 'MySQL adapter',
    desc: 'Relational workflows with broad hosting support, FULLTEXT search, and schema sync.',
    badge: 'Experimental',
  },
  {
    icon: 'sqlite',
    title: 'SQLite adapter',
    desc: 'Embedded relational workflows with schema sync and migration.',
    badge: 'Experimental',
  },
  {
    icon: 'mongodb',
    title: 'MongoDB adapter',
    desc: 'Document workflows, nested objects, Atlas Search, and vector search.',
    badge: 'Experimental',
  },
  {
    icon: 'api',
    title: 'REST / CRUD layer',
    desc: 'Typed HTTP controllers generated from the same .as model.',
  },
]

const plannedItems = [
  {
    icon: 'uiForm',
    title: 'Form tools',
    desc: 'Auto-generate forms from labels, structure, and validation metadata on the model.',
  },
  {
    icon: 'tableView',
    title: 'Table and list tools',
    desc: 'Drive table and list UIs from live schema instead of separate config.',
  },
  {
    icon: 'language',
    title: 'More language targets',
    desc: 'Python, Java, and others — the plugin architecture is designed to support them.',
  },
]

const hubSpokes = [
  { label: 'Types & validation', icon: 'validation', tone: 'today' },
  { label: 'DB adapters', icon: 'database', tone: 'today' },
  { label: 'REST / CRUD', icon: 'api', tone: 'today' },
  { label: 'IDE tooling', icon: 'ideTooling', tone: 'today' },
  { label: 'UI generation', icon: 'uiForm', tone: 'planned' },
  { label: 'More languages', icon: 'language', tone: 'planned' },
]

const getIcon = name => roadmapIcons[name]
const getIconStyle = name => {
  const icon = roadmapIcons[name]
  return {
    '--rv-icon-color': icon.color,
    '--rv-icon-bg': icon.background,
  }
}
</script>

<template>
  <div class="roadmap-visual">
    <div class="legend">
      <span class="legend-chip legend-chip-now">Available today</span>
      <span class="legend-chip legend-chip-next">Planned next</span>
    </div>

    <section class="rv-section">
      <div class="rv-heading">
        <h2 class="rv-title">How it connects</h2>
        <p class="rv-copy">
          One <code>.as</code> model feeds every output — types, validation, database adapters, HTTP
          layer, and IDE tooling today, with UI generation and more languages planned.
        </p>
      </div>

      <div class="rv-hub">
        <div class="rv-hub-center">
          <div class="rv-hub-badge">
            <span class="rv-hub-logo" v-html="asLogoSvg" />
          </div>
          <div class="rv-hub-label">.as model</div>
        </div>
        <div class="rv-hub-arrow">
          <svg width="2" height="24" viewBox="0 0 2 24">
            <line
              x1="1"
              y1="0"
              x2="1"
              y2="24"
              stroke="currentColor"
              stroke-width="2"
              stroke-dasharray="4 3"
            />
          </svg>
          <svg width="14" height="10" viewBox="0 0 14 10">
            <path
              d="M1 1l6 8 6-8"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="rv-hub-spokes">
          <div
            v-for="spoke in hubSpokes"
            :key="spoke.label"
            class="rv-spoke"
            :class="`rv-spoke-${spoke.tone}`"
          >
            <span
              class="rv-spoke-icon"
              :style="getIconStyle(spoke.icon)"
              v-html="getIcon(spoke.icon).svg"
            />
            <span class="rv-spoke-label">{{ spoke.label }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="rv-section">
      <div class="rv-heading">
        <h2 class="rv-title">Available today</h2>
      </div>
      <div class="rv-grid">
        <article v-for="item in todayItems" :key="item.title" class="rv-card">
          <div class="rv-icon" :style="getIconStyle(item.icon)">
            <span class="rv-icon-markup" v-html="getIcon(item.icon).svg" />
          </div>
          <span v-if="item.badge" class="rv-badge">{{ item.badge }}</span>
          <div class="rv-card-title">{{ item.title }}</div>
          <p class="rv-card-desc">{{ item.desc }}</p>
        </article>
      </div>
    </section>

    <section class="rv-section">
      <div class="rv-heading">
        <h2 class="rv-title">Planned next</h2>
      </div>
      <div class="rv-grid">
        <article v-for="item in plannedItems" :key="item.title" class="rv-card rv-card-next">
          <div class="rv-icon" :style="getIconStyle(item.icon)">
            <span class="rv-icon-markup" v-html="getIcon(item.icon).svg" />
          </div>
          <div class="rv-card-title">{{ item.title }}</div>
          <p class="rv-card-desc">{{ item.desc }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.roadmap-visual {
  display: grid;
  gap: 28px;
  margin: 20px 0 8px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.legend-chip-now {
  background: rgba(43, 170, 196, 0.12);
  color: #127791;
}

.legend-chip-next {
  background: rgba(217, 119, 6, 0.12);
  color: #9a4b00;
}

:global(.dark) .legend-chip-now {
  background: rgba(43, 170, 196, 0.18);
  color: #7ddff2;
}

:global(.dark) .legend-chip-next {
  background: rgba(245, 158, 11, 0.18);
  color: #f6c46b;
}

.rv-section {
  display: grid;
  gap: 18px;
}

.rv-heading {
  display: grid;
  gap: 6px;
}

.rv-title {
  margin: 0;
  font-size: 26px;
  color: var(--vp-c-text-1);
}

.rv-copy {
  margin: 0;
  max-width: 760px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.rv-copy code {
  font-size: 14px;
  color: var(--vp-c-brand-1);
  background: rgba(71, 26, 236, 0.08);
  padding: 1px 5px;
  border-radius: 4px;
}

/* Hub-and-spoke diagram */

.rv-hub {
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: 22px;
  border: 1px solid rgba(71, 26, 236, 0.18);
  background: linear-gradient(135deg, rgba(71, 26, 236, 0.06), rgba(43, 170, 196, 0.05));
}

:global(.dark) .rv-hub {
  border-color: rgba(174, 153, 252, 0.24);
  background: linear-gradient(135deg, rgba(174, 153, 252, 0.12), rgba(43, 170, 196, 0.08));
}

.rv-hub-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rv-hub-badge {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: block;
}

.rv-hub-logo {
  width: 100%;
  height: 100%;
  display: block;
}

.rv-hub-logo :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.rv-hub-label {
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.rv-hub-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--vp-c-brand-1);
  opacity: 0.45;
}

.rv-hub-spokes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (min-width: 640px) {
  .rv-hub-spokes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .rv-hub-spokes {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.rv-spoke {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 10px;
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  text-align: center;
}

.rv-spoke-icon {
  width: 28px;
  height: 28px;
  display: block;
  color: var(--rv-icon-color);
}

.rv-spoke-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.rv-spoke-label {
  flex: 1;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.rv-spoke-today {
  border-color: rgba(71, 26, 236, 0.18);
}

.rv-spoke-planned {
  border-style: dashed;
  border-color: rgba(217, 119, 6, 0.22);
}

.rv-spoke-planned .rv-spoke-label {
  color: var(--vp-c-text-2);
}

/* Card grid */

.rv-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

@media (min-width: 640px) {
  .rv-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .rv-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.rv-card {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.rv-card-next {
  border-color: rgba(217, 119, 6, 0.18);
  background: linear-gradient(135deg, rgba(217, 119, 6, 0.05), rgba(71, 26, 236, 0.04));
}

:global(.dark) .rv-card-next {
  border-color: rgba(245, 158, 11, 0.2);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(174, 153, 252, 0.05));
}

.rv-icon {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--rv-icon-color);
}

.rv-icon-markup {
  width: 42px;
  height: 42px;
  display: block;
}

.rv-icon-markup :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.rv-card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.rv-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: rgba(217, 119, 6, 0.1);
  color: rgba(154, 75, 0, 0.5);
}

:global(.dark) .rv-badge {
  background: rgba(245, 158, 11, 0.1);
  color: rgba(246, 196, 107, 0.45);
}

.rv-card-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}
</style>
