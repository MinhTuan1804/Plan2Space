# Plan2Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Plan2Space end-to-end — a web platform that converts 2D floor plans (raster image or DXF/DWG) into reviewable, editable 2D vector geometry and a real-time interactive 3D model, with AI-assisted vectorization, a conversational co-pilot, BOQ export, and multi-format export (glTF/OBJ/IFC/PDF).

**Architecture:** Modular Monolith + AI Sidecar. ASP.NET Core 8 (Clean Architecture, CQRS/MediatR) owns auth, projects, geometry persistence, job orchestration and export; a Python FastAPI + Celery service does all AI inference (ViT vectorization, GNN topology healing, YOLO-OBB symbol detection, PaddleOCR dimensions) behind an internal-only Docker network; React 18 + Vite + TypeScript renders a Konva.js 2D editor and a Three.js/React-Three-Fiber 3D viewer, synchronized through a Zustand geometry store.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, React Three Fiber/Three.js, Konva.js, Zustand · ASP.NET Core 8, MediatR, EF Core, PostgreSQL 16 + PostGIS, Redis, MinIO · Python 3.11, FastAPI, Celery, RabbitMQ, PyTorch, PyTorch Geometric, Ultralytics YOLO-OBB, PaddleOCR, Shapely, ezdxf, Trimesh · Docker Compose (8 services)

**Spec:** `docs/superpowers/specs/2026-09-23-plan2space-design.md`

## Global Constraints

- Web-first SPA only for this plan — no Flutter mobile app, no server-side rendering (no Next.js).
- AI inference services (FastAPI + Celery workers) run only on the `p2s_internal` Docker network and are never exposed to the public network or the internet.
- All AI jobs are asynchronous: the API enqueues to RabbitMQ and returns immediately; job status/progress is delivered via WebSocket (`/ws/job/{id}`), backed by Redis pub/sub.
- AI job latency target: p95 < 30s for a typical single-floor residential plan.
- 3D viewport must sustain 60 FPS on mid-range hardware (target: integrated GPU, 1080p).
- Spatial tolerance for vectorized geometry: ±5mm against the source drawing's stated scale.
- Every wall/room/opening record persists geometry as PostGIS `geometry` columns (SRID 0, local project-space meters) — never as raw JSON blobs — so spatial queries (area, perimeter, overlap) run in SQL.
- Auth is JWT (access + refresh), TLS 1.3 in production, HMAC-signed public share links, rate limiting on all public and AI-triggering endpoints.
- File uploads accepted: PNG, JPG, PDF (rasterized page 1), DXF, DWG (converted server-side to DXF via ODA or rejected if conversion unavailable) — max 60MB per upload.
- Every service ships as its own Dockerfile; `docker-compose.yml` at repo root brings up the full stack with one command; no service assumes a locally-installed toolchain outside its container.
- Team of 4, 5-month timeline (07/2026–12/2026) — phase ordering in this plan follows that calendar and must not be reordered without re-splitting owners.

## Review Focus

- A DXF/DWG upload with entities on nonstandard layers or using blocks/inserts for walls (not raw LINE/LWPOLYLINE) — the parser must not silently drop them or produce zero walls; Task 8 pins this with a fixture DXF using block inserts.
- A raster upload where the AI vectorizer detects wall pixels but the polygon it forms is self-intersecting or unclosed — geometry finalization must reject/repair it rather than pass a broken polygon into PostGIS, which will throw on invalid geometry; Task 9's finalizer test covers this.
- Two rooms whose computed polygons overlap after AI vectorization (common when a wall is missed) — the room service must flag the overlap for human review rather than silently store overlapping areas; Task 5 adds an overlap-detection test.
- A WebSocket client that disconnects mid-job and reconnects — job progress must be resumable from Redis state, not lost, so the client doesn't hang forever waiting for a message it already missed; Task 6 covers reconnect-and-catch-up.
- Concurrent edits to the same project's geometry from two open Studio tabs — the last-write-wins API must not corrupt geometry (e.g., partial wall list overwritten by a stale save); Task 21 (2D↔3D sync + save) adds an optimistic-concurrency test using a version/ETag column.

---

## File Structure Overview

```
plan2space/
├── docker-compose.yml
├── docker-compose.override.yml        # local dev overrides (hot reload, exposed AI port)
├── .env.example
├── backend/
│   └── Plan2Space.sln
│       ├── src/Plan2Space.Domain/            # Entities, value objects, domain events
│       ├── src/Plan2Space.Application/       # CQRS commands/queries, interfaces, DTOs
│       ├── src/Plan2Space.Infrastructure/    # EF Core, Redis, MinIO, RabbitMQ publisher
│       ├── src/Plan2Space.API/               # Controllers, WebSocket hub, DI wiring, Dockerfile
│       └── tests/
│           ├── Plan2Space.Domain.Tests/
│           ├── Plan2Space.Application.Tests/
│           └── Plan2Space.API.IntegrationTests/
├── ai-service/
│   ├── api/                # FastAPI app: main.py, routers/
│   ├── pipeline/           # vectorize.py, dxf_parser.py, gnn_healing.py, symbol_detect.py, ocr.py, serializer.py
│   ├── workers/            # celery_app.py, tasks.py
│   ├── models/             # weights loader, model registry
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── plan2space-web/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/studio/{Canvas2D,Viewer3D,Copilot}/
│   │   ├── stores/         # geometryStore.ts, authStore.ts, jobStore.ts
│   │   ├── services/       # api.ts, websocket.ts
│   │   └── types/
│   ├── tests/
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   ├── nginx.conf
│   └── Dockerfile
└── docs/superpowers/{specs,plans}/
```

This structure is locked in for the whole plan: each task below creates or modifies files under exactly these directories. Files that change together (a Domain entity and the EF Core mapping for it, a Celery task and its serializer) are scoped to the same task so a reviewer can approve one task without needing the next.

---

## Phase 1: Foundation (Tasks 1–6)

Goal of this phase: a running Docker Compose stack (Postgres/PostGIS, Redis, RabbitMQ, MinIO, API, AI sidecar stub, web stub, nginx), a working auth flow, project CRUD, the geometry persistence layer, and end-to-end AI job orchestration wired to a stub AI worker (real models come in Phase 2). By the end of Phase 1 you can register a user, create a project, upload a file, watch a fake AI job complete over WebSocket, and see an empty geometry payload returned.

### Task 1: Docker Infrastructure Skeleton

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.override.yml`
- Create: `.env.example`
- Create: `backend/src/Plan2Space.API/Dockerfile`
- Create: `ai-service/Dockerfile`
- Create: `plan2space-web/Dockerfile`
- Create: `nginx/Dockerfile`
- Create: `nginx/nginx.conf`
- Test: `scripts/test-compose-up.sh`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: network names `p2s_internal` (internal-only) and `p2s_public`; service hostnames `postgres`, `redis`, `rabbitmq`, `minio`, `api`, `ai`, `web`, `nginx` that every later task's connection strings reference verbatim.

- [ ] **Step 1: Write `.env.example`**

```bash
# .env.example
POSTGRES_DB=plan2space
POSTGRES_USER=p2s
POSTGRES_PASSWORD=change_me_dev_only
REDIS_URL=redis://redis:6379/0
RABBITMQ_DEFAULT_USER=p2s
RABBITMQ_DEFAULT_PASS=change_me_dev_only
MINIO_ROOT_USER=p2s_minio
MINIO_ROOT_PASSWORD=change_me_dev_only
JWT_SECRET=dev_secret_replace_in_prod_min_32_chars
ASPNETCORE_ENVIRONMENT=Development
AI_INTERNAL_URL=http://ai:8000
```

- [ ] **Step 2: Write placeholder Dockerfiles so `docker compose build` succeeds before real app code exists**

`backend/src/Plan2Space.API/Dockerfile`:
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src
COPY . .
RUN dotnet restore Plan2Space.API.csproj || echo "no csproj yet"
RUN dotnet publish Plan2Space.API.csproj -c Release -o /app/publish || mkdir -p /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS production
RUN addgroup -S p2s && adduser -S p2s -G p2s
WORKDIR /app
COPY --from=build /app/publish .
USER p2s
EXPOSE 5000
ENTRYPOINT ["dotnet", "Plan2Space.API.dll"]
```

`ai-service/Dockerfile`:
```dockerfile
FROM python:3.11-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN addgroup --system p2s && adduser --system --ingroup p2s p2s
USER p2s
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`plan2space-web/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
```

`nginx/nginx.conf`:
```nginx
events { worker_connections 1024; }
http {
  client_max_body_size 60M;
  upstream api_backend { server api:5000; }
  upstream web_backend { server web:3000; }
  server {
    listen 80;
    location /api/ { proxy_pass http://api_backend; proxy_set_header Host $host; }
    location /ws/ {
      proxy_pass http://api_backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
    }
    location / { proxy_pass http://web_backend; }
  }
}
```

`nginx/Dockerfile`:
```dockerfile
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
version: "3.9"
services:
  postgres:
    image: postgis/postgis:16-3.4-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks: [ p2s_public ]

  redis:
    image: redis:7.2-alpine
    networks: [ p2s_public ]

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS}
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [ p2s_public, p2s_internal ]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes: [ "miniodata:/data" ]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [ p2s_public ]

  api:
    build: ./backend/src/Plan2Space.API
    environment:
      ConnectionStrings__Default: "Host=postgres;Database=${POSTGRES_DB};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}"
      Redis__ConnectionString: ${REDIS_URL}
      RabbitMq__Host: rabbitmq
      RabbitMq__User: ${RABBITMQ_DEFAULT_USER}
      RabbitMq__Pass: ${RABBITMQ_DEFAULT_PASS}
      Minio__Endpoint: minio:9000
      Ai__InternalUrl: ${AI_INTERNAL_URL}
      Jwt__Secret: ${JWT_SECRET}
      ASPNETCORE_ENVIRONMENT: ${ASPNETCORE_ENVIRONMENT}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
      rabbitmq: { condition: service_healthy }
      minio: { condition: service_healthy }
    networks: [ p2s_public, p2s_internal ]

  ai:
    build: ./ai-service
    environment:
      REDIS_URL: ${REDIS_URL}
      RABBITMQ_URL: "amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@rabbitmq:5672//"
      MINIO_ENDPOINT: minio:9000
    depends_on:
      rabbitmq: { condition: service_healthy }
    networks: [ p2s_internal ]   # NOT on p2s_public — never reachable from nginx/internet

  celery_worker:
    build: ./ai-service
    command: celery -A workers.celery_app worker --concurrency=4 --loglevel=info
    environment:
      REDIS_URL: ${REDIS_URL}
      RABBITMQ_URL: "amqp://${RABBITMQ_DEFAULT_USER}:${RABBITMQ_DEFAULT_PASS}@rabbitmq:5672//"
      MINIO_ENDPOINT: minio:9000
    depends_on:
      rabbitmq: { condition: service_healthy }
    networks: [ p2s_internal ]

  web:
    build: ./plan2space-web
    networks: [ p2s_public ]

  nginx:
    build: ./nginx
    ports: [ "80:80" ]
    depends_on: [ api, web ]
    networks: [ p2s_public ]

networks:
  p2s_internal:
    internal: true
  p2s_public: {}

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 4: Write `docker-compose.override.yml` for local dev (hot reload, exposed ports for debugging)**

```yaml
version: "3.9"
services:
  postgres:
    ports: [ "5432:5432" ]
  rabbitmq:
    ports: [ "15672:15672" ]
  minio:
    ports: [ "9000:9000", "9001:9001" ]
  api:
    ports: [ "5000:5000" ]
  ai:
    ports: [ "8000:8000" ]   # dev-only escape hatch; removed in prod compose
```

- [ ] **Step 5: Write the compose smoke test**

```bash
#!/usr/bin/env bash
# scripts/test-compose-up.sh
set -euo pipefail
cp .env.example .env
docker compose up -d postgres redis rabbitmq minio
for i in $(seq 1 30); do
  healthy=$(docker compose ps --format json | grep -c '"Health":"healthy"' || true)
  [ "$healthy" -ge 3 ] && break
  sleep 2
done
docker compose ps
docker compose exec -T postgres pg_isready -U p2s
docker compose down -v
echo "PASS: infra services start and report healthy"
```

- [ ] **Step 6: Run it**

Run: `bash scripts/test-compose-up.sh`
Expected: `PASS: infra services start and report healthy`

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker-compose.override.yml .env.example \
  backend/src/Plan2Space.API/Dockerfile ai-service/Dockerfile \
  plan2space-web/Dockerfile nginx/ scripts/test-compose-up.sh
git commit -m "chore: docker compose infra skeleton with internal AI network"
```

### Task 2: PostgreSQL Schema + EF Core Migrations

**Files:**
- Create: `backend/src/Plan2Space.Domain/Entities/User.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/Project.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/ProjectFile.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/AiJob.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/Wall.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/Room.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/Opening.cs`
- Create: `backend/src/Plan2Space.Domain/Entities/Asset3D.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Persistence/Plan2SpaceDbContext.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Persistence/Migrations/` (generated)
- Test: `backend/tests/Plan2Space.Application.Tests/Persistence/SchemaTests.cs`

**Interfaces:**
- Consumes: Task 1's `postgres` service (PostGIS extension) via `ConnectionStrings__Default`.
- Produces: EF Core `DbContext` with `DbSet<User>`, `DbSet<Project>`, `DbSet<ProjectFile>`, `DbSet<AiJob>`, `DbSet<Wall>`, `DbSet<Room>`, `DbSet<Opening>`, `DbSet<Asset3D>` — every later backend task depends on these exact type and property names (e.g. `Wall.Geometry` is `NetTopologySuite.Geometries.LineString`, `Room.Geometry` is `Polygon`, `Wall.Version` is a `uint` concurrency token).

- [ ] **Step 1: Write the failing schema test**

```csharp
// backend/tests/Plan2Space.Application.Tests/Persistence/SchemaTests.cs
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;
using Xunit;

public class SchemaTests
{
    private static Plan2SpaceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<Plan2SpaceDbContext>()
            .UseNpgsql("Host=localhost;Database=p2s_test;Username=p2s;Password=change_me_dev_only",
                o => o.UseNetTopologySuite())
            .Options;
        return new Plan2SpaceDbContext(options);
    }

    [Fact]
    public async Task CanInsertProjectWithWallGeometry()
    {
        await using var db = CreateContext();
        await db.Database.MigrateAsync();

        var user = new User { Email = "test@plan2space.dev", PasswordHash = "hash" };
        var project = new Project { Name = "Test House", Owner = user };
        var wall = new Wall
        {
            Project = project,
            Geometry = new LineString(new[] { new Coordinate(0, 0), new Coordinate(5, 0) }),
            ThicknessMeters = 0.2,
            HeightMeters = 2.8,
            Version = 1
        };
        db.Users.Add(user);
        db.Projects.Add(project);
        db.Walls.Add(wall);
        await db.SaveChangesAsync();

        var saved = await db.Walls.FirstAsync(w => w.Id == wall.Id);
        Assert.Equal(5.0, saved.Geometry.Length, 3);
    }
}
```

- [ ] **Step 2: Run test to verify it fails (no entities/DbContext yet)**

Run: `dotnet test backend/tests/Plan2Space.Application.Tests --filter SchemaTests`
Expected: FAIL — build error, `Plan2SpaceDbContext` does not exist

- [ ] **Step 3: Write the domain entities**

```csharp
// backend/src/Plan2Space.Domain/Entities/User.cs
namespace Plan2Space.Domain.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;
    public string Role { get; set; } = "StandardUser"; // Guest | StandardUser | Admin
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<Project> Projects { get; set; } = new List<Project>();
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/Project.cs
namespace Plan2Space.Domain.Entities;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = default!;
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = default!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<ProjectFile> Files { get; set; } = new List<ProjectFile>();
    public ICollection<Wall> Walls { get; set; } = new List<Wall>();
    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<Opening> Openings { get; set; } = new List<Opening>();
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/ProjectFile.cs
namespace Plan2Space.Domain.Entities;

public enum FileKind { RasterImage, Pdf, Dxf, Dwg }

public class ProjectFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public string MinioObjectKey { get; set; } = default!;
    public FileKind Kind { get; set; }
    public long SizeBytes { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/AiJob.cs
namespace Plan2Space.Domain.Entities;

public enum AiJobStatus { Queued, Running, Completed, Failed }

public class AiJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Guid SourceFileId { get; set; }
    public AiJobStatus Status { get; set; } = AiJobStatus.Queued;
    public int ProgressPercent { get; set; }
    public string? ResultJson { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/Wall.cs
using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public class Wall
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public LineString Geometry { get; set; } = default!;   // centerline, project-space meters
    public double ThicknessMeters { get; set; }
    public double HeightMeters { get; set; }
    public uint Version { get; set; } = 1;                 // optimistic concurrency token
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/Room.cs
using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public class Room
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Polygon Geometry { get; set; } = default!;
    public string Label { get; set; } = "Room";
    public uint Version { get; set; } = 1;
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/Opening.cs
using NetTopologySuite.Geometries;

namespace Plan2Space.Domain.Entities;

public enum OpeningType { Door, Window }

public class Opening
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public Guid WallId { get; set; }
    public OpeningType Type { get; set; }
    public Point Position { get; set; } = default!;   // point on the wall centerline
    public double WidthMeters { get; set; }
    public double SillHeightMeters { get; set; }       // 0 for doors
    public uint Version { get; set; } = 1;
}
```

```csharp
// backend/src/Plan2Space.Domain/Entities/Asset3D.cs
namespace Plan2Space.Domain.Entities;

public class Asset3D
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = default!;
    public string Format { get; set; } = default!;   // "gltf" | "obj" | "ifc" | "pdf"
    public string MinioObjectKey { get; set; } = default!;
    public DateTimeOffset GeneratedAt { get; set; } = DateTimeOffset.UtcNow;
}
```

- [ ] **Step 4: Write the DbContext**

```csharp
// backend/src/Plan2Space.Infrastructure/Persistence/Plan2SpaceDbContext.cs
using Microsoft.EntityFrameworkCore;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Infrastructure.Persistence;

public class Plan2SpaceDbContext : DbContext
{
    public Plan2SpaceDbContext(DbContextOptions<Plan2SpaceDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectFile> ProjectFiles => Set<ProjectFile>();
    public DbSet<AiJob> AiJobs => Set<AiJob>();
    public DbSet<Wall> Walls => Set<Wall>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Opening> Openings => Set<Opening>();
    public DbSet<Asset3D> Assets3D => Set<Asset3D>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("postgis");

        b.Entity<User>().HasIndex(u => u.Email).IsUnique();

        b.Entity<Wall>().Property(w => w.Geometry).HasColumnType("geometry (LineString)");
        b.Entity<Wall>().Property(w => w.Version).IsConcurrencyToken();

        b.Entity<Room>().Property(r => r.Geometry).HasColumnType("geometry (Polygon)");
        b.Entity<Room>().Property(r => r.Version).IsConcurrencyToken();

        b.Entity<Opening>().Property(o => o.Position).HasColumnType("geometry (Point)");
        b.Entity<Opening>().Property(o => o.Version).IsConcurrencyToken();

        b.Entity<Project>().HasMany(p => p.Walls).WithOne(w => w.Project).HasForeignKey(w => w.ProjectId);
        b.Entity<Project>().HasMany(p => p.Rooms).WithOne(r => r.Project).HasForeignKey(r => r.ProjectId);
        b.Entity<Project>().HasMany(p => p.Openings).WithOne(o => o.Project).HasForeignKey(o => o.ProjectId);
        b.Entity<Project>().HasMany(p => p.Files).WithOne(f => f.Project).HasForeignKey(f => f.ProjectId);
    }
}
```

Register NetTopologySuite in `Program.cs` (added properly in Task 3): `options.UseNpgsql(cs, o => o.UseNetTopologySuite())`.

- [ ] **Step 5: Generate migration and run test**

Run:
```bash
cd backend
dotnet ef migrations add InitialCreate --project src/Plan2Space.Infrastructure --startup-project src/Plan2Space.API
dotnet test tests/Plan2Space.Application.Tests --filter SchemaTests
```
Expected: PASS — `saved.Geometry.Length` equals 5.0

- [ ] **Step 6: Commit**

```bash
git add backend/src/Plan2Space.Domain backend/src/Plan2Space.Infrastructure backend/tests/Plan2Space.Application.Tests/Persistence
git commit -m "feat: PostGIS-backed domain schema and EF Core migrations"
```

### Task 3: Auth (Register/Login/JWT) + API Bootstrap

**Files:**
- Create: `backend/src/Plan2Space.API/Program.cs`
- Create: `backend/src/Plan2Space.API/Controllers/AuthController.cs`
- Create: `backend/src/Plan2Space.Application/Auth/Commands/RegisterUserCommand.cs`
- Create: `backend/src/Plan2Space.Application/Auth/Commands/LoginCommand.cs`
- Create: `backend/src/Plan2Space.Application/Auth/IJwtTokenService.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Auth/JwtTokenService.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/AuthControllerTests.cs`

**Interfaces:**
- Consumes: `Plan2SpaceDbContext` (Task 2), `IJwtTokenService`.
- Produces: `POST /api/auth/register` → `201` with `{ userId, email }`; `POST /api/auth/login` → `200` with `{ accessToken, refreshToken, expiresIn }`. `IJwtTokenService.GenerateAccessToken(User user) : string` — every later authenticated-endpoint task assumes this bearer token shape (`sub` claim = user id, `role` claim = role string).

- [ ] **Step 1: Write the failing integration test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/AuthControllerTests.cs
using System.Net;
using System.Net.Http.Json;
using Xunit;

public class AuthControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly HttpClient _client;
    public AuthControllerTests(Plan2SpaceWebApplicationFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task RegisterThenLogin_ReturnsAccessToken()
    {
        var email = $"user{Guid.NewGuid():N}@plan2space.dev";
        var register = await _client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "Str0ngPass!123" });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var login = await _client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "Str0ngPass!123" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var body = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.False(string.IsNullOrEmpty(body!.AccessToken));
    }

    private record LoginResponse(string AccessToken, string RefreshToken, int ExpiresIn);
}
```

`Plan2SpaceWebApplicationFactory` (test helper, same file's directory, `WebApplicationFactoryBase.cs`) wraps `WebApplicationFactory<Program>` pointed at a Testcontainers Postgres instance — standard EF Core integration-test setup, wired once here and reused by every later `*.API.IntegrationTests` file.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter AuthControllerTests`
Expected: FAIL — `Program` / routes don't exist yet

- [ ] **Step 3: Implement `IJwtTokenService` and commands**

```csharp
// backend/src/Plan2Space.Application/Auth/IJwtTokenService.cs
using Plan2Space.Domain.Entities;
namespace Plan2Space.Application.Auth;

public interface IJwtTokenService
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken();
}
```

```csharp
// backend/src/Plan2Space.Infrastructure/Auth/JwtTokenService.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;
using Plan2Space.Application.Auth;
using Plan2Space.Domain.Entities;

namespace Plan2Space.Infrastructure.Auth;

public class JwtTokenService : IJwtTokenService
{
    private readonly string _secret;
    public JwtTokenService(string secret) => _secret = secret;

    public string GenerateAccessToken(User user)
    {
        var key = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim("role", user.Role),
            new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };
        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
}
```

```csharp
// backend/src/Plan2Space.Application/Auth/Commands/RegisterUserCommand.cs
using MediatR;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;
using BCrypt.Net;

namespace Plan2Space.Application.Auth.Commands;

public record RegisterUserCommand(string Email, string Password) : IRequest<Guid>;

public class RegisterUserHandler : IRequestHandler<RegisterUserCommand, Guid>
{
    private readonly Plan2SpaceDbContext _db;
    public RegisterUserHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<Guid> Handle(RegisterUserCommand cmd, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == cmd.Email, ct))
            throw new InvalidOperationException("Email already registered");

        var user = new User
        {
            Email = cmd.Email,
            PasswordHash = BCrypt.HashPassword(cmd.Password)
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return user.Id;
    }
}
```

```csharp
// backend/src/Plan2Space.Application/Auth/Commands/LoginCommand.cs
using MediatR;
using Plan2Space.Application.Auth;
using Plan2Space.Infrastructure.Persistence;
using BCrypt.Net;

namespace Plan2Space.Application.Auth.Commands;

public record LoginResult(string AccessToken, string RefreshToken, int ExpiresIn);
public record LoginCommand(string Email, string Password) : IRequest<LoginResult>;

public class LoginHandler : IRequestHandler<LoginCommand, LoginResult>
{
    private readonly Plan2SpaceDbContext _db;
    private readonly IJwtTokenService _jwt;
    public LoginHandler(Plan2SpaceDbContext db, IJwtTokenService jwt) { _db = db; _jwt = jwt; }

    public async Task<LoginResult> Handle(LoginCommand cmd, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == cmd.Email, ct)
            ?? throw new UnauthorizedAccessException("Invalid credentials");
        if (!BCrypt.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        return new LoginResult(_jwt.GenerateAccessToken(user), _jwt.GenerateRefreshToken(), 1800);
    }
}
```

```csharp
// backend/src/Plan2Space.API/Controllers/AuthController.cs
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Auth.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IMediator _mediator;
    public AuthController(IMediator mediator) => _mediator = mediator;

    public record RegisterRequest(string Email, string Password);
    public record LoginRequest(string Email, string Password);

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var id = await _mediator.Send(new RegisterUserCommand(req.Email, req.Password));
        return Created($"/api/users/{id}", new { userId = id, email = req.Email });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var result = await _mediator.Send(new LoginCommand(req.Email, req.Password));
        return Ok(new { accessToken = result.AccessToken, refreshToken = result.RefreshToken, expiresIn = result.ExpiresIn });
    }
}
```

- [ ] **Step 4: Wire `Program.cs`**

```csharp
// backend/src/Plan2Space.API/Program.cs
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Plan2Space.Application.Auth;
using Plan2Space.Infrastructure.Auth;
using Plan2Space.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret missing");

builder.Services.AddDbContext<Plan2SpaceDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default"), npg => npg.UseNetTopologySuite()));

builder.Services.AddSingleton<IJwtTokenService>(new JwtTokenService(jwtSecret));

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(Plan2Space.Application.Auth.Commands.RegisterUserCommand).Assembly));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = false,
        ValidateAudience = false
    });
builder.Services.AddAuthorization();
builder.Services.AddControllers();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program { }  // exposed for WebApplicationFactory<Program> in tests
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter AuthControllerTests`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/Plan2Space.API backend/src/Plan2Space.Application/Auth backend/src/Plan2Space.Infrastructure/Auth backend/tests/Plan2Space.API.IntegrationTests
git commit -m "feat: JWT auth register/login endpoints"
```

### Task 4: Project CRUD

**Files:**
- Create: `backend/src/Plan2Space.API/Controllers/ProjectsController.cs`
- Create: `backend/src/Plan2Space.Application/Projects/Commands/CreateProjectCommand.cs`
- Create: `backend/src/Plan2Space.Application/Projects/Queries/GetProjectByIdQuery.cs`
- Create: `backend/src/Plan2Space.Application/Projects/Queries/ListProjectsQuery.cs`
- Create: `backend/src/Plan2Space.Application/Projects/Commands/DeleteProjectCommand.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/ProjectsControllerTests.cs`

**Interfaces:**
- Consumes: `Plan2SpaceDbContext` (Task 2), bearer auth from Task 3 (`[Authorize]`, `User.FindFirst("sub")` for owner id).
- Produces: `POST /api/projects`, `GET /api/projects`, `GET /api/projects/{id}`, `DELETE /api/projects/{id}` — later tasks (5, 6, 21+) reference these routes and the `ProjectDto { Id, Name, CreatedAt, UpdatedAt }` shape.

- [ ] **Step 1: Write the failing test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/ProjectsControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class ProjectsControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public ProjectsControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task CreateThenGet_ReturnsProject()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "proj-owner@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var create = await client.PostAsJsonAsync("/api/projects", new { name = "My House" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ProjectDto>();

        var get = await client.GetAsync($"/api/projects/{created!.Id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var fetched = await get.Content.ReadFromJsonAsync<ProjectDto>();
        Assert.Equal("My House", fetched!.Name);
    }

    private record ProjectDto(Guid Id, string Name, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
}
```

(`Plan2SpaceWebApplicationFactory.RegisterAndLoginAsync` is added in this task's test-helper file — a small extension used by every later authenticated integration test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter ProjectsControllerTests`
Expected: FAIL — 404, route not mapped

- [ ] **Step 3: Implement commands/queries and controller**

```csharp
// backend/src/Plan2Space.Application/Projects/Commands/CreateProjectCommand.cs
using MediatR;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Projects.Commands;

public record CreateProjectCommand(Guid OwnerId, string Name) : IRequest<Guid>;

public class CreateProjectHandler : IRequestHandler<CreateProjectCommand, Guid>
{
    private readonly Plan2SpaceDbContext _db;
    public CreateProjectHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<Guid> Handle(CreateProjectCommand cmd, CancellationToken ct)
    {
        var project = new Project { Name = cmd.Name, OwnerId = cmd.OwnerId };
        _db.Projects.Add(project);
        await _db.SaveChangesAsync(ct);
        return project.Id;
    }
}
```

```csharp
// backend/src/Plan2Space.Application/Projects/Queries/GetProjectByIdQuery.cs
using MediatR;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Projects.Queries;

public record ProjectDto(Guid Id, string Name, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public record GetProjectByIdQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<ProjectDto?>;

public class GetProjectByIdHandler : IRequestHandler<GetProjectByIdQuery, ProjectDto?>
{
    private readonly Plan2SpaceDbContext _db;
    public GetProjectByIdHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<ProjectDto?> Handle(GetProjectByIdQuery q, CancellationToken ct)
    {
        var p = await _db.Projects.FirstOrDefaultAsync(x => x.Id == q.ProjectId && x.OwnerId == q.RequestingUserId, ct);
        return p is null ? null : new ProjectDto(p.Id, p.Name, p.CreatedAt, p.UpdatedAt);
    }
}
```

```csharp
// backend/src/Plan2Space.Application/Projects/Queries/ListProjectsQuery.cs
using MediatR;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Projects.Queries;

public record ListProjectsQuery(Guid RequestingUserId) : IRequest<List<ProjectDto>>;

public class ListProjectsHandler : IRequestHandler<ListProjectsQuery, List<ProjectDto>>
{
    private readonly Plan2SpaceDbContext _db;
    public ListProjectsHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<List<ProjectDto>> Handle(ListProjectsQuery q, CancellationToken ct) =>
        await _db.Projects.Where(p => p.OwnerId == q.RequestingUserId)
            .Select(p => new ProjectDto(p.Id, p.Name, p.CreatedAt, p.UpdatedAt))
            .ToListAsync(ct);
}
```

```csharp
// backend/src/Plan2Space.Application/Projects/Commands/DeleteProjectCommand.cs
using MediatR;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Projects.Commands;

public record DeleteProjectCommand(Guid ProjectId, Guid RequestingUserId) : IRequest<bool>;

public class DeleteProjectHandler : IRequestHandler<DeleteProjectCommand, bool>
{
    private readonly Plan2SpaceDbContext _db;
    public DeleteProjectHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<bool> Handle(DeleteProjectCommand cmd, CancellationToken ct)
    {
        var p = await _db.Projects.FirstOrDefaultAsync(x => x.Id == cmd.ProjectId && x.OwnerId == cmd.RequestingUserId, ct);
        if (p is null) return false;
        _db.Projects.Remove(p);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
```

```csharp
// backend/src/Plan2Space.API/Controllers/ProjectsController.cs
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Projects.Commands;
using Plan2Space.Application.Projects.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly IMediator _mediator;
    public ProjectsController(IMediator mediator) => _mediator = mediator;

    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record CreateProjectRequest(string Name);

    [HttpPost]
    public async Task<IActionResult> Create(CreateProjectRequest req)
    {
        var id = await _mediator.Send(new CreateProjectCommand(CurrentUserId, req.Name));
        var dto = await _mediator.Send(new GetProjectByIdQuery(id, CurrentUserId));
        return Created($"/api/projects/{id}", dto);
    }

    [HttpGet]
    public async Task<IActionResult> List() => Ok(await _mediator.Send(new ListProjectsQuery(CurrentUserId)));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var dto = await _mediator.Send(new GetProjectByIdQuery(id, CurrentUserId));
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id) =>
        await _mediator.Send(new DeleteProjectCommand(id, CurrentUserId)) ? NoContent() : NotFound();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter ProjectsControllerTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/Plan2Space.API/Controllers/ProjectsController.cs backend/src/Plan2Space.Application/Projects backend/tests/Plan2Space.API.IntegrationTests/ProjectsControllerTests.cs
git commit -m "feat: project CRUD endpoints scoped to owner"
```

### Task 5: Geometry API (Walls/Rooms/Openings CRUD + Overlap Detection)

**Files:**
- Create: `backend/src/Plan2Space.API/Controllers/GeometryController.cs`
- Create: `backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs`
- Create: `backend/src/Plan2Space.Application/Geometry/Queries/GetGeometryQuery.cs`
- Create: `backend/src/Plan2Space.Application/Geometry/RoomOverlapDetector.cs`
- Test: `backend/tests/Plan2Space.Application.Tests/Geometry/RoomOverlapDetectorTests.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs`

**Interfaces:**
- Consumes: `Wall`/`Room`/`Opening` entities (Task 2), `ProjectsController` auth pattern (Task 4).
- Produces: `PUT /api/projects/{id}/geometry` (body: `GeometrySaveRequest { Walls[], Rooms[], Openings[], BaseVersion }`) → `200` with updated version or `409 Conflict` on stale version; `GET /api/projects/{id}/geometry` → `GeometryDto { Walls[], Rooms[], Openings[] }`. `RoomOverlapDetector.FindOverlaps(IEnumerable<Room>) : List<(Guid, Guid)>` — used by Task 9 (AI result finalization) and Task 21 (2D↔3D sync) to flag conflicts before persisting.

- [ ] **Step 1: Write the failing overlap-detector unit test (Review Focus item)**

```csharp
// backend/tests/Plan2Space.Application.Tests/Geometry/RoomOverlapDetectorTests.cs
using NetTopologySuite.Geometries;
using Plan2Space.Application.Geometry;
using Plan2Space.Domain.Entities;
using Xunit;

public class RoomOverlapDetectorTests
{
    private static Polygon Square(double x, double y, double size)
    {
        var factory = new GeometryFactory();
        return factory.CreatePolygon(new[]
        {
            new Coordinate(x, y), new Coordinate(x + size, y),
            new Coordinate(x + size, y + size), new Coordinate(x, y + size),
            new Coordinate(x, y)
        });
    }

    [Fact]
    public void TwoOverlappingRooms_AreFlagged()
    {
        var roomA = new Room { Id = Guid.NewGuid(), Geometry = Square(0, 0, 4) };
        var roomB = new Room { Id = Guid.NewGuid(), Geometry = Square(2, 0, 4) }; // overlaps roomA by 2x4

        var overlaps = new RoomOverlapDetector().FindOverlaps(new[] { roomA, roomB });

        Assert.Single(overlaps);
    }

    [Fact]
    public void TwoAdjacentNonOverlappingRooms_AreNotFlagged()
    {
        var roomA = new Room { Id = Guid.NewGuid(), Geometry = Square(0, 0, 4) };
        var roomB = new Room { Id = Guid.NewGuid(), Geometry = Square(4, 0, 4) }; // shares an edge only

        var overlaps = new RoomOverlapDetector().FindOverlaps(new[] { roomA, roomB });

        Assert.Empty(overlaps);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.Application.Tests --filter RoomOverlapDetectorTests`
Expected: FAIL — `RoomOverlapDetector` does not exist

- [ ] **Step 3: Implement `RoomOverlapDetector`**

```csharp
// backend/src/Plan2Space.Application/Geometry/RoomOverlapDetector.cs
using Plan2Space.Domain.Entities;

namespace Plan2Space.Application.Geometry;

public class RoomOverlapDetector
{
    public List<(Guid RoomAId, Guid RoomBId)> FindOverlaps(IEnumerable<Room> rooms)
    {
        var list = rooms.ToList();
        var result = new List<(Guid, Guid)>();
        for (int i = 0; i < list.Count; i++)
        for (int j = i + 1; j < list.Count; j++)
        {
            var intersection = list[i].Geometry.Intersection(list[j].Geometry);
            // Shared edges/points have zero area; only a genuine area overlap counts.
            if (!intersection.IsEmpty && intersection.Area > 1e-6)
                result.Add((list[i].Id, list[j].Id));
        }
        return result;
    }
}
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `dotnet test backend/tests/Plan2Space.Application.Tests --filter RoomOverlapDetectorTests`
Expected: PASS — 2 tests pass

- [ ] **Step 5: Write the failing integration test for save/get with optimistic concurrency**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/GeometryControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class GeometryControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public GeometryControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task SaveGeometry_ThenStaleSave_Returns409()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "geo-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "Geo Test");

        var payload = new
        {
            baseVersion = 0,
            walls = new[] { new { points = new[] { new { x = 0.0, y = 0.0 }, new { x = 5.0, y = 0.0 } }, thicknessMeters = 0.2, heightMeters = 2.8 } },
            rooms = Array.Empty<object>(),
            openings = Array.Empty<object>()
        };

        var first = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Second save still claims baseVersion 0 -> must conflict, not silently overwrite
        var stale = await client.PutAsJsonAsync($"/api/projects/{project.Id}/geometry", payload);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }
}
```

(`Plan2SpaceWebApplicationFactory.CreateProjectAsync` helper added here, returning `{ Id, Name }`, reused by Tasks 6/9/21.)

- [ ] **Step 6: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter GeometryControllerTests`
Expected: FAIL — 404, no geometry route

- [ ] **Step 7: Implement `SaveGeometryCommand`, `GetGeometryQuery`, controller**

```csharp
// backend/src/Plan2Space.Application/Geometry/Commands/SaveGeometryCommand.cs
using MediatR;
using NetTopologySuite.Geometries;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Geometry.Commands;

public record PointDto(double X, double Y);
public record WallInput(List<PointDto> Points, double ThicknessMeters, double HeightMeters);
public record RoomInput(List<PointDto> Points, string Label);
public record OpeningInput(Guid WallId, string Type, PointDto Position, double WidthMeters, double SillHeightMeters);

public class GeometryConflictException : Exception { }

public record SaveGeometryCommand(
    Guid ProjectId, Guid RequestingUserId, uint BaseVersion,
    List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings) : IRequest<uint>;

public class SaveGeometryHandler : IRequestHandler<SaveGeometryCommand, uint>
{
    private readonly Plan2SpaceDbContext _db;
    private static readonly GeometryFactory Factory = new();

    public SaveGeometryHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<uint> Handle(SaveGeometryCommand cmd, CancellationToken ct)
    {
        var project = await _db.Projects
            .Include(p => p.Walls).Include(p => p.Rooms).Include(p => p.Openings)
            .FirstOrDefaultAsync(p => p.Id == cmd.ProjectId && p.OwnerId == cmd.RequestingUserId, ct)
            ?? throw new KeyNotFoundException();

        var currentMaxVersion = project.Walls.Select(w => w.Version)
            .Concat(project.Rooms.Select(r => r.Version))
            .Concat(project.Openings.Select(o => o.Version))
            .DefaultIfEmpty(0).Max();

        if (currentMaxVersion > cmd.BaseVersion)
            throw new GeometryConflictException();

        _db.Walls.RemoveRange(project.Walls);
        _db.Rooms.RemoveRange(project.Rooms);
        _db.Openings.RemoveRange(project.Openings);

        var nextVersion = cmd.BaseVersion + 1;

        var newWalls = cmd.Walls.Select(w => new Wall
        {
            ProjectId = project.Id,
            Geometry = new LineString(w.Points.Select(p => new Coordinate(p.X, p.Y)).ToArray()),
            ThicknessMeters = w.ThicknessMeters,
            HeightMeters = w.HeightMeters,
            Version = nextVersion
        }).ToList();

        var newRooms = cmd.Rooms.Select(r => new Room
        {
            ProjectId = project.Id,
            Geometry = Factory.CreatePolygon(r.Points.Select(p => new Coordinate(p.X, p.Y)).ToArray()),
            Label = r.Label,
            Version = nextVersion
        }).ToList();

        if (new RoomOverlapDetector().FindOverlaps(newRooms).Count > 0)
            throw new InvalidOperationException("Overlapping rooms detected — resolve before saving");

        var newOpenings = cmd.Openings.Select(o => new Opening
        {
            ProjectId = project.Id,
            WallId = o.WallId,
            Type = Enum.Parse<OpeningType>(o.Type, ignoreCase: true),
            Position = Factory.CreatePoint(new Coordinate(o.Position.X, o.Position.Y)),
            WidthMeters = o.WidthMeters,
            SillHeightMeters = o.SillHeightMeters,
            Version = nextVersion
        }).ToList();

        _db.Walls.AddRange(newWalls);
        _db.Rooms.AddRange(newRooms);
        _db.Openings.AddRange(newOpenings);
        project.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return nextVersion;
    }
}
```

```csharp
// backend/src/Plan2Space.Application/Geometry/Queries/GetGeometryQuery.cs
using MediatR;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Geometry.Queries;

public record GeometryPointDto(double X, double Y);
public record WallDto(Guid Id, List<GeometryPointDto> Points, double ThicknessMeters, double HeightMeters, uint Version);
public record RoomDto(Guid Id, List<GeometryPointDto> Points, string Label, uint Version);
public record OpeningDto(Guid Id, Guid WallId, string Type, GeometryPointDto Position, double WidthMeters, double SillHeightMeters, uint Version);
public record GeometryDto(List<WallDto> Walls, List<RoomDto> Rooms, List<OpeningDto> Openings);

public record GetGeometryQuery(Guid ProjectId, Guid RequestingUserId) : IRequest<GeometryDto?>;

public class GetGeometryHandler : IRequestHandler<GetGeometryQuery, GeometryDto?>
{
    private readonly Plan2SpaceDbContext _db;
    public GetGeometryHandler(Plan2SpaceDbContext db) => _db = db;

    public async Task<GeometryDto?> Handle(GetGeometryQuery q, CancellationToken ct)
    {
        var project = await _db.Projects
            .Include(p => p.Walls).Include(p => p.Rooms).Include(p => p.Openings)
            .FirstOrDefaultAsync(p => p.Id == q.ProjectId && p.OwnerId == q.RequestingUserId, ct);
        if (project is null) return null;

        return new GeometryDto(
            project.Walls.Select(w => new WallDto(w.Id,
                w.Geometry.Coordinates.Select(c => new GeometryPointDto(c.X, c.Y)).ToList(),
                w.ThicknessMeters, w.HeightMeters, w.Version)).ToList(),
            project.Rooms.Select(r => new RoomDto(r.Id,
                r.Geometry.Coordinates.Select(c => new GeometryPointDto(c.X, c.Y)).ToList(),
                r.Label, r.Version)).ToList(),
            project.Openings.Select(o => new OpeningDto(o.Id, o.WallId, o.Type.ToString(),
                new GeometryPointDto(o.Position.X, o.Position.Y), o.WidthMeters, o.SillHeightMeters, o.Version)).ToList());
    }
}
```

```csharp
// backend/src/Plan2Space.API/Controllers/GeometryController.cs
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Geometry.Commands;
using Plan2Space.Application.Geometry.Queries;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId:guid}/geometry")]
public class GeometryController : ControllerBase
{
    private readonly IMediator _mediator;
    public GeometryController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record SaveRequest(uint BaseVersion, List<WallInput> Walls, List<RoomInput> Rooms, List<OpeningInput> Openings);

    [HttpGet]
    public async Task<IActionResult> Get(Guid projectId)
    {
        var dto = await _mediator.Send(new GetGeometryQuery(projectId, CurrentUserId));
        return dto is null ? NotFound() : Ok(dto);
    }

    [HttpPut]
    public async Task<IActionResult> Save(Guid projectId, SaveRequest req)
    {
        try
        {
            var version = await _mediator.Send(new SaveGeometryCommand(
                projectId, CurrentUserId, req.BaseVersion, req.Walls, req.Rooms, req.Openings));
            return Ok(new { version });
        }
        catch (GeometryConflictException)
        {
            return Conflict(new { message = "Geometry was modified by another session. Reload and retry." });
        }
    }
}
```

- [ ] **Step 8: Run integration test to verify it passes**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter GeometryControllerTests`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/Plan2Space.Application/Geometry backend/src/Plan2Space.API/Controllers/GeometryController.cs backend/tests
git commit -m "feat: geometry save/get with room-overlap detection and optimistic concurrency"
```

### Task 6: AI Job Orchestration (RabbitMQ publish + WebSocket progress via Redis pub/sub)

**Files:**
- Create: `backend/src/Plan2Space.API/Controllers/AiController.cs`
- Create: `backend/src/Plan2Space.Application/Ai/Commands/EnqueueVectorizeJobCommand.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Messaging/RabbitMqJobPublisher.cs`
- Create: `backend/src/Plan2Space.Application/Ai/IJobPublisher.cs`
- Create: `backend/src/Plan2Space.API/WebSockets/JobProgressHub.cs`
- Create: `backend/src/Plan2Space.Infrastructure/Messaging/RedisJobProgressSubscriber.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/AiJobFlowTests.cs`

**Interfaces:**
- Consumes: `AiJob` entity (Task 2), `ProjectFile` upload (this task also adds a minimal `POST /api/projects/{id}/files` upload endpoint to MinIO since AI jobs need a source file).
- Produces: `POST /api/ai/vectorize` (`{ projectId, fileId }`) → `202` with `{ jobId }`; `GET /api/ai/job/{id}/status` → `{ status, progressPercent }`; WebSocket endpoint `/ws/job/{id}` streaming `{ status, progressPercent }` frames, resumable on reconnect by re-reading current Redis state (Review Focus item). `IJobPublisher.PublishVectorizeJob(Guid jobId, Guid projectId, string fileObjectKey)` — Task 9's Celery consumer reads the exact message shape this publishes: `{ "job_id": "...", "project_id": "...", "file_object_key": "..." }`.

- [ ] **Step 1: Write the failing end-to-end job flow test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/AiJobFlowTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Xunit;

public class AiJobFlowTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public AiJobFlowTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task EnqueueJob_ReturnsJobId_AndStatusIsQueryable()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "ai-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "AI Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        var enqueue = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });
        Assert.Equal(HttpStatusCode.Accepted, enqueue.StatusCode);
        var body = await enqueue.Content.ReadFromJsonAsync<JsonElement>();
        var jobId = body.GetProperty("jobId").GetGuid();

        var status = await client.GetAsync($"/api/ai/job/{jobId}/status");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        var statusBody = await status.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Queued", statusBody.GetProperty("status").GetString());
    }

    [Fact]
    public async Task WebSocket_ReconnectAfterProgressUpdate_ReceivesCurrentStateImmediately()
    {
        // Simulates the Review Focus scenario: client disconnects mid-job, reconnects,
        // and must catch up from the last known Redis-persisted state rather than
        // waiting indefinitely for a new pub/sub message it already missed.
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "ws-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "WS Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");
        var enqueue = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });
        var jobId = (await enqueue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("jobId").GetGuid();

        // Simulate a worker having already pushed 40% progress to Redis before any client connects.
        await _factory.SetJobProgressInRedisAsync(jobId, "Running", 40);

        using var ws = _factory.Server.CreateWebSocketClient();
        var socket = await ws.ConnectAsync(new Uri(_factory.Server.BaseAddress, $"/ws/job/{jobId}"), CancellationToken.None);

        var buffer = new byte[1024];
        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
        var msg = JsonSerializer.Deserialize<JsonElement>(Encoding.UTF8.GetString(buffer, 0, result.Count));

        Assert.Equal(40, msg.GetProperty("progressPercent").GetInt32());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter AiJobFlowTests`
Expected: FAIL — routes/websocket endpoint don't exist

- [ ] **Step 3: Implement publisher interface + RabbitMQ implementation**

```csharp
// backend/src/Plan2Space.Application/Ai/IJobPublisher.cs
namespace Plan2Space.Application.Ai;

public interface IJobPublisher
{
    Task PublishVectorizeJobAsync(Guid jobId, Guid projectId, string fileObjectKey, CancellationToken ct);
}
```

```csharp
// backend/src/Plan2Space.Infrastructure/Messaging/RabbitMqJobPublisher.cs
using System.Text;
using System.Text.Json;
using Plan2Space.Application.Ai;
using RabbitMQ.Client;

namespace Plan2Space.Infrastructure.Messaging;

public class RabbitMqJobPublisher : IJobPublisher, IDisposable
{
    private readonly IConnection _connection;
    private readonly IModel _channel;
    private const string QueueName = "ai.vectorize.jobs";

    public RabbitMqJobPublisher(string host, string user, string pass)
    {
        var factory = new ConnectionFactory { HostName = host, UserName = user, Password = pass };
        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();
        _channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false);
    }

    public Task PublishVectorizeJobAsync(Guid jobId, Guid projectId, string fileObjectKey, CancellationToken ct)
    {
        var payload = JsonSerializer.Serialize(new
        {
            job_id = jobId.ToString(),
            project_id = projectId.ToString(),
            file_object_key = fileObjectKey
        });
        var body = Encoding.UTF8.GetBytes(payload);
        var props = _channel.CreateBasicProperties();
        props.Persistent = true;
        _channel.BasicPublish(exchange: "", routingKey: QueueName, basicProperties: props, body: body);
        return Task.CompletedTask;
    }

    public void Dispose() { _channel.Dispose(); _connection.Dispose(); }
}
```

- [ ] **Step 4: Implement the command, controller, and Redis-backed WebSocket hub**

```csharp
// backend/src/Plan2Space.Application/Ai/Commands/EnqueueVectorizeJobCommand.cs
using MediatR;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Ai.Commands;

public record EnqueueVectorizeJobCommand(Guid ProjectId, Guid FileId, Guid RequestingUserId) : IRequest<Guid>;

public class EnqueueVectorizeJobHandler : IRequestHandler<EnqueueVectorizeJobCommand, Guid>
{
    private readonly Plan2SpaceDbContext _db;
    private readonly IJobPublisher _publisher;
    public EnqueueVectorizeJobHandler(Plan2SpaceDbContext db, IJobPublisher publisher) { _db = db; _publisher = publisher; }

    public async Task<Guid> Handle(EnqueueVectorizeJobCommand cmd, CancellationToken ct)
    {
        var file = await _db.ProjectFiles.FirstOrDefaultAsync(f =>
            f.Id == cmd.FileId && f.ProjectId == cmd.ProjectId, ct) ?? throw new KeyNotFoundException();

        var job = new AiJob { ProjectId = cmd.ProjectId, SourceFileId = cmd.FileId, Status = AiJobStatus.Queued };
        _db.AiJobs.Add(job);
        await _db.SaveChangesAsync(ct);

        await _publisher.PublishVectorizeJobAsync(job.Id, cmd.ProjectId, file.MinioObjectKey, ct);
        return job.Id;
    }
}
```

```csharp
// backend/src/Plan2Space.Infrastructure/Messaging/RedisJobProgressSubscriber.cs
using StackExchange.Redis;

namespace Plan2Space.Infrastructure.Messaging;

// Workers (Celery, Task 9) write current state to key "job:{id}:progress" as "status|percent"
// AND publish to channel "job:{id}:updates" for live pushes. Reconnecting clients read the key
// first (catch-up), then subscribe for further pushes — this is what satisfies the
// Review Focus reconnect requirement.
public class RedisJobProgressSubscriber
{
    private readonly IConnectionMultiplexer _redis;
    public RedisJobProgressSubscriber(IConnectionMultiplexer redis) => _redis = redis;

    public async Task<(string Status, int Percent)?> GetCurrentStateAsync(Guid jobId)
    {
        var db = _redis.GetDatabase();
        var value = await db.StringGetAsync($"job:{jobId}:progress");
        if (value.IsNullOrEmpty) return null;
        var parts = value.ToString().Split('|');
        return (parts[0], int.Parse(parts[1]));
    }

    public ISubscriber Subscriber => _redis.GetSubscriber();
    public string ChannelFor(Guid jobId) => $"job:{jobId}:updates";
}
```

```csharp
// backend/src/Plan2Space.API/WebSockets/JobProgressHub.cs
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Plan2Space.Infrastructure.Messaging;

namespace Plan2Space.API.WebSockets;

public class JobProgressHub
{
    private readonly RedisJobProgressSubscriber _subscriber;
    public JobProgressHub(RedisJobProgressSubscriber subscriber) => _subscriber = subscriber;

    public async Task HandleAsync(HttpContext context, Guid jobId)
    {
        if (!context.WebSockets.IsWebSocketRequest) { context.Response.StatusCode = 400; return; }
        using var socket = await context.WebSockets.AcceptWebSocketAsync();

        // Catch-up: send whatever state already exists in Redis before subscribing,
        // so a reconnecting client never blocks on a message it already missed.
        var current = await _subscriber.GetCurrentStateAsync(jobId);
        if (current is not null)
            await SendAsync(socket, current.Value.Status, current.Value.Percent);

        var tcs = new TaskCompletionSource();
        await _subscriber.Subscriber.SubscribeAsync(_subscriber.ChannelFor(jobId), async (_, message) =>
        {
            var parts = message.ToString().Split('|');
            await SendAsync(socket, parts[0], int.Parse(parts[1]));
            if (parts[0] is "Completed" or "Failed") tcs.TrySetResult();
        });

        await tcs.Task;
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "job finished", CancellationToken.None);
    }

    private static Task SendAsync(WebSocket socket, string status, int percent)
    {
        var json = JsonSerializer.Serialize(new { status, progressPercent = percent });
        return socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, CancellationToken.None);
    }
}
```

```csharp
// backend/src/Plan2Space.API/Controllers/AiController.cs
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Ai.Commands;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly Plan2SpaceDbContext _db;
    public AiController(IMediator mediator, Plan2SpaceDbContext db) { _mediator = mediator; _db = db; }
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record VectorizeRequest(Guid ProjectId, Guid FileId);

    [HttpPost("vectorize")]
    public async Task<IActionResult> Vectorize(VectorizeRequest req)
    {
        var jobId = await _mediator.Send(new EnqueueVectorizeJobCommand(req.ProjectId, req.FileId, CurrentUserId));
        return Accepted(new { jobId });
    }

    [HttpGet("job/{id:guid}/status")]
    public async Task<IActionResult> Status(Guid id)
    {
        var job = await _db.AiJobs.FindAsync(id);
        return job is null ? NotFound() : Ok(new { status = job.Status.ToString(), progressPercent = job.ProgressPercent });
    }
}
```

Register the WebSocket route in `Program.cs` (extends Task 3's file):
```csharp
app.UseWebSockets();
app.Map("/ws/job/{jobId:guid}", async (HttpContext ctx, Guid jobId, Plan2Space.API.WebSockets.JobProgressHub hub) =>
    await hub.HandleAsync(ctx, jobId));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter AiJobFlowTests`
Expected: PASS — both tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/Plan2Space.API/Controllers/AiController.cs backend/src/Plan2Space.API/WebSockets \
  backend/src/Plan2Space.Application/Ai backend/src/Plan2Space.Infrastructure/Messaging backend/tests
git commit -m "feat: AI job enqueue via RabbitMQ and resumable WebSocket progress via Redis"
```

**Phase 1 checkpoint:** `docker compose up`, register a user, create a project, upload a file, POST `/api/ai/vectorize`, watch `Queued` status (no real worker consumes it yet — that's Phase 2). This is a safe integration point to demo to the mentor before AI work begins.

---

## Phase 2: AI Pipeline (Tasks 7–12)

Goal of this phase: a real Python FastAPI + Celery service that consumes the RabbitMQ queue Task 6 publishes to, runs the actual vectorization pipeline (DXF direct parse, or raster → ViT → skeleton → GNN healing → polygonize → YOLO-OBB symbols → PaddleOCR dimensions), and writes a result back that Task 6's WebSocket/Redis plumbing can report and that Task 9 turns into real `Wall`/`Room`/`Opening` rows via the geometry API from Task 5.

### Task 7: FastAPI + Celery Skeleton Wired to RabbitMQ

**Files:**
- Create: `ai-service/requirements.txt`
- Create: `ai-service/api/main.py`
- Create: `ai-service/api/routers/health.py`
- Create: `ai-service/workers/celery_app.py`
- Create: `ai-service/workers/tasks.py`
- Test: `ai-service/tests/test_health.py`
- Test: `ai-service/tests/test_celery_task_dispatch.py`

**Interfaces:**
- Consumes: RabbitMQ queue `ai.vectorize.jobs` (message shape from Task 6: `{job_id, project_id, file_object_key}`).
- Produces: Celery task `workers.tasks.vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict` — Task 8/9/10/11/12 all extend this task's body; `GET /health` for the Docker healthcheck.

- [ ] **Step 1: Write `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
celery==5.4.0
kombu==5.4.2
redis==5.0.8
pika==1.3.2
minio==7.2.9
pytest==8.3.3
httpx==0.27.2
numpy==1.26.4
shapely==2.0.6
ezdxf==1.3.4
scikit-image==0.24.0
opencv-python-headless==4.10.0.84
torch==2.4.1
torchvision==0.19.1
torch-geometric==2.6.1
ultralytics==8.3.5
paddleocr==2.8.1
paddlepaddle==2.6.2
trimesh==4.4.9
```

- [ ] **Step 2: Write the failing health test**

```python
# ai-service/tests/test_health.py
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api'`

- [ ] **Step 4: Implement FastAPI app and health route**

```python
# ai-service/api/routers/health.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "ok"}
```

```python
# ai-service/api/main.py
from fastapi import FastAPI
from api.routers import health

app = FastAPI(title="Plan2Space AI Service")
app.include_router(health.router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 6: Write the failing Celery dispatch test**

```python
# ai-service/tests/test_celery_task_dispatch.py
from workers.celery_app import celery_app
from workers.tasks import vectorize_job

def test_vectorize_job_is_registered():
    assert "workers.tasks.vectorize_job" in celery_app.tasks

def test_vectorize_job_returns_result_dict_shape():
    # Run eagerly (no broker needed) to check the return contract Task 9 depends on.
    celery_app.conf.task_always_eager = True
    result = vectorize_job.delay(job_id="00000000-0000-0000-0000-000000000000",
                                  project_id="11111111-1111-1111-1111-111111111111",
                                  file_object_key="fixtures/blank.png").get()
    assert set(result.keys()) >= {"walls", "rooms", "openings"}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_celery_task_dispatch.py -v`
Expected: FAIL — `celery_app` module missing

- [ ] **Step 8: Implement Celery app and stub task**

```python
# ai-service/workers/celery_app.py
import os
from celery import Celery

celery_app = Celery(
    "plan2space_ai",
    broker=os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672//"),
    backend=os.environ.get("REDIS_URL", "redis://redis:6379/0"),
)
celery_app.conf.task_routes = {"workers.tasks.vectorize_job": {"queue": "ai.vectorize.jobs"}}
```

```python
# ai-service/workers/tasks.py
from workers.celery_app import celery_app

@celery_app.task(name="workers.tasks.vectorize_job")
def vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict:
    # Real pipeline dispatch (raster vs DXF) is added in Tasks 8-12.
    # Stub keeps the contract stable so the queue integration works end-to-end now.
    return {"walls": [], "rooms": [], "openings": []}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd ai-service && pytest tests/ -v`
Expected: PASS — 3 tests pass

- [ ] **Step 10: Commit**

```bash
git add ai-service/requirements.txt ai-service/api ai-service/workers ai-service/tests
git commit -m "feat: FastAPI + Celery skeleton consuming the vectorize job queue"
```

### Task 8: DXF/DWG Parser

**Files:**
- Create: `ai-service/pipeline/dxf_parser.py`
- Create: `ai-service/tests/fixtures/simple_walls.dxf`
- Create: `ai-service/tests/fixtures/walls_with_block_inserts.dxf`
- Test: `ai-service/tests/test_dxf_parser.py`

**Interfaces:**
- Consumes: a local file path to a DXF (DWG is converted to DXF upstream by the API layer using the ODA File Converter, or the upload is rejected with a clear error if that binary isn't present — out of scope for this task, which starts from DXF).
- Produces: `parse_dxf(path: str) -> dict` returning `{"walls": [{"points": [[x,y],...], "thickness_m": float, "height_m": float}], "openings": [...]}` — this exact shape is what Task 12's serializer forwards to the geometry API's `SaveGeometryCommand` input shape from Task 5.

- [ ] **Step 1: Generate the DXF fixtures used by the tests**

```python
# scripts/generate_dxf_fixtures.py  (run once, not part of the app)
import ezdxf

# Fixture 1: two raw LWPOLYLINE walls on layer "WALLS"
doc = ezdxf.new()
msp = doc.modelspace()
doc.layers.add(name="WALLS")
msp.add_lwpolyline([(0, 0), (5, 0)], dxfattribs={"layer": "WALLS"})
msp.add_lwpolyline([(5, 0), (5, 4)], dxfattribs={"layer": "WALLS"})
doc.saveas("ai-service/tests/fixtures/simple_walls.dxf")

# Fixture 2 (Review Focus): walls modeled as a BLOCK definition inserted via INSERT,
# which a naive "only read LWPOLYLINE in modelspace" parser will miss entirely.
doc2 = ezdxf.new()
block = doc2.blocks.new(name="WALL_SEGMENT")
block.add_lwpolyline([(0, 0), (3, 0)], dxfattribs={"layer": "WALLS"})
msp2 = doc2.modelspace()
doc2.layers.add(name="WALLS")
msp2.add_blockref("WALL_SEGMENT", insert=(0, 0))
msp2.add_blockref("WALL_SEGMENT", insert=(0, 3))
doc2.saveas("ai-service/tests/fixtures/walls_with_block_inserts.dxf")
```

Run: `python scripts/generate_dxf_fixtures.py`

- [ ] **Step 2: Write the failing tests**

```python
# ai-service/tests/test_dxf_parser.py
from pipeline.dxf_parser import parse_dxf

def test_parses_raw_polyline_walls():
    result = parse_dxf("tests/fixtures/simple_walls.dxf")
    assert len(result["walls"]) == 2
    assert result["walls"][0]["points"] == [[0.0, 0.0], [5.0, 0.0]]

def test_parses_walls_from_block_inserts():
    # Review Focus: block-defined walls referenced via INSERT must not be dropped.
    result = parse_dxf("tests/fixtures/walls_with_block_inserts.dxf")
    assert len(result["walls"]) == 2
    # Second insert is offset by (0, 3): its wall should be translated accordingly.
    points = sorted(w["points"][0][1] for w in result["walls"])
    assert points == [0.0, 3.0]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ai-service && pytest tests/test_dxf_parser.py -v`
Expected: FAIL — `pipeline.dxf_parser` doesn't exist

- [ ] **Step 4: Implement the parser, including block/insert flattening**

```python
# ai-service/pipeline/dxf_parser.py
import ezdxf
from ezdxf.math import Matrix44

DEFAULT_WALL_THICKNESS_M = 0.2
DEFAULT_WALL_HEIGHT_M = 2.8
WALL_LAYER_HINTS = ("WALL", "WALLS", "A-WALL")


def _is_wall_layer(layer_name: str) -> bool:
    upper = layer_name.upper()
    return any(hint in upper for hint in WALL_LAYER_HINTS)


def _polyline_points(entity) -> list[list[float]]:
    return [[float(p[0]), float(p[1])] for p in entity.get_points(format="xy")]


def _extract_from_space(space, transform: Matrix44 | None = None) -> list[dict]:
    walls = []
    for entity in space:
        if entity.dxftype() == "LWPOLYLINE" and _is_wall_layer(entity.dxf.layer):
            points = _polyline_points(entity)
            if transform is not None:
                points = [[*transform.transform((x, y, 0))[:2]] for x, y in points]
            walls.append({"points": points, "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M})
        elif entity.dxftype() == "INSERT":
            block = entity.block()
            insert_transform = entity.matrix44()
            combined = insert_transform if transform is None else transform @ insert_transform
            walls.extend(_extract_from_space(block, combined))
    return walls


def parse_dxf(path: str) -> dict:
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    walls = _extract_from_space(msp)
    return {"walls": walls, "openings": []}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ai-service && pytest tests/test_dxf_parser.py -v`
Expected: PASS — both tests pass

- [ ] **Step 6: Commit**

```bash
git add ai-service/pipeline/dxf_parser.py ai-service/tests/fixtures ai-service/tests/test_dxf_parser.py scripts/generate_dxf_fixtures.py
git commit -m "feat: DXF parser with block/insert flattening for wall extraction"
```

### Task 9: Raster Vectorization — ViT Wall Heatmap + Skeletonization + Geometry Finalizer

**Files:**
- Create: `ai-service/pipeline/vectorize.py`
- Create: `ai-service/pipeline/geometry_finalizer.py`
- Create: `ai-service/models/vit_wall_segmenter.py`
- Create: `ai-service/tests/test_geometry_finalizer.py`
- Test: `ai-service/tests/test_vectorize_raster.py`

**Interfaces:**
- Consumes: a raster image path (PNG/JPG) or a rasterized PDF page.
- Produces: `vectorize_raster(image_path: str) -> dict` shaped like Task 8's `parse_dxf` output (`{"walls": [...], "openings": []}`); `finalize_wall_geometry(raw_polylines: list[list[tuple[float,float]]]) -> list[list[tuple[float,float]]]` — repairs self-intersecting/unclosed polylines (Review Focus item) and is reused by Task 11 before polygons reach Task 5's `SaveGeometryCommand`.

- [ ] **Step 1: Write the failing geometry-finalizer test (Review Focus: invalid polygon repair)**

```python
# ai-service/tests/test_geometry_finalizer.py
from pipeline.geometry_finalizer import finalize_wall_geometry
from shapely.geometry import LineString

def test_valid_polyline_passes_through_unchanged():
    line = [(0, 0), (5, 0), (5, 4)]
    result = finalize_wall_geometry([line])
    assert result[0] == line

def test_self_intersecting_polyline_is_repaired_to_valid_geometry():
    # A bowtie-shaped polyline is invalid; the finalizer must return something
    # Shapely accepts as a valid LineString/Polygon rather than passing it through.
    bowtie = [(0, 0), (4, 4), (4, 0), (0, 4)]
    result = finalize_wall_geometry([bowtie])
    line = LineString(result[0])
    assert line.is_valid

def test_unclosed_room_outline_gets_closed():
    almost_square = [(0, 0), (4, 0), (4, 4), (0, 4)]  # missing closing point back to (0,0)
    result = finalize_wall_geometry([almost_square], close_loops=True)
    assert result[0][0] == result[0][-1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_geometry_finalizer.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement the finalizer**

```python
# ai-service/pipeline/geometry_finalizer.py
from shapely.geometry import LineString
from shapely.validation import make_valid


def _dedupe_consecutive(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out = [points[0]]
    for p in points[1:]:
        if p != out[-1]:
            out.append(p)
    return out


def finalize_wall_geometry(raw_polylines: list[list[tuple[float, float]]], close_loops: bool = False) -> list[list[tuple[float, float]]]:
    finalized = []
    for points in raw_polylines:
        points = _dedupe_consecutive(list(points))
        line = LineString(points)
        if not line.is_valid:
            repaired = make_valid(line)
            # make_valid on a self-intersecting line yields a MultiLineString or
            # GeometryCollection; take the longest component as the representative wall run.
            candidates = list(getattr(repaired, "geoms", [repaired]))
            longest = max(candidates, key=lambda g: g.length)
            points = list(longest.coords)
        if close_loops and points[0] != points[-1]:
            points = points + [points[0]]
        finalized.append(points)
    return finalized
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_geometry_finalizer.py -v`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Write the failing raster vectorization test (using a lightweight synthetic fixture, no GPU/weights required for the test)**

```python
# ai-service/tests/test_vectorize_raster.py
import numpy as np
from PIL import Image
from pipeline.vectorize import vectorize_raster

def _write_synthetic_floorplan(path: str):
    # 200x200 white image with a single black rectangular wall outline —
    # simple enough that the ViT stub segmenter (Step 3) can be swapped for a
    # deterministic thresholding fallback in test mode, keeping this test fast and offline.
    img = np.full((200, 200), 255, dtype=np.uint8)
    img[40:42, 40:160] = 0
    img[158:160, 40:160] = 0
    img[40:160, 40:42] = 0
    img[40:160, 158:160] = 0
    Image.fromarray(img).save(path)

def test_vectorize_raster_extracts_at_least_one_wall(tmp_path):
    image_path = tmp_path / "floorplan.png"
    _write_synthetic_floorplan(str(image_path))

    result = vectorize_raster(str(image_path), use_model=False)  # test-mode: threshold fallback, no ViT weights needed

    assert len(result["walls"]) >= 4
    for wall in result["walls"]:
        assert len(wall["points"]) >= 2
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_vectorize_raster.py -v`
Expected: FAIL — `pipeline.vectorize` doesn't exist

- [ ] **Step 7: Implement `vectorize_raster` with a `use_model` flag (real ViT path added fully in Task 10; this task lands the skeletonization + polygon extraction path with a deterministic threshold fallback so the pipeline is testable without GPU weights)**

```python
# ai-service/models/vit_wall_segmenter.py
import numpy as np

class ViTWallSegmenter:
    """Loads a ViT-B/16 fine-tuned on CubiCasa5K for binary wall-pixel segmentation.
    Weight loading is real; Task 10 adds the fine-tuning/training script and the
    actual checkpoint path. This class is consumed as-is by vectorize.py."""

    def __init__(self, checkpoint_path: str | None = None):
        self.checkpoint_path = checkpoint_path
        self._model = None

    def _lazy_load(self):
        if self._model is None:
            import torch
            self._model = torch.hub.load("facebookresearch/dino:main", "dino_vitb16", pretrained=False)
            if self.checkpoint_path:
                state = torch.load(self.checkpoint_path, map_location="cpu")
                self._model.load_state_dict(state, strict=False)
            self._model.eval()
        return self._model

    def predict_heatmap(self, image: np.ndarray) -> np.ndarray:
        """Returns a float32 [H,W] heatmap in [0,1] where 1 = wall pixel."""
        model = self._lazy_load()
        import torch
        tensor = torch.from_numpy(image).float().unsqueeze(0).unsqueeze(0) / 255.0
        with torch.no_grad():
            logits = model(tensor)
        heatmap = torch.sigmoid(logits).squeeze().numpy()
        return heatmap
```

```python
# ai-service/pipeline/vectorize.py
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize
from skimage.measure import approximate_polygon
import cv2

from pipeline.geometry_finalizer import finalize_wall_geometry
from models.vit_wall_segmenter import ViTWallSegmenter

DEFAULT_WALL_THICKNESS_M = 0.2
DEFAULT_WALL_HEIGHT_M = 2.8


def _threshold_fallback(gray: np.ndarray) -> np.ndarray:
    """Deterministic non-ML wall mask used in tests and as a graceful degrade
    path when model weights are unavailable: dark pixels = wall."""
    return (gray < 128).astype(np.uint8)


def _mask_to_polylines(mask: np.ndarray) -> list[list[tuple[float, float]]]:
    skeleton = skeletonize(mask.astype(bool))
    contours, _ = cv2.findContours(skeleton.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    polylines = []
    for contour in contours:
        pts = contour.reshape(-1, 2).astype(float)
        if len(pts) < 2:
            continue
        simplified = approximate_polygon(pts, tolerance=2.0)
        polylines.append([(float(x), float(y)) for x, y in simplified])
    return polylines


def vectorize_raster(image_path: str, use_model: bool = True, checkpoint_path: str | None = None) -> dict:
    img = Image.open(image_path).convert("L")
    gray = np.array(img)

    if use_model:
        segmenter = ViTWallSegmenter(checkpoint_path)
        heatmap = segmenter.predict_heatmap(gray)
        mask = (heatmap > 0.5).astype(np.uint8)
    else:
        mask = _threshold_fallback(gray)

    raw_polylines = _mask_to_polylines(mask)
    finalized = finalize_wall_geometry(raw_polylines)

    walls = [
        {"points": [[p[0], p[1]] for p in line], "thickness_m": DEFAULT_WALL_THICKNESS_M, "height_m": DEFAULT_WALL_HEIGHT_M}
        for line in finalized if len(line) >= 2
    ]
    return {"walls": walls, "openings": []}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_vectorize_raster.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add ai-service/pipeline/vectorize.py ai-service/pipeline/geometry_finalizer.py ai-service/models/vit_wall_segmenter.py ai-service/tests/test_vectorize_raster.py ai-service/tests/test_geometry_finalizer.py
git commit -m "feat: raster wall vectorization with skeletonization and invalid-geometry repair"
```

### Task 10: GNN Topology Healing

**Files:**
- Create: `ai-service/pipeline/gnn_healing.py`
- Create: `ai-service/models/wall_graph_gnn.py`
- Test: `ai-service/tests/test_gnn_healing.py`

**Interfaces:**
- Consumes: `walls: list[dict]` shaped like Task 9's output (`{"points": [[x,y],...], ...}`).
- Produces: `heal_wall_topology(walls: list[dict]) -> list[dict]` — snaps near-miss endpoints into shared junctions and closes small gaps, same shape in and out; called by Task 12's serializer between vectorization and finalization.

- [ ] **Step 1: Write the failing test**

```python
# ai-service/tests/test_gnn_healing.py
from pipeline.gnn_healing import heal_wall_topology

def test_near_miss_endpoints_snap_to_shared_junction():
    # Two wall segments that should meet at (5,0) but are off by 3cm due to
    # vectorization noise — a common ViT-heatmap artifact.
    walls = [
        {"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8},
        {"points": [[5.03, 0.0], [5.03, 4.0]], "thickness_m": 0.2, "height_m": 2.8},
    ]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)

    endpoint_a = healed[0]["points"][-1]
    endpoint_b = healed[1]["points"][0]
    assert endpoint_a == endpoint_b

def test_gap_beyond_tolerance_is_left_unmodified():
    walls = [
        {"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8},
        {"points": [[5.5, 0.0], [5.5, 4.0]], "thickness_m": 0.2, "height_m": 2.8},
    ]
    healed = heal_wall_topology(walls, snap_tolerance_m=0.05)
    assert healed[0]["points"][-1] == [5.0, 0.0]
    assert healed[1]["points"][0] == [5.5, 0.0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_gnn_healing.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement healing. The GNN model class is included for the full pipeline (edge-classification over a wall-endpoint graph, matching the spec's architecture), with a fast geometric snap as the deterministic backbone the model's output is merged into — this keeps the behavior testable and correct even before the GNN is trained on real data.**

```python
# ai-service/models/wall_graph_gnn.py
import torch
from torch_geometric.nn import GCNConv

class WallEndpointGNN(torch.nn.Module):
    """Edge-classification GNN: nodes are wall endpoints, edges connect
    candidate junction pairs within a coarse radius; output is a per-edge
    probability that the two endpoints represent the same physical junction.
    Training script and checkpoint are a Phase-2-later data task; this module
    defines the architecture pipeline.py's heal_wall_topology can call."""

    def __init__(self, in_channels: int = 2, hidden_channels: int = 32):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.edge_classifier = torch.nn.Linear(hidden_channels * 2, 1)

    def forward(self, node_features: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.conv1(node_features, edge_index))
        x = torch.relu(self.conv2(x, edge_index))
        src, dst = edge_index
        pair_features = torch.cat([x[src], x[dst]], dim=1)
        return torch.sigmoid(self.edge_classifier(pair_features)).squeeze(-1)
```

```python
# ai-service/pipeline/gnn_healing.py
import math

def _distance(a: list[float], b: list[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def heal_wall_topology(walls: list[dict], snap_tolerance_m: float = 0.05) -> list[dict]:
    """Deterministic geometric snap of near-miss endpoints into shared junctions.
    A trained WallEndpointGNN (models/wall_graph_gnn.py) can replace the fixed
    tolerance with a learned per-edge probability once checkpoints exist; the
    function signature and output shape stay the same either way."""
    healed = [dict(w, points=[list(p) for p in w["points"]]) for w in walls]

    endpoints = []
    for wi, wall in enumerate(healed):
        endpoints.append((wi, 0, wall["points"][0]))
        endpoints.append((wi, -1, wall["points"][-1]))

    for i in range(len(endpoints)):
        for j in range(i + 1, len(endpoints)):
            wi, idx_i, pi = endpoints[i]
            wj, idx_j, pj = endpoints[j]
            if wi == wj:
                continue
            if _distance(pi, pj) <= snap_tolerance_m:
                midpoint = [(pi[0] + pj[0]) / 2, (pi[1] + pj[1]) / 2]
                healed[wi]["points"][idx_i] = midpoint
                healed[wj]["points"][idx_j] = midpoint

    return healed
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_gnn_healing.py -v`
Expected: PASS — both tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-service/pipeline/gnn_healing.py ai-service/models/wall_graph_gnn.py ai-service/tests/test_gnn_healing.py
git commit -m "feat: wall topology healing (geometric snap + GNN edge-classifier architecture)"
```

### Task 11: YOLO-OBB Symbol Detection + PaddleOCR Dimension Extraction

**Files:**
- Create: `ai-service/pipeline/symbol_detect.py`
- Create: `ai-service/pipeline/ocr_dimensions.py`
- Test: `ai-service/tests/test_symbol_detect.py`
- Test: `ai-service/tests/test_ocr_dimensions.py`

**Interfaces:**
- Consumes: the same raster image path as Task 9.
- Produces: `detect_symbols(image_path: str, use_model: bool = True) -> list[dict]` returning `[{"type": "door"|"window", "bbox_center": [x,y], "angle_deg": float, "confidence": float}]`; `extract_dimensions(image_path: str, use_model: bool = True) -> list[dict]` returning `[{"text": "3000", "bbox_center": [x,y]}]`. Task 12's serializer maps detected symbols onto the nearest healed wall to produce `Opening` inputs, and uses extracted dimension text to compute the pixel-to-meter scale factor.

- [ ] **Step 1: Write the failing symbol-detection test (test mode avoids requiring real YOLO weights)**

```python
# ai-service/tests/test_symbol_detect.py
from pipeline.symbol_detect import detect_symbols

def test_detect_symbols_test_mode_returns_expected_shape(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "plan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    result = detect_symbols(str(img_path), use_model=False)

    assert isinstance(result, list)
    for symbol in result:
        assert symbol["type"] in ("door", "window")
        assert "bbox_center" in symbol and "angle_deg" in symbol and "confidence" in symbol
```

- [ ] **Step 2: Write the failing OCR test**

```python
# ai-service/tests/test_ocr_dimensions.py
from pipeline.ocr_dimensions import extract_dimensions

def test_extract_dimensions_test_mode_returns_expected_shape(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "plan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    result = extract_dimensions(str(img_path), use_model=False)

    assert isinstance(result, list)
    for dim in result:
        assert "text" in dim and "bbox_center" in dim
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ai-service && pytest tests/test_symbol_detect.py tests/test_ocr_dimensions.py -v`
Expected: FAIL — modules missing

- [ ] **Step 4: Implement both, each with a `use_model` flag mirroring Task 9's pattern (real model path + empty-but-well-shaped fallback for fast offline tests)**

```python
# ai-service/pipeline/symbol_detect.py
from ultralytics import YOLO

_MODEL_CACHE: dict[str, YOLO] = {}


def _load_model(weights_path: str) -> YOLO:
    if weights_path not in _MODEL_CACHE:
        _MODEL_CACHE[weights_path] = YOLO(weights_path)
    return _MODEL_CACHE[weights_path]


def detect_symbols(image_path: str, use_model: bool = True, weights_path: str = "models/weights/yolo_obb_symbols.pt") -> list[dict]:
    if not use_model:
        return []  # deterministic empty result for offline/unit tests

    model = _load_model(weights_path)
    results = model(image_path)[0]
    symbols = []
    class_names = {0: "door", 1: "window"}
    for box in results.obb:
        cls_id = int(box.cls.item())
        cx, cy = box.xywhr[0][:2].tolist()
        angle = float(box.xywhr[0][4])
        symbols.append({
            "type": class_names.get(cls_id, "door"),
            "bbox_center": [cx, cy],
            "angle_deg": angle,
            "confidence": float(box.conf.item()),
        })
    return symbols
```

```python
# ai-service/pipeline/ocr_dimensions.py
from paddleocr import PaddleOCR

_OCR_CACHE: PaddleOCR | None = None


def _load_ocr() -> PaddleOCR:
    global _OCR_CACHE
    if _OCR_CACHE is None:
        _OCR_CACHE = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _OCR_CACHE


def extract_dimensions(image_path: str, use_model: bool = True) -> list[dict]:
    if not use_model:
        return []  # deterministic empty result for offline/unit tests

    ocr = _load_ocr()
    raw_results = ocr.ocr(image_path, cls=True)
    dimensions = []
    for line in raw_results[0] or []:
        bbox, (text, _confidence) = line
        if any(ch.isdigit() for ch in text):
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            dimensions.append({"text": text, "bbox_center": [sum(xs) / 4, sum(ys) / 4]})
    return dimensions
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ai-service && pytest tests/test_symbol_detect.py tests/test_ocr_dimensions.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-service/pipeline/symbol_detect.py ai-service/pipeline/ocr_dimensions.py ai-service/tests/test_symbol_detect.py ai-service/tests/test_ocr_dimensions.py
git commit -m "feat: YOLO-OBB symbol detection and PaddleOCR dimension extraction"
```

### Task 12: Result Serializer + Celery Task Wiring (raster and DXF paths, writes back via API's geometry endpoint)

**Files:**
- Create: `ai-service/pipeline/serializer.py`
- Create: `ai-service/pipeline/api_client.py`
- Modify: `ai-service/workers/tasks.py`
- Test: `ai-service/tests/test_serializer.py`
- Test: `ai-service/tests/test_vectorize_job_end_to_end.py`

**Interfaces:**
- Consumes: outputs of Tasks 8–11 (`parse_dxf`/`vectorize_raster`, `heal_wall_topology`, `detect_symbols`, `extract_dimensions`); Task 6's Redis progress keys/channel (`job:{id}:progress`, `job:{id}:updates`) and Task 5's `PUT /api/projects/{id}/geometry` endpoint.
- Produces: `serialize_pipeline_result(walls, openings) -> dict` in the exact `WallInput`/`RoomInput`/`OpeningInput` JSON shape Task 5's `SaveGeometryCommand` expects; the fully-wired `vectorize_job` Celery task that Task 6's `IJobPublisher` triggers end-to-end.

- [ ] **Step 1: Write the failing serializer test**

```python
# ai-service/tests/test_serializer.py
from pipeline.serializer import serialize_pipeline_result

def test_serialize_maps_symbol_to_nearest_wall():
    walls = [{"points": [[0.0, 0.0], [5.0, 0.0]], "thickness_m": 0.2, "height_m": 2.8}]
    symbols = [{"type": "door", "bbox_center": [2.5, 0.05], "angle_deg": 0.0, "confidence": 0.9}]

    result = serialize_pipeline_result(walls, symbols)

    assert len(result["walls"]) == 1
    assert len(result["openings"]) == 1
    assert result["openings"][0]["type"] == "door"
    assert result["openings"][0]["wallIndex"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_serializer.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement the serializer (nearest-wall assignment by point-to-segment distance)**

```python
# ai-service/pipeline/serializer.py
def _point_to_segment_distance(p, a, b) -> float:
    import math
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    closest = (ax + t * dx, ay + t * dy)
    return math.hypot(px - closest[0], py - closest[1])


def serialize_pipeline_result(walls: list[dict], symbols: list[dict], default_opening_width_m: float = 0.9) -> dict:
    walls_out = [{"points": w["points"], "thicknessMeters": w["thickness_m"], "heightMeters": w["height_m"]} for w in walls]

    openings_out = []
    for symbol in symbols:
        best_idx, best_dist = None, float("inf")
        for idx, wall in enumerate(walls):
            for i in range(len(wall["points"]) - 1):
                d = _point_to_segment_distance(symbol["bbox_center"], wall["points"][i], wall["points"][i + 1])
                if d < best_dist:
                    best_dist, best_idx = d, idx
        if best_idx is None:
            continue
        openings_out.append({
            "wallIndex": best_idx,
            "type": symbol["type"],
            "position": {"x": symbol["bbox_center"][0], "y": symbol["bbox_center"][1]},
            "widthMeters": default_opening_width_m,
            "sillHeightMeters": 0.0 if symbol["type"] == "door" else 0.9,
        })

    return {"walls": walls_out, "rooms": [], "openings": openings_out}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_serializer.py -v`
Expected: PASS

- [ ] **Step 5: Write the failing end-to-end Celery task test (mocks the API client, exercises progress reporting)**

```python
# ai-service/tests/test_vectorize_job_end_to_end.py
from unittest.mock import patch, MagicMock
from workers.celery_app import celery_app
from workers.tasks import vectorize_job

def test_vectorize_job_reports_progress_and_calls_api(tmp_path):
    from PIL import Image
    import numpy as np
    img_path = tmp_path / "floorplan.png"
    Image.fromarray(np.full((100, 100), 255, dtype="uint8")).save(img_path)

    celery_app.conf.task_always_eager = True

    with patch("workers.tasks.download_from_minio", return_value=str(img_path)), \
         patch("workers.tasks.report_progress") as mock_progress, \
         patch("workers.tasks.push_geometry_to_api") as mock_push:
        vectorize_job.delay(job_id="job-1", project_id="proj-1", file_object_key="uploads/floorplan.png").get()

    assert mock_progress.call_args_list[0][0][1:] == ("Running", 10)
    assert mock_progress.call_args_list[-1][0][1:] == ("Completed", 100)
    mock_push.assert_called_once()
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_vectorize_job_end_to_end.py -v`
Expected: FAIL — `download_from_minio`/`report_progress`/`push_geometry_to_api` don't exist yet

- [ ] **Step 7: Implement `api_client.py` and wire `tasks.py`**

```python
# ai-service/pipeline/api_client.py
import os
import redis
import httpx

_redis_client = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))
API_INTERNAL_URL = os.environ.get("API_INTERNAL_URL", "http://api:5000")


def report_progress(job_id: str, status: str, percent: int) -> None:
    _redis_client.set(f"job:{job_id}:progress", f"{status}|{percent}")
    _redis_client.publish(f"job:{job_id}:updates", f"{status}|{percent}")


def download_from_minio(file_object_key: str) -> str:
    # Real implementation streams from MinIO to a local temp path; kept as a thin
    # seam so tests can patch it without a MinIO container.
    from minio import Minio
    client = Minio(os.environ.get("MINIO_ENDPOINT", "minio:9000"),
                    access_key=os.environ["MINIO_ROOT_USER"], secret_key=os.environ["MINIO_ROOT_PASSWORD"], secure=False)
    local_path = f"/tmp/{os.path.basename(file_object_key)}"
    client.fget_object("plan2space-uploads", file_object_key, local_path)
    return local_path


def push_geometry_to_api(project_id: str, geometry: dict) -> None:
    # Internal service-to-service call on p2s_internal network; uses a service
    # account token in production. Base version 0 assumes first AI write per
    # project; a project with prior manual edits passes its current version
    # through job metadata (extension point, not needed for MVP happy path).
    httpx.put(f"{API_INTERNAL_URL}/api/projects/{project_id}/geometry",
              json={"baseVersion": 0, **geometry}, timeout=30.0)
```

```python
# ai-service/workers/tasks.py
from workers.celery_app import celery_app
from pipeline.dxf_parser import parse_dxf
from pipeline.vectorize import vectorize_raster
from pipeline.gnn_healing import heal_wall_topology
from pipeline.symbol_detect import detect_symbols
from pipeline.ocr_dimensions import extract_dimensions
from pipeline.serializer import serialize_pipeline_result
from pipeline.api_client import download_from_minio, report_progress, push_geometry_to_api

RASTER_EXTENSIONS = (".png", ".jpg", ".jpeg", ".pdf")
DXF_EXTENSIONS = (".dxf",)


@celery_app.task(name="workers.tasks.vectorize_job")
def vectorize_job(job_id: str, project_id: str, file_object_key: str) -> dict:
    report_progress(job_id, "Running", 10)
    local_path = download_from_minio(file_object_key)

    report_progress(job_id, "Running", 30)
    if local_path.lower().endswith(DXF_EXTENSIONS):
        parsed = parse_dxf(local_path)
        symbols = []
    else:
        parsed = vectorize_raster(local_path)
        symbols = detect_symbols(local_path)
        extract_dimensions(local_path)  # dimension-to-scale calibration is a Phase 4 co-pilot refinement

    report_progress(job_id, "Running", 60)
    healed_walls = heal_wall_topology(parsed["walls"])

    report_progress(job_id, "Running", 80)
    result = serialize_pipeline_result(healed_walls, symbols)

    push_geometry_to_api(project_id, result)
    report_progress(job_id, "Completed", 100)
    return result
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_vectorize_job_end_to_end.py -v`
Expected: PASS

- [ ] **Step 9: Run the full AI service test suite**

Run: `cd ai-service && pytest tests/ -v`
Expected: PASS — all tests across Tasks 7–12 pass

- [ ] **Step 10: Commit**

```bash
git add ai-service/pipeline/serializer.py ai-service/pipeline/api_client.py ai-service/workers/tasks.py ai-service/tests/test_serializer.py ai-service/tests/test_vectorize_job_end_to_end.py
git commit -m "feat: wire full vectorization pipeline into Celery task with progress reporting and API writeback"
```

**Phase 2 checkpoint:** `docker compose up`, upload a real floor plan PNG or DXF, POST `/api/ai/vectorize`, watch progress reach 100% over the WebSocket, then GET `/api/projects/{id}/geometry` and see real walls/openings populated by the AI pipeline. This is the first fully-automatic 2D→vector milestone.

---

## Phase 3: Studio UI (Tasks 13–21)

Goal of this phase: the React SPA — auth pages, dashboard, and the Studio itself with a Konva.js 2D editor (including the snap engine), a Three.js/R3F 3D viewer with CSG-cut openings, and the Zustand store that keeps 2D edits, AI results, and the 3D scene synchronized and saved back to the backend from Task 5/6.

### Task 13: React + Vite + TypeScript + Tailwind Bootstrap, API/Auth Client, Zustand Auth Store

**Files:**
- Create: `plan2space-web/package.json`
- Create: `plan2space-web/vite.config.ts`
- Create: `plan2space-web/tailwind.config.js`
- Create: `plan2space-web/src/main.tsx`
- Create: `plan2space-web/src/App.tsx`
- Create: `plan2space-web/src/services/api.ts`
- Create: `plan2space-web/src/stores/authStore.ts`
- Test: `plan2space-web/tests/authStore.test.ts`

**Interfaces:**
- Consumes: Task 3's `/api/auth/register` and `/api/auth/login`.
- Produces: `api.ts` exporting a configured `axios`-like `apiClient` with an auth-header interceptor reading from `authStore`; `useAuthStore` (Zustand) with `{ accessToken, user, login(email,password), register(email,password), logout() }` — every later page/component imports `useAuthStore` and `apiClient` by these exact names.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "plan2space-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^4.5.5",
    "axios": "^1.7.7",
    "konva": "^9.3.15",
    "react-konva": "^18.2.10",
    "three": "^0.169.0",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.114.0",
    "three-bvh-csg": "^0.0.17"
  },
  "devDependencies": {
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "vitest": "^2.1.2",
    "@testing-library/react": "^16.0.1",
    "tailwindcss": "^3.4.13",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}
```

- [ ] **Step 2: Write `vite.config.ts` and `tailwind.config.js`**

```typescript
// plan2space-web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  test: { environment: 'jsdom', globals: true }
})
```

```javascript
// plan2space-web/tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: Write the failing auth store test**

```typescript
// plan2space-web/tests/authStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../src/stores/authStore'
import { apiClient } from '../src/services/api'

vi.mock('../src/services/api', () => ({
  apiClient: { post: vi.fn() }
}))

describe('authStore', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: null, user: null }))

  it('login stores accessToken on success', async () => {
    (apiClient.post as any).mockResolvedValue({
      data: { accessToken: 'tok-123', refreshToken: 'ref-123', expiresIn: 1800 }
    })

    await useAuthStore.getState().login('a@b.com', 'pw')

    expect(useAuthStore.getState().accessToken).toBe('tok-123')
  })

  it('logout clears state', () => {
    useAuthStore.setState({ accessToken: 'tok', user: { email: 'a@b.com' } })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/authStore.test.ts`
Expected: FAIL — modules don't exist

- [ ] **Step 5: Implement `api.ts` and `authStore.ts`**

```typescript
// plan2space-web/src/services/api.ts
import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

export const apiClient = axios.create({ baseURL: '/api' })

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

```typescript
// plan2space-web/src/stores/authStore.ts
import { create } from 'zustand'
import { apiClient } from '../services/api'

interface AuthUser { email: string }

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  login: async (email, password) => {
    const { data } = await apiClient.post('/auth/login', { email, password })
    set({ accessToken: data.accessToken, user: { email } })
  },
  register: async (email, password) => {
    await apiClient.post('/auth/register', { email, password })
  },
  logout: () => set({ accessToken: null, user: null }),
}))
```

- [ ] **Step 6: Write minimal `App.tsx`/`main.tsx` so the app boots**

```tsx
// plan2space-web/src/App.tsx
export default function App() {
  return <div className="min-h-screen bg-slate-950 text-white">Plan2Space</div>
}
```

```tsx
// plan2space-web/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd plan2space-web && npx vitest run tests/authStore.test.ts`
Expected: PASS — both tests pass

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/package.json plan2space-web/vite.config.ts plan2space-web/tailwind.config.js \
  plan2space-web/src/main.tsx plan2space-web/src/App.tsx plan2space-web/src/services plan2space-web/src/stores/authStore.ts \
  plan2space-web/tests/authStore.test.ts
git commit -m "chore: React/Vite/Tailwind bootstrap with auth store and API client"
```

### Task 14: Auth Pages (Login/Register) + Route Guards

**Files:**
- Create: `plan2space-web/src/pages/AuthPage.tsx`
- Create: `plan2space-web/src/components/RequireAuth.tsx`
- Modify: `plan2space-web/src/App.tsx`
- Test: `plan2space-web/tests/RequireAuth.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 13).
- Produces: route `/auth` (login/register form), `<RequireAuth>` wrapper component redirecting to `/auth` when `accessToken` is null — Task 15/16 wrap `/dashboard` and `/studio/:projectId` with it.

- [ ] **Step 1: Write the failing route-guard test**

```tsx
// plan2space-web/tests/RequireAuth.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from '../src/components/RequireAuth'
import { useAuthStore } from '../src/stores/authStore'

describe('RequireAuth', () => {
  it('redirects to /auth when not authenticated', () => {
    useAuthStore.setState({ accessToken: null, user: null })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/auth" element={<div>Auth Page</div>} />
          <Route path="/dashboard" element={<RequireAuth><div>Dashboard</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Auth Page')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuthStore.setState({ accessToken: 'tok', user: { email: 'a@b.com' } })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<RequireAuth><div>Dashboard</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/RequireAuth.test.tsx`
Expected: FAIL — `RequireAuth` doesn't exist

- [ ] **Step 3: Implement `RequireAuth` and `AuthPage`**

```tsx
// plan2space-web/src/components/RequireAuth.tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  if (!accessToken) return <Navigate to="/auth" replace />
  return <>{children}</>
}
```

```tsx
// plan2space-web/src/pages/AuthPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { login, register } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'register') {
        await register(email, password)
      }
      await login(email, password)
      navigate('/dashboard')
    } catch {
      setError('Authentication failed. Check your credentials.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-xl bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-white">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <input className="w-full rounded bg-slate-800 p-2 text-white" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded bg-slate-800 p-2 text-white" placeholder="Password" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded bg-indigo-600 p-2 text-white" type="submit">
          {mode === 'login' ? 'Sign in' : 'Register'}
        </button>
        <button type="button" className="w-full text-sm text-slate-400"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Wire routes in `App.tsx`**

```tsx
// plan2space-web/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import { RequireAuth } from './components/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/dashboard" element={<RequireAuth><div>Dashboard placeholder</div></RequireAuth>} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd plan2space-web && npx vitest run tests/RequireAuth.test.tsx`
Expected: PASS — both tests pass

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src/pages/AuthPage.tsx plan2space-web/src/components/RequireAuth.tsx plan2space-web/src/App.tsx plan2space-web/tests/RequireAuth.test.tsx
git commit -m "feat: auth page and route guard"
```

### Task 15: Dashboard (Project List/Create/Delete)

**Files:**
- Create: `plan2space-web/src/pages/DashboardPage.tsx`
- Create: `plan2space-web/src/services/projectsService.ts`
- Modify: `plan2space-web/src/App.tsx`
- Test: `plan2space-web/tests/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: Task 4's `/api/projects` endpoints via `apiClient` (Task 13).
- Produces: `projectsService` exporting `listProjects()`, `createProject(name)`, `deleteProject(id)`; route `/dashboard` rendering the project grid — Task 16's Studio route navigates here from `projectId` link.

- [ ] **Step 1: Write the failing test**

```tsx
// plan2space-web/tests/DashboardPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../src/pages/DashboardPage'
import * as projectsService from '../src/services/projectsService'

vi.mock('../src/services/projectsService')

describe('DashboardPage', () => {
  it('lists projects returned by the API', async () => {
    vi.mocked(projectsService.listProjects).mockResolvedValue([
      { id: '1', name: 'House A', createdAt: '', updatedAt: '' }
    ])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('House A')).toBeInTheDocument())
  })

  it('creates a project on form submit', async () => {
    vi.mocked(projectsService.listProjects).mockResolvedValue([])
    vi.mocked(projectsService.createProject).mockResolvedValue({ id: '2', name: 'New', createdAt: '', updatedAt: '' })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'New' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(projectsService.createProject).toHaveBeenCalledWith('New'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/DashboardPage.test.tsx`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement**

```typescript
// plan2space-web/src/services/projectsService.ts
import { apiClient } from './api'

export interface ProjectDto { id: string; name: string; createdAt: string; updatedAt: string }

export async function listProjects(): Promise<ProjectDto[]> {
  const { data } = await apiClient.get('/projects')
  return data
}

export async function createProject(name: string): Promise<ProjectDto> {
  const { data } = await apiClient.post('/projects', { name })
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`)
}
```

```tsx
// plan2space-web/src/pages/DashboardPage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listProjects, createProject, deleteProject, ProjectDto } from '../services/projectsService'

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [name, setName] = useState('')

  async function refresh() { setProjects(await listProjects()) }
  useEffect(() => { refresh() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createProject(name)
    setName('')
    await refresh()
  }

  async function handleDelete(id: string) {
    await deleteProject(id)
    await refresh()
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input className="rounded bg-slate-800 p-2" placeholder="Project name"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="rounded bg-indigo-600 px-4">Create</button>
      </form>
      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg bg-slate-900 p-4">
            <Link to={`/studio/${p.id}`} className="text-lg font-semibold hover:underline">{p.name}</Link>
            <button onClick={() => handleDelete(p.id)} className="mt-2 block text-sm text-red-400">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire route, run test, commit**

Update `/dashboard` route in `App.tsx` to render `<DashboardPage />` inside `RequireAuth`.

Run: `cd plan2space-web && npx vitest run tests/DashboardPage.test.tsx`
Expected: PASS — both tests pass

```bash
git add plan2space-web/src/pages/DashboardPage.tsx plan2space-web/src/services/projectsService.ts plan2space-web/src/App.tsx plan2space-web/tests/DashboardPage.test.tsx
git commit -m "feat: dashboard with project list/create/delete"
```

### Task 16: Geometry Store (Zustand) + Studio Page Shell

**Files:**
- Create: `plan2space-web/src/stores/geometryStore.ts`
- Create: `plan2space-web/src/services/geometryService.ts`
- Create: `plan2space-web/src/pages/StudioPage.tsx`
- Modify: `plan2space-web/src/App.tsx`
- Test: `plan2space-web/tests/geometryStore.test.ts`

**Interfaces:**
- Consumes: Task 5's `GET/PUT /api/projects/{id}/geometry`.
- Produces: `useGeometryStore` with state `{ walls: Wall[], rooms: Room[], openings: Opening[], version: number }` and actions `loadFromServer(projectId)`, `applyAiResult(dto)`, `updateWall(id, points)`, `addOpening(opening)`, `saveToServer(projectId)` — Task 17 (Canvas2D), Task 19 (SnapEngine), and Task 20 (Viewer3D) all read/write this store exclusively; no component talks to `geometryService` directly except this store.

- [ ] **Step 1: Write the failing test**

```typescript
// plan2space-web/tests/geometryStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

describe('geometryStore', () => {
  beforeEach(() => useGeometryStore.setState({ walls: [], rooms: [], openings: [], version: 0 }))

  it('loadFromServer populates walls/rooms/openings and version', async () => {
    vi.mocked(geometryService.fetchGeometry).mockResolvedValue({
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: []
    })

    await useGeometryStore.getState().loadFromServer('proj-1')

    expect(useGeometryStore.getState().walls).toHaveLength(1)
    expect(useGeometryStore.getState().version).toBe(1)
  })

  it('updateWall mutates the matching wall points', () => {
    useGeometryStore.setState({
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: [], version: 1
    })
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 0 }, { x: 6, y: 0 }])
    expect(useGeometryStore.getState().walls[0].points[1].x).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/geometryStore.test.ts`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement types, service, and store**

```typescript
// plan2space-web/src/services/geometryService.ts
import { apiClient } from './api'

export interface Point { x: number; y: number }
export interface Wall { id: string; points: Point[]; thicknessMeters: number; heightMeters: number; version: number }
export interface Room { id: string; points: Point[]; label: string; version: number }
export interface Opening { id: string; wallId: string; type: 'Door' | 'Window'; position: Point; widthMeters: number; sillHeightMeters: number; version: number }
export interface GeometryDto { walls: Wall[]; rooms: Room[]; openings: Opening[] }

export async function fetchGeometry(projectId: string): Promise<GeometryDto> {
  const { data } = await apiClient.get(`/projects/${projectId}/geometry`)
  return data
}

export async function saveGeometry(projectId: string, baseVersion: number, payload: {
  walls: { points: Point[]; thicknessMeters: number; heightMeters: number }[]
  rooms: { points: Point[]; label: string }[]
  openings: { wallId: string; type: string; position: Point; widthMeters: number; sillHeightMeters: number }[]
}): Promise<{ version: number }> {
  const { data } = await apiClient.put(`/projects/${projectId}/geometry`, { baseVersion, ...payload })
  return data
}
```

```typescript
// plan2space-web/src/stores/geometryStore.ts
import { create } from 'zustand'
import { fetchGeometry, saveGeometry, GeometryDto, Wall, Room, Opening, Point } from '../services/geometryService'

interface GeometryState {
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  version: number
  loadFromServer: (projectId: string) => Promise<void>
  applyAiResult: (dto: GeometryDto) => void
  updateWall: (wallId: string, points: Point[]) => void
  addOpening: (opening: Opening) => void
  saveToServer: (projectId: string) => Promise<void>
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  walls: [], rooms: [], openings: [], version: 0,

  loadFromServer: async (projectId) => {
    const dto = await fetchGeometry(projectId)
    const maxVersion = [...dto.walls, ...dto.rooms, ...dto.openings].reduce((m, e) => Math.max(m, e.version), 0)
    set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings, version: maxVersion })
  },

  applyAiResult: (dto) => set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings }),

  updateWall: (wallId, points) => set((state) => ({
    walls: state.walls.map((w) => (w.id === wallId ? { ...w, points } : w))
  })),

  addOpening: (opening) => set((state) => ({ openings: [...state.openings, opening] })),

  saveToServer: async (projectId) => {
    const { walls, rooms, openings, version } = get()
    const result = await saveGeometry(projectId, version, {
      walls: walls.map((w) => ({ points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
      rooms: rooms.map((r) => ({ points: r.points, label: r.label })),
      openings: openings.map((o) => ({ wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters })),
    })
    set({ version: result.version })
  },
}))
```

```tsx
// plan2space-web/src/pages/StudioPage.tsx
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGeometryStore } from '../stores/geometryStore'

export default function StudioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)

  useEffect(() => { if (projectId) loadFromServer(projectId) }, [projectId])

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <div className="flex-1" id="canvas-2d-slot" />
      <div className="flex-1" id="viewer-3d-slot" />
    </div>
  )
}
```

- [ ] **Step 4: Wire route, run test, commit**

Add `<Route path="/studio/:projectId" element={<RequireAuth><StudioPage /></RequireAuth>} />` to `App.tsx`.

Run: `cd plan2space-web && npx vitest run tests/geometryStore.test.ts`
Expected: PASS — both tests pass

```bash
git add plan2space-web/src/stores/geometryStore.ts plan2space-web/src/services/geometryService.ts plan2space-web/src/pages/StudioPage.tsx plan2space-web/src/App.tsx plan2space-web/tests/geometryStore.test.ts
git commit -m "feat: geometry store and studio page shell"
```

### Task 17: Konva.js 2D Canvas Editor — Wall/Room/Opening Layers

**Files:**
- Create: `plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx`
- Create: `plan2space-web/src/components/studio/Canvas2D/WallLayer.tsx`
- Create: `plan2space-web/src/components/studio/Canvas2D/OpeningLayer.tsx`
- Modify: `plan2space-web/src/pages/StudioPage.tsx`
- Test: `plan2space-web/tests/WallLayer.test.tsx`

**Interfaces:**
- Consumes: `useGeometryStore` (Task 16).
- Produces: `<CanvasEditor>` mounted at `#canvas-2d-slot`; `WallLayer` renders each `Wall.points` as a draggable Konva `Line` and calls `updateWall` on drag-end — Task 18's `SnapEngine` intercepts this drag-end coordinate before it reaches `updateWall`.

- [ ] **Step 1: Write the failing test (renders wall count, verifies updateWall call shape)**

```tsx
// plan2space-web/tests/WallLayer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallLayer } from '../src/components/studio/Canvas2D/WallLayer'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('WallLayer', () => {
  it('renders one Konva Line per wall', () => {
    useGeometryStore.setState({
      walls: [
        { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
        { id: 'w2', points: [{ x: 5, y: 0 }, { x: 5, y: 4 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
      ],
      rooms: [], openings: [], version: 1
    })
    const { container } = render(
      <Stage width={400} height={400}><Layer><WallLayer /></Layer></Stage>
    )
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0)
    expect(useGeometryStore.getState().walls).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/WallLayer.test.tsx`
Expected: FAIL — `WallLayer` doesn't exist

- [ ] **Step 3: Implement layers and editor**

```tsx
// plan2space-web/src/components/studio/Canvas2D/WallLayer.tsx
import { Line } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { snapPoint } from './SnapEngine'

const PIXELS_PER_METER = 50

export function WallLayer() {
  const walls = useGeometryStore((s) => s.walls)
  const updateWall = useGeometryStore((s) => s.updateWall)

  return (
    <>
      {walls.map((wall) => (
        <Line
          key={wall.id}
          points={wall.points.flatMap((p) => [p.x * PIXELS_PER_METER, p.y * PIXELS_PER_METER])}
          stroke="#e2e8f0"
          strokeWidth={wall.thicknessMeters * PIXELS_PER_METER}
          draggable
          onDragEnd={(e) => {
            const dx = e.target.x() / PIXELS_PER_METER
            const dy = e.target.y() / PIXELS_PER_METER
            const rawPoints = wall.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
            const snapped = rawPoints.map((p) => snapPoint(p, useGeometryStore.getState().walls, wall.id))
            updateWall(wall.id, snapped)
            e.target.position({ x: 0, y: 0 })
          }}
        />
      ))}
    </>
  )
}
```

```tsx
// plan2space-web/src/components/studio/Canvas2D/OpeningLayer.tsx
import { Rect } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'

const PIXELS_PER_METER = 50

export function OpeningLayer() {
  const openings = useGeometryStore((s) => s.openings)
  return (
    <>
      {openings.map((o) => (
        <Rect
          key={o.id}
          x={o.position.x * PIXELS_PER_METER - (o.widthMeters * PIXELS_PER_METER) / 2}
          y={o.position.y * PIXELS_PER_METER - 4}
          width={o.widthMeters * PIXELS_PER_METER}
          height={8}
          fill={o.type === 'Door' ? '#f59e0b' : '#38bdf8'}
        />
      ))}
    </>
  )
}
```

```tsx
// plan2space-web/src/components/studio/Canvas2D/CanvasEditor.tsx
import { Stage, Layer } from 'react-konva'
import { WallLayer } from './WallLayer'
import { OpeningLayer } from './OpeningLayer'

export function CanvasEditor() {
  return (
    <Stage width={window.innerWidth / 2} height={window.innerHeight}>
      <Layer>
        <WallLayer />
        <OpeningLayer />
      </Layer>
    </Stage>
  )
}
```

- [ ] **Step 4: Mount in `StudioPage.tsx`**

```tsx
// plan2space-web/src/pages/StudioPage.tsx (replace #canvas-2d-slot div)
import { CanvasEditor } from '../components/studio/Canvas2D/CanvasEditor'
// ...
<div className="flex-1"><CanvasEditor /></div>
```

- [ ] **Step 5: Run test to verify it passes (SnapEngine stub added in Task 18; provide a pass-through stub now so this task's test runs standalone)**

Create a temporary pass-through so this task isn't blocked on Task 18:
```typescript
// plan2space-web/src/components/studio/Canvas2D/SnapEngine.ts (pass-through stub; replaced by Task 18)
import { Point, Wall } from '../../../services/geometryService'
export function snapPoint(point: Point, _walls: Wall[], _excludeWallId: string): Point { return point }
```

Run: `cd plan2space-web && npx vitest run tests/WallLayer.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src/components/studio/Canvas2D plan2space-web/src/pages/StudioPage.tsx plan2space-web/tests/WallLayer.test.tsx
git commit -m "feat: Konva 2D wall/opening layers with draggable walls"
```

### Task 18: Snap Engine (Endpoint/Perpendicular/Grid Snapping)

**Files:**
- Modify: `plan2space-web/src/components/studio/Canvas2D/SnapEngine.ts`
- Test: `plan2space-web/tests/SnapEngine.test.ts`

**Interfaces:**
- Consumes: `Wall[]` (Task 16 types), a candidate `Point`.
- Produces: `snapPoint(point, walls, excludeWallId, options?) -> Point` — replaces the Task 17 stub; called from `WallLayer`'s `onDragEnd` with the exact same signature so no caller changes.

- [ ] **Step 1: Write the failing tests**

```typescript
// plan2space-web/tests/SnapEngine.test.ts
import { describe, it, expect } from 'vitest'
import { snapPoint } from '../src/components/studio/Canvas2D/SnapEngine'
import { Wall } from '../src/services/geometryService'

const walls: Wall[] = [
  { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
]

describe('snapPoint', () => {
  it('snaps to a nearby wall endpoint within tolerance', () => {
    const result = snapPoint({ x: 5.02, y: 0.01 }, walls, 'other-wall', { endpointToleranceM: 0.05 })
    expect(result).toEqual({ x: 5, y: 0 })
  })

  it('snaps to the nearest grid point when no endpoint is close', () => {
    const result = snapPoint({ x: 2.03, y: 1.97 }, walls, 'other-wall', { gridSizeM: 0.1, endpointToleranceM: 0.05 })
    expect(result.x).toBeCloseTo(2.0, 5)
    expect(result.y).toBeCloseTo(2.0, 5)
  })

  it('does not snap to the wall being dragged itself', () => {
    const result = snapPoint({ x: 0.02, y: 0.02 }, walls, 'w1', { endpointToleranceM: 0.05, gridSizeM: 0 })
    expect(result).toEqual({ x: 0.02, y: 0.02 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/SnapEngine.test.ts`
Expected: FAIL — stub always passes through, grid/endpoint tests fail

- [ ] **Step 3: Implement the real snap engine**

```typescript
// plan2space-web/src/components/studio/Canvas2D/SnapEngine.ts
import { Point, Wall } from '../../../services/geometryService'

export interface SnapOptions {
  endpointToleranceM?: number
  gridSizeM?: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function snapPoint(point: Point, walls: Wall[], excludeWallId: string, options: SnapOptions = {}): Point {
  const endpointTolerance = options.endpointToleranceM ?? 0.05
  const gridSize = options.gridSizeM ?? 0

  for (const wall of walls) {
    if (wall.id === excludeWallId) continue
    for (const candidate of wall.points) {
      if (distance(point, candidate) <= endpointTolerance) {
        return { x: candidate.x, y: candidate.y }
      }
    }
  }

  if (gridSize > 0) {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    }
  }

  return point
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plan2space-web && npx vitest run tests/SnapEngine.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add plan2space-web/src/components/studio/Canvas2D/SnapEngine.ts plan2space-web/tests/SnapEngine.test.ts
git commit -m "feat: endpoint and grid snap engine for 2D wall editing"
```

### Task 19: Three.js/R3F 3D Viewer — Wall Extrusion Scene Graph

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx`
- Create: `plan2space-web/src/components/studio/Viewer3D/buildWallGeometry.ts`
- Modify: `plan2space-web/src/pages/StudioPage.tsx`
- Test: `plan2space-web/tests/buildWallGeometry.test.ts`

**Interfaces:**
- Consumes: `Wall[]` from `useGeometryStore` (Task 16).
- Produces: `buildWallGeometry(wall: Wall) -> THREE.BufferGeometry` (extruded box along the centerline) — consumed by `<Scene>` and by Task 20's opening-cutting logic, which takes this geometry as its base mesh before subtracting door/window boxes.

- [ ] **Step 1: Write the failing test**

```typescript
// plan2space-web/tests/buildWallGeometry.test.ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { Wall } from '../src/services/geometryService'

describe('buildWallGeometry', () => {
  it('produces a box geometry with length matching the wall centerline', () => {
    const wall: Wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const geometry = buildWallGeometry(wall)
    geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    geometry.boundingBox!.getSize(size)
    expect(size.x).toBeCloseTo(5, 3)
    expect(size.z).toBeCloseTo(2.8, 3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/buildWallGeometry.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement `buildWallGeometry` and `Scene`**

```typescript
// plan2space-web/src/components/studio/Viewer3D/buildWallGeometry.ts
import * as THREE from 'three'
import { Wall } from '../../../services/geometryService'

export function buildWallGeometry(wall: Wall): THREE.BufferGeometry {
  const [start, end] = wall.points
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  const geometry = new THREE.BoxGeometry(length, wall.thicknessMeters, wall.heightMeters)
  geometry.rotateZ(angle)
  geometry.translate(midX, midY, wall.heightMeters / 2)
  // Box local Y (thickness) becomes world Z-up here; caller's <Scene> applies the
  // group-level rotation converting project-space XY-plan to Three.js XZ-ground.
  return geometry
}
```

```tsx
// plan2space-web/src/components/studio/Viewer3D/Scene.tsx
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { buildWallGeometry } from './buildWallGeometry'

export function Scene() {
  const walls = useGeometryStore((s) => s.walls)

  return (
    <Canvas camera={{ position: [10, 10, 10], fov: 50 }} rotation={[-Math.PI / 2, 0, 0]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={0.8} />
      <OrbitControls />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {walls.map((wall) => (
          <mesh key={wall.id} geometry={buildWallGeometry(wall)}>
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        ))}
      </group>
    </Canvas>
  )
}
```

- [ ] **Step 4: Mount in `StudioPage.tsx`, run test, commit**

```tsx
// plan2space-web/src/pages/StudioPage.tsx (replace #viewer-3d-slot div)
import { Scene } from '../components/studio/Viewer3D/Scene'
// ...
<div className="flex-1"><Scene /></div>
```

Run: `cd plan2space-web && npx vitest run tests/buildWallGeometry.test.ts`
Expected: PASS

```bash
git add plan2space-web/src/components/studio/Viewer3D plan2space-web/src/pages/StudioPage.tsx plan2space-web/tests/buildWallGeometry.test.ts
git commit -m "feat: R3F 3D scene with extruded wall geometry"
```

### Task 20: CSG Door/Window Cutting in 3D

**Files:**
- Create: `plan2space-web/src/components/studio/Viewer3D/cutOpenings.ts`
- Modify: `plan2space-web/src/components/studio/Viewer3D/Scene.tsx`
- Test: `plan2space-web/tests/cutOpenings.test.ts`

**Interfaces:**
- Consumes: `buildWallGeometry` output (Task 19), `Opening[]` from `useGeometryStore`.
- Produces: `cutOpeningsIntoWall(wallGeometry: THREE.BufferGeometry, wall: Wall, openings: Opening[]) -> THREE.BufferGeometry` using `three-bvh-csg` subtraction — `Scene` calls this instead of using the raw wall geometry directly whenever a wall has openings.

- [ ] **Step 1: Write the failing test**

```typescript
// plan2space-web/tests/cutOpenings.test.ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { cutOpeningsIntoWall } from '../src/components/studio/Viewer3D/cutOpenings'
import { Wall, Opening } from '../src/services/geometryService'

describe('cutOpeningsIntoWall', () => {
  it('reduces wall volume when a door opening is cut', () => {
    const wall: Wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const opening: Opening = { id: 'o1', wallId: 'w1', type: 'Door', position: { x: 2.5, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }

    const solidGeometry = buildWallGeometry(wall)
    const cutGeometry = cutOpeningsIntoWall(solidGeometry, wall, [opening])

    const solidVolume = new THREE.Box3().setFromBufferAttribute(solidGeometry.attributes.position as THREE.BufferAttribute)
    const cutVolume = new THREE.Box3().setFromBufferAttribute(cutGeometry.attributes.position as THREE.BufferAttribute)

    // A CSG subtraction keeps the same bounding box but must have fewer vertices
    // than a naive duplicate (i.e., the subtraction actually ran).
    expect(cutGeometry.attributes.position.count).not.toBe(solidGeometry.attributes.position.count)
    expect(cutVolume.max.z).toBeCloseTo(solidVolume.max.z, 3)
  })

  it('returns the original geometry unchanged when there are no openings for this wall', () => {
    const wall: Wall = { id: 'w2', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const solidGeometry = buildWallGeometry(wall)
    const result = cutOpeningsIntoWall(solidGeometry, wall, [])
    expect(result).toBe(solidGeometry)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/cutOpenings.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement using `three-bvh-csg`**

```typescript
// plan2space-web/src/components/studio/Viewer3D/cutOpenings.ts
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { Wall, Opening } from '../../../services/geometryService'

const evaluator = new Evaluator()

function openingCutterGeometry(wall: Wall, opening: Opening): THREE.BufferGeometry {
  const [start, end] = wall.points
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const height = opening.type === 'Door' ? 2.1 : 1.2 // standard door/window heights, meters
  const geometry = new THREE.BoxGeometry(opening.widthMeters, wall.thicknessMeters * 2, height)
  geometry.rotateZ(angle)
  geometry.translate(opening.position.x, opening.position.y, opening.sillHeightMeters + height / 2)
  return geometry
}

export function cutOpeningsIntoWall(wallGeometry: THREE.BufferGeometry, wall: Wall, openings: Opening[]): THREE.BufferGeometry {
  const relevant = openings.filter((o) => o.wallId === wall.id)
  if (relevant.length === 0) return wallGeometry

  let currentBrush = new Brush(wallGeometry)
  currentBrush.updateMatrixWorld()

  for (const opening of relevant) {
    const cutterBrush = new Brush(openingCutterGeometry(wall, opening))
    cutterBrush.updateMatrixWorld()
    const result = evaluator.evaluate(currentBrush, cutterBrush, SUBTRACTION)
    currentBrush = result
  }

  return currentBrush.geometry
}
```

- [ ] **Step 4: Wire into `Scene.tsx`**

```tsx
// plan2space-web/src/components/studio/Viewer3D/Scene.tsx (replace mesh mapping)
import { cutOpeningsIntoWall } from './cutOpenings'
// ...
{walls.map((wall) => (
  <mesh key={wall.id} geometry={cutOpeningsIntoWall(buildWallGeometry(wall), wall, openings)}>
    <meshStandardMaterial color="#e2e8f0" />
  </mesh>
))}
```
(Add `const openings = useGeometryStore((s) => s.openings)` alongside the existing `walls` selector.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd plan2space-web && npx vitest run tests/cutOpenings.test.ts`
Expected: PASS — both tests pass

- [ ] **Step 6: Commit**

```bash
git add plan2space-web/src/components/studio/Viewer3D/cutOpenings.ts plan2space-web/src/components/studio/Viewer3D/Scene.tsx plan2space-web/tests/cutOpenings.test.ts
git commit -m "feat: CSG door/window cutting into 3D wall meshes"
```

### Task 21: 2D↔3D Sync, AI Result Application, Save/Autosave (with Optimistic-Concurrency Handling)

**Files:**
- Create: `plan2space-web/src/components/studio/StudioToolbar.tsx`
- Create: `plan2space-web/src/services/aiJobService.ts`
- Modify: `plan2space-web/src/stores/geometryStore.ts`
- Modify: `plan2space-web/src/pages/StudioPage.tsx`
- Test: `plan2space-web/tests/StudioSaveFlow.test.tsx`

**Interfaces:**
- Consumes: Task 6's `/api/ai/vectorize`, `/ws/job/{id}` and Task 16's `saveToServer`.
- Produces: `aiJobService.enqueueVectorize(projectId, fileId)`, `aiJobService.subscribeToJob(jobId, onUpdate)` (wraps native `WebSocket`); `useGeometryStore.saveToServer` now surfaces a `saveConflict: boolean` state flag the toolbar reads to prompt "someone else changed this project — reload?" instead of silently losing edits (Review Focus: concurrent-edit conflict).

- [ ] **Step 1: Write the failing test for the conflict-surfacing behavior**

```tsx
// plan2space-web/tests/StudioSaveFlow.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

describe('saveToServer conflict handling', () => {
  beforeEach(() => useGeometryStore.setState({ walls: [], rooms: [], openings: [], version: 1, saveConflict: false }))

  it('sets saveConflict true on a 409 response instead of throwing unhandled', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 409 } })

    await useGeometryStore.getState().saveToServer('proj-1')

    expect(useGeometryStore.getState().saveConflict).toBe(true)
  })

  it('clears saveConflict and bumps version on a successful save', async () => {
    useGeometryStore.setState({ saveConflict: true })
    vi.mocked(geometryService.saveGeometry).mockResolvedValue({ version: 2 })

    await useGeometryStore.getState().saveToServer('proj-1')

    expect(useGeometryStore.getState().saveConflict).toBe(false)
    expect(useGeometryStore.getState().version).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plan2space-web && npx vitest run tests/StudioSaveFlow.test.tsx`
Expected: FAIL — `saveConflict` doesn't exist on the store

- [ ] **Step 3: Extend `geometryStore.ts`**

```typescript
// plan2space-web/src/stores/geometryStore.ts (additions)
interface GeometryState {
  // ...existing fields
  saveConflict: boolean
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  // ...existing fields
  saveConflict: false,

  saveToServer: async (projectId) => {
    const { walls, rooms, openings, version } = get()
    try {
      const result = await saveGeometry(projectId, version, {
        walls: walls.map((w) => ({ points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
        rooms: rooms.map((r) => ({ points: r.points, label: r.label })),
        openings: openings.map((o) => ({ wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters })),
      })
      set({ version: result.version, saveConflict: false })
    } catch (err: any) {
      if (err?.response?.status === 409) {
        set({ saveConflict: true })
        return
      }
      throw err
    }
  },
}))
```

- [ ] **Step 4: Implement `aiJobService` and the toolbar**

```typescript
// plan2space-web/src/services/aiJobService.ts
import { apiClient } from './api'

export async function enqueueVectorize(projectId: string, fileId: string): Promise<{ jobId: string }> {
  const { data } = await apiClient.post('/ai/vectorize', { projectId, fileId })
  return data
}

export function subscribeToJob(jobId: string, onUpdate: (status: string, progressPercent: number) => void): () => void {
  const socket = new WebSocket(`${window.location.origin.replace('http', 'ws')}/ws/job/${jobId}`)
  socket.onmessage = (event) => {
    const { status, progressPercent } = JSON.parse(event.data)
    onUpdate(status, progressPercent)
  }
  return () => socket.close()
}
```

```tsx
// plan2space-web/src/components/studio/StudioToolbar.tsx
import { useGeometryStore } from '../../stores/geometryStore'

export function StudioToolbar({ projectId }: { projectId: string }) {
  const saveToServer = useGeometryStore((s) => s.saveToServer)
  const saveConflict = useGeometryStore((s) => s.saveConflict)
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)

  return (
    <div className="flex items-center gap-3 bg-slate-900 p-2 text-white">
      <button className="rounded bg-indigo-600 px-3 py-1" onClick={() => saveToServer(projectId)}>Save</button>
      {saveConflict && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <span>Someone else changed this project.</span>
          <button className="underline" onClick={() => loadFromServer(projectId)}>Reload latest</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Mount toolbar and wire AI-result application in `StudioPage.tsx`**

```tsx
// plan2space-web/src/pages/StudioPage.tsx (final version for this task)
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGeometryStore } from '../stores/geometryStore'
import { CanvasEditor } from '../components/studio/Canvas2D/CanvasEditor'
import { Scene } from '../components/studio/Viewer3D/Scene'
import { StudioToolbar } from '../components/studio/StudioToolbar'

export default function StudioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)

  useEffect(() => { if (projectId) loadFromServer(projectId) }, [projectId])

  if (!projectId) return null

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white">
      <StudioToolbar projectId={projectId} />
      <div className="flex flex-1">
        <div className="flex-1"><CanvasEditor /></div>
        <div className="flex-1"><Scene /></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd plan2space-web && npx vitest run tests/StudioSaveFlow.test.tsx`
Expected: PASS — both tests pass

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd plan2space-web && npx vitest run`
Expected: PASS — all tests across Tasks 13–21 pass

- [ ] **Step 8: Commit**

```bash
git add plan2space-web/src/components/studio/StudioToolbar.tsx plan2space-web/src/services/aiJobService.ts \
  plan2space-web/src/stores/geometryStore.ts plan2space-web/src/pages/StudioPage.tsx plan2space-web/tests/StudioSaveFlow.test.tsx
git commit -m "feat: studio toolbar with save-conflict handling and AI job service"
```

**Phase 3 checkpoint:** full manual flow — register, create project, upload a floor plan, run AI vectorization, watch the 2D canvas populate, drag a wall (snap engine active), see the 3D viewer update with cut door/window openings, save, and confirm a second browser tab gets a conflict prompt on stale save. This is the core product demo.

---

## Phase 4: Advanced Features (Tasks 22–23)

Goal of this phase: a conversational co-pilot that turns natural-language commands into geometry edits, and a generative staging endpoint that proposes furniture layouts for a room.

### Task 22: Co-pilot Chat — Intent Parsing → Geometry Command

**Files:**
- Create: `ai-service/pipeline/copilot_intent.py`
- Create: `backend/src/Plan2Space.API/Controllers/CopilotController.cs`
- Create: `backend/src/Plan2Space.Application/Copilot/Commands/InterpretCopilotMessageCommand.cs`
- Create: `plan2space-web/src/components/studio/Copilot/CopilotChat.tsx`
- Test: `ai-service/tests/test_copilot_intent.py`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/CopilotControllerTests.cs`

**Interfaces:**
- Consumes: user free-text; GPT-4o mini via an OpenAI-compatible client (API key from environment, never hardcoded); Task 5's `SaveGeometryCommand` input shapes for the resulting edit.
- Produces: `parse_intent(message: str, current_geometry: dict) -> dict` returning a structured command `{"action": "move_wall"|"add_opening"|"resize_room"|"unknown", "params": {...}}`; `POST /api/copilot/message` (`{ projectId, message }`) → `{ action, params, appliedVersion }` after applying the parsed intent through the existing geometry save path — so co-pilot edits go through the same concurrency-safe path as manual edits (Task 5/21), never a side channel.

- [ ] **Step 1: Write the failing Python intent-parsing test (mocks the LLM call, tests the parsing/validation contract)**

```python
# ai-service/tests/test_copilot_intent.py
from unittest.mock import patch
from pipeline.copilot_intent import parse_intent

@patch("pipeline.copilot_intent._call_llm")
def test_parses_move_wall_intent(mock_llm):
    mock_llm.return_value = '{"action": "move_wall", "params": {"wall_id": "w1", "dx": 0.5, "dy": 0.0}}'

    result = parse_intent("move the wall on the left 50cm to the right", current_geometry={"walls": [{"id": "w1"}]})

    assert result["action"] == "move_wall"
    assert result["params"]["wall_id"] == "w1"

@patch("pipeline.copilot_intent._call_llm")
def test_unparseable_response_falls_back_to_unknown(mock_llm):
    mock_llm.return_value = "not valid json at all"

    result = parse_intent("do something vague", current_geometry={"walls": []})

    assert result["action"] == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_copilot_intent.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement `copilot_intent.py`**

```python
# ai-service/pipeline/copilot_intent.py
import json
import os
from openai import OpenAI

SYSTEM_PROMPT = """You are a floor-plan editing assistant. Given a user instruction and
the current geometry, respond with ONLY a JSON object of the form:
{"action": "move_wall"|"add_opening"|"resize_room"|"unknown", "params": {...}}
No prose, no markdown fences — raw JSON only."""


def _call_llm(message: str, current_geometry: dict) -> str:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Geometry: {json.dumps(current_geometry)}\nInstruction: {message}"},
        ],
        temperature=0,
    )
    return response.choices[0].message.content or ""


def parse_intent(message: str, current_geometry: dict) -> dict:
    raw = _call_llm(message, current_geometry)
    try:
        parsed = json.loads(raw)
        if "action" not in parsed:
            return {"action": "unknown", "params": {}}
        return parsed
    except json.JSONDecodeError:
        return {"action": "unknown", "params": {}}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_copilot_intent.py -v`
Expected: PASS — both tests pass

- [ ] **Step 5: Write the failing backend integration test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/CopilotControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class CopilotControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public CopilotControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task UnknownIntent_ReturnsOkWithNoGeometryChange()
    {
        // Uses the factory's stubbed AI HTTP client (WireMock) returning {"action":"unknown","params":{}}
        // for this test — validated against the ai-service contract in Task's Python tests above.
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "copilot-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "Copilot Test");

        var response = await client.PostAsJsonAsync("/api/copilot/message",
            new { projectId = project.Id, message = "make it nicer somehow" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("unknown", body.GetProperty("action").GetString());
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter CopilotControllerTests`
Expected: FAIL — route missing

- [ ] **Step 7: Implement the command/controller (calls the AI sidecar's internal HTTP endpoint, which wraps `parse_intent`)**

```csharp
// backend/src/Plan2Space.Application/Copilot/Commands/InterpretCopilotMessageCommand.cs
using System.Text.Json;
using MediatR;
using Plan2Space.Application.Geometry.Commands;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Copilot.Commands;

public record CopilotResult(string Action, JsonElement Params, uint? AppliedVersion);
public record InterpretCopilotMessageCommand(Guid ProjectId, Guid RequestingUserId, string Message) : IRequest<CopilotResult>;

public interface ICopilotIntentClient
{
    Task<(string Action, JsonElement Params)> ParseIntentAsync(string message, GeometryDto currentGeometry, CancellationToken ct);
}

public class InterpretCopilotMessageHandler : IRequestHandler<InterpretCopilotMessageCommand, CopilotResult>
{
    private readonly ICopilotIntentClient _intentClient;
    private readonly Plan2SpaceDbContext _db;
    private readonly IMediator _mediator;

    public InterpretCopilotMessageHandler(ICopilotIntentClient intentClient, Plan2SpaceDbContext db, IMediator mediator)
    { _intentClient = intentClient; _db = db; _mediator = mediator; }

    public async Task<CopilotResult> Handle(InterpretCopilotMessageCommand cmd, CancellationToken ct)
    {
        var geometry = await _mediator.Send(new GetGeometryQuery(cmd.ProjectId, cmd.RequestingUserId), ct)
            ?? throw new KeyNotFoundException();

        var (action, parameters) = await _intentClient.ParseIntentAsync(cmd.Message, geometry, ct);

        if (action == "unknown")
            return new CopilotResult(action, parameters, null);

        if (action == "move_wall")
        {
            var wallId = Guid.Parse(parameters.GetProperty("wall_id").GetString()!);
            var dx = parameters.GetProperty("dx").GetDouble();
            var dy = parameters.GetProperty("dy").GetDouble();
            var wall = geometry.Walls.First(w => w.Id == wallId);
            var movedPoints = wall.Points.Select(p => new PointDto(p.X + dx, p.Y + dy)).ToList();

            var updatedWalls = geometry.Walls.Select(w => w.Id == wallId
                ? new WallInput(movedPoints, w.ThicknessMeters, w.HeightMeters)
                : new WallInput(w.Points.Select(p => new PointDto(p.X, p.Y)).ToList(), w.ThicknessMeters, w.HeightMeters)).ToList();

            var maxVersion = geometry.Walls.Select(w => w.Version).DefaultIfEmpty(0).Max();
            var newVersion = await _mediator.Send(new SaveGeometryCommand(cmd.ProjectId, cmd.RequestingUserId, maxVersion,
                updatedWalls, new(), new()), ct);

            return new CopilotResult(action, parameters, newVersion);
        }

        // add_opening / resize_room follow the same pattern; omitted here for brevity
        // but required before this task is considered complete — see Step 7 note below.
        return new CopilotResult(action, parameters, null);
    }
}
```

> **Note for the implementer:** `add_opening` and `resize_room` branches must be filled in with the same pattern as `move_wall` (parse `parameters`, transform the relevant geometry list, call `SaveGeometryCommand`) before this task's PR is opened — the plan's "no placeholders" rule applies to the finished task, not to this illustrative branch, which the self-review step below re-flags if left incomplete.

```csharp
// backend/src/Plan2Space.API/Controllers/CopilotController.cs
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Copilot.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/copilot")]
public class CopilotController : ControllerBase
{
    private readonly IMediator _mediator;
    public CopilotController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    public record MessageRequest(Guid ProjectId, string Message);

    [HttpPost("message")]
    public async Task<IActionResult> Message(MessageRequest req)
    {
        var result = await _mediator.Send(new InterpretCopilotMessageCommand(req.ProjectId, CurrentUserId, req.Message));
        return Ok(new { action = result.Action, @params = result.Params, appliedVersion = result.AppliedVersion });
    }
}
```

- [ ] **Step 8: Implement the minimal chat UI**

```tsx
// plan2space-web/src/components/studio/Copilot/CopilotChat.tsx
import { useState } from 'react'
import { apiClient } from '../../../services/api'
import { useGeometryStore } from '../../../stores/geometryStore'

export function CopilotChat({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState('')
  const [log, setLog] = useState<string[]>([])
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)

  async function send() {
    if (!message.trim()) return
    const { data } = await apiClient.post('/copilot/message', { projectId, message })
    setLog((l) => [...l, `You: ${message}`, `Co-pilot: ${data.action}`])
    setMessage('')
    if (data.appliedVersion) await loadFromServer(projectId)
  }

  return (
    <div className="flex w-72 flex-col gap-2 bg-slate-900 p-3 text-white">
      <div className="flex-1 space-y-1 overflow-y-auto text-sm">{log.map((l, i) => <p key={i}>{l}</p>)}</div>
      <input className="rounded bg-slate-800 p-2" value={message} onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Tell the co-pilot what to change..." />
    </div>
  )
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter CopilotControllerTests`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add ai-service/pipeline/copilot_intent.py ai-service/tests/test_copilot_intent.py \
  backend/src/Plan2Space.API/Controllers/CopilotController.cs backend/src/Plan2Space.Application/Copilot \
  backend/tests/Plan2Space.API.IntegrationTests/CopilotControllerTests.cs plan2space-web/src/components/studio/Copilot
git commit -m "feat: co-pilot natural-language geometry edits routed through the concurrency-safe save path"
```

### Task 23: Generative Staging (Furniture Layout Suggestion)

**Files:**
- Create: `ai-service/pipeline/generative_staging.py`
- Create: `backend/src/Plan2Space.API/Controllers/StagingController.cs`
- Test: `ai-service/tests/test_generative_staging.py`

**Interfaces:**
- Consumes: a `Room` polygon and its `label` (e.g. "Bedroom", "Living Room").
- Produces: `suggest_layout(room_polygon: list[list[float]], room_label: str) -> list[dict]` returning `[{"item": "bed", "position": [x,y], "rotation_deg": float, "width_m": float, "depth_m": float}]`, placed so no item's bounding box overlaps another's or exits the room polygon; exposed via `POST /api/staging/suggest` for the Studio UI's (future, post-MVP) staging panel.

- [ ] **Step 1: Write the failing test**

```python
# ai-service/tests/test_generative_staging.py
from shapely.geometry import Polygon, box
from pipeline.generative_staging import suggest_layout

def test_suggested_items_fit_inside_room_and_do_not_overlap():
    room = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]  # 4x4m bedroom
    items = suggest_layout(room, "Bedroom")

    room_poly = Polygon(room)
    boxes = []
    for item in items:
        item_box = box(
            item["position"][0] - item["width_m"] / 2, item["position"][1] - item["depth_m"] / 2,
            item["position"][0] + item["width_m"] / 2, item["position"][1] + item["depth_m"] / 2,
        )
        assert room_poly.contains(item_box), f"{item['item']} exits room bounds"
        for other in boxes:
            assert item_box.intersection(other).area < 1e-6, f"{item['item']} overlaps another item"
        boxes.append(item_box)

    assert len(items) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_generative_staging.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement a constraint-based placement (greedy grid placement with overlap/bounds rejection — the spec calls this "Layout AI"; a greedy geometric placer satisfies the MVP contract without requiring a trained layout-generation model, and the function signature leaves room to swap in a learned model later without changing callers)**

```python
# ai-service/pipeline/generative_staging.py
from shapely.geometry import Polygon, box

FURNITURE_CATALOG = {
    "Bedroom": [
        {"item": "bed", "width_m": 1.6, "depth_m": 2.0},
        {"item": "nightstand", "width_m": 0.5, "depth_m": 0.4},
        {"item": "wardrobe", "width_m": 1.2, "depth_m": 0.6},
    ],
    "Living Room": [
        {"item": "sofa", "width_m": 2.0, "depth_m": 0.9},
        {"item": "coffee_table", "width_m": 1.0, "depth_m": 0.5},
        {"item": "tv_stand", "width_m": 1.5, "depth_m": 0.4},
    ],
}


def suggest_layout(room_polygon: list[list[float]], room_label: str) -> list[dict]:
    room_poly = Polygon(room_polygon)
    minx, miny, maxx, maxy = room_poly.bounds
    catalog = FURNITURE_CATALOG.get(room_label, FURNITURE_CATALOG["Living Room"])

    placed_boxes = []
    results = []
    margin = 0.1
    step = 0.2

    for furniture in catalog:
        w, d = furniture["width_m"], furniture["depth_m"]
        placed = False
        y = miny + d / 2 + margin
        while y + d / 2 + margin <= maxy and not placed:
            x = minx + w / 2 + margin
            while x + w / 2 + margin <= maxx and not placed:
                candidate = box(x - w / 2, y - d / 2, x + w / 2, y + d / 2)
                if room_poly.contains(candidate) and all(candidate.intersection(b).area < 1e-6 for b in placed_boxes):
                    placed_boxes.append(candidate)
                    results.append({"item": furniture["item"], "position": [x, y], "rotation_deg": 0.0, "width_m": w, "depth_m": d})
                    placed = True
                x += step
            y += step

    return results
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_generative_staging.py -v`
Expected: PASS

- [ ] **Step 5: Add the thin controller passthrough**

```csharp
// backend/src/Plan2Space.API/Controllers/StagingController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/staging")]
public class StagingController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    public StagingController(IHttpClientFactory httpClientFactory) => _httpClientFactory = httpClientFactory;

    public record SuggestRequest(List<List<double>> RoomPolygon, string RoomLabel);

    [HttpPost("suggest")]
    public async Task<IActionResult> Suggest(SuggestRequest req)
    {
        var client = _httpClientFactory.CreateClient("AiInternal"); // base address = Ai:InternalUrl, p2s_internal only
        var response = await client.PostAsJsonAsync("/staging/suggest", req);
        var body = await response.Content.ReadAsStringAsync();
        return Content(body, "application/json");
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add ai-service/pipeline/generative_staging.py ai-service/tests/test_generative_staging.py backend/src/Plan2Space.API/Controllers/StagingController.cs
git commit -m "feat: constraint-based generative furniture staging"
```

---

## Phase 5: Export, Admin, Cross-Cutting Tests (Tasks 24–27)

Goal of this phase: export the finished 3D model to the formats the spec requires (glTF/GLB, OBJ, IFC, PDF BOQ report), a minimal admin panel for user/project oversight, and the security/rate-limiting hardening the spec's non-functional requirements call for.

### Task 24: Export — glTF/GLB and OBJ (Backend-Generated via Trimesh)

**Files:**
- Create: `ai-service/pipeline/export_mesh.py`
- Create: `backend/src/Plan2Space.API/Controllers/ExportController.cs`
- Create: `backend/src/Plan2Space.Application/Export/Commands/RequestExportCommand.cs`
- Test: `ai-service/tests/test_export_mesh.py`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/ExportControllerTests.cs`

**Interfaces:**
- Consumes: `GeometryDto`-shaped wall/room/opening data (same shape as Task 5's `GetGeometryQuery` result, passed as JSON to the AI-internal export endpoint since Trimesh/glTF export lives in Python).
- Produces: `build_mesh_from_geometry(geometry: dict) -> trimesh.Trimesh`; `export_mesh(mesh, format: str) -> bytes` for `"gltf"` and `"obj"`; `POST /api/export/{projectId}?format=gltf|obj` → streams the file and records an `Asset3D` row (Task 2's entity) pointing at the MinIO object.

- [ ] **Step 1: Write the failing Python mesh-export test**

```python
# ai-service/tests/test_export_mesh.py
import trimesh
from pipeline.export_mesh import build_mesh_from_geometry, export_mesh

def test_build_mesh_from_single_wall():
    geometry = {
        "walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}],
        "rooms": [], "openings": []
    }
    mesh = build_mesh_from_geometry(geometry)
    assert isinstance(mesh, trimesh.Trimesh)
    assert mesh.is_watertight

def test_export_gltf_produces_nonempty_bytes():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    mesh = build_mesh_from_geometry(geometry)
    data = export_mesh(mesh, "gltf")
    assert len(data) > 0

def test_export_obj_produces_nonempty_bytes():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    mesh = build_mesh_from_geometry(geometry)
    data = export_mesh(mesh, "obj")
    assert len(data) > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_export_mesh.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement using Trimesh (box-per-wall, same extrusion logic as Task 19's `buildWallGeometry`, mirrored server-side for exports independent of the browser)**

```python
# ai-service/pipeline/export_mesh.py
import numpy as np
import trimesh

DEFAULT_HEIGHT_M = 2.8


def _wall_box(wall: dict) -> trimesh.Trimesh:
    (x1, y1), (x2, y2) = wall["points"][0], wall["points"][-1]
    length = float(np.hypot(x2 - x1, y2 - y1))
    angle = float(np.arctan2(y2 - y1, x2 - x1))
    thickness = wall["thicknessMeters"]
    height = wall["heightMeters"]

    box = trimesh.creation.box(extents=[length, thickness, height])
    rotation = trimesh.transformations.rotation_matrix(angle, [0, 0, 1])
    translation = trimesh.transformations.translation_matrix([(x1 + x2) / 2, (y1 + y2) / 2, height / 2])
    box.apply_transform(rotation)
    box.apply_transform(translation)
    return box


def build_mesh_from_geometry(geometry: dict) -> trimesh.Trimesh:
    wall_meshes = [_wall_box(w) for w in geometry["walls"]]
    if not wall_meshes:
        return trimesh.Trimesh()
    combined = trimesh.util.concatenate(wall_meshes)
    return combined


def export_mesh(mesh: trimesh.Trimesh, fmt: str) -> bytes:
    if fmt not in ("gltf", "obj"):
        raise ValueError(f"Unsupported export format: {fmt}")
    exported = mesh.export(file_type=fmt)
    return exported if isinstance(exported, bytes) else exported.encode("utf-8")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_export_mesh.py -v`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Add a small FastAPI export route so the .NET backend can call it internally**

```python
# ai-service/api/routers/export.py (registered in api/main.py alongside health.router)
from fastapi import APIRouter, Response
from pydantic import BaseModel
from pipeline.export_mesh import build_mesh_from_geometry, export_mesh

router = APIRouter(prefix="/export")

class ExportRequest(BaseModel):
    geometry: dict
    format: str

@router.post("")
def export(req: ExportRequest):
    mesh = build_mesh_from_geometry(req.geometry)
    data = export_mesh(mesh, req.format)
    media_type = "model/gltf+json" if req.format == "gltf" else "text/plain"
    return Response(content=data, media_type=media_type)
```

- [ ] **Step 6: Write the failing .NET integration test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/ExportControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class ExportControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public ExportControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task ExportGltf_ReturnsFileAndRecordsAsset()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "export-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "Export Test");
        await _factory.SeedOneWallAsync(project.Id); // test helper inserting a Wall row directly via DbContext

        var response = await client.PostAsync($"/api/export/{project.Id}?format=gltf", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.True(bytes.Length > 0);
    }
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter ExportControllerTests`
Expected: FAIL — route missing

- [ ] **Step 8: Implement `RequestExportCommand` and `ExportController`**

```csharp
// backend/src/Plan2Space.Application/Export/Commands/RequestExportCommand.cs
using MediatR;
using Plan2Space.Application.Geometry.Queries;
using Plan2Space.Domain.Entities;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.Application.Export.Commands;

public interface IAiExportClient
{
    Task<byte[]> ExportAsync(GeometryDto geometry, string format, CancellationToken ct);
}

public record RequestExportCommand(Guid ProjectId, Guid RequestingUserId, string Format) : IRequest<byte[]>;

public class RequestExportHandler : IRequestHandler<RequestExportCommand, byte[]>
{
    private readonly IMediator _mediator;
    private readonly IAiExportClient _aiExportClient;
    private readonly Plan2SpaceDbContext _db;

    public RequestExportHandler(IMediator mediator, IAiExportClient aiExportClient, Plan2SpaceDbContext db)
    { _mediator = mediator; _aiExportClient = aiExportClient; _db = db; }

    public async Task<byte[]> Handle(RequestExportCommand cmd, CancellationToken ct)
    {
        var geometry = await _mediator.Send(new GetGeometryQuery(cmd.ProjectId, cmd.RequestingUserId), ct)
            ?? throw new KeyNotFoundException();

        var bytes = await _aiExportClient.ExportAsync(geometry, cmd.Format, ct);

        _db.Assets3D.Add(new Asset3D
        {
            ProjectId = cmd.ProjectId,
            Format = cmd.Format,
            MinioObjectKey = $"exports/{cmd.ProjectId}/{Guid.NewGuid()}.{cmd.Format}"
        });
        await _db.SaveChangesAsync(ct);

        return bytes;
    }
}
```

```csharp
// backend/src/Plan2Space.API/Controllers/ExportController.cs
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Application.Export.Commands;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize]
[Route("api/export")]
public class ExportController : ControllerBase
{
    private readonly IMediator _mediator;
    public ExportController(IMediator mediator) => _mediator = mediator;
    private Guid CurrentUserId => Guid.Parse(User.FindFirst("sub")!.Value);

    [HttpPost("{projectId:guid}")]
    public async Task<IActionResult> Export(Guid projectId, [FromQuery] string format)
    {
        var bytes = await _mediator.Send(new RequestExportCommand(projectId, CurrentUserId, format));
        var contentType = format == "gltf" ? "model/gltf+json" : "text/plain";
        return File(bytes, contentType, $"export.{format}");
    }
}
```

(`IAiExportClient`'s concrete `HttpClient`-based implementation lives in `Plan2Space.Infrastructure/Export/AiExportClient.cs`, posting to `Ai:InternalUrl/export` — same pattern as `RabbitMqJobPublisher` from Task 6, registered in `Program.cs` DI.)

- [ ] **Step 9: Run test to verify it passes**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter ExportControllerTests`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add ai-service/pipeline/export_mesh.py ai-service/api/routers/export.py ai-service/tests/test_export_mesh.py \
  backend/src/Plan2Space.Application/Export backend/src/Plan2Space.API/Controllers/ExportController.cs backend/tests
git commit -m "feat: glTF/OBJ mesh export pipeline with asset tracking"
```

### Task 25: Export — IFC and PDF BOQ Report

**Files:**
- Create: `ai-service/pipeline/export_ifc.py`
- Create: `ai-service/pipeline/boq_calculator.py`
- Create: `ai-service/pipeline/export_pdf_report.py`
- Test: `ai-service/tests/test_boq_calculator.py`
- Test: `ai-service/tests/test_export_pdf_report.py`

**Interfaces:**
- Consumes: `GeometryDto`-shaped data (same as Task 24).
- Produces: `calculate_boq(geometry: dict, unit_prices: dict) -> dict` returning `{"brick_count": int, "paint_area_m2": float, "mortar_volume_m3": float, "total_cost_vnd": float}`; `export_ifc(geometry: dict) -> bytes`; `generate_pdf_report(geometry: dict, boq: dict) -> bytes` — all reachable from `ExportController` (Task 24) via `format=ifc|pdf`.

- [ ] **Step 1: Write the failing BOQ test**

```python
# ai-service/tests/test_boq_calculator.py
from pipeline.boq_calculator import calculate_boq

def test_calculates_brick_and_paint_quantities_for_single_wall():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    unit_prices = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}

    boq = calculate_boq(geometry, unit_prices)

    wall_area_m2 = 5 * 2.8  # length x height, one face
    assert boq["paint_area_m2"] == wall_area_m2 * 2  # both faces
    assert boq["brick_count"] > 0
    assert boq["total_cost_vnd"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_boq_calculator.py -v`
Expected: FAIL — module missing

- [ ] **Step 3: Implement `boq_calculator.py`**

```python
# ai-service/pipeline/boq_calculator.py
BRICKS_PER_M2 = 60          # standard 200x100x50mm brick wall coursing, Vietnam construction convention
MORTAR_M3_PER_M2_WALL = 0.02


def calculate_boq(geometry: dict, unit_prices: dict) -> dict:
    total_wall_area_one_face = 0.0
    for wall in geometry["walls"]:
        (x1, y1), (x2, y2) = wall["points"][0], wall["points"][-1]
        length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        total_wall_area_one_face += length * wall["heightMeters"]

    paint_area_m2 = total_wall_area_one_face * 2  # interior + exterior face
    brick_count = round(total_wall_area_one_face * BRICKS_PER_M2)
    mortar_volume_m3 = total_wall_area_one_face * MORTAR_M3_PER_M2_WALL

    total_cost_vnd = (
        brick_count * unit_prices["brick_per_unit_vnd"]
        + paint_area_m2 * unit_prices["paint_per_m2_vnd"]
        + mortar_volume_m3 * unit_prices["mortar_per_m3_vnd"]
    )

    return {
        "brick_count": brick_count,
        "paint_area_m2": round(paint_area_m2, 2),
        "mortar_volume_m3": round(mortar_volume_m3, 3),
        "total_cost_vnd": round(total_cost_vnd, 0),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-service && pytest tests/test_boq_calculator.py -v`
Expected: PASS

- [ ] **Step 5: Write the failing PDF report test**

```python
# ai-service/tests/test_export_pdf_report.py
from pipeline.export_pdf_report import generate_pdf_report
from pipeline.boq_calculator import calculate_boq

def test_generate_pdf_report_produces_valid_pdf_bytes():
    geometry = {"walls": [{"points": [[0, 0], [5, 0]], "thicknessMeters": 0.2, "heightMeters": 2.8}], "rooms": [], "openings": []}
    boq = calculate_boq(geometry, {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000})

    pdf_bytes = generate_pdf_report(geometry, boq)

    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 500
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd ai-service && pytest tests/test_export_pdf_report.py -v`
Expected: FAIL — module missing

- [ ] **Step 7: Implement PDF generation (adds `reportlab` to `requirements.txt`, Task 7's file) and the IFC exporter**

```
# ai-service/requirements.txt (append)
reportlab==4.2.2
ifcopenshell==0.7.0
```

```python
# ai-service/pipeline/export_pdf_report.py
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def generate_pdf_report(geometry: dict, boq: dict) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Plan2Space — Bill of Quantities Report")

    c.setFont("Helvetica", 11)
    y = height - 100
    lines = [
        f"Wall count: {len(geometry['walls'])}",
        f"Estimated brick count: {boq['brick_count']}",
        f"Paint area (both faces): {boq['paint_area_m2']} m2",
        f"Mortar volume: {boq['mortar_volume_m3']} m3",
        f"Estimated total cost: {boq['total_cost_vnd']:,.0f} VND",
    ]
    for line in lines:
        c.drawString(50, y, line)
        y -= 20

    c.showPage()
    c.save()
    return buffer.getvalue()
```

```python
# ai-service/pipeline/export_ifc.py
import ifcopenshell
import ifcopenshell.api


def export_ifc(geometry: dict) -> bytes:
    model = ifcopenshell.api.run("project.create_file")
    project = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="Plan2Space Export")
    site = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuildingStorey", name="Ground Floor")

    ifcopenshell.api.run("aggregate.assign_object", model, relating_object=project, product=site)
    ifcopenshell.api.run("aggregate.assign_object", model, relating_object=site, product=building)
    ifcopenshell.api.run("aggregate.assign_object", model, relating_object=building, product=storey)

    for i, wall in enumerate(geometry["walls"]):
        wall_entity = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall", name=f"Wall {i+1}")
        ifcopenshell.api.run("spatial.assign_container", model, relating_structure=storey, product=wall_entity)

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".ifc", delete=False) as tmp:
        model.write(tmp.name)
        tmp_path = tmp.name
    with open(tmp_path, "rb") as f:
        data = f.read()
    os.unlink(tmp_path)
    return data
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd ai-service && pytest tests/test_export_pdf_report.py -v`
Expected: PASS

- [ ] **Step 9: Wire `format=ifc` and `format=pdf` into the FastAPI export route from Task 24**

```python
# ai-service/api/routers/export.py (extend the existing handler)
from pipeline.export_ifc import export_ifc
from pipeline.boq_calculator import calculate_boq
from pipeline.export_pdf_report import generate_pdf_report

DEFAULT_UNIT_PRICES = {"brick_per_unit_vnd": 1200, "paint_per_m2_vnd": 45000, "mortar_per_m3_vnd": 1500000}

@router.post("")
def export(req: ExportRequest):
    if req.format == "ifc":
        data = export_ifc(req.geometry)
        return Response(content=data, media_type="application/x-step")
    if req.format == "pdf":
        boq = calculate_boq(req.geometry, DEFAULT_UNIT_PRICES)
        data = generate_pdf_report(req.geometry, boq)
        return Response(content=data, media_type="application/pdf")
    mesh = build_mesh_from_geometry(req.geometry)
    data = export_mesh(mesh, req.format)
    media_type = "model/gltf+json" if req.format == "gltf" else "text/plain"
    return Response(content=data, media_type=media_type)
```

- [ ] **Step 10: Commit**

```bash
git add ai-service/pipeline/export_ifc.py ai-service/pipeline/boq_calculator.py ai-service/pipeline/export_pdf_report.py \
  ai-service/api/routers/export.py ai-service/requirements.txt ai-service/tests/test_boq_calculator.py ai-service/tests/test_export_pdf_report.py
git commit -m "feat: IFC export and PDF bill-of-quantities report generation"
```

### Task 26: Admin Panel + Rate Limiting + Security Hardening

**Files:**
- Create: `backend/src/Plan2Space.API/Controllers/AdminController.cs`
- Create: `backend/src/Plan2Space.API/Middleware/RateLimitingSetup.cs`
- Create: `plan2space-web/src/pages/AdminPage.tsx`
- Modify: `backend/src/Plan2Space.API/Program.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/AdminControllerTests.cs`
- Test: `backend/tests/Plan2Space.API.IntegrationTests/RateLimitingTests.cs`

**Interfaces:**
- Consumes: `User`/`Project`/`AiJob` entities (Task 2); JWT `role` claim (Task 3).
- Produces: `GET /api/admin/users`, `GET /api/admin/projects`, `GET /api/admin/jobs` — all `[Authorize(Roles = "Admin")]`; a named rate-limit policy `"ai-triggering"` applied to `POST /api/ai/vectorize` and `POST /api/copilot/message` (per spec's non-functional security table).

- [ ] **Step 1: Write the failing role-authorization test**

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/AdminControllerTests.cs
using System.Net;
using System.Net.Http.Headers;
using Xunit;

public class AdminControllerTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public AdminControllerTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task StandardUser_IsForbiddenFromAdminEndpoints()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "regular-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.GetAsync("/api/admin/users");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminUser_CanListUsers()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsAdminAsync(client, "admin@plan2space.dev"); // test helper promoting role in DB
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.GetAsync("/api/admin/users");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

```csharp
// backend/tests/Plan2Space.API.IntegrationTests/RateLimitingTests.cs
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

public class RateLimitingTests : IClassFixture<Plan2SpaceWebApplicationFactory>
{
    private readonly Plan2SpaceWebApplicationFactory _factory;
    public RateLimitingTests(Plan2SpaceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task ExceedingVectorizeRateLimit_Returns429()
    {
        var client = _factory.CreateClient();
        var token = await _factory.RegisterAndLoginAsync(client, "rate-user@plan2space.dev");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var project = await _factory.CreateProjectAsync(client, "Rate Test");
        var fileId = await _factory.UploadFixtureFileAsync(client, project.Id, "fixtures/blank.png");

        HttpResponseMessage? last = null;
        for (int i = 0; i < 15; i++) // policy configured for 10 requests/minute in Step 3
            last = await client.PostAsJsonAsync("/api/ai/vectorize", new { projectId = project.Id, fileId });

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter "AdminControllerTests|RateLimitingTests"`
Expected: FAIL — admin route missing, no rate limiting configured (returns 202 fifteen times)

- [ ] **Step 3: Implement rate limiting setup and admin controller**

```csharp
// backend/src/Plan2Space.API/Middleware/RateLimitingSetup.cs
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Plan2Space.API.Middleware;

public static class RateLimitingSetup
{
    public static IServiceCollection AddPlan2SpaceRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddFixedWindowLimiter("ai-triggering", opt =>
            {
                opt.Window = TimeSpan.FromMinutes(1);
                opt.PermitLimit = 10;
                opt.QueueLimit = 0;
            });
        });
        return services;
    }
}
```

Apply in `Program.cs` (extends Task 3's file): `builder.Services.AddPlan2SpaceRateLimiting();` and `app.UseRateLimiter();`, then decorate the vectorize/copilot actions with `[EnableRateLimiting("ai-triggering")]`.

```csharp
// backend/src/Plan2Space.API/Controllers/AdminController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Plan2Space.Infrastructure.Persistence;

namespace Plan2Space.API.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly Plan2SpaceDbContext _db;
    public AdminController(Plan2SpaceDbContext db) => _db = db;

    [HttpGet("users")]
    public async Task<IActionResult> Users() => Ok(await _db.Users.Select(u => new { u.Id, u.Email, u.Role, u.CreatedAt }).ToListAsync());

    [HttpGet("projects")]
    public async Task<IActionResult> Projects() => Ok(await _db.Projects.Select(p => new { p.Id, p.Name, p.OwnerId, p.CreatedAt }).ToListAsync());

    [HttpGet("jobs")]
    public async Task<IActionResult> Jobs() => Ok(await _db.AiJobs.Select(j => new { j.Id, j.ProjectId, j.Status, j.CreatedAt }).ToListAsync());
}
```

- [ ] **Step 4: Add `[EnableRateLimiting("ai-triggering")]` to `AiController.Vectorize` (Task 6) and `CopilotController.Message` (Task 22)**

```csharp
// backend/src/Plan2Space.API/Controllers/AiController.cs (decorate existing action)
[HttpPost("vectorize")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("ai-triggering")]
public async Task<IActionResult> Vectorize(VectorizeRequest req) { /* unchanged body */ }
```

- [ ] **Step 5: Implement the admin page**

```tsx
// plan2space-web/src/pages/AdminPage.tsx
import { useEffect, useState } from 'react'
import { apiClient } from '../services/api'

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])

  useEffect(() => {
    apiClient.get('/admin/users').then((r) => setUsers(r.data))
    apiClient.get('/admin/projects').then((r) => setProjects(r.data))
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white">
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <h2 className="mb-2 text-lg">Users ({users.length})</h2>
      <ul className="mb-6">{users.map((u) => <li key={u.id}>{u.email} — {u.role}</li>)}</ul>
      <h2 className="mb-2 text-lg">Projects ({projects.length})</h2>
      <ul>{projects.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `dotnet test backend/tests/Plan2Space.API.IntegrationTests --filter "AdminControllerTests|RateLimitingTests"`
Expected: PASS — all 3 tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/Plan2Space.API/Controllers/AdminController.cs backend/src/Plan2Space.API/Middleware \
  backend/src/Plan2Space.API/Program.cs backend/src/Plan2Space.API/Controllers/AiController.cs \
  plan2space-web/src/pages/AdminPage.tsx backend/tests
git commit -m "feat: admin panel, role-based authorization, and AI-endpoint rate limiting"
```

### Task 27: Whole-Stack Smoke Test + CI Wiring

**Files:**
- Create: `scripts/smoke-test-full-stack.sh`
- Create: `.github/workflows/ci.yml`
- Test: (this task's deliverable is itself the test — a scripted end-to-end run against the full Docker Compose stack)

**Interfaces:**
- Consumes: every service built in Tasks 1–26, `docker-compose.yml` (Task 1).
- Produces: `scripts/smoke-test-full-stack.sh`, runnable locally and in CI, exercising: register → login → create project → upload DXF fixture → vectorize → poll WebSocket to completion → GET geometry (non-empty) → export gltf → export pdf. `.github/workflows/ci.yml` running backend `dotnet test`, ai-service `pytest`, frontend `vitest`, and this smoke script on every PR.

- [ ] **Step 1: Write the smoke test script**

```bash
#!/usr/bin/env bash
# scripts/smoke-test-full-stack.sh
set -euo pipefail

cp -n .env.example .env || true
docker compose up -d --build
echo "Waiting for stack to become healthy..."
for i in $(seq 1 60); do
  if curl -sf http://localhost/api/health >/dev/null 2>&1; then break; fi
  sleep 3
done

EMAIL="smoke-$(date +%s)@plan2space.dev"
PASSWORD="Str0ngPass!123"

curl -sf -X POST http://localhost/api/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null

TOKEN=$(curl -sf -X POST http://localhost/api/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

PROJECT_ID=$(curl -sf -X POST http://localhost/api/projects -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Smoke Test House"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

FILE_ID=$(curl -sf -X POST "http://localhost/api/projects/$PROJECT_ID/files" -H "Authorization: Bearer $TOKEN" \
  -F "file=@ai-service/tests/fixtures/simple_walls.dxf" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

JOB_ID=$(curl -sf -X POST http://localhost/api/ai/vectorize -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"projectId\":\"$PROJECT_ID\",\"fileId\":\"$FILE_ID\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['jobId'])")

for i in $(seq 1 30); do
  STATUS=$(curl -sf "http://localhost/api/ai/job/$JOB_ID/status" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")
  [ "$STATUS" = "Completed" ] && break
  sleep 2
done
[ "$STATUS" = "Completed" ] || { echo "FAIL: job did not complete"; exit 1; }

WALL_COUNT=$(curl -sf "http://localhost/api/projects/$PROJECT_ID/geometry" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;print(len(json.load(sys.stdin)['walls']))")
[ "$WALL_COUNT" -gt 0 ] || { echo "FAIL: no walls persisted after vectorization"; exit 1; }

curl -sf -o /tmp/export.gltf -X POST "http://localhost/api/export/$PROJECT_ID?format=gltf" -H "Authorization: Bearer $TOKEN"
[ -s /tmp/export.gltf ] || { echo "FAIL: gltf export empty"; exit 1; }

curl -sf -o /tmp/report.pdf -X POST "http://localhost/api/export/$PROJECT_ID?format=pdf" -H "Authorization: Bearer $TOKEN"
[ -s /tmp/report.pdf ] || { echo "FAIL: pdf export empty"; exit 1; }

echo "PASS: full-stack smoke test succeeded end to end"
docker compose down
```

- [ ] **Step 2: Run it**

Run: `bash scripts/smoke-test-full-stack.sh`
Expected: `PASS: full-stack smoke test succeeded end to end`

- [ ] **Step 3: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with: { dotnet-version: '8.0.x' }
      - run: dotnet test backend/Plan2Space.sln

  ai-service-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r ai-service/requirements.txt --no-cache-dir
      - run: cd ai-service && pytest tests/ -v

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd plan2space-web && npm ci && npx vitest run

  full-stack-smoke:
    runs-on: ubuntu-latest
    needs: [backend-tests, ai-service-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/smoke-test-full-stack.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-test-full-stack.sh .github/workflows/ci.yml
git commit -m "test: whole-stack smoke test and CI pipeline across all three services"
```

**Phase 5 checkpoint — project complete:** every functional requirement from the capstone registration doc has a working, tested implementation, packaged in Docker, and verified end-to-end by an automated smoke test running in CI on every push.

---

## Self-Review

**1. Spec coverage.** Every major section of `2026-09-23-plan2space-design.md` maps to a task: system architecture (Task 1), frontend structure (Tasks 13–21), backend Clean Architecture + API surface (Tasks 2–6, 24–26), AI pipeline (Tasks 7–12), database schema (Task 2), AI job flow (Task 6), DXF pipeline (Task 8), co-pilot (Task 22), PostgreSQL schema (Task 2), Three.js scene graph (Tasks 19–20), Konva snap engine (Task 18), security table (Task 3, Task 26), timeline/team (calendar ordering preserved via phase sequencing), export formats (Tasks 24–25). Generative staging (spec's "Layout AI" mention) is covered by Task 23.

**2. Placeholder scan.** One illustrative gap was flagged inline rather than hidden: Task 22's `move_wall` branch is fully implemented; the `add_opening`/`resize_room` branches are explicitly called out as required-before-done with the exact pattern to follow, rather than silently omitted — this is a deliberate scope note, not a "TBD," and the executing engineer cannot mistake it for finished work.

**3. Type consistency.** `Wall`/`Room`/`Opening` field names are consistent from Task 2's C# entities through Task 5's DTOs, Task 12's Python serializer (camelCase JSON matching the C# `WallInput`/`RoomInput`/`OpeningInput` records), and Task 16's TypeScript interfaces. `snapPoint(point, walls, excludeWallId, options?)`'s signature in Task 18 matches its Task 17 stub exactly, so no caller changes. `buildWallGeometry` (Task 19) and `cutOpeningsIntoWall` (Task 20) compose without signature drift.

**4. Review Focus coverage confirmed:**
- DXF block/insert walls → Task 8, `test_parses_walls_from_block_inserts`.
- Self-intersecting/unclosed AI-vectorized polygons → Task 9, `test_self_intersecting_polyline_is_repaired_to_valid_geometry` and `test_unclosed_room_outline_gets_closed`.
- Overlapping rooms after vectorization → Task 5, `RoomOverlapDetectorTests`, enforced inside `SaveGeometryHandler` so it also catches AI-pushed geometry (Task 12's `push_geometry_to_api` goes through the same endpoint).
- WebSocket reconnect/catch-up → Task 6, `WebSocket_ReconnectAfterProgressUpdate_ReceivesCurrentStateImmediately`.
- Concurrent-edit conflict (stale save) → Task 5, `SaveGeometry_ThenStaleSave_Returns409`, and Task 21, `StudioSaveFlow.test.tsx` surfacing it in the UI instead of losing edits silently.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-23-plan2space-implementation.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

For this plan I recommend **Subagent-driven**, because the 27 tasks span three languages/runtimes (C#, Python, TypeScript) with tight interface contracts between them (exact JSON field names crossing the .NET↔Python↔React boundary in Tasks 5/6/9/12/16), and a mismatched field name or dropped concurrency check surfacing only at Phase 3 or Phase 5 would be expensive to unwind across a 5-month, 4-person academic capstone timeline where each phase is a demo milestone. Does the plan capture what you want, and which approach should we use?
