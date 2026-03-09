<script setup>
import { computed, ref } from 'vue'
import ValidationAnimation from './ValidationAnimation.vue'
import AnnotationScroll from './AnnotationScroll.vue'
import DbRelationsAnimation from './DbRelationsAnimation.vue'
import PlannedUiPreview from './PlannedUiPreview.vue'

const tabs = [
    {
        label: 'Validation',
        status: 'Available today',
        tone: 'today',
        title: 'Validation from the model',
        desc: 'Semantic types and expectations stay on the model, then become runtime checks automatically.',
        points: [
            'Use primitives like string.email and number.int.positive instead of duplicating rules in a second schema.',
            'Keep the source of truth on the model, then validate inputs at runtime from the same definition.',
        ],
    },
    {
        label: 'Metadata',
        status: 'Available today',
        tone: 'today',
        title: 'Metadata for tooling',
        desc: 'App-facing hints stay next to the data model instead of getting buried in UI configuration.',
        points: [
            'Annotations like @meta.* keep labels and related hints attached to the type itself.',
            'That metadata is usable today in runtime tooling and becomes a foundation for future UI automation.',
        ],
    },
    {
        label: 'DB + API',
        status: 'Available today',
        tone: 'today',
        title: 'DB and API integrations',
        desc: 'The same model can feed schema sync, relations, CRUD workflows, and REST integrations.',
        points: [
            'Use @db.* annotations and typed relations to drive your data layer from the same source file.',
            'Keep types, validation, and DB behavior aligned instead of updating them independently.',
        ],
    },
    {
        label: 'Planned UI',
        status: 'Planned',
        tone: 'planned',
        title: 'Future UI automation',
        desc: 'The model is being shaped so UI tools can build forms and tables from the same live metadata later.',
        points: [
            'Labels, field hints, validation rules, and structure already live on the model.',
            'That gives Atscript a clean path toward UI tools that respond directly to the live model.',
        ],
    },
]

const active = ref(0)
const current = computed(() => tabs[active.value])
</script>

<template>
    <div class="signal-tabs">
        <div class="signal-tablist" role="tablist" aria-label="Model outputs">
            <button
                v-for="(tab, index) in tabs"
                :key="tab.label"
                class="signal-tab"
                :class="{ active: index === active }"
                :aria-selected="index === active"
                :tabindex="index === active ? 0 : -1"
                @click="active = index"
            >
                <span class="signal-tab-label">{{ tab.label }}</span>
                <span class="signal-tab-mini" :class="`signal-mini-${tab.tone}`">{{ tab.tone === 'planned' ? 'Planned' : 'Today' }}</span>
            </button>
        </div>

        <div class="signal-panel">
            <div class="signal-copy">
                <div class="signal-status" :class="`signal-status-${current.tone}`">{{ current.status }}</div>
                <h3 class="signal-title">{{ current.title }}</h3>
                <p class="signal-desc">{{ current.desc }}</p>
                <div class="signal-points">
                    <p v-for="point in current.points" :key="point" class="signal-point">{{ point }}</p>
                </div>
            </div>
            <div class="signal-visual">
                <ValidationAnimation v-if="active === 0" />
                <AnnotationScroll v-else-if="active === 1" />
                <DbRelationsAnimation v-else-if="active === 2" />
                <PlannedUiPreview v-else />
            </div>
        </div>
    </div>
</template>

<style scoped>
.signal-tabs {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.signal-tablist {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
}

.signal-tablist::-webkit-scrollbar {
    display: none;
}

.signal-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 999px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-2);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.signal-tab:hover,
.signal-tab.active {
    border-color: var(--vp-c-brand-1);
    color: var(--vp-c-text-1);
    background: rgba(71, 26, 236, 0.06);
}

.signal-tab-label {
    font-size: 14px;
    font-weight: 600;
}

.signal-tab-mini {
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.signal-mini-today {
    background: rgba(43, 170, 196, 0.12);
    color: #127791;
}

.signal-mini-planned {
    background: rgba(217, 119, 6, 0.12);
    color: #9a4b00;
}

:global(.dark) .signal-mini-today {
    background: rgba(43, 170, 196, 0.18);
    color: #7ddff2;
}

:global(.dark) .signal-mini-planned {
    background: rgba(245, 158, 11, 0.18);
    color: #f6c46b;
}

.signal-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 22px;
    border-radius: 18px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg);
}

@media (min-width: 900px) {
    .signal-panel {
        grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        align-items: center;
    }
}

.signal-copy {
    min-width: 0;
}

.signal-status {
    display: inline-flex;
    align-items: center;
    margin-bottom: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.signal-status-today {
    background: rgba(43, 170, 196, 0.12);
    color: #127791;
}

.signal-status-planned {
    background: rgba(217, 119, 6, 0.12);
    color: #9a4b00;
}

:global(.dark) .signal-status-today {
    background: rgba(43, 170, 196, 0.18);
    color: #7ddff2;
}

:global(.dark) .signal-status-planned {
    background: rgba(245, 158, 11, 0.18);
    color: #f6c46b;
}

.signal-title {
    margin: 0 0 8px;
    font-size: 20px;
    color: var(--vp-c-text-1);
}

.signal-desc {
    margin: 0 0 14px;
    font-size: 15px;
    line-height: 1.65;
    color: var(--vp-c-text-2);
}

.signal-points {
    display: grid;
    gap: 10px;
}

.signal-point {
    margin: 0;
    padding-left: 14px;
    position: relative;
    font-size: 14px;
    line-height: 1.6;
    color: var(--vp-c-text-2);
}

.signal-point::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.62em;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--vp-c-brand-1);
}

.signal-visual {
    min-width: 0;
    min-height: 250px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(71, 26, 236, 0.06), rgba(43, 170, 196, 0.06));
}

:global(.dark) .signal-visual {
    background: linear-gradient(135deg, rgba(174, 153, 252, 0.1), rgba(43, 170, 196, 0.1));
}
</style>
