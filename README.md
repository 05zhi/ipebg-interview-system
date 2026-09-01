# Global Interview Scheduling System

公司內部使用的全球面試排程管理系統。系統僅提供 `administrator` 與 `hr` 登入；主管及候選人不具登入帳號。

## 網站功能

### 使用者角色與權限

系統只有兩種可登入角色，主管與面試者不需要建立帳號：

- `administrator`：管理 HR 帳號及系統功能開關，不能操作 HR 的面試資料 API。
- `hr`：管理部門、人員、空檔、媒合、面試、評語及報表，不能操作 Administrator API。
- 主管／面試者：不登入系統；安全空檔填寫功能開啟時，可使用 HR 提供的限時連結填寫空檔。

登入後使用 HttpOnly Cookie 保存可撤銷 Session。JWT 不會寫入 `localStorage`；修改密碼、停用帳號或登出時，
伺服器會撤銷 Session。

### Administrator 控制台

Administrator 可執行以下操作：

- 建立 HR 帳號，設定姓名、Username、Email 與初始密碼。
- 修改 HR 姓名、Username、Email、密碼與啟用狀態。
- 停用或刪除不再使用的 HR 帳號；停用或重設密碼時會撤銷既有 Session。
- 查看 HR 帳號總數及啟用帳號數量。
- 在「HR 功能開關」開啟或關閉「安全空檔填寫連結」。

安全空檔填寫連結預設關閉。關閉時，HR 介面不顯示「填寫連結」按鈕、HR 無法透過 API 建立新連結，
既有公開連結也無法繼續使用。

### 部門、人員與聯絡資料

HR 可集中管理組織及面試相關人員：

- 建立、修改及刪除部門；仍有主管或面試者使用的部門不可直接刪除。
- 建立、搜尋、修改及刪除主管，記錄姓名、Email、部門與備註。
- 建立、搜尋、修改及刪除面試者，記錄姓名、Email、電話、應徵職位、部門與備註。
- Email 與電話可留空；姓名、職位及部門等必要欄位會在後端再次驗證。
- 面試者列表會顯示目前面試流程狀態，例如待確認、已確認、已完成或未出席。

### 全球時區與空檔管理

- HR 可為每位主管及面試者分日設定多個 30 分鐘空檔。
- 每一天可選擇所在地與 IANA Timezone，例如 `Asia/Taipei`、`America/New_York` 或 `Europe/London`。
- 畫面使用當地時間操作，海外時區會另外顯示台灣時間對照。
- 時段顯示完整範圍，例如 `12:00–12:30`；實際資料一律轉成 UTC 存入 PostgreSQL。
- 系統會檢查無效日期、夏令時間不存在的時間、結束早於開始及重疊時段。
- 已安排面試所占用的主管時段會鎖定，避免修改空檔後造成既有面試衝突。
- 儲存單日空檔後會直接顯示完成提示。

### 安全空檔填寫連結

功能由 Administrator 開啟後，HR 可在主管或面試者列表按「填寫連結」：

1. 輸入 1–30 天的有效期限。
2. 系統產生不可猜測的 32-byte 隨機 token，並自動複製公開網址。
3. 主管或面試者不需登入，即可分日選擇城市、時區及 30 分鐘空檔。
4. 使用者儲存後會看到彈出式完成提示。
5. 同一人產生新連結時，仍有效的舊連結會自動撤銷。

資料庫只保存 token 的 SHA-256 雜湊，不保存原始 token。連結過期、撤銷、對象停用或功能被
Administrator 關閉後，公開 API 都會拒絕存取。

### 共同空檔媒合與面試建立

- HR 選擇一位面試者、一位或多位主管、日期範圍及面試長度。
- 媒合結果只顯示所有參與者都完整有空的連續時段。
- 支援 30、60、90、120 分鐘等由 30 分鐘空檔組成的面試。
- 建立面試時會再次由資料庫驗證人員存在、空檔完整及時間沒有衝突，避免多人同時操作造成重複預約。
- 主管或面試者已有重疊面試時，資料庫會拒絕建立衝突紀錄。

### 面試流程管理

每場面試可記錄及修改：

- 面試者及一位或多位參與主管。
- 開始時間、結束時間、備註及會議室資訊。
- Teams、Google Meet 或其他 HTTP／HTTPS 會議連結；系統會辨識常見供應商。
- 面試輪次（1–20）及輪次名稱，例如「HR 初談」、「技術面談」或「主管面談」。
- 狀態：待確認、已確認、已排程、已完成、未出席、已取消。
- 錄取結果：待決定、進入下一輪、不錄取、已發 Offer、已錄取、候選人退出。

HR 可從列表或月曆查看面試、搜尋面試者／主管／部門／備註、依狀態篩選、依日期或姓名排序，並開啟詳細資料。

### 主管評語

- 每位參與主管可有一筆獨立評語。
- HR 可代為輸入 1–5 分評分、錄取建議及最多 5,000 字評語。
- 錄取建議包括強烈建議錄取、建議錄取、待討論、不建議錄取與強烈不建議。
- 評語與主管／面試關聯綁定；不是該場面試參與者的主管不能建立評語。
- 重複儲存同一主管評語時會更新原紀錄，不會產生重複資料。

### Email、ICS 與面試提醒

Email 功能預設關閉；設定 SMTP 並開啟後：

- 建立面試時，系統寄送邀請給有 Email 的面試者及參與主管。
- Email 會包含面試時間、備註、會議連結及 `.ics` 行事曆附件。
- HR 可手動重新寄送面試邀請。
- 服務每 15 分鐘檢查近期面試，依 `INTERVIEW_REMINDER_HOURS` 寄送一次提醒。
- 通知結果會記錄為成功或失敗，提醒會去除重複寄送。
- 郵件失敗不會回滾已成功建立的面試。

目前 Teams／Google Meet 網址由 HR 貼上；自動建立會議仍需 Microsoft Graph 或 Google Calendar OAuth 憑證。

### Dashboard 與報表

HR 營運總覽會顯示：

- 今日面試數、本週面試數、主管總數及面試者總數。
- 面試完成率：已開始且未取消的面試中，狀態為「已完成」的比例。
- 平均安排時間：建立面試到面試開始之間的平均時間。
- 即將進行的面試及目前狀態。
- 各部門的面試者數、主管數及面試場次。

Dashboard 右上角可直接下載：

- CSV：UTF-8 BOM 格式，可用 Excel 開啟，並防止試算表公式注入。
- Excel：真正的 `.xlsx` 活頁簿，包含凍結標題列、自動篩選、欄寬及日期格式。

匯出內容包括面試 ID、時間、狀態、輪次、錄取結果、面試者、Email、職位、部門、主管、平均評分、
會議連結、備註及建立時間。一般匯出只包含尚未封存的面試。

### 封存與資料保留

- 自動封存預設關閉，`npm start` 不會自行刪除任何面試資料。
- 開啟後，只會封存狀態為「已完成」且超過保留天數的面試。
- 封存是軟刪除：設定 `archived_at` 並從一般列表隱藏，不會刪除面試者、面試、評語或通知紀錄。
- 封存資料仍存在 Neon 並占用資料庫空間；目前系統不會自動永久刪除。
- 保留天數由 `INTERVIEW_ARCHIVE_AFTER_DAYS` 設定，預設為 90 天。

### 安全性與可靠性

- 密碼使用 bcrypt 雜湊，不保存明碼。
- Session 使用 HttpOnly、SameSite Cookie，並可由伺服器撤銷。
- Helmet 設定 CSP、禁止 iframe 嵌入及其他 HTTP 安全標頭。
- API 有一般速率限制，登入另有 IP＋帳號失敗限流。
- CORS 可限制允許的網站來源，請求內容限制為 1 MB。
- PostgreSQL constraint、transaction、排他範圍及外鍵共同保護資料一致性。
- 正式資料庫與測試資料庫會比較 endpoint/database identity，避免測試誤刪正式資料。
- GitHub Actions 使用臨時 PostgreSQL，不會接觸 Neon 正式資料。

## 一般操作流程

1. Administrator 建立 HR 帳號，並依需要開啟安全空檔填寫連結。
2. HR 建立部門、主管及面試者資料。
3. HR 直接維護空檔，或產生安全連結讓主管／面試者自行填寫。
4. HR 選擇參與者、日期範圍與面試長度，尋找共同空檔。
5. HR 建立面試、填入輪次及 Teams／Google Meet 網址。
6. 系統寄出邀請與 ICS；HR 追蹤待確認、已確認及面試結果。
7. 面試完成後輸入主管評語與錄取結果。
8. 從 Dashboard 查看統計或匯出 CSV／Excel 報表。

## 專案結構

```text
frontend/                 HTML、CSS 與瀏覽器端 JavaScript
backend/                  Node.js / Express API
  config/                 Neon PostgreSQL connection pool
  controllers/            API 業務邏輯
  middleware/             JWT Session 與角色權限
  routes/                 REST API 路由
  services/               驗證與時段媒合演算法
database/
  neon.sql                Neon 全新資料庫完整 Schema
  supabase.sql            舊 Supabase Schema（僅供遷移參考）
  migrations/
    003_hr_system_rebuild.sql  舊版系統升級用 Migration
    009_interview_archiving.sql 面試封存欄位與索引
    010_auth_sessions.sql       可撤銷登入 Session
    011_interview_notifications.sql Email、ICS 與會議連結
    012_secure_availability_links.sql 限時安全空檔連結
    013_interview_workflow.sql  狀態、輪次、評語與錄取結果
    014_feature_settings.sql    Administrator 功能開關
```

## 本機設定

在 `backend/.env` 設定：

```env
PORT=3000
DATABASE_URL=Neon-pooled-connection-string
DATABASE_URL_DIRECT=Neon-direct-connection-string
DATABASE_URL_TEST=Neon-test-branch-connection-string
# 若尚未建立 branch，可改用同專案的獨立資料庫：
TEST_DATABASE_NAME=interview_system_test
DB_POOL_MAX=1
JWT_SECRET=至少-32-字元的隨機長字串
JWT_EXPIRES_IN=8h
AUTH_COOKIE_NAME=interview_session
CORS_ORIGIN=http://localhost:3000
TRUST_PROXY=
API_RATE_LIMIT=600
LOGIN_RATE_LIMIT=5
ENABLE_INTERVIEW_ARCHIVE=false
INTERVIEW_ARCHIVE_AFTER_DAYS=90
EMAIL_NOTIFICATIONS_ENABLED=false
EMAIL_FROM=iPEBG Interview <no-reply@example.com>
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
INTERVIEW_REMINDER_HOURS=24
PUBLIC_BASE_URL=http://localhost:3000
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

Email 通知預設關閉。正式使用時填入公司 SMTP 設定並將 `EMAIL_NOTIFICATIONS_ENABLED=true`；建立面試時會寄出
邀請與 `.ics` 附件，服務每 15 分鐘檢查一次並於 `INTERVIEW_REMINDER_HOURS` 指定的時間範圍內寄送一次提醒。
Teams／Google Meet 目前由 HR 貼上既有會議網址；若要由系統自動建立會議，仍需另外設定 Microsoft Graph 或
Google Calendar OAuth 應用程式憑證。

`PUBLIC_BASE_URL` 是安全空檔連結對外顯示的網站根網址。本機使用 `http://localhost:3000`；正式部署時需改成
HTTPS 網址。系統只保存隨機 token 的 SHA-256 雜湊，原始 token 只在建立時回傳一次；有效期為 1–30 天，
替同一人產生新連結時會自動撤銷仍有效的舊連結。此功能預設關閉，Administrator 可在控制台的
「HR 功能開關」手動開啟。

開啟 <http://localhost:3000>。健康檢查網址為 <http://localhost:3000/api/health>。

開發時可使用：

```bash
npm run dev
```

### 隔離測試

```bash
cd backend
npm test
```

`npm test` 會先重建測試資料庫，再執行前端、完整 API 與 20 組跨時區整合測試。測試設定會比較
`DATABASE_URL_TEST` 與正式連線；若指向同一個 endpoint/database，程式會立即中止。若尚未建立 Neon
test branch，可設定 `TEST_DATABASE_NAME=interview_system_test` 使用同專案內的獨立資料庫。GitHub Actions
則使用臨時 PostgreSQL service，不會接觸 Neon 正式資料。

若需要用後端相同的 bcrypt 實作重設 Administrator 密碼：

```bash
npm run admin:reset-password
```

## REST API

所有 HR 與 Administrator API 都需要同源的 HttpOnly Session Cookie；JWT 不會儲存在瀏覽器 `localStorage`。

- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/password`
- `GET|POST /api/admin/hr-accounts`
- `PATCH|DELETE /api/admin/hr-accounts/:id`
- `GET|PATCH /api/admin/settings/features`
- `GET|POST /api/hr/managers`
- `GET|POST /api/hr/departments`
- `PATCH|DELETE /api/hr/departments/:id`
- `GET|PATCH|DELETE /api/hr/managers/:id`
- `GET|POST /api/hr/managers/:id/slots`
- `PUT /api/hr/managers/:id/slots/day`
- `PATCH|DELETE /api/hr/managers/:id/slots/:slotId`
- `POST /api/hr/managers/:id/availability-links`
- `GET|POST /api/hr/candidates`
- `GET|PATCH|DELETE /api/hr/candidates/:id`
- `GET|POST /api/hr/candidates/:id/slots`
- `PUT /api/hr/candidates/:id/slots/day`
- `PATCH|DELETE /api/hr/candidates/:id/slots/:slotId`
- `POST /api/hr/candidates/:id/availability-links`
- `POST /api/hr/matches`
- `GET|POST /api/hr/interviews`
- `GET|PATCH|DELETE /api/hr/interviews/:id`
- `POST /api/hr/interviews/:id/notifications`
- `PUT /api/hr/interviews/:id/feedback/:managerId`
- `GET /api/hr/dashboard`
- `GET /api/hr/reports/interviews.csv`
- `GET /api/hr/reports/interviews.xlsx`
- `GET /api/hr/settings/features`
- `DELETE /api/hr/availability-links/:linkId`
- `GET /api/availability/:token`
- `PUT /api/availability/:token/day`

## 安全注意事項

- 正式環境應設定限定來源的 CORS、HTTPS 與高強度 JWT Secret；若部署平台位於單層反向代理後，設定 `TRUST_PROXY=1`。
- Helmet 會設定 CSP 與安全標頭；API 與登入端點分別套用一般限流及 IP＋帳號失敗限流。
- Neon connection string 或遷移期間的 Supabase Service Role Key 外洩時必須立即輪替。
- 上線前執行 `npm audit`，並以不同帳號驗證 Administrator／HR 權限隔離。
- 正式資料庫執行 Migration 前必須建立備份。
