<script setup>
import Carousel from './Carousel.vue'

const slides = [
    { label: 'Form', title: 'Live form tool', chip: 'Planned form tool' },
    { label: 'Table', title: 'Live table tool', chip: 'Planned table tool' },
]
</script>

<template>
    <div class="planned-ui">
        <div class="planned-model">user.as</div>

        <Carousel :count="slides.length" :labels="slides.map(s => s.label)" :interval="4200">
            <template #default="{ index }">
                <div class="planned-card">
                    <div class="planned-card-meta">
                        <div class="planned-card-head">{{ slides[index].title }}</div>
                        <div class="planned-card-chip">{{ slides[index].chip }}</div>
                    </div>

                    <div v-if="index === 0" class="planned-form">
                        <div class="planned-field">
                            <span class="planned-label">Full Name</span>
                            <div class="planned-input wide" />
                        </div>
                        <div class="planned-field">
                            <span class="planned-label">Email</span>
                            <div class="planned-input wide" />
                        </div>
                        <div class="planned-field">
                            <span class="planned-label">Role</span>
                            <div class="planned-input short" />
                        </div>
                        <div class="planned-field">
                            <span class="planned-label">Bio</span>
                            <div class="planned-input tall" />
                        </div>
                        <div class="planned-button">Submit</div>
                    </div>

                    <div v-else class="planned-table">
                        <div class="planned-row planned-row-head">
                            <span>Name</span>
                            <span>Email</span>
                            <span>Role</span>
                        </div>
                        <div class="planned-row">
                            <span class="cell-fill med" />
                            <span class="cell-fill long" />
                            <span class="cell-fill short" />
                        </div>
                        <div class="planned-row">
                            <span class="cell-fill short" />
                            <span class="cell-fill med" />
                            <span class="cell-fill short" />
                        </div>
                        <div class="planned-row">
                            <span class="cell-fill med" />
                            <span class="cell-fill long" />
                            <span class="cell-fill short" />
                        </div>
                        <div class="planned-row">
                            <span class="cell-fill med" />
                            <span class="cell-fill med" />
                            <span class="cell-fill short" />
                        </div>
                    </div>
                </div>
            </template>
        </Carousel>
    </div>
</template>

<style scoped>
.planned-ui {
    width: 100%;
    max-width: 460px;
}

.planned-ui :deep(.carousel) {
    gap: 12px;
}

.planned-ui :deep(.carousel-dots) {
    justify-content: flex-start;
}

.planned-model {
    display: inline-flex;
    align-items: center;
    margin-bottom: 14px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(71, 26, 236, 0.12);
    color: var(--vp-c-brand-1);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.planned-card {
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(71, 26, 236, 0.16);
    background: var(--vp-c-bg);
    box-shadow: 0 10px 24px rgba(71, 26, 236, 0.08);
    height: 402px;
}

:global(.dark) .planned-card {
    border-color: rgba(174, 153, 252, 0.22);
    box-shadow: 0 10px 24px rgba(174, 153, 252, 0.08);
}

.planned-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}

.planned-card-head {
    font-size: 13px;
    font-weight: 700;
    color: var(--vp-c-text-1);
}

.planned-card-chip {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(217, 119, 6, 0.12);
    color: #9a4b00;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

:global(.dark) .planned-card-chip {
    background: rgba(245, 158, 11, 0.18);
    color: #f6c46b;
}

.planned-field {
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
}

.planned-label {
    font-size: 12px;
    color: var(--vp-c-text-2);
}

.planned-input {
    height: 28px;
    border-radius: 8px;
    background: linear-gradient(90deg, rgba(71, 26, 236, 0.14), rgba(43, 170, 196, 0.14));
}

.planned-input.wide { width: 100%; }
.planned-input.short { width: 62%; }
.planned-input.tall { width: 100%; height: 54px; }

.planned-button {
    margin-top: 6px;
    width: 72px;
    padding: 7px 0;
    border-radius: 999px;
    background: var(--vp-c-brand-1);
    color: white;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
}

.planned-row {
    display: grid;
    grid-template-columns: 1fr 1.35fr 0.7fr;
    gap: 8px;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--vp-c-divider);
}

.planned-row-head {
    padding-top: 0;
    border-top: none;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vp-c-text-2);
}

.cell-fill {
    display: block;
    height: 8px;
    border-radius: 999px;
    background: rgba(71, 26, 236, 0.14);
}

:global(.dark) .cell-fill {
    background: rgba(174, 153, 252, 0.16);
}

.cell-fill.short { width: 70%; }
.cell-fill.med { width: 85%; }
.cell-fill.long { width: 100%; }
</style>
