# kppdf-7.0 backend (Stage 4 Wave 1 Bootstrap)

> **NestJS + Mongoose + MongoDB + BullMQ + Local disk.** Greenfield MVP.

## Quick start

```bash
# 1. Start MongoDB (with replica set) + Redis
npm run docker:up

# 2. Copy env template
cp .env.example .env
# Edit .env: set ADMIN_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET (32+ chars each)

# 3. Install deps
npm install

# 4. Start dev server (watches src/)
npm run start:dev

# 5. Verify
curl http://localhost:3000/api/health
# → {"status":"ok","mongo":"connected","redis":"connected",...}
```

## What's included (Wave 1 Bootstrap)

- ✅ NestJS scaffold + TypeScript strict mode
- ✅ MongoDB connection via `@nestjs/mongoose`
- ✅ Redis connection via `ioredis`
- ✅ `docker-compose.yml` with replica-set init script
- ✅ `ConfigModule` + typesafe env loader
- ✅ Health check endpoint `/api/health`
- ✅ Shared `@Permissions()` decorator + `RbacGuard` (Wave 2 wires JWT strategy)
- ✅ Permission keys registry (14 keys per `RBAC-SCHEME.md §1`)
- ✅ Admin seed hook structure (Wave 2 implements)

## What's NOT included yet (queued for Waves 2-3)

- ⏳ Auth: JWT strategies, login endpoint (Wave 2.A)
- ⏳ Organizations/Products CRUD (Wave 2.C, 2 parallel agents)
- ⏳ Storage LocalDiskProvider + Photo cluster (Wave 2.D)
- ⏳ Ingestion BullMQ workers + 3 strategies (Wave 3.B)

## Layout

```
backend/
├── src/
│   ├── main.ts                              # Bootstrap entry
│   ├── app.module.ts                        # Root module (only Bootstrap edits)
│   ├── config/
│   │   └── configuration.ts                 # Env loader (registerAs)
│   ├── health/
│   │   ├── health.module.ts
│   │   └── health.controller.ts             # GET /api/health
│   ├── common/                              # Shared (only Bootstrap edits)
│   │   ├── decorators/
│   │   │   └── permissions.decorator.ts
│   │   ├── guards/
│   │   │   └── rbac.guard.ts
│   │   └── types/
│   │       └── permission-keys.ts
│   ├── bootstrap/
│   │   └── admin-seed.ts                    # Wave 2 implements (placeholder now)
│   └── modules/                             # Domain modules (one folder per agent)
├── docker/
│   └── mongo-entrypoint.sh
├── docker-compose.yml
├── .env.example
└── package.json
```

## Stage 4 Wave 1 Done Criteria (per CHECKLIST §6.1 row 4.A)

- ✅ `npm install` succeeds.
- ⏳ `npm run start:dev` succeeds (verify after `npm install`).
- ⏳ `GET /api/health` → 200 with mongo+redis connected.
- ⏳ Admin seed in `OnApplicationBootstrap` (placeholder, full impl in Wave 2).

## Parallelism rules (per ANALYSIS.md §4.4)

> **Hard rule:** only the Bootstrap agent (this Wave) may edit `app.module.ts`, `common/`, `package.json`. Waves 2-3 domain agents work in their own `modules/<name>/` folder, and require parent-agent coordination to register new modules in `app.module.ts`. **Concurrency ≤ 5 agents in any single wave.**

## Reference

- [docs/backend/ARCHITECTURE.md](../docs/backend/ARCHITECTURE.md) — Tech stack + module structure
- [docs/backend/DOMAIN-MODEL.md](../docs/backend/DOMAIN-MODEL.md) — Mongoose schemas index
- [docs/backend/RBAC-SCHEME.md](../docs/backend/RBAC-SCHEME.md) — Permission registry, role machine
- [docs/backend/CHECKLIST.md](../docs/backend/CHECKLIST.md) — Stage 4 plan + Wave 1-3 order
