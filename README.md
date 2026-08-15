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
  config/                 Supabase server client
  controllers/            API 業務邏輯
  middleware/             JWT 與角色權限
  routes/                 REST API 路由
  services/               驗證與時段媒合演算法
database/
  supabase.sql             全新資料庫完整 Schema
  migrations/
    003_hr_system_rebuild.sql  舊版系統升級用 Migration
```

## 本機設定

在 `backend/.env` 設定：

```env
PORT=3000
SUPABASE_URL=https://你的專案代碼.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key
JWT_SECRET=至少-32-字元的隨機長字串
JWT_EXPIRES_IN=8h
```

`SUPABASE_SERVICE_ROLE_KEY` 只能放在後端環境變數，禁止放入前端或提交到 Git。

### 資料庫

- 全新 Supabase 專案：在 SQL Editor 執行 `database/supabase.sql`。
- 已安裝舊版面試系統：在 SQL Editor 執行 `database/migrations/003_hr_system_rebuild.sql`。

Migration 會移除舊版主管與求職者登入及舊排程資料，並把舊 `admin` 角色轉為 `administrator`。執行前請先備份正式資料。

### 啟動

```bash
cd /c/Andy/mywebsite/05zhi.github.io/ipebg/interview-system/backend
npm install
npm start
```

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
- Service Role Key 外洩時必須立即在 Supabase 輪替。
- 上線前執行 `npm audit`，並以不同帳號驗證 Administrator／HR 權限隔離。
- 正式資料庫執行 Migration 前必須建立備份。
