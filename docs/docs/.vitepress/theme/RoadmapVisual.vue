<script setup>
import { asLogoSvg, roadmapIcons } from './roadmapIcons'

const todayGroups = [
    {
        title: 'Current platform',
        desc: 'The current Atscript workflow is centered on the TypeScript implementation and its authoring tools.',
        items: [
            {
                icon: 'typescript',
                title: 'TypeScript plugin',
                desc: 'The first and most complete Atscript implementation today.',
            },
            {
                icon: 'validation',
                title: 'Validation + JSON Schema',
                desc: 'Runtime validation, metadata export, and JSON Schema from the same model.',
            },
            {
                icon: 'visualstudiocode',
                title: 'VSCode tooling',
                desc: 'Syntax highlighting, diagnostics, and generated type support are already available.',
            },
        ],
    },
    {
        title: 'Data layer',
        desc: 'Current data-layer adapters and integrations are available through the TypeScript implementation.',
        items: [
            {
                icon: 'sqlite',
                title: 'SQLite adapter',
                desc: 'Available today for embedded relational workflows and schema sync.',
            },
            {
                icon: 'mongodb',
                title: 'MongoDB adapter',
                desc: 'Available today for document workflows, nested objects, and search features.',
            },
            {
                icon: 'api',
                title: 'REST / CRUD integrations',
                desc: 'Use the same model with typed CRUD and HTTP integrations in the TypeScript ecosystem.',
            },
        ],
    },
]

const nextGroups = [
    {
        title: 'UI tools',
        desc: 'Planned UI tools will build forms and tables from live metadata and schema exposed by the same source model.',
        items: [
            {
                icon: 'uiForm',
                title: 'Form tools',
                desc: 'Build forms from live labels, structure, and validation metadata already present on the model.',
            },
            {
                icon: 'tableView',
                title: 'Table and list tools',
                desc: 'Build table and list experiences from live schema and metadata instead of separate UI config.',
            },
        ],
    },
    {
        title: 'More DB adapters',
        desc: 'The next database targets extend the existing data-layer model to broader production deployments.',
        items: [
            {
                icon: 'postgresql',
                title: 'PostgreSQL adapter',
                desc: 'A natural next relational target for networked production applications.',
            },
            {
                icon: 'mysql',
                title: 'MySQL adapter',
                desc: 'A practical relational companion target with broad hosting and deployment support.',
            },
        ],
    },
    {
        title: 'Additional language targets',
        desc: 'The core model and plugin architecture are designed so Atscript can expand beyond TypeScript over time.',
        items: [
            {
                icon: 'language',
                title: 'More language targets',
                desc: 'The plugin architecture is built so Atscript can expand beyond TypeScript over time.',
            },
        ],
    },
]

const architectureGroups = [
    {
        title: 'Current targets',
        tone: 'today',
        items: [
            'TypeScript types and runtime validation',
            'SQLite and MongoDB adapters',
            'REST / CRUD integrations and VSCode tooling',
        ],
    },
    {
        title: 'Planned expansion',
        tone: 'future',
        items: [
            'UI form and table tools from live model metadata',
            'PostgreSQL and MySQL adapters',
            'More language plugins over time',
        ],
    },
]

const getIcon = (name) => roadmapIcons[name]
const getIconStyle = (name) => {
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
            <span class="legend-chip legend-chip-arch">Architecture</span>
        </div>

        <section class="rv-section">
            <div class="rv-heading">
                <h2 class="rv-title">Available today</h2>
                <p class="rv-copy">These workflows are already part of the current docs and product surface.</p>
            </div>
            <div class="rv-groups">
                <section
                    v-for="group in todayGroups"
                    :key="group.title"
                    class="rv-group"
                >
                    <div class="rv-group-head">
                        <h3 class="rv-group-title">{{ group.title }}</h3>
                        <p class="rv-group-copy">{{ group.desc }}</p>
                    </div>
                    <div class="rv-grid">
                        <article
                            v-for="item in group.items"
                            :key="item.title"
                            class="rv-card"
                        >
                            <div class="rv-icon" :style="getIconStyle(item.icon)">
                                <span class="rv-icon-markup" v-html="getIcon(item.icon).svg" />
                            </div>
                            <div class="rv-card-title">{{ item.title }}</div>
                            <p class="rv-card-desc">{{ item.desc }}</p>
                        </article>
                    </div>
                </section>
            </div>
        </section>

        <section class="rv-section">
            <div class="rv-heading">
                <h2 class="rv-title">Planned next</h2>
                <p class="rv-copy">These are the main directions currently reflected as planned work in the docs.</p>
            </div>
            <div class="rv-groups">
                <section
                    v-for="group in nextGroups"
                    :key="group.title"
                    class="rv-group rv-group-next"
                >
                    <div class="rv-group-head">
                        <h3 class="rv-group-title">{{ group.title }}</h3>
                        <p class="rv-group-copy">{{ group.desc }}</p>
                    </div>
                    <div class="rv-grid" :class="{ 'rv-grid-compact': group.items.length < 3 }">
                        <article
                            v-for="item in group.items"
                            :key="item.title"
                            class="rv-card rv-card-next"
                        >
                            <div class="rv-icon" :style="getIconStyle(item.icon)">
                                <span class="rv-icon-markup" v-html="getIcon(item.icon).svg" />
                            </div>
                            <div class="rv-card-title">{{ item.title }}</div>
                            <p class="rv-card-desc">{{ item.desc }}</p>
                        </article>
                    </div>
                </section>
            </div>
        </section>

        <section class="rv-section">
            <div class="rv-heading">
                <h2 class="rv-title">Architecture</h2>
                <p class="rv-copy">Atscript stays centered on one shared <code>.as</code> model. Current work is already shipping through the TypeScript ecosystem, while planned work extends the same model into more targets and live UI tooling.</p>
            </div>

            <div class="rv-flow">
                <div class="rv-flow-center">
                    <div class="rv-flow-badge">
                        <span class="rv-flow-logo" v-html="asLogoSvg" />
                    </div>
                    <div class="rv-flow-title">Shared model layer</div>
                    <div class="rv-flow-desc">One definition for structure, metadata, validation, and data-layer hints.</div>
                </div>

                <div class="rv-flow-lanes">
                    <article
                        v-for="group in architectureGroups"
                        :key="group.title"
                        class="rv-flow-lane"
                        :class="`rv-flow-lane-${group.tone}`"
                    >
                        <div class="rv-flow-lane-title">{{ group.title }}</div>
                        <div class="rv-flow-lane-grid">
                            <div
                                v-for="item in group.items"
                                :key="item"
                                class="rv-flow-node"
                            >
                                {{ item }}
                            </div>
                        </div>
                    </article>
                </div>
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

.legend-chip-arch {
    background: rgba(71, 26, 236, 0.12);
    color: var(--vp-c-brand-1);
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

.rv-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
}

.rv-groups {
    display: grid;
    gap: 18px;
}

.rv-group {
    display: grid;
    gap: 14px;
}

.rv-group-head {
    display: grid;
    gap: 4px;
}

.rv-group-title {
    margin: 0;
    font-size: 18px;
    color: var(--vp-c-text-1);
}

.rv-group-copy {
    margin: 0;
    max-width: 720px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--vp-c-text-2);
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

    .rv-grid-compact {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.rv-card {
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

.rv-card-desc {
    margin: 0;
    font-size: 14px;
    line-height: 1.65;
    color: var(--vp-c-text-2);
}

.rv-flow {
    display: grid;
    gap: 18px;
    padding: 22px;
    border-radius: 22px;
    border: 1px solid rgba(71, 26, 236, 0.18);
    background: linear-gradient(135deg, rgba(71, 26, 236, 0.06), rgba(43, 170, 196, 0.05));
}

:global(.dark) .rv-flow {
    border-color: rgba(174, 153, 252, 0.24);
    background: linear-gradient(135deg, rgba(174, 153, 252, 0.12), rgba(43, 170, 196, 0.08));
}

.rv-flow-center {
    display: grid;
    gap: 8px;
}

.rv-flow-badge {
    width: 58px;
    height: 58px;
    display: block;
}

.rv-flow-logo {
    width: 100%;
    height: 100%;
    display: block;
}

.rv-flow-logo :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}

.rv-flow-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--vp-c-text-1);
}

.rv-flow-desc {
    max-width: 640px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--vp-c-text-2);
}

.rv-flow-lanes {
    display: grid;
    gap: 12px;
}

.rv-flow-lane {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: 18px;
    border: 1px solid var(--vp-c-divider);
    background: rgba(255, 255, 255, 0.45);
}

:global(.dark) .rv-flow-lane {
    background: rgba(255, 255, 255, 0.02);
}

.rv-flow-lane-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.rv-flow-lane-today {
    border-color: rgba(71, 26, 236, 0.2);
}

.rv-flow-lane-today .rv-flow-lane-title {
    color: var(--vp-c-brand-1);
}

.rv-flow-lane-future {
    opacity: 0.62;
    border-style: dashed;
    border-color: rgba(217, 119, 6, 0.22);
    background: rgba(217, 119, 6, 0.03);
}

:global(.dark) .rv-flow-lane-future {
    background: rgba(245, 158, 11, 0.04);
}

.rv-flow-lane-future .rv-flow-lane-title {
    color: #b06a15;
}

:global(.dark) .rv-flow-lane-future .rv-flow-lane-title {
    color: #d8a25d;
}

.rv-flow-lane-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 10px;
}

@media (min-width: 900px) {
    .rv-flow-lanes {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.rv-flow-node {
    padding: 12px;
    border-radius: 14px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--vp-c-text-1);
}

.rv-flow-lane-today .rv-flow-node {
    border-color: rgba(71, 26, 236, 0.12);
}

.rv-flow-lane-future .rv-flow-node {
    border-style: dashed;
    border-color: rgba(217, 119, 6, 0.18);
    color: var(--vp-c-text-2);
}
</style>
