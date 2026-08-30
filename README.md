# Global Interview Scheduling System

公司內部使用的全球面試排程管理系統。系統僅提供 `administrator` 與 `hr` 登入；主管及候選人不具登入帳號。

## 功能

- Administrator 建立、修改及刪除 HR 帳號
- HR 統一管理部門，主管與候選人從部門選項中選擇
- HR 管理主管、候選人及各自的多個可面試時段
- 每筆可用時段各自使用 IANA Timezone，支援參與者旅行；實際時間統一以 UTC 儲存
- 自動尋找候選人與所有指定主管的共同空檔
- 建立、搜尋、篩選、修改及刪除面試
- Dashboard 顯示今日、本週面試數及人員統計
- bcrypt 密碼雜湊與 JWT Authentication
- Bootstrap 5 響應式企業管理介面

## 專案結構

```text
frontend/                 HTML、CSS 與瀏覽器端 JavaScript
backend/                  Node.js / Express API
  config/                 Neon PostgreSQL connection pool
  controllers/            API 業務邏輯
  middleware/             JWT 與角色權限
  routes/                 REST API 路由
  services/               驗證與時段媒合演算法
database/
  neon.sql                Neon 全新資料庫完整 Schema
  supabase.sql            舊 Supabase Schema（僅供遷移參考）
  migrations/
    003_hr_system_rebuild.sql  舊版系統升級用 Migration
```

## 本機設定

在 `backend/.env` 設定：

```env
PORT=3000
DATABASE_URL=Neon-pooled-connection-string
DATABASE_URL_DIRECT=Neon-direct-connection-string
DB_POOL_MAX=1
JWT_SECRET=至少-32-字元的隨機長字串
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3000
ENABLE_INTERVIEW_ARCHIVE=false
INTERVIEW_ARCHIVE_AFTER_DAYS=90
```

連線字串只能放在後端環境變數，禁止放入前端或提交到 Git。此長駐 Express 服務優先使用
`DATABASE_URL_DIRECT`；`DATABASE_URL` 保留作為 pooled endpoint fallback。

### 資料庫

- 全新 Neon 專案：執行 `npm run db:schema` 建立完整 Schema。
- 從 Supabase 搬移既有資料：保留來源 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`，確認 Neon 為空後執行 `npm run db:migrate:supabase`。
- 搬移工具在單一 PostgreSQL transaction 中依外鍵順序寫入，失敗會 rollback，完成後逐表核對筆數。

資料搬移會保留 UUID、帳號、bcrypt 密碼雜湊、建立時間與排程資料，因此現有人員不需要重設密碼。執行前仍應先備份來源資料庫。

### 啟動

```bash
cd /c/Andy/iPEBG/interview-system/backend
npm install
npm start
```

`npm start` 預設不會刪除或封存任何面試資料。若正式環境要自動封存已完成面試，請明確設定
`ENABLE_INTERVIEW_ARCHIVE=true`，並以 `INTERVIEW_ARCHIVE_AFTER_DAYS` 指定保留天數；封存只會設定
`archived_at`，不會刪除面試者或面試紀錄。

開啟 <http://localhost:3000>。健康檢查網址為 <http://localhost:3000/api/health>。

開發時可使用：

```bash
npm run dev
```

若需要用後端相同的 bcrypt 實作重設 Administrator 密碼：

```bash
npm run admin:reset-password
```

## REST API

所有 HR 與 Administrator API 都需要 `Authorization: Bearer <token>`。

- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET|POST /api/admin/hr-accounts`
- `PATCH|DELETE /api/admin/hr-accounts/:id`
- `GET|POST /api/hr/managers`
- `GET|POST /api/hr/departments`
- `PATCH|DELETE /api/hr/departments/:id`
- `GET|PATCH|DELETE /api/hr/managers/:id`
- `GET|POST /api/hr/managers/:id/slots`
- `PATCH|DELETE /api/hr/managers/:id/slots/:slotId`
- `GET|POST /api/hr/candidates`
- `GET|PATCH|DELETE /api/hr/candidates/:id`
- `GET|POST /api/hr/candidates/:id/slots`
- `PATCH|DELETE /api/hr/candidates/:id/slots/:slotId`
- `POST /api/hr/matches`
- `GET|POST /api/hr/interviews`
- `GET|PATCH|DELETE /api/hr/interviews/:id`
- `GET /api/hr/dashboard`

## 安全注意事項

- 正式環境應設定限定來源的 CORS、HTTPS 與高強度 JWT Secret。
- Neon connection string 或遷移期間的 Supabase Service Role Key 外洩時必須立即輪替。
- 上線前執行 `npm audit`，並以不同帳號驗證 Administrator／HR 權限隔離。
- 正式資料庫執行 Migration 前必須建立備份。
