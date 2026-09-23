# Plan2Space — Architecture Design Specification

**Dự án:** Plan2Space — AI-First Platform for Multimodal 2D Floor Plan Understanding & Generative 3D Spatial Reconstruction  
**Nhóm:** Lê Minh Tuấn (Leader), Lê Xuân Thọ, Nguyễn Thành Thiên, Vũ Thanh Tùng  
**Mentor:** Lê Nguyễn Sơn Vũ  
**Thời gian:** 07/2026 → 12/2026  
**Kiến trúc được chọn:** Approach 2 — Modular Monolith + AI Sidecar  
**Phiên bản spec:** 1.0 — 2026-09-23  

---

## 1. Tổng Quan Hệ Thống

Plan2Space là nền tảng web AI-First chuyển đổi mặt bằng 2D đa định dạng (PNG/JPG, PDF, DXF/DWG, sketch) thành mô hình 3D tương tác hoàn chỉnh. Hệ thống kết hợp ba lớp chính:

- **Web Studio (Frontend):** React.js SPA với Konva.js (2D canvas editor) + Three.js/React Three Fiber (3D WebGL viewer)
- **Backend Platform (ASP.NET Core 8):** Quản lý user, project, asset, geometry, export, và orchestration AI jobs
- **AI Engine (Python FastAPI + Celery):** Pipeline deep learning cho vectorization, semantic detection, generative staging

Scope MVP tập trung vào nhà dân dụng, căn hộ, văn phòng — bao gồm tường, cửa, cửa sổ, phân vùng phòng, sàn/trần, và nội thất cơ bản.

---

## 2. Kiến Trúc Hệ Thống

### 2.1 Sơ Đồ Tổng Thể

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Konva.js     │  │ Three.js/R3F │  │ Co-pilot Chat UI     │  │
│  │ 2D Canvas    │  │ 3D Viewport  │  │ (LLM conversational) │  │
│  │ Editor       │  │ (60 FPS)     │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│              ASP.NET Core 8 API (Port 5000)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Auth     │ │ Project  │ │ Geometry │ │ Export Controller  │  │
│  │ /api/auth│ │ /api/    │ │ /api/    │ │ /api/export       │  │
│  │ JWT/OAuth│ │ projects │ │ geometry │ │ (glTF/OBJ/IFC/PDF)│  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AI Job Orchestrator                         │   │
│  │  POST /api/ai/vectorize → enqueue RabbitMQ job           │   │
│  │  GET  /api/ai/job/{id}/status → poll job progress        │   │
│  │  WebSocket /ws/job/{id} → push real-time progress        │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────┬───────────────────────────────┬─────────────────────┘
            │                               │
   ┌────────▼────────┐            ┌─────────▼──────────────────┐
   │  PostgreSQL 16  │            │  Python FastAPI (Port 8000) │
   │  + PostGIS      │            │  AI Pipeline Service        │
   │  Redis Cache    │            │  ┌─────────────────────┐   │
   │  MinIO Storage  │            │  │ Vectorization Worker │   │
   └─────────────────┘            │  │ (Vision Transformer) │   │
                                  │  ├─────────────────────┤   │
                                  │  │ Semantic Detector    │   │
                                  │  │ (GNN + OCR)          │   │
                                  │  ├─────────────────────┤   │
                                  │  │ Generative Staging   │   │
                                  │  │ (LLM + Layout AI)    │   │
                                  │  └─────────────────────┘   │
                                  │  Celery Workers (async)    │
                                  │  RabbitMQ Message Queue    │
                                  └────────────────────────────┘
```

### 2.2 Nguyên Tắc Kiến Trúc

- **Web-first SPA:** React 18 + Vite, không dùng Next.js SSR — tối ưu cho 3D WebGL heavy client
- **Async AI Jobs:** Mọi inference nặng đều chạy async qua RabbitMQ, không block API response
- **AI Sidecar pattern:** FastAPI chạy cùng Docker Compose với .NET, giao tiếp internal HTTP (không expose ra ngoài)
- **Human-in-the-loop:** AI pipeline tự động vectorize nhưng user luôn có thể review/chỉnh sửa trên 2D canvas trước khi render 3D
- **Spatial data:** PostGIS lưu vector geometry để query spatial (room area, perimeter, overlap detection)

---

## 3. Frontend Architecture (React.js + TypeScript)

### 3.1 Cấu Trúc Thư Mục

```
plan2space-web/
├── src/
│   ├── pages/                  # Route-level components
│   │   ├── LandingPage.tsx     # Public showcase + demo
│   │   ├── AuthPage.tsx        # Login / Register
│   │   ├── DashboardPage.tsx   # Project list
│   │   ├── StudioPage.tsx      # *** MAIN STUDIO ***
│   │   └── AdminPage.tsx       # Admin panel
│   ├── components/
│   │   ├── studio/
│   │   │   ├── Canvas2D/       # Konva.js 2D editor
│   │   │   │   ├── CanvasEditor.tsx
│   │   │   │   ├── WallLayer.tsx
│   │   │   │   ├── OpeningLayer.tsx  # Doors / Windows
│   │   │   │   └── SnapEngine.ts
│   │   │   ├── Viewer3D/       # Three.js / R3F viewer
│   │   │   │   ├── Scene3D.tsx
│   │   │   │   ├── WallMesh.tsx
│   │   │   │   ├── FloorCeiling.tsx
│   │   │   │   ├── FurnitureAsset.tsx
│   │   │   │   ├── CameraController.tsx  # Orbit + FirstPerson
│   │   │   │   └── LightingRig.tsx
│   │   │   ├── Copilot/        # AI Chat Co-pilot
│   │   │   │   ├── CopilotPanel.tsx
│   │   │   │   └── MessageBubble.tsx
│   │   │   └── Toolbar/        # Upload, export, tools
│   │   ├── ui/                 # Shared design system
│   │   └── admin/
│   ├── stores/                 # Zustand state management
│   │   ├── projectStore.ts
│   │   ├── geometryStore.ts    # Walls, rooms, openings
│   │   ├── sceneStore.ts       # 3D scene state
│   │   └── copilotStore.ts
│   ├── services/               # API clients
│   │   ├── api.ts              # Axios base + interceptors
│   │   ├── projectService.ts
│   │   ├── aiService.ts        # AI job polling / WebSocket
│   │   └── exportService.ts
│   ├── hooks/
│   │   ├── useAIJob.ts         # Poll AI job status
│   │   └── useStudioSync.ts    # 2D/3D sync
│   └── types/
│       ├── geometry.ts         # Wall, Room, Opening, Point2D
│       ├── project.ts
│       └── ai.ts
├── vite.config.ts
└── tailwind.config.ts
```

### 3.2 Studio Layout (Main Page)

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Project Name | Export ▾ | Share | User Avatar   │
├──────────────────────────────────────────────────────────────────┤
│ TOOLBAR │   2D Canvas Editor (Konva.js)  │  3D Viewport (R3F)   │
│ ────── │ ──────────────────────────────  │ ──────────────────── │
│ Upload │  [AI detected walls/rooms]      │  [3D mesh realtime]  │
│ Select │  Snap-to-grid editing           │  Orbit / Walk mode   │
│ Wall   │  Door/Window placement          │  PBR materials       │
│ Door   │  Room labeling                  │  Shadows/AO          │
│ Window │  Dimension display              │  Measurement tool    │
│ Erase  │                                 │  Cross-section       │
├────────┴─────────────────────────────────┴──────────────────────┤
│  AI CO-PILOT PANEL (collapsible bottom)                         │
│  "Elevate living room ceiling to 3.2m" → [Send]                │
│  AI: "Done! Ceiling updated. Wall height adjusted accordingly." │
├──────────────────────────────────────────────────────────────────┤
│  STATUS BAR: Floor area: 85m² | Walls: 24 | Rooms: 5 | Job: ✓  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 State Management (Zustand)

```typescript
// geometryStore.ts — source of truth cho 2D và 3D
interface GeometryStore {
  walls: Wall[];          // {id, start: Point2D, end: Point2D, thickness, height, material}
  rooms: Room[];          // {id, label, boundaryWallIds, area, function: RoomFunction}
  openings: Opening[];    // {id, wallId, type: 'door'|'window', position, width, height}
  
  // Actions
  addWall: (wall: Wall) => void;
  updateWall: (id, changes) => void;
  applyAIResult: (vectorResult: VectorizationResult) => void;  // from AI pipeline
  applyCopiloCommand: (cmd: CopilotCommand) => void;
}
```

**2D ↔ 3D Sync:** Mỗi khi `geometryStore` thay đổi, hook `useStudioSync` tự động trigger Three.js re-render geometry. Không cần manual update 3D — reactive pattern.

---

## 4. Backend Architecture (ASP.NET Core 8)

### 4.1 Clean Architecture Layers

```
Plan2Space.API/
├── Controllers/          # HTTP endpoints, input validation
├── Application/
│   ├── UseCases/         # Business logic (CQRS with MediatR)
│   │   ├── Projects/     # CreateProject, GetProject, UpdateGeometry...
│   │   ├── AI/           # EnqueueVectorizeJob, GetJobStatus...
│   │   └── Export/       # ExportToGLTF, ExportToPDF...
│   ├── Interfaces/       # Repository + Service abstractions
│   └── DTOs/
├── Domain/
│   ├── Entities/         # Project, Wall, Room, Opening, AIJob, User...
│   ├── ValueObjects/     # Point2D, BoundingBox, MaterialSpec...
│   └── Enums/            # RoomFunction, JobStatus, ExportFormat...
├── Infrastructure/
│   ├── Repositories/     # EF Core + PostGIS queries
│   ├── Storage/          # MinIO upload/download
│   ├── AIClient/         # HTTP client gọi FastAPI
│   ├── Messaging/        # RabbitMQ producer
│   └── Export/           # Trimesh GLB, IFC writer, PDF generator
└── Plan2Space.Tests/
```

### 4.2 API Endpoints

#### Authentication
```
POST   /api/auth/register        # Đăng ký tài khoản
POST   /api/auth/login           # JWT login
POST   /api/auth/refresh         # Refresh token
POST   /api/auth/oauth/google    # OAuth2 Google
```

#### Projects
```
GET    /api/projects             # List projects của user
POST   /api/projects             # Tạo project mới
GET    /api/projects/{id}        # Chi tiết project + geometry
PUT    /api/projects/{id}        # Cập nhật metadata
DELETE /api/projects/{id}        # Xóa project
POST   /api/projects/{id}/upload # Upload file đầu vào (multipart)
```

#### Geometry (2D Canvas Data)
```
GET    /api/projects/{id}/geometry          # Lấy walls/rooms/openings
PUT    /api/projects/{id}/geometry          # Save toàn bộ geometry (autosave)
PATCH  /api/projects/{id}/geometry/walls    # Cập nhật một số walls
PATCH  /api/projects/{id}/geometry/rooms    # Cập nhật room labels/functions
```

#### AI Pipeline
```
POST   /api/ai/vectorize         # Enqueue vectorization job (trả về jobId)
POST   /api/ai/copilot           # Gửi natural language command
GET    /api/ai/jobs/{jobId}      # Poll job status + progress %
WS     /ws/jobs/{jobId}          # WebSocket push real-time progress
```

#### Export
```
POST   /api/export/gltf          # Export GLB/GLTF file
POST   /api/export/obj           # Export OBJ + MTL
POST   /api/export/ifc           # Export IFC (BIM)
POST   /api/export/pdf           # Export PDF report (BOQ + floor plan)
GET    /api/export/share/{token} # Public share link (view-only 3D)
```

#### Admin
```
GET    /api/admin/users          # Danh sách users
PUT    /api/admin/users/{id}/quota  # Cập nhật storage quota
GET    /api/admin/jobs           # Monitor all AI jobs
POST   /api/admin/assets         # Upload 3D asset (furniture, materials)
GET    /api/admin/analytics      # Usage statistics
```

### 4.3 AI Job Orchestration Flow

```
Client → POST /api/ai/vectorize
  ↓
1. Validate file đã upload (MinIO path exists)
2. Tạo AIJob record (status: Queued) trong PostgreSQL
3. Publish message to RabbitMQ queue "vectorize_queue"
4. Return {jobId, status: "queued", wsUrl: "/ws/jobs/{jobId}"}

[Client mở WebSocket /ws/jobs/{jobId} để nhận live updates]

Python Celery Worker nhận message:
  ↓
5. Download file từ MinIO
6. Run AI pipeline (progress: 0% → 100% qua Redis pub/sub)
7. .NET subscribe Redis channel → forward qua WebSocket tới client
8. Khi xong: lưu VectorizationResult vào PostgreSQL
9. Update job status: Completed

Client nhận event "job.completed" → fetch geometry qua REST → render 2D canvas + 3D
```

---

## 5. AI Pipeline (Python FastAPI + Celery)

### 5.1 Cấu Trúc

```
plan2space-ai/
├── api/
│   ├── main.py                 # FastAPI app (internal only)
│   └── routes/
│       ├── vectorize.py        # POST /vectorize (called by .NET)
│       └── copilot.py          # POST /copilot
├── pipeline/
│   ├── ingestion/
│   │   ├── raster_loader.py    # PNG/JPG → numpy array
│   │   ├── pdf_loader.py       # PDF → page images (PyMuPDF)
│   │   └── dxf_loader.py       # DXF/DWG → entity lists (ezdxf)
│   ├── vectorization/
│   │   ├── vit_detector.py     # Vision Transformer wall detection
│   │   ├── gnn_topology.py     # Graph Neural Network line healing
│   │   └── polygon_engine.py   # Shapely polygon construction
│   ├── semantic/
│   │   ├── symbol_detector.py  # YOLO-OBB: doors, windows, stairs
│   │   ├── ocr_engine.py       # PaddleOCR dimension extraction
│   │   └── room_classifier.py  # Room function classification
│   ├── staging/
│   │   ├── layout_ai.py        # Furniture layout generation
│   │   └── material_predictor.py  # PBR material assignment
│   └── export/
│       └── result_serializer.py  # → JSON VectorizationResult
├── workers/
│   ├── celery_app.py
│   └── vectorize_worker.py     # Async pipeline execution
├── models/                     # Pretrained weights (.pth, .onnx)
│   ├── wall_detector_vit.onnx
│   ├── symbol_yolo_obb.pt
│   └── room_classifier.onnx
└── requirements.txt
```

### 5.2 Pipeline Steps cho Raster Input (PNG/JPG)

```
Step 1: INGESTION
  Input: PNG/JPG floor plan ảnh
  Output: Preprocessed numpy array (grayscale, normalized, 1024×1024)

Step 2: WALL DETECTION (Vision Transformer)
  Model: Fine-tuned ViT-B/16 trên dataset CubiCasa5K + RPLAN
  Output: Wall segment heatmap + junction point predictions
  Precision target: ±5mm spatial tolerance

Step 3: LINE VECTORIZATION
  Convert heatmap → centerlines (skeletonization)
  Detect endpoints + junctions → node graph

Step 4: GRAPH TOPOLOGY HEALING (GNN)
  Input: Noisy wall graph với gaps và spurious segments
  GNN message passing: heal broken connections, resolve T/L/X junctions
  Output: Clean watertight planar graph

Step 5: POLYGON CONSTRUCTION
  Shapely: build closed room polygons từ healed graph
  PostGIS: store spatial vectors với SRID 3857

Step 6: SEMANTIC DETECTION
  YOLO-OBB: detect door swings, window symbols, stairs, columns
  PaddleOCR: extract room labels và dimension annotations (m, cm)
  Room Classifier: assign function (Living Room, Bedroom, Kitchen...)

Step 7: RESULT SERIALIZATION
  Output: VectorizationResult JSON → gửi về .NET API
  {walls: [...], rooms: [...], openings: [...], dimensions: {...}}
```

### 5.3 Pipeline cho DXF Input

```
DXF parsing bằng ezdxf (thư viện có sẵn trong repo):
- Đọc entities: LINE, LWPOLYLINE, ARC, TEXT, INSERT (blocks)
- Filter theo layer name conventions (walls, doors, windows...)
- Convert entities → Wall/Opening objects trực tiếp (không cần ViT)
- Fallback sang ViT nếu layer conventions không chuẩn
```

### 5.4 AI Co-pilot (Natural Language → 3D Command)

```
User input: "Elevate living room ceiling to 3.2m"

1. Intent Classification:
   - Action: "elevate"
   - Target: "living room" → match room by label
   - Property: "ceiling_height"
   - Value: 3.2, unit: "m"

2. Command Generation:
   {type: "UPDATE_ROOM_HEIGHT", roomId: "uuid-living-room", value: 3.2}

3. Return command → .NET API → forward tới client
4. Client applies command qua geometryStore.applyCopiloCommand()
```

**Model:** Sử dụng GPT-4o mini hoặc Gemini Flash (API calls) với structured output mode để parse intent. Không cần fine-tune.

---

## 6. Database Schema

### 6.1 Core Tables (PostgreSQL + PostGIS)

```sql
-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user',  -- 'user' | 'admin'
  storage_quota_mb INT DEFAULT 500,
  storage_used_mb INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE,
  unit_system VARCHAR(10) DEFAULT 'metric',  -- 'metric' | 'imperial'
  default_ceiling_height FLOAT DEFAULT 2.8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded Source Files
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_type VARCHAR(20),  -- 'image' | 'pdf' | 'dxf' | 'dwg'
  storage_path TEXT NOT NULL,  -- MinIO object key
  original_filename VARCHAR(255),
  file_size_bytes BIGINT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Jobs
CREATE TABLE ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID REFERENCES project_files(id),
  job_type VARCHAR(30),   -- 'vectorize' | 'stage' | 'copilot'
  status VARCHAR(20) DEFAULT 'queued',  -- queued|processing|completed|failed
  progress INT DEFAULT 0,
  error_message TEXT,
  result_json JSONB,      -- VectorizationResult
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Geometry: Walls
CREATE TABLE walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  geom GEOMETRY(LineString, 3857),  -- PostGIS spatial
  thickness FLOAT DEFAULT 0.2,      -- meters
  height FLOAT DEFAULT 2.8,         -- meters
  material VARCHAR(50) DEFAULT 'concrete',
  layer_name VARCHAR(100),          -- từ DXF
  is_structural BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_walls_geom ON walls USING GIST(geom);
CREATE INDEX idx_walls_project ON walls(project_id);

-- Geometry: Rooms
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(100),
  room_function VARCHAR(50),   -- 'living_room' | 'bedroom' | 'kitchen'...
  boundary GEOMETRY(Polygon, 3857),  -- room polygon
  area_sqm FLOAT GENERATED ALWAYS AS (ST_Area(boundary)) STORED,
  floor_material VARCHAR(50) DEFAULT 'tile',
  ceiling_height FLOAT DEFAULT 2.8,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geometry: Openings (Doors / Windows)
CREATE TABLE openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  wall_id UUID REFERENCES walls(id) ON DELETE CASCADE,
  opening_type VARCHAR(20),    -- 'single_door' | 'double_door' | 'sliding' | 'window'
  position_on_wall FLOAT,      -- distance from wall start (0.0 to 1.0)
  width FLOAT,
  height FLOAT,
  sill_height FLOAT DEFAULT 0,  -- for windows
  swing_direction VARCHAR(10)   -- 'left' | 'right' | 'both'
);

-- 3D Assets Catalog
CREATE TABLE assets_3d (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50),  -- 'furniture' | 'door' | 'window' | 'material'
  subcategory VARCHAR(50),
  name VARCHAR(100),
  storage_path TEXT,      -- MinIO: .glb file
  thumbnail_url TEXT,
  style VARCHAR(30),      -- 'modern' | 'scandinavian' | 'minimalist'
  room_function VARCHAR(50),
  footprint_w FLOAT,
  footprint_d FLOAT,
  height FLOAT
);
```

### 6.2 Redis Usage

```
Key pattern: job:{jobId}:progress → INT (0-100)
Key pattern: job:{jobId}:status  → STRING
Channel:     job:{jobId}:events  → pub/sub cho WebSocket push

Session cache:  user:{userId}:session → JWT payload (TTL: 24h)
Geometry cache: project:{id}:geometry → JSON (TTL: 5 min, invalidate on save)
```

---

## 7. Three.js / React Three Fiber — 3D Renderer

### 7.1 Scene Graph

```tsx
<Canvas shadows camera={{ fov: 60 }}>
  <Suspense fallback={<LoadingFallback />}>
    
    {/* Lighting */}
    <ambientLight intensity={0.4} />
    <DirectionalLight castShadow position={[10, 20, 10]} />
    <EnvironmentMap preset="apartment" />
    
    {/* Geometry từ geometryStore */}
    {walls.map(wall => (
      <WallMesh key={wall.id} wall={wall} />        // ExtrudeGeometry từ LineString
    ))}
    {rooms.map(room => (
      <FloorPlane key={room.id} room={room} />      // ShapeGeometry từ polygon
      <CeilingPlane key={room.id} room={room} />
    ))}
    {openings.map(op => (
      <OpeningCSG key={op.id} opening={op} />       // CSG subtract door/window hole
    ))}
    
    {/* Furniture (từ staging AI) */}
    {furnitureItems.map(item => (
      <FurnitureAsset key={item.id} {...item} />    // Load .glb từ MinIO
    ))}
    
    {/* Controls */}
    <CameraController mode={cameraMode} />          // 'orbit' | 'firstperson'
    <MeasurementTool active={measureActive} />
    <ClipPlane active={clipActive} normal={clipNormal} />
    
  </Suspense>
</Canvas>
```

### 7.2 WallMesh Construction

```typescript
// Từ wall LineString → ExtrudeGeometry
function buildWallGeometry(wall: Wall): THREE.ExtrudeGeometry {
  const { start, end, thickness, height } = wall;
  
  const direction = new THREE.Vector2(end.x - start.x, end.y - start.y).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const halfT = thickness / 2;
  
  // Wall cross-section profile
  const shape = new THREE.Shape([
    new THREE.Vector2(-halfT, 0),
    new THREE.Vector2(halfT, 0),
    new THREE.Vector2(halfT, height),
    new THREE.Vector2(-halfT, height),
  ]);
  
  const wallLength = Math.hypot(end.x - start.x, end.y - start.y);
  return new THREE.ExtrudeGeometry(shape, {
    depth: wallLength,
    bevelEnabled: false,
  });
}
```

### 7.3 Performance Budget

| Metric | Target |
|--------|--------|
| FPS (desktop) | 60 FPS |
| Wall mesh count (typical apartment) | < 50 meshes |
| Texture atlas | PBR textures 1024×1024 compressed (KTX2) |
| GLTF export size | < 50MB |
| Initial load time | < 3s trên WiFi |

---

## 8. Konva.js 2D Canvas Editor

### 8.1 Layers Architecture

```
KonvaStage (full canvas)
├── GridLayer          # Background grid (snap reference)
├── GeometryLayer      # Walls (Konva.Line), Rooms (Konva.Polygon)
├── OpeningLayer       # Doors, Windows (Konva.Group with arc)
├── DimensionLayer     # Dimension labels (Konva.Text + arrows)
├── AnnotationLayer    # Room labels, area text
└── InteractionLayer   # Mouse events, snap handles
```

### 8.2 Snap Engine

```typescript
class SnapEngine {
  readonly SNAP_DISTANCE = 10;  // pixels
  
  snapPoint(cursor: Point2D, walls: Wall[]): Point2D {
    // Priority 1: snap to wall endpoint
    // Priority 2: snap to wall midpoint
    // Priority 3: snap to grid (10cm intervals)
    // Priority 4: snap to intersection
    return snappedPoint;
  }
}
```

### 8.3 Sync Trigger

```typescript
// useStudioSync.ts
function useStudioSync() {
  const geometry = useGeometryStore();
  
  useEffect(() => {
    // Mỗi khi geometry thay đổi → trigger 3D re-render
    // Three.js reactive via R3F useFrame + geometry store subscription
    sceneStore.rebuildFromGeometry(geometry);
  }, [geometry.walls, geometry.rooms, geometry.openings]);
}
```

---

## 9. Security

| Layer | Cơ chế |
|-------|--------|
| Auth | JWT (Access 15min + Refresh 7 days) + OAuth2 Google |
| Transport | TLS 1.3 toàn bộ (HTTPS + WSS) |
| File Upload | Validate MIME type + magic bytes, max 50MB/file |
| Storage | MinIO encrypted at rest (AES-256), presigned URL download |
| Authorization | Row-level: user chỉ access project của mình |
| Rate Limiting | ASP.NET Core RateLimiter: 100 req/min per user, 5 AI jobs/hour |
| Input | Sanitize text inputs, parameterized queries (EF Core), DXF entity whitelist |
| Share Links | HMAC-signed token với expiry, view-only (no geometry mutation) |

---

## 10. Phân Công Nhóm & Phân Kỳ Thực Thi

### 10.1 Phân Công (4 Người)

| Người | Vai Trò | Phụ Trách |
|-------|---------|-----------|
| Lê Minh Tuấn (Leader) | Full-stack + AI Architect | ASP.NET Core 8 API, AI Orchestration, DevOps Docker |
| Lê Xuân Thọ | Frontend Lead | React Studio UI, Konva.js 2D Editor, Zustand stores |
| Nguyễn Thành Thiên | AI/ML Engineer | Python FastAPI, ViT wall detection, GNN topology, Celery |
| Vũ Thanh Tùng | Frontend + 3D | Three.js/R3F 3D viewer, Co-pilot UI, Export module |

### 10.2 Phân Kỳ (5 Tháng)

#### Phase 1 — Foundation (Tháng 7: Tuần 1-3)
- [ ] Setup Docker Compose: .NET + FastAPI + PostgreSQL + Redis + MinIO + RabbitMQ
- [ ] ASP.NET Core 8: Auth (JWT + OAuth), User CRUD, Project CRUD
- [ ] React: Routing, AuthContext, Dashboard (project list), Upload UI
- [ ] PostgreSQL: Schema đầy đủ + PostGIS extension
- [ ] MinIO: File upload pipeline (multipart, presigned URL)

#### Phase 2 — AI Pipeline Core (Tháng 7-8: Tuần 4-7)
- [ ] Python FastAPI: Celery setup, RabbitMQ workers
- [ ] DXF Parser (ezdxf): LINE/LWPOLYLINE/TEXT → Wall/Opening objects
- [ ] Raster input: Preprocessing + ViT wall heatmap detection (CubiCasa5K dataset)
- [ ] GNN topology healing (PyTorch Geometric)
- [ ] Symbol detection YOLO-OBB: doors, windows, stairs
- [ ] PaddleOCR: dimension extraction
- [ ] Result serializer → JSON → .NET → PostgreSQL (walls/rooms/openings)
- [ ] WebSocket job progress (Redis pub/sub → .NET → Client)

#### Phase 3 — Studio UI (Tháng 8-9: Tuần 8-12)
- [ ] Konva.js 2D Canvas: render AI result walls/rooms/openings
- [ ] Snap engine + wall editing (move, resize, delete)
- [ ] Door/Window placement tools
- [ ] Three.js/R3F: WallMesh từ geometry store
- [ ] Floor/Ceiling planes, PBR materials
- [ ] CSG door/window openings
- [ ] Orbit camera + First-person walkthrough
- [ ] 2D ↔ 3D live sync

#### Phase 4 — Advanced Features (Tháng 10: Tuần 13-16)
- [ ] Generative furniture staging AI (layout prediction)
- [ ] AI Co-pilot (GPT-4o mini intent parsing → geometry commands)
- [ ] Real-time lighting: directional, shadows, ambient occlusion
- [ ] 3D measurement tool + cross-section clipping
- [ ] Share link (view-only public URL)

#### Phase 5 — Export + Admin + Testing (Tháng 11: Tuần 17-20)
- [ ] Export: glTF/GLB (Three.js GLTFExporter)
- [ ] Export: OBJ + MTL
- [ ] Export: IFC (xBIM hoặc IfcOpenShell Python binding)
- [ ] Export: PDF report (BOQ + floor plan image + room schedule)
- [ ] Admin panel: user management, job monitoring, asset catalog
- [ ] Unit tests + Integration tests + AI benchmark report

#### Phase 6 — Polish & Capstone Submission (Tháng 12: Tuần 21-22)
- [ ] Performance optimization (LOD, texture compression KTX2)
- [ ] Responsive UI (tablet support)
- [ ] Bug fixes, UX polish
- [ ] SRS + Design Doc + AI Evaluation Report + User Guide
- [ ] Demo video + final presentation

---

## 11. Non-Functional Requirements

| Requirement | Target | Cơ chế |
|-------------|--------|--------|
| AI Job Latency | < 30s cho apartment chuẩn | Celery async worker, ONNX optimized inference |
| 3D Viewer FPS | 60 FPS desktop | LOD meshes, KTX2 textures, frustum culling |
| API Response | < 200ms (non-AI) | Redis cache, indexed DB queries |
| Concurrent AI Jobs | 10 jobs đồng thời | Celery worker pool, horizontal scale |
| File Size Limit | 50MB/upload | Nginx + .NET config, MinIO multipart |
| Spatial Tolerance | ±5mm / ±0.5% relative | Shapely precision, PostGIS SRID |
| Storage Quota | 500MB/user (free tier) | .NET middleware check trước upload |

---

## 12. Rủi Ro & Giảm Thiểu

| Rủi Ro | Khả Năng | Giảm Thiểu |
|--------|----------|------------|
| ViT model không đủ chính xác trên ảnh thực tế Việt Nam | Cao | Fine-tune thêm trên dataset ảnh mặt bằng VN thu thập; human-in-the-loop fallback |
| DWG format (binary, không mở source) | Trung bình | Convert DWG → DXF phía client (ODA File Converter CLI hoặc LibreDWG) trước khi upload |
| CSG boolean cho door/window chậm | Trung bình | Pre-compute CSG offline khi geometry ổn định, cache kết quả |
| IFC export phức tạp | Trung bình | Dùng IfcOpenShell (Python) hoặc xBIM (.NET); fallback: chỉ export glTF/OBJ cho MVP |
| GPU không có trên server | Cao | Dùng ONNX Runtime CPU-optimized cho inference; batch nhỏ; hoặc Google Colab cho training |
| 5 tháng không đủ cho full AI pipeline | Trung bình | DXF parser chạy trước (không cần AI); AI cho raster là stretch goal nếu cần |

---

## 13. Docker Packaging & Deployment

### 13.1 Cấu Trúc Monorepo

```
plan2space/
├── docker-compose.yml          # *** Toàn bộ stack 1 lệnh ***
├── docker-compose.override.yml # Dev overrides (hot-reload, volume mounts)
├── plan2space-api/             # ASP.NET Core 8
│   ├── Dockerfile
│   └── src/Plan2Space.API/...
├── plan2space-ai/              # Python FastAPI + Celery
│   ├── Dockerfile
│   └── ...
├── plan2space-web/             # React SPA
│   ├── Dockerfile
│   └── ...
└── infra/
    ├── nginx/
    │   └── nginx.conf          # Reverse proxy + static serve
    ├── postgres/
    │   └── init.sql            # PostGIS extension + schema seed
    └── minio/
        └── init-buckets.sh     # Tạo buckets khi startup
```

### 13.2 docker-compose.yml (Full Stack)

```yaml
version: "3.9"

services:

  # ─── Infrastructure ──────────────────────────────────────────
  postgres:
    image: postgis/postgis:16-3.4-alpine
    container_name: p2s_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: plan2space
      POSTGRES_USER: p2s_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U p2s_user -d plan2space"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7.2-alpine
    container_name: p2s_redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: p2s_rabbitmq
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: p2s_rabbit
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    ports:
      - "5672:5672"
      - "15672:15672"    # Management UI
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 15s
      retries: 5

  minio:
    image: minio/minio:RELEASE.2024-11-07T00-52-20Z
    container_name: p2s_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Console UI
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 15s
      retries: 5

  # ─── Backend: ASP.NET Core 8 API ─────────────────────────────
  api:
    build:
      context: ./plan2space-api
      dockerfile: Dockerfile
      target: production
    container_name: p2s_api
    restart: unless-stopped
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:5000
      ConnectionStrings__DefaultConnection: >
        Host=postgres;Port=5432;Database=plan2space;
        Username=p2s_user;Password=${POSTGRES_PASSWORD}
      Redis__ConnectionString: "redis:6379,password=${REDIS_PASSWORD}"
      RabbitMQ__Host: rabbitmq
      RabbitMQ__Username: p2s_rabbit
      RabbitMQ__Password: ${RABBITMQ_PASSWORD}
      MinIO__Endpoint: "minio:9000"
      MinIO__AccessKey: ${MINIO_ROOT_USER}
      MinIO__SecretKey: ${MINIO_ROOT_PASSWORD}
      AI__ServiceUrl: "http://ai:8000"     # internal network call
      Jwt__Secret: ${JWT_SECRET}
      Jwt__Issuer: "plan2space"
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      rabbitmq:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks:
      - p2s_internal
      - p2s_public

  # ─── AI Service: Python FastAPI ───────────────────────────────
  ai:
    build:
      context: ./plan2space-ai
      dockerfile: Dockerfile
    container_name: p2s_ai_api
    restart: unless-stopped
    environment:
      RABBITMQ_URL: "amqp://p2s_rabbit:${RABBITMQ_PASSWORD}@rabbitmq:5672/"
      REDIS_URL: "redis://:${REDIS_PASSWORD}@redis:6379/0"
      MINIO_ENDPOINT: "minio:9000"
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      OPENAI_API_KEY: ${OPENAI_API_KEY}    # for Co-pilot
      MODEL_DIR: /app/models
    volumes:
      - ./plan2space-ai/models:/app/models  # mount pretrained weights
    ports:
      - "8000:8000"    # internal only — không expose production nếu cần
    depends_on:
      - rabbitmq
      - redis
      - minio
    networks:
      - p2s_internal   # chỉ internal, không public

  # ─── AI Worker: Celery ────────────────────────────────────────
  celery_worker:
    build:
      context: ./plan2space-ai
      dockerfile: Dockerfile
    container_name: p2s_celery
    restart: unless-stopped
    command: celery -A workers.celery_app worker --loglevel=info --concurrency=4
    environment:
      RABBITMQ_URL: "amqp://p2s_rabbit:${RABBITMQ_PASSWORD}@rabbitmq:5672/"
      REDIS_URL: "redis://:${REDIS_PASSWORD}@redis:6379/0"
      MINIO_ENDPOINT: "minio:9000"
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      MODEL_DIR: /app/models
    volumes:
      - ./plan2space-ai/models:/app/models
    depends_on:
      - rabbitmq
      - redis
      - minio
    networks:
      - p2s_internal

  # ─── Frontend: React SPA (served via Nginx) ───────────────────
  web:
    build:
      context: ./plan2space-web
      dockerfile: Dockerfile
    container_name: p2s_web
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - api
    networks:
      - p2s_public

  # ─── Reverse Proxy: Nginx ─────────────────────────────────────
  nginx:
    image: nginx:1.27-alpine
    container_name: p2s_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./infra/nginx/certs:/etc/nginx/certs:ro   # SSL certs
    depends_on:
      - api
      - web
    networks:
      - p2s_public

networks:
  p2s_internal:   # API ↔ AI: không expose ra host
    internal: true
  p2s_public:     # Nginx ↔ API ↔ Web: expose qua port

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:
  minio_data:
```

### 13.3 Dockerfile — ASP.NET Core 8 API

```dockerfile
# plan2space-api/Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

# Restore dependencies (layer cache)
COPY ["src/Plan2Space.API/Plan2Space.API.csproj", "src/Plan2Space.API/"]
COPY ["src/Plan2Space.Application/Plan2Space.Application.csproj", "src/Plan2Space.Application/"]
COPY ["src/Plan2Space.Domain/Plan2Space.Domain.csproj", "src/Plan2Space.Domain/"]
COPY ["src/Plan2Space.Infrastructure/Plan2Space.Infrastructure.csproj", "src/Plan2Space.Infrastructure/"]
RUN dotnet restore "src/Plan2Space.API/Plan2Space.API.csproj"

# Build
COPY . .
RUN dotnet publish "src/Plan2Space.API/Plan2Space.API.csproj" \
    -c Release -o /app/publish --no-restore

# Production image (runtime only, không có SDK)
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS production
WORKDIR /app
EXPOSE 5000

# Non-root user
RUN addgroup -S p2s && adduser -S p2s -G p2s
USER p2s

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Plan2Space.API.dll"]
```

### 13.4 Dockerfile — Python FastAPI + Celery

```dockerfile
# plan2space-ai/Dockerfile
FROM python:3.11-slim AS base
WORKDIR /app

# System deps cho OpenCV, Shapely, ezdxf
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Python deps (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Models dir (mounted via volume, không bake vào image)
RUN mkdir -p /app/models

# Non-root
RUN useradd -m p2s && chown -R p2s:p2s /app
USER p2s

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
# Celery override qua docker-compose command
```

### 13.5 Dockerfile — React SPA (Multi-stage Nginx)

```dockerfile
# plan2space-web/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json .
RUN npm ci --frozen-lockfile

COPY . .
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build   # output: /app/dist

# Serve bằng Nginx
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# nginx-spa.conf: try_files $uri /index.html (SPA routing)
```

### 13.6 Nginx Reverse Proxy Config

```nginx
# infra/nginx/nginx.conf
events { worker_connections 1024; }

http {
  upstream api_backend {
    server api:5000;
  }

  server {
    listen 80;
    server_name plan2space.local;

    # React SPA
    location / {
      proxy_pass http://web:80;
    }

    # API — forward tới ASP.NET Core
    location /api/ {
      proxy_pass http://api_backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_read_timeout 120s;
    }

    # WebSocket — job progress
    location /ws/ {
      proxy_pass http://api_backend;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
    }

    # File upload — tăng max body size
    client_max_body_size 60M;
  }
}
```

### 13.7 Environment File (.env)

```bash
# .env (KHÔNG commit lên git — thêm vào .gitignore)
POSTGRES_PASSWORD=your_secure_password_here
REDIS_PASSWORD=your_redis_password
RABBITMQ_PASSWORD=your_rabbit_password
MINIO_ROOT_USER=plan2space_admin
MINIO_ROOT_PASSWORD=your_minio_password
JWT_SECRET=your_jwt_secret_min_32_chars
OPENAI_API_KEY=sk-...
```

### 13.8 Quick Start (1 Lệnh)

```bash
# Clone repo
git clone <repo> && cd plan2space

# Copy env file
cp .env.example .env && nano .env   # điền passwords

# Build và start toàn bộ stack (lần đầu ~5 phút)
docker-compose up --build -d

# Verify tất cả services healthy
docker-compose ps

# Chạy DB migrations
docker-compose exec api dotnet ef database update

# Tạo MinIO buckets
docker-compose exec minio sh /docker-entrypoint-initdb.d/init-buckets.sh

# Mở app
# React Web:    http://localhost
# API Swagger:  http://localhost:5000/swagger
# MinIO UI:     http://localhost:9001
# RabbitMQ UI:  http://localhost:15672

# Xem logs realtime
docker-compose logs -f api celery_worker
```

---

*Spec được phê duyệt bởi: Lê Minh Tuấn — 2026-09-23*  
*Bước tiếp theo: Invoke `writing-plans` skill để tạo implementation plan chi tiết.*
