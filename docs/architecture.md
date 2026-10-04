# TFarms Backend Architecture

NestJS + TypeScript service for **payout management** and **ledger querying**, backed by **PostgreSQL** through **Prisma**.

## 1. Overview

| Area | Details |
|------|---------|
| Framework | NestJS 10 (`@nestjs/platform-express`) |
| Language | TypeScript (Node >= 18) |
| Database | PostgreSQL via Prisma 6 (`DATABASE_URL`) |
| Auth | Passport API-key strategy (`X-API-Key` header) |
| Validation | `class-validator` / `class-transformer` DTOs |
| Tests | Jest + ts-jest (`*.spec.ts` under `src/`) |
| Deployment | Dockerfile included |

### Module structure

```
AppModule
 ├── PrismaModule   (@Global)  → PrismaService
 ├── AuthModule                → ApiKeyStrategy, ApiKeyGuard
 ├── PayoutsModule             → PayoutsController, PayoutsService, AchRoutingService
 └── LedgerModule              → LedgerController, LedgerService
```

- `PrismaModule` is marked `@Global()`, so `PrismaService` is injectable anywhere. `PayoutsModule` and `LedgerModule` also import it explicitly.
- `AppModule` also exports `getCorsOptions()`. It reads `FRONTEND_ORIGIN` and defaults to `http://localhost:3000`.

### Configuration (environment)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `API_KEYS` | Comma-separated list of valid API keys |
| `FRONTEND_ORIGIN` | Allowed CORS origin |

See `.env.example` for the full list.

## 2. Flows

### 2.1 App bootstrap

```
App starts
  → AppModule loads PrismaModule, AuthModule, PayoutsModule, LedgerModule
  → PrismaService.onModuleInit()    → $connect()
  → ...serves requests...
  → PrismaService.onModuleDestroy() → $disconnect()
```

### 2.2 Authentication

```
Client request (X-API-Key: <key>)
  → Controller route decorated with @UseGuards(ApiKeyGuard)
  → ApiKeyGuard (AuthGuard('api-key'))
  → ApiKeyStrategy (passport-headerapikey, header "X-API-Key")
  → timing-safe compare against each key in API_KEYS
  → valid   → request continues
  → invalid → 401 UnauthorizedException("Invalid API key")
```

Guarded endpoints: `POST /payouts`, `PUT /payouts/:id/status`, `POST /payouts/route`.  
Read endpoints (`GET /payouts/*`, `GET /ledger`) are **not** guarded in the current code.

### 2.3 Payout creation

```
POST /payouts  (ApiKeyGuard)
  → PayoutsController.create(CreatePayoutDto)
  → PayoutsService.create(vendorId, amount, rail)
      - amount must be a string, parseable as Decimal, finite, <= 2 decimal places
      - rail trimmed + uppercased, must match the Rail enum (else 400)
      - prisma.payout.create({ status: PENDING, ... })
  → returns the Payout
```

### 2.4 Payout lookup and status lifecycle

```
GET /payouts                     → all payouts
GET /payouts/pending             → status = PENDING
GET /payouts/:id                 → one payout (404 if missing)
GET /payouts/vendor/:vendorId    → payouts for a vendor
GET /payouts/rail/:rail/pending  → pending payouts filtered by rail
PUT /payouts/:id/status          → update status (ApiKeyGuard)
```

Status update:
```
PUT /payouts/:id/status
  → PayoutsService.updateStatus(id, status, externalTransactionId?, failureReason?)
      - findById (404 if missing)
      - status validated against PayoutStatus enum (else 400)
      - prisma.payout.update(...)
```

Statuses: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REVERSED`, `REQUIRES_REVIEW`.

### 2.5 Routing decision

```
POST /payouts/route  (ApiKeyGuard)
  → RoutingInputDto { vendorId, amount, rail, status?, currency? }
  → AchRoutingService.decide(input)
```

Decision tree:

```
vendorId missing/blank          → 400
amount invalid / <= 0 / >2 dp   → 400
currency != USD (default USD)   → 400

rail not recognized             → rail=OTHER, status=REQUIRES_REVIEW, no route
status = REQUIRES_REVIEW        → returned as-is, no route
status != PENDING               → 400 (cannot be routed)
rail != ACH                     → no route, status unchanged
rail = ACH:
    first enabled route (by priority) whose [minAmount, maxAmount] contains amount
        → routeId + provider, status PENDING
    none match
        → fallback rail (MANUAL), status REQUIRES_REVIEW, fallback=true
```

Result shape (`RoutingDecision`):
`{ rail, status, routeId, provider, fallback, reason }`

Per the unit tests, the default config routes up to 25,000.00 to `ach-primary`, up to 100,000.00 to `ach-secondary`, and anything above to the `MANUAL` fallback.

Note: `/payouts/route` only returns a decision. It does not persist anything.

### 2.6 Ledger query

```
GET /ledger?vendorId=&payoutId=&type=&limit=&offset=
  → LedgerController.findAll(LedgerQueryDto)
  → LedgerService.findAll
      - optional filters: vendorId, payoutId, type
      - limit default 50, offset default 0
      - ordered by createdAt desc
      - findMany + count in parallel
  → { data, total, limit, offset }
```

## 3. Module breakdown

### AppModule
Root module. Imports all feature modules and exports `getCorsOptions()`.

### PrismaModule (global)
- `PrismaService extends PrismaClient`
- Connects on init, disconnects on destroy, and logs the connection.

### AuthModule
- `ApiKeyStrategy`: header `X-API-Key`, keys from `API_KEYS`, timing-safe comparison.
- `ApiKeyGuard`: `AuthGuard('api-key')`, exported for use by controllers.

### PayoutsModule
| Piece | Responsibility |
|-------|----------------|
| `PayoutsController` | HTTP routes under `/payouts` |
| `PayoutsService` | CRUD-style payout operations, amount/enum validation |
| `AchRoutingService` | Pure routing decision logic (no DB access) |
| `ach-routing.config` | Route definitions (id, provider, min/max, priority, enabled) and fallback rail |
| DTOs | `CreatePayoutDto`, `UpdatePayoutStatusDto`, `RoutingInputDto` |
| Tests | `ach-routing.service.spec.ts` covers route selection, unknown rails, non-ACH rails, status handling, threshold boundaries, fallback and currency |

### LedgerModule
| Piece | Responsibility |
|-------|----------------|
| `LedgerController` | `GET /ledger` |
| `LedgerService` | Filtered, paginated reads |
| `LedgerQueryDto` | Query param validation |

## 4. Data model (Prisma)

```
Payout
  id (uuid), vendorId, amount Decimal(18,2), currency Char(3)="USD",
  rail, status="PENDING", externalTransactionId?, failureReason?,
  createdAt, updatedAt, ledgerEntries[]
  indexes: vendorId, status, rail

LedgerEntry
  id (uuid), type, amount Decimal(18,2), currency Char(3)="USD",
  vendorId?, payoutId?, createdAt, payout?  (onDelete: SetNull)
  indexes: vendorId, type, payoutId
```

Enums:
- `Rail`: ACH, PAYPAL, RTP, WALLET, MANUAL, OTHER
- `PayoutStatus`: PENDING, PROCESSING, COMPLETED, FAILED, REVERSED, REQUIRES_REVIEW
- `LedgerEntryType`: PAYOUT_DEBIT, PAYOUT_FEE, PAYOUT_REVERSAL, ADJUSTMENT_CREDIT, ADJUSTMENT_DEBIT

## 5. Implementation notes

- **Route ordering:** in `PayoutsController`, `GET pending` is declared before `GET :id`, so `pending` is not captured as an id. `GET :id` is declared before `GET vendor/:vendorId`. They don't collide because `:id` matches a single path segment and `vendor/:vendorId` has two. Keep static routes ahead of parameterized ones when adding new endpoints.
- **Global Prisma:** because `PrismaModule` is `@Global()`, new modules can inject `PrismaService` without importing it, although the existing modules import it explicitly.
- **Money handling:** amounts are decimal strings parsed into `Prisma.Decimal` (max 2 dp). Never use floats.
- **Read endpoints are open:** payout and ledger reads currently have no guard.
- **Ledger writes:** the code reviewed has no service that creates ledger entries. Only reads are exposed.
- **Validation duplication:** amount parsing exists in both `PayoutsService` and `AchRoutingService`. A shared helper would remove it.

## 6. Mental model

```
1. Client (with API key) creates a payout          → status PENDING
2. Routing endpoint advises rail/route/provider    → ACH primary / secondary / fallback
3. Payout status advances via PUT /:id/status      → PROCESSING → COMPLETED / FAILED / REVERSED
4. Ledger entries are queried for reporting/audit  → GET /ledger
```

## 7. Possible expansion

- Auth on read endpoints, role/scope-based keys
- Writing ledger entries transactionally when payout status changes
- Double-entry ledger semantics
- Persisting routing decisions on the payout
- Additional rails with their own routing services
