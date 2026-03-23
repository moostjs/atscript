## [0.1.45](https://github.com/moostjs/atscript/compare/v0.1.44...v0.1.45) (2026-03-23)


### Bug Fixes

* default unknownAnnotation to error instead of allow ([26579cd](https://github.com/moostjs/atscript/commit/26579cd138c05e1ff6746da8637a0082a241e6fc))



## [0.1.44](https://github.com/moostjs/atscript/compare/v0.1.43...v0.1.44) (2026-03-22)



## [0.1.43](https://github.com/moostjs/atscript/compare/v0.1.42...v0.1.43) (2026-03-21)



## [0.1.42](https://github.com/moostjs/atscript/compare/v0.1.41...v0.1.42) (2026-03-21)


### Performance Improvements

* cache replace results in Validator and simplify build script ([216aaa9](https://github.com/moostjs/atscript/commit/216aaa9c49d9d09eac397b4f6fc98f687c96be61))



## [0.1.41](https://github.com/moostjs/atscript/compare/v0.1.40...v0.1.41) (2026-03-18)


### Performance Improvements

* optimize Validator — 3x faster than before, 1.3–2x faster than Zod ([0637e52](https://github.com/moostjs/atscript/commit/0637e52972aa29a2a54923f326a27ab5efd2d223))



## [0.1.40](https://github.com/moostjs/atscript/compare/v0.1.39...v0.1.40) (2026-03-17)


### Features

* add node_modules resolution for .as imports ([70ec466](https://github.com/moostjs/atscript/commit/70ec466c584df45c975dad463778477e5f9c0761))



## [0.1.39](https://github.com/moostjs/atscript/compare/v0.1.38...v0.1.39) (2026-03-15)



## [0.1.38](https://github.com/moostjs/atscript/compare/v0.1.37...v0.1.38) (2026-03-15)


### Bug Fixes

* **db-mysql:** handle number.int tags and expect.maxLength object format in type mapper ([e349220](https://github.com/moostjs/atscript/commit/e349220254fe8cdec28c5c8e0e1434ac9b21f280))
* **db-utils:** trigger lazy metadata build before reading adapter table options in resolveAndHash ([4e2c430](https://github.com/moostjs/atscript/commit/4e2c430d3603962c51fdb622d5d013a55ab52b9d))
* fix aggreagation with count * ([44565ce](https://github.com/moostjs/atscript/commit/44565ce23db73e5472b9e66129c80d3274335959))
* fix aggregations with count * ([54ca6a8](https://github.com/moostjs/atscript/commit/54ca6a8a92739f43b210985b4d4c61472edd33ad))
* fix collate bug ([3970eaa](https://github.com/moostjs/atscript/commit/3970eaa1c9acaa7426fdc49869c0634e7a403c62))
* fix increment defaults ([31921cc](https://github.com/moostjs/atscript/commit/31921ccbfea76e61d96e8319af436bfef638fd6b))
* fix mongo schema storing ([8327fe1](https://github.com/moostjs/atscript/commit/8327fe1e4ff5b9207e0f7d1805873587252896de))
* lint errors, unused imports, dead code, and barrel re-exports ([c49cffa](https://github.com/moostjs/atscript/commit/c49cffaad04abae9b84938a341a1a013c55377a5))
* mongodb collate option support ([756253f](https://github.com/moostjs/atscript/commit/756253f9682ca94db9332218cd854814a50ac8bf))
* omit explicit column ordering for MySQL FULLTEXT indexes ([3f1b686](https://github.com/moostjs/atscript/commit/3f1b686fd3f276386675b522e3c57c7f6d7c33d2))
* read db.search.filter as string[] not object[] and remove redundant type casts in MongoAdapter ([e1a6e39](https://github.com/moostjs/atscript/commit/e1a6e3991cb3f091e3cbbf97513b607b194cd640))
* resolve lint errors and TS type mismatches in vector search code ([04f1ebd](https://github.com/moostjs/atscript/commit/04f1ebd718434bcff391138be4e14af5e91f9f12))
* restore count(*) wildcard skip in validateInsights lost in 58481fe ([f05f1a2](https://github.com/moostjs/atscript/commit/f05f1a2974950ae14ed44f7b70d7cedc01ecdc0e))
* run FK validation outside transaction context to prevent MongoDB session mismatch ([10d482d](https://github.com/moostjs/atscript/commit/10d482d8b121dab83c570a8b4c6d3a93878f1fad))
* skip count(*) wildcard in validateInsights ([1eab608](https://github.com/moostjs/atscript/commit/1eab608d98d3883e608727f7784b4c1b52572678))
* use MongoDB Convenient Transaction API and remove counter session participation ([92d7ef0](https://github.com/moostjs/atscript/commit/92d7ef05ea97e5c5e99e6e304bfca7079cdad673))


### Features

* add aggregate query dispatch to moost-db HTTP controller via $groupBy detection ([2467ce1](https://github.com/moostjs/atscript/commit/2467ce18b401922d2ce89ac64ff81af10b42c9be))
* add aggregation annotations and [@db](https://github.com/db).view.having ([ac89380](https://github.com/moostjs/atscript/commit/ac893801398ed181f99bfd519475d7de2930965d))
* add aggregation infrastructure — UniquSelect, dimensions/measures, field mapping, and aggregate() with validation ([28e3037](https://github.com/moostjs/atscript/commit/28e3037d5621271926a1eacddc69e59dd3a4afb4))
* add aggregation pipeline support to MongoDB adapter (Phase 6) ([5689e01](https://github.com/moostjs/atscript/commit/5689e015063a769cc7a54512bb01f1720b1a32d9))
* add aggregation support to MySQL adapter ([58481fe](https://github.com/moostjs/atscript/commit/58481fe22fbf82e0af02e551d901b178cfcef1e3))
* add generic vector search annotations ([@db](https://github.com/db).search.vector, [@db](https://github.com/db).search.filter, db.vector) replacing mongo-specific ones ([f87efd4](https://github.com/moostjs/atscript/commit/f87efd43a23b2dec5da9ffd7522fb237bcf58725))
* add GROUP BY and HAVING support to aggregate view SQL/pipeline generation ([d0ca5a0](https://github.com/moostjs/atscript/commit/d0ca5a01a7dff722e0c6f555182b9b57aa87203c))
* add GROUP BY SQL generation and SqliteAdapter.aggregate() for aggregate queries ([2a95501](https://github.com/moostjs/atscript/commit/2a95501868efb08f21e62d9ca229275ddfacd15e))
* add PostgreSQL adapter with pgvector, CITEXT, batched inserts, and paramPlaceholder support ([d2e6ee9](https://github.com/moostjs/atscript/commit/d2e6ee99d7bb294d728b542ff2c708d04f1b7a1b))
* add vector search support to moost-db controller via $vector query param ([f7e135b](https://github.com/moostjs/atscript/commit/f7e135ba3641d63ac668b6305aac6071753dee4b))
* auto-index dimension fields during schema sync (Phase 8) ([cb06ae4](https://github.com/moostjs/atscript/commit/cb06ae47e2c78c672739a6583ecf9f2d37cbc7a9))
* **db-utils:** unified table option introspection and diffing for schema sync ([a11dfb0](https://github.com/moostjs/atscript/commit/a11dfb05d820a25b13d6f1c1f7908b6bfc01077f))
* emit __dim/__measure types and dimensions/measures arrays in codegen ([bdaf591](https://github.com/moostjs/atscript/commit/bdaf591232050ce2180f51e3d53e1cef312239ad))
* implement FTS5 full-text search in SQLite adapter ([f5d47c0](https://github.com/moostjs/atscript/commit/f5d47c04673daf521d3f1ecb5f35d37f9c3dd5a5))



## [0.1.37](https://github.com/moostjs/atscript/compare/v0.1.36...v0.1.37) (2026-03-11)


### Features

* change vector search api ([13966a6](https://github.com/moostjs/atscript/commit/13966a60ff661ad1d7fd0ef8f4d67ccb68dec9b6))



## [0.1.36](https://github.com/moostjs/atscript/compare/v0.1.35...v0.1.36) (2026-03-10)


### Bug Fixes

* bug fixes ([acaaa3e](https://github.com/moostjs/atscript/commit/acaaa3e56fe1b4dfc9b6312238d51a6ac1f46cfa))
* bug fixes ([3af64f2](https://github.com/moostjs/atscript/commit/3af64f25c606e58dbc57a1b196c9fa8f4cf448dd))
* bug fixing ([e8c3e20](https://github.com/moostjs/atscript/commit/e8c3e2044e937a87ebc0ec8687ed8af0f3aaa83e))
* bug fixing ([adc36de](https://github.com/moostjs/atscript/commit/adc36de6e85b1d7400fbaa189b015018e61f9a7e))
* bugs fixed ([fab9b5c](https://github.com/moostjs/atscript/commit/fab9b5cddcb1c1b07189383e23c9c290004ecba6))
* db bugs fixing ([13c8c53](https://github.com/moostjs/atscript/commit/13c8c53286e1c2532cf4ff1d368e60783b0a3c2b))
* fix bugs ([c6c125a](https://github.com/moostjs/atscript/commit/c6c125a5cf91915815899b22a84dc93d1e4b65c2))
* fix bugs ([e818cd6](https://github.com/moostjs/atscript/commit/e818cd6826329fdf1ef8efea486c862051472d91))
* fix bugs ([2c0c0c0](https://github.com/moostjs/atscript/commit/2c0c0c0fe7729cc134dabb07528a1f350f9c8fe5))
* fix validations to be on top level ([01319d6](https://github.com/moostjs/atscript/commit/01319d64e38584237445bc656e00c4b04ebe937b))
* more bugs fixed ([f8e3d6b](https://github.com/moostjs/atscript/commit/f8e3d6b5697141f89b6f67e85fbbe37ade81c2b9))
* snapshot-based schema sync with type/nullable/default change detection and external view validation ([c66c9ed](https://github.com/moostjs/atscript/commit/c66c9edd2a57a6ec39e5e134cbb22d51c1e7de4c))


### Features

* move array patch operators to generic db layer with FROM/VIA operator support ([0020303](https://github.com/moostjs/atscript/commit/0020303fbe1fcb95140263cd9e5247ff4a99ee88))



## [0.1.35](https://github.com/moostjs/atscript/compare/v0.1.34...v0.1.35) (2026-03-07)


### Features

* **core:** leaf annotation can be branch ([da59570](https://github.com/moostjs/atscript/commit/da5957015c791718e89376895ea9992f7cf019a4))
* db sync ([a4ef495](https://github.com/moostjs/atscript/commit/a4ef4954c96c5f5a467e6c32deb574d9acd028f4))
* **db:** add deep inserts ([03d9632](https://github.com/moostjs/atscript/commit/03d9632e94c8c1495a6dde08ecf26f5739c13922))
* **db:** add support for batch deep inserts ([cd7b90a](https://github.com/moostjs/atscript/commit/cd7b90a45e6bd28ab8ee5f7d39be22f905ef2597))
* **db:** add sync in cli ([a971b06](https://github.com/moostjs/atscript/commit/a971b0629d0aa9eafa295f05b25e01059dbd2cb3))
* **db:** add trasactions ([366b75d](https://github.com/moostjs/atscript/commit/366b75d2088ffa7649ea427f81f802bc8475817d))
* **db:** phase 3 implemented ([539bfb6](https://github.com/moostjs/atscript/commit/539bfb6c3c93d52df5f9e3b5f6ef1dd6ba1403ad))
* **db:** schema migrations — column renames, [@db](https://github.com/db).sync.method drop/recreate, table tracking, [@db](https://github.com/db).mongo.capped ([e264deb](https://github.com/moostjs/atscript/commit/e264deb176fcf97b53fdf230a832879a848c090b))
* deep updates/patches ([5aadc97](https://github.com/moostjs/atscript/commit/5aadc97540ba7f59f326abcda0c3d4053247fb2c))
* improve typesafe ([b4988ef](https://github.com/moostjs/atscript/commit/b4988efb787b9cf4f72845e522ab9cf46fae354f))



## [0.1.34](https://github.com/moostjs/atscript/compare/v0.1.33...v0.1.34) (2026-03-05)


### Features

* db phase 2 implemented ([bb77077](https://github.com/moostjs/atscript/commit/bb7707793340947e5e03e77f7aea81c095943a4d))



## [0.1.33](https://github.com/moostjs/atscript/compare/v0.1.32...v0.1.33) (2026-03-05)


### Bug Fixes

* add unique indexes to __pk type ([7feb54e](https://github.com/moostjs/atscript/commit/7feb54e6b3572645ddae07c880359b382cb62710))
* improve mongo __pk type ([958a4c6](https://github.com/moostjs/atscript/commit/958a4c6bb5252449a4e75da9a79658a77baf7256))



## [0.1.32](https://github.com/moostjs/atscript/compare/v0.1.31...v0.1.32) (2026-03-05)


### Bug Fixes

* fix tests ([bd0953d](https://github.com/moostjs/atscript/commit/bd0953df596ea2a58b904fab67ca674d6e2aa84a))
* **LSP:** fix props usage list ([7bdb85b](https://github.com/moostjs/atscript/commit/7bdb85b8ad9fad95a4d793a6ff530f6375364c34))


### Features

* add generic moost db controller ([20ba118](https://github.com/moostjs/atscript/commit/20ba118a05298d943da8fa117a23c3b886153c1a))
* add primary key type safety ([9f97c19](https://github.com/moostjs/atscript/commit/9f97c1975bca7f4d66ed485ff35276161849840a))
* implement moost db controller ([fbfd8ed](https://github.com/moostjs/atscript/commit/fbfd8edf594bd1e5325380be90e06a791d67b5c9))



## [0.1.31](https://github.com/moostjs/atscript/compare/v0.1.30...v0.1.31) (2026-03-03)


### Features

* **db:** add db.json annotation and improve filter expression type safety ([7a68d47](https://github.com/moostjs/atscript/commit/7a68d470997506b982ef2dffda692e56e9f5cdf1))



## [0.1.30](https://github.com/moostjs/atscript/compare/v0.1.29...v0.1.30) (2026-03-02)


### Features

* **core:** add support for interface extends ([59b8452](https://github.com/moostjs/atscript/commit/59b84528bd911df666b1e912b30ece34fe5eb79b))



## [0.1.29](https://github.com/moostjs/atscript/compare/v0.1.28...v0.1.29) (2026-03-02)


### Features

* migrate filters to uniqu ([11b3f12](https://github.com/moostjs/atscript/commit/11b3f12974c41de1eefc58b067299f63ef64e4c5))



## [0.1.28](https://github.com/moostjs/atscript/compare/v0.1.27...v0.1.28) (2026-02-28)


### Features

* add db integrations (experimental) ([49178ce](https://github.com/moostjs/atscript/commit/49178ce09a884e19620c524f773c7c189710d2f6))



## [0.1.27](https://github.com/moostjs/atscript/compare/v0.1.26...v0.1.27) (2026-02-26)



## [0.1.26](https://github.com/moostjs/atscript/compare/v0.1.25...v0.1.26) (2026-02-23)

### Bug Fixes

- **typescript:** clone refs in mutating annotate and inline refs in non-mutating annotate to fix deep path annotations ([d3fe70d](https://github.com/moostjs/atscript/commit/d3fe70dfb12c5966fc463e63cbe4b6c07c2f09cd))

### Features

- **typescript:** add $defs/$ref, type id, mergeJsonSchemas, and fromJsonSchema $ref resolution to JSON Schema support ([2dd2855](https://github.com/moostjs/atscript/commit/2dd2855b8fbc3e13a44728ca61eba311ca52675e))

## [0.1.25](https://github.com/moostjs/atscript/compare/v0.1.24...v0.1.25) (2026-02-22)

### Features

- **typescript:** auto-detect discriminated unions in toJsonSchema ([bc37917](https://github.com/moostjs/atscript/commit/bc37917c0b40c4fdcc385ba3a7ea5f8cf8bd6d61))

## [0.1.24](https://github.com/moostjs/atscript/compare/v0.1.23...v0.1.24) (2026-02-22)

### Bug Fixes

- improve example generation ([c376569](https://github.com/moostjs/atscript/commit/c376569f3c120ad5d7c7f25137409fa68c79d1f8))

## [0.1.23](https://github.com/moostjs/atscript/compare/v0.1.22...v0.1.23) (2026-02-22)

### Features

- **unplugin:** create multiple exports for bundlers ([0a4ea00](https://github.com/moostjs/atscript/commit/0a4ea00d8d9edc19fdeb0a2a340f223354ab1a40))

## [0.1.22](https://github.com/moostjs/atscript/compare/v0.1.21...v0.1.22) (2026-02-21)

### Features

- add type utility TAtscriptDataType ([7348267](https://github.com/moostjs/atscript/commit/7348267eae8506980af253631f73bf7f7ca0a87b))

## [0.1.21](https://github.com/moostjs/atscript/compare/v0.1.20...v0.1.21) (2026-02-21)

### Features

- add toExampleData() ([d1be890](https://github.com/moostjs/atscript/commit/d1be89013ed8e02a23366f97d2ff35989de216fc))

## [0.1.20](https://github.com/moostjs/atscript/compare/v0.1.19...v0.1.20) (2026-02-21)

### Features

- add skill setup ([fa15cd5](https://github.com/moostjs/atscript/commit/fa15cd55139e648d83972263ae156946a1d2ef0b))
- **ts:** add createDataFromAnnotatedType ([914edd6](https://github.com/moostjs/atscript/commit/914edd603772fafc506f53308ece54ae4ce12d0a))

## [0.1.19](https://github.com/moostjs/atscript/compare/v0.1.18...v0.1.19) (2026-02-20)

### Bug Fixes

- fix typo ([2375f7c](https://github.com/moostjs/atscript/commit/2375f7c77989f3d3fb8467f3630ed9e4293298ac))

## [0.1.18](https://github.com/moostjs/atscript/compare/v0.1.17...v0.1.18) (2026-02-20)

### Bug Fixes

- fix flatten optional flag lost ([cdcb827](https://github.com/moostjs/atscript/commit/cdcb8274b19d34ecb42999e03ebc8a86dc5ccbfb))
- fix primitive annotations in props complex types ([8d3932f](https://github.com/moostjs/atscript/commit/8d3932fc21298ad40424beb924106d44a6697183))

## <small>0.1.17 (2026-02-19)</small>

- fix: merge metadata and declaration order fix ([56e9f13](https://github.com/moostjs/atscript/commit/56e9f13))

## <small>0.1.16 (2026-02-18)</small>

- fix: fix suggestions for annotate block ([80ba558](https://github.com/moostjs/atscript/commit/80ba558))

## <small>0.1.15 (2026-02-18)</small>

- refactor: expect.filled -> meta.required ([52a1f7d](https://github.com/moostjs/atscript/commit/52a1f7d))

## <small>0.1.14 (2026-02-18)</small>

- feat: add expect.filled annotation ([bb7f1fe](https://github.com/moostjs/atscript/commit/bb7f1fe))

## <small>0.1.13 (2026-02-18)</small>

- fix: propagate type metadata to array typed props ([587b89e](https://github.com/moostjs/atscript/commit/587b89e))
- docs: update ([4a219d5](https://github.com/moostjs/atscript/commit/4a219d5))

## <small>0.1.12 (2026-02-17)</small>

- feat(vscode): add restart command ([e976794](https://github.com/moostjs/atscript/commit/e976794))

## <small>0.1.11 (2026-02-17)</small>

- chore: add oxc-disable to generated files ([9802ec2](https://github.com/moostjs/atscript/commit/9802ec2))
- chore: add oxc-disable to generated files ([c488f3a](https://github.com/moostjs/atscript/commit/c488f3a))
- chore: add oxc-disable to generated files ([53b88ad](https://github.com/moostjs/atscript/commit/53b88ad))

## <small>0.1.10 (2026-02-17)</small>

- feat: add external context to validator ([5663c23](https://github.com/moostjs/atscript/commit/5663c23))

## <small>0.1.9 (2026-02-17)</small>

- feat: extract flattenAnnotatedType to typescript module ([89fb70f](https://github.com/moostjs/atscript/commit/89fb70f))

## <small>0.1.8 (2026-02-16)</small>

- fix: include phantom props in serialization ([60bb4d7](https://github.com/moostjs/atscript/commit/60bb4d7))

## <small>0.1.7 (2026-02-16)</small>

- feat: add custom error messages ([395fb31](https://github.com/moostjs/atscript/commit/395fb31))

## <small>0.1.6 (2026-02-16)</small>

- chore: update snapshots ([e1d853e](https://github.com/moostjs/atscript/commit/e1d853e))
- fix: improve dts, remove DataType ([8f128ae](https://github.com/moostjs/atscript/commit/8f128ae))
- fix: phantom type d.ts render ([ec30f53](https://github.com/moostjs/atscript/commit/ec30f53))

## <small>0.1.5 (2026-02-16)</small>

- feat(vscode): add semantic token to phantom types ([51c03ba](https://github.com/moostjs/atscript/commit/51c03ba))
- fix: add phantom to base types ([45b11c8](https://github.com/moostjs/atscript/commit/45b11c8))

## <small>0.1.4 (2026-02-16)</small>

- feat: add phantom primitive ([f5ea27a](https://github.com/moostjs/atscript/commit/f5ea27a))

## <small>0.1.3 (2026-02-15)</small>

- docs: update ([2cfab8b](https://github.com/moostjs/atscript/commit/2cfab8b))
- docs: update ([4158753](https://github.com/moostjs/atscript/commit/4158753))
- docs: update docs ([b3e108f](https://github.com/moostjs/atscript/commit/b3e108f))
- feat: add fromJsonSchema ([23751a9](https://github.com/moostjs/atscript/commit/23751a9))
- feat: add serializer ([01c168d](https://github.com/moostjs/atscript/commit/01c168d))

## <small>0.1.2 (2026-02-12)</small>

- docs: update ([521b26d](https://github.com/moostjs/atscript/commit/521b26d))
- docs: update vscode docs ([2b2b09b](https://github.com/moostjs/atscript/commit/2b2b09b))
- fix(core): fix annotate with intersection types ([2e06e7c](https://github.com/moostjs/atscript/commit/2e06e7c))
- fix(js): fix merging annotations logic ([a866bcc](https://github.com/moostjs/atscript/commit/a866bcc))
- fix(js): fix order of ad-hoc annotations ([6280e29](https://github.com/moostjs/atscript/commit/6280e29))
- fix(validator): fix generic generated types and typeguards ([f7abda8](https://github.com/moostjs/atscript/commit/f7abda8))
- fix(vscode): fix crashing LSP when config file is broken ([8a1d8f8](https://github.com/moostjs/atscript/commit/8a1d8f8))
- chore: update deps ([f284b06](https://github.com/moostjs/atscript/commit/f284b06))

## [0.1.1](https://github.com/moostjs/atscript/compare/v0.1.0...v0.1.1) (2026-02-10)

### Bug Fixes

- **typescript:** restore static class properties removed during ad-hoc refactor ([1962552](https://github.com/moostjs/atscript/commit/1962552847c9c3b80511c9ef47e85efde24c5b20))

# [0.1.0](https://github.com/moostjs/atscript/compare/v0.0.32...v0.1.0) (2026-02-10)

### Features

- add ad-hoc annotations ([8b74759](https://github.com/moostjs/atscript/commit/8b74759b0ebc344bd5f321086ddb97f8a91f6307))

## [0.0.32](https://github.com/moostjs/atscript/compare/v0.0.31...v0.0.32) (2026-02-02)

## [0.0.31](https://github.com/ts-anscript/anscript/compare/v0.0.30...v0.0.31) (2025-09-18)

### Features

- add llms to docs ([db58724](https://github.com/ts-anscript/anscript/commit/db5872431f13ee3f91d2f9be5d0f31e6b4c0505a))

## [0.0.30](https://github.com/ts-anscript/anscript/compare/v0.0.29...v0.0.30) (2025-09-18)

### Bug Fixes

- fix typo ([e3906ae](https://github.com/ts-anscript/anscript/commit/e3906ae1b41434969146fb64c5ab83594f2f9bc8))

## [0.0.29](https://github.com/ts-anscript/anscript/compare/v0.0.28...v0.0.29) (2025-08-23)

### Bug Fixes

- improve type def for wildcard props ([202e0f1](https://github.com/ts-anscript/anscript/commit/202e0f15250ca66282d1f748322055d5a10c7e01))

## [0.0.28](https://github.com/ts-anscript/anscript/compare/v0.0.27...v0.0.28) (2025-08-13)

### Features

- add json schema generator ([4ee167f](https://github.com/ts-anscript/anscript/commit/4ee167f28f1169bfcd607297ca7d21a66dc10cfc))

## [0.0.27](https://github.com/ts-anscript/anscript/compare/v0.0.26...v0.0.27) (2025-07-10)

### Bug Fixes

- **moost-mongo:** fix pages endpoing ([0eefba1](https://github.com/ts-anscript/anscript/commit/0eefba112cc1b72face7f73681cab86347290511))

## [0.0.26](https://github.com/ts-anscript/anscript/compare/v0.0.25...v0.0.26) (2025-07-10)

### Features

- **moost-mongo:** Add text search capabilities to AsMongoController ([436dda9](https://github.com/ts-anscript/anscript/commit/436dda9e9f8e25dc10c415324effee173cb8c58b))

## [0.0.25](https://github.com/ts-anscript/anscript/compare/v0.0.24...v0.0.25) (2025-07-04)

### Bug Fixes

- add new lines ([f610b66](https://github.com/ts-anscript/anscript/commit/f610b6664fad71d0ac74d07558b6580c9aeeb8c5))

## [0.0.24](https://github.com/ts-anscript/anscript/compare/v0.0.23...v0.0.24) (2025-07-04)

### Bug Fixes

- **typescript:** add eslint-disable ([280887d](https://github.com/ts-anscript/anscript/commit/280887d0c73d7ed9addd1f5b3f356a77f53570d2))

## [0.0.23](https://github.com/ts-anscript/anscript/compare/v0.0.22...v0.0.23) (2025-07-04)

### Bug Fixes

- **mongo:** flatten arrays in asCollection ([153fcc3](https://github.com/ts-anscript/anscript/commit/153fcc3ca696ab6825e0596eb294799b1efee42f))

## [0.0.22](https://github.com/ts-anscript/anscript/compare/v0.0.21...v0.0.22) (2025-07-01)

### Bug Fixes

- **moost-mongo:** add transfromFilter calls to every relevant method ([98f11ee](https://github.com/ts-anscript/anscript/commit/98f11ee63e7f0cffeb039b5925801fc9ce69292f))

## [0.0.21](https://github.com/ts-anscript/anscript/compare/v0.0.20...v0.0.21) (2025-06-30)

### Features

- **moost-mongo:** add $search support ([577586b](https://github.com/ts-anscript/anscript/commit/577586b262bb1f25c273d342d85d035e53f24c4b))

## [0.0.20](https://github.com/ts-anscript/anscript/compare/v0.0.19...v0.0.20) (2025-06-29)

### Bug Fixes

- **moost-mongo:** improve types ([ed87067](https://github.com/ts-anscript/anscript/commit/ed87067f9de3623650fa0bb773404a7b548dc916))

## [0.0.19](https://github.com/ts-anscript/anscript/compare/v0.0.18...v0.0.19) (2025-06-26)

### Features

- **moost-mongo:** add InjectCollection resolver ([19c9778](https://github.com/ts-anscript/anscript/commit/19c9778e2e6d1ccea8a46d4187d2557640391656))

## [0.0.18](https://github.com/ts-anscript/anscript/compare/v0.0.17...v0.0.18) (2025-06-26)

### Bug Fixes

- **core:** fix number token ([dacd830](https://github.com/ts-anscript/anscript/commit/dacd8309051c2d5f3f33d569377dd617d6652064))
- **core:** fix number token ([bb77a34](https://github.com/ts-anscript/anscript/commit/bb77a347c0e588884f777eab289431b4ad18e040))
- fix peer deps ([4271aa3](https://github.com/ts-anscript/anscript/commit/4271aa3811e67cfd171a4508576f6c224815315e))
- minor fixes ([d6882c8](https://github.com/ts-anscript/anscript/commit/d6882c8ea7b93ed49fc398e746a7871698c4ddcc))
- **ts-gen:** add Partial to TValidatorOptions ([40d460f](https://github.com/ts-anscript/anscript/commit/40d460f357a49f52f06298545272c32504c8dd84))

### Features

- add mongo integrations ([24028f7](https://github.com/ts-anscript/anscript/commit/24028f73b594c13943ad4582bdffbb8fa891e69d))
- add moost validator ([1cb35b4](https://github.com/ts-anscript/anscript/commit/1cb35b4edec94276fc5dd097fb430e925ac0dfb1))
- **core:** add support for wildcards in props; add support of negative number consts ([ce69739](https://github.com/ts-anscript/anscript/commit/ce69739e76b42c7b6fd55d23255fad49c2228673))
- **mongo:** add duplicates validation for unique items arrays ([4b392cf](https://github.com/ts-anscript/anscript/commit/4b392cf052f235ba7d292f29c16a6504051e49d9))
- **mongo:** add patch arrays support ([2b2e383](https://github.com/ts-anscript/anscript/commit/2b2e383fa76a21c0abbe3f2cc5caa8830dcd205a))
- **ts:** add key wildcards validation support ([7607e91](https://github.com/ts-anscript/anscript/commit/7607e918c284d21158b7bcb24ea113cfc656e56c))
- **unplugin:** add error rendering and strict mode by default ([d49ee43](https://github.com/ts-anscript/anscript/commit/d49ee4302be70b9c00acfb0351c56859c3c73d4c))

## [0.0.17](https://github.com/ts-anscript/anscript/compare/v0.0.16...v0.0.17) (2025-05-19)

### Bug Fixes

- fix strings render; fix config load ([c356958](https://github.com/ts-anscript/anscript/commit/c356958cbabdbe16522cac218e074868b98757a5))
- **typescript:** fix type guard for validate method ([ee0b730](https://github.com/ts-anscript/anscript/commit/ee0b730d043fed50664ec0829c0fb29f1957327c))

### Features

- **mongo:** add array.key and patch.strategy annotations ([7f40a84](https://github.com/ts-anscript/anscript/commit/7f40a843499e7628dd452b46e84e58e800bd6c5f))
- **typescript:** add skipList option to validator ([8bf5a34](https://github.com/ts-anscript/anscript/commit/8bf5a343b28294110b6319eb22e1b729b9b2418b))

## [0.0.16](https://github.com/ts-anscript/anscript/compare/v0.0.15...v0.0.16) (2025-02-11)

### Features

- add generic type and type guard to Validator ([e29cd9e](https://github.com/ts-anscript/anscript/commit/e29cd9ee15ba66c5f419b8449788f9e1409931a5))

## [0.0.15](https://github.com/ts-anscript/anscript/compare/v0.0.1...v0.0.15) (2025-02-08)

### Bug Fixes

- fix load config ([247c3b5](https://github.com/ts-anscript/anscript/commit/247c3b53ac2681ca41ae9db607719f9e0902d077))

## [0.0.2](https://github.com/ts-anscript/anscript/compare/v0.0.1...v0.0.2) (2025-02-08)

### Bug Fixes

- fix load config ([247c3b5](https://github.com/ts-anscript/anscript/commit/247c3b53ac2681ca41ae9db607719f9e0902d077))

## [0.0.1](https://github.com/ts-anscript/anscript/compare/v0.0.11...v0.0.1) (2025-02-08)

### Features

- add unplugin; add more primitives; add expect annotations; add meta annotations ([09cdd5a](https://github.com/ts-anscript/anscript/commit/09cdd5ac94b9fdca6a0c0424a8b1f39bf978733b))

## [0.0.11](https://github.com/intertation/intertation/compare/v0.0.10...v0.0.11) (2025-02-06)

## [0.0.10](https://github.com/intertation/intertation/compare/v0.0.6...v0.0.10) (2025-02-06)

### Bug Fixes

- **config:** fix resolving config ([371f649](https://github.com/intertation/intertation/commit/371f6493d5f35da0df6d2ad8befb1157d75a48ac))

## [0.0.6](https://github.com/intertation/intertation/compare/v0.0.5...v0.0.6) (2025-02-06)

### Bug Fixes

- **vscode:** fix build ([a10db0c](https://github.com/intertation/intertation/commit/a10db0c98561eaae4d910181108f94e250d783db))

## [0.0.5](https://github.com/intertation/intertation/compare/v0.0.4...v0.0.5) (2025-02-06)

## [0.0.4](https://github.com/intertation/intertation/compare/v0.0.3...v0.0.4) (2025-02-06)

## [0.0.3](https://github.com/intertation/intertation/compare/v0.0.2...v0.0.3) (2025-02-06)

## 0.0.2 (2025-02-06)

### Bug Fixes

- config loading; add refs to as files; add static props ([263ed2d](https://github.com/intertation/intertation/commit/263ed2d1157d8572f1c61c255e60930e1f161f7e))
- fix structure ([128c1da](https://github.com/intertation/intertation/commit/128c1da72cf4bc9a68eed78f4bf437b5a1ce9aa7))
- fix structure props ([7151eb2](https://github.com/intertation/intertation/commit/7151eb21121a52c2d8925be06d9c30b4af828a62))
- import file completions ([8d022e1](https://github.com/intertation/intertation/commit/8d022e19591475279d9275b913f52c780cde3bd8))
- minor fixes ([429bb68](https://github.com/intertation/intertation/commit/429bb6870e14760ed7bd3b6e5ac84e576552c6a9))

### Features

- add annotations generation ([1dd6c10](https://github.com/intertation/intertation/commit/1dd6c100f035ec75a10dd52b03529597ba710e28))
- add annotations typegen ([d5c2366](https://github.com/intertation/intertation/commit/d5c2366510ab500f8e1570290dafb60cec59bc09))
- add chaining support ([7b49268](https://github.com/intertation/intertation/commit/7b4926802f25683891b78f41ca7ad52283411f65))
- add completion for imports ([f24ab96](https://github.com/intertation/intertation/commit/f24ab9688fc716d83de05d4304bd6000ad8e5003))
- add completions for declarations and add imports ([f659b73](https://github.com/intertation/intertation/commit/f659b73171ef440e5c638deb59abeb944037a05f))
- add config file watch; render annotations value according specs ([763d512](https://github.com/intertation/intertation/commit/763d51248a3ca351765114d66612620f39959c6d))
- add config file; add annotations completions ([93c99af](https://github.com/intertation/intertation/commit/93c99af10f4297fd4e5d655906f0e6a659b01f0c))
- add file folding and icon ([7fda581](https://github.com/intertation/intertation/commit/7fda58161f0050f81969dc844605c568e9197040))
- add goto definition ([bef1edb](https://github.com/intertation/intertation/commit/bef1edbd6f7fda3fab6faac2e517436ba6560b10))
- add groups support ([8ca3adc](https://github.com/intertation/intertation/commit/8ca3adcbd4587bf99a570f2089795569e6dbcc93))
- add imports and diagnostics ([ea57e50](https://github.com/intertation/intertation/commit/ea57e508a84fba33f3d7f1565d959de6b262e723))
- add imports; add checks ([024dede](https://github.com/intertation/intertation/commit/024dede3b271c0f495623f6ef234ef8a438a9fdb))
- add limt logic to validator ([5d307e5](https://github.com/intertation/intertation/commit/5d307e54fbf0e565abb8fb6f57d58edf05e042e8))
- add partial options to validator ([0dfe0c6](https://github.com/intertation/intertation/commit/0dfe0c6f887ce7652309c76332659b1e5296e866))
- add primitive extensions ([80ee968](https://github.com/intertation/intertation/commit/80ee968df31e87db0c338a80582473b393eb5678))
- add props chaining ([21b1b0c](https://github.com/intertation/intertation/commit/21b1b0c960ad1a717ed0493f1d221ef414239481))
- add rename capability ([cc6bb21](https://github.com/intertation/intertation/commit/cc6bb21e26b7865bd76115e494afc264b5d121d4))
- add ts codegen ([4b786f1](https://github.com/intertation/intertation/commit/4b786f131560a8f199526a9d66748d25760e68fb))
- add validator ([73a4b85](https://github.com/intertation/intertation/commit/73a4b850f422fd0d0d8a43654e3adc099631e86a))
- create ts plugin ([4175886](https://github.com/intertation/intertation/commit/4175886cc5cd9d30edd9ecee444c42e90c4cd4a6))
- **mongo:** add mongo plugin ([df2411e](https://github.com/intertation/intertation/commit/df2411e8ac62e1fbbc6290e1350db9131459065e))
- shift merging of intersections to document class ([e9bd0da](https://github.com/intertation/intertation/commit/e9bd0dadb7b6da7dbea4abb3d3ffa10aede16ffd))
- ts plugin ([ce8a487](https://github.com/intertation/intertation/commit/ce8a487b823394a8dcb336190df653ed50bcff56))
