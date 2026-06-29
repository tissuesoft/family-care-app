# API 테스트 체크리스트 (Postman)

> **Base URL**: `http://localhost:3000`  
> **인증**: 모든 `/v1/*` API → `Authorization: Bearer <access_token>`  
> **토큰 발급**: `tools/auth-test/index.html` (http://localhost:5173) 카카오 로그인

---

## 이미 확인한 것

| # | API | 상태 |
|---|-----|------|
| ✅ | 카카오 로그인 → JWT | 완료 |
| ✅ | `GET /v1/auth/me` | 완료 |
| ✅ | `POST /v1/family/groups` | 완료 (`name` 필수) |
| ✅ | `GET /v1/home` | 안내함 |
| ✅ | `POST /v1/safety-checks` | 안내함 (오늘 괜찮아요) |

---

## 아직 확인 안 한 것 (권장 순서)

### 0. 공통 준비

```powershell
cd backend
npm run start:dev
```

Postman Collection에 **Bearer Token** 한 번 설정해 두면 이후 요청에 자동 적용됩니다.

**변수 저장 권장** (Tests 탭 또는 환경 변수):

| 변수 | 어디서 받나 |
|------|-------------|
| `group_id` | `POST /v1/family/groups` 응답 `id` |
| `medication_id` | `POST /v1/medications` 응답 `id` |
| `invite_code` | `POST /v1/family/invitations` 응답 `invite_code` |

---

### 1. 인증

#### `POST /v1/auth/logout`
- **Body**: 없음
- **기대**: `{ "success": true }`
- **참고**: 서버에서 JWT 무효화는 안 함. 클라이언트가 토큰 삭제하는 용도.

---

### 2. 가족 / 그룹

#### `GET /v1/family/groups`
- **Body**: 없음
- **기대**: 소속 그룹 배열 `[{ id, name, member_count, is_active }]`

#### `GET /v1/family/groups/:groupId/dashboard/today`
- **URL**: `.../v1/family/groups/{{group_id}}/dashboard/today`
- **기대**: 가족 현황 화면 — 집계(`summary`) + 멤버 목록(`members`)
- **멤버 1명뿐이면**: `members`가 빈 배열 (본인 제외)

#### `POST /v1/family/invitations`
- **Body**:
```json
{
  "family_group_id": "{{group_id}}"
}
```
- **기대**: `invite_code`, `invite_link`

#### `POST /v1/family/invitations/join`
- **누가**: 다른 카카오 계정으로 로그인한 JWT 필요
- **Body**:
```json
{
  "invite_code": "ABC123",
  "relationship_label": "아버지",
  "member_role": "parent"
}
```
- `member_role`: `parent` | `caregiver` (선택)
- **기대**: `{ "family_group_id": "..." }`
- **확인**: 원래 계정으로 `GET /v1/home` → `active_group.members`에 추가됨

#### `PATCH /v1/user/preferences`
- **Body**:
```json
{
  "last_active_group_id": "{{group_id}}"
}
```
- **기대**: `{ "last_active_group_id": "..." }`
- **용도**: 홈/설정에서 활성 탭 그룹 변경

---

### 3. 홈 (재확인)

#### `GET /v1/home`
- **Query** (선택): `group_id={{group_id}}`
- **안심 체크 후 확인**: `my_safety_check.status` → `completed`
- **기분/약/걸음 입력 후**: 각 섹션 값 변경 확인

---

### 4. 안심 체크

#### `POST /v1/safety-checks` ← 오늘 괜찮아요
- **Body**: `{}` 또는 비움
- **선택** (`check_date` 다른 날):
```json
{ "check_date": "2026-06-29" }
```

#### `GET /v1/safety-checks?from=2026-06-01&to=2026-06-30`
- **기대**: 일별 안심 체크 이력 배열

---

### 5. 기분

#### `PUT /v1/mood/today`
- **Body**:
```json
{ "mood_level": 4 }
```
- `mood_level`: 1~5 (1=매우 나쁨 … 5=매우 좋음)
- **기대**: `{ "level": 4, "label": "기분 좋음" }`

#### `GET /v1/mood/today`
- **기대**: 위와 동일 또는 `null`(미입력)

> ⚠️ Body가 500이면 DTO 미적용 이슈 — 개발자에게 알리기 (family/groups와 동일 원인)

---

### 6. 약 복용

#### `POST /v1/medications` — 약 등록
```json
{
  "name": "혈압약",
  "dosage_text": "1정",
  "meal_time": "morning",
  "scheduled_time": "08:00"
}
```
- `meal_time`: `morning` | `lunch` | `evening`

#### `GET /v1/medications`
- **기대**: 내 활성 약 목록

#### `POST /v1/medications/intake-logs` — 복용 체크
```json
{
  "medication_id": "{{medication_id}}",
  "intake_date": "2026-06-29",
  "status": "taken",
  "taken_at": "2026-06-29T08:30:00+09:00"
}
```
- `status`: `taken` | `missed` | `pending` | `scheduled`

#### `GET /v1/medications/family-status?group_id={{group_id}}`
- **기대**: 그룹 멤버별 오늘 약 복용 현황

---

### 7. 걸음 수

#### `PUT /v1/steps/sync`
```json
{
  "step_date": "2026-06-29",
  "total_steps": 5180,
  "calories_kcal": 210,
  "distance_km": 3.2,
  "duration_minutes": 45,
  "hourly": [
    { "recorded_at": "2026-06-29T09:00:00+09:00", "steps": 1200 },
    { "recorded_at": "2026-06-29T15:00:00+09:00", "steps": 3980 }
  ]
}
```
- `hourly`는 선택

#### `GET /v1/steps/family/today?group_id={{group_id}}`
- **기대**: 그룹 멤버별 오늘 걸음 수

---

### 8. 설정

#### `GET /v1/settings`
- **Query** (선택): `group_id={{group_id}}`
- **기대**: 프로필, 알림 설정, 공개범위, 소속 그룹, 플랜 정보

---

## 한 번에 흐름 테스트 (추천 시나리오)

```
1. GET  /v1/auth/me
2. POST /v1/family/groups          { "name": "우리 가족" }
3. POST /v1/safety-checks          {}
4. PUT  /v1/mood/today             { "mood_level": 4 }
5. POST /v1/medications            (혈압약 등록)
6. POST /v1/medications/intake-logs (복용 완료)
7. PUT  /v1/steps/sync             (걸음 5180)
8. GET  /v1/home                   → 모든 섹션 채워졌는지 확인
9. GET  /v1/family/groups/:id/dashboard/today
10. GET /v1/settings
```

---

## 아직 구현 안 된 API (문서만 있음)

| 기능 | 예상 API | 비고 |
|------|----------|------|
| 가족에게 안심 확인 요청 | `POST /v1/family/members/:userId/safety-check-requests` | 미구현 |
| 건강 리포트 (일/주/월) | `/v1/health-reports/...` | 미구현 |
| 설정 변경 (알림 on/off) | `PATCH /v1/settings` | 조회만 있음 |
| 카카오 콜백 래핑 | `POST /v1/auth/kakao/callback` | Supabase가 대신 처리 |

---

## 자주 나는 오류

| 코드 | 원인 | 해결 |
|------|------|------|
| **401** | 토큰 없음/만료 | http://localhost:5173 재로그인 |
| **400** `GROUP_ID_REQUIRED` | 그룹 없음 | `POST /v1/family/groups` |
| **403** `NOT_GROUP_MEMBER` | 다른 사람 그룹 `group_id` | 본인 그룹 ID 사용 |
| **500** + body 관련 | ValidationPipe가 body 필드 제거 | DTO 추가 필요 (family는 수정됨) |

---

## 부가 도구

| 도구 | 실행 |
|------|------|
| 카카오 로그인 테스트 | `npx serve tools/auth-test -p 5173` |
| Supabase 유저 확인 | [Auth Users](https://supabase.com/dashboard/project/nscxlpwokanlqypnyyqw/auth/users) |
| DB 테이블 확인 | Supabase Table Editor |

---

*마지막 업데이트: group_type 제거, 그룹 name 필수 반영*
