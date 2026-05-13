---
layout: home

hero2:
  kicker: 'One model. Types · DB · UI.'
  text: 'Define your data once.'
  tagline: 'Generate TypeScript types, runtime validation, DB schema, REST routes, and a full UI — forms, tables and multi-step flows — from a single `.as` model.'

actions:
  - theme: brand
    text: Start with TypeScript
    link: /packages/typescript/quick-start
  - theme: alt
    text: Explore Database
    link: https://db.atscript.dev/guide/quick-start
  - theme: alt
    text: Explore UI
    link: https://ui.atscript.dev/
---

## AI Agent Skill

Atscript provides a unified skill for AI coding agents (Claude Code, Cursor, Windsurf, Codex, etc.) that covers all `@atscript/*` packages with progressive-disclosure reference docs.

```bash
npx skills add moostjs/atscript
```

The DB and UI layers ship their own skill bundles too:

```bash
npx skills add moostjs/atscript-db   # @db.* annotations, adapters, moost-db REST, browser client
npx skills add moostjs/atscript-ui   # @ui.* annotations, <AsForm> / <AsTable> / <AsWfForm>, styling
```

Learn more about AI agent skills at [skills.sh](https://skills.sh).
