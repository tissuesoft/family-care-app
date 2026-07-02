# 가족안심 Flutter 구현 가이드

> **대상**: Flutter 앱을 처음부터 구현하는 AI 에이전트 / 개발자  
> **기준일**: 2026-06-29  
> **원칙**: 이 문서는 **실제 구현된 백엔드 코드**를 기준으로 작성함. `BACKEND_ARCHITECTURE.md` 중 일부 API·필드는 **아직 미구현** — 본 문서 §3·§4를 우선 따를 것.

---

## 0. 한 줄 요약

| 레이어 | 역할 |
|--------|------|
| **Supabase Auth** | 카카오 로그인만. JWT(access_token) 발급 |
| **NestJS API** (`/v1/*`) | 모든 비즈니스 로직·DB 접근. Flutter는 **항상 NestJS 호출** |
| **Flutter** | UI 14화면 + 센서(걸음) + OAuth + API 클라이언트 |

- **Base URL (개발)**: `http://localhost:3000` (Android 에뮬레이터: `http://10.0.2.2:3000`)
- **Supabase URL**: `https://nscxlpwokanlqypnyyqw.supabase.co`
- **인증 헤더**: `Authorization: Bearer <supabase_access_token>`

---

## 1. 저장소·인프라 현황

### 1.1 GitHub / 폴더 구조

```
가족 안심 어플/
├── backend/                 # NestJS API (구현됨)
├── supabase/migrations/     # DB 스키마 SQL
├── docs/
│   ├── BACKEND_ARCHITECTURE.md   # 설계서 (일부 구버전 정보 포함)
│   ├── API_TEST_CHECKLIST.md     # Postman 수동 테스트
│   └── FLUTTER_IMPLEMENTATION_GUIDE.md  # 본 문서
├── tools/auth-test/         # 로컬 카카오 로그인 테스트 (Flutter 대체용)
└── (flutter/)               # ★ 아직 없음 — 새로 생성
```

### 1.2 Supabase 프로젝트

| 항목 | 값 |
|------|-----|
| Project ID | `nscxlpwokanlqypnyyqw` |
| Region | ap-northeast-2 |
| Auth | 카카오 OAuth 활성화 필요 |
| Kakao Redirect URI | `https://nscxlpwokanlqypnyyqw.supabase.co/auth/v1/callback` |
| Supabase Redirect URLs | `family-care://login-callback` (앱 딥링크 권장), 개발 시 등록 |

### 1.3 적용된 DB 마이그레이션

| 파일 | 내용 |
|------|------|
| `20260628000000_initial_schema.sql` | 초기 15테이블, RLS, 트리거 |
| `20260629100000_remove_group_type.sql` | `family_groups.group_type` 삭제, `name` NOT NULL |
| `20260629120000_member_role_to_text.sql` | `member_role` → TEXT (자유 문자열) |

**현재 `family_groups` 컬럼**: `id`, `name`(필수), `created_by`, `created_at`  
**`group_type` / `tab_label`**: 삭제됨 → UI에는 `name` 사용

---

## 2. 백엔드 아키텍처 (Flutter가 알아야 할 것)

### 2.1 인증 흐름

```
[Flutter] supabase_flutter.signInWithOAuth(provider: OAuthProvider.kakao)
    → 카카오 로그인
    → Supabase callback
    → 앱 딥링크로 복귀 (PKCE code 교환)
    → session.accessToken 확보

[Flutter] 모든 API 호출
    → Header: Authorization: Bearer <accessToken>

[NestJS] SupabaseAuthGuard
    → service_role로 auth.getUser(token) 검증
    → request.user에 Supabase User 주입
```

- NestJS **service_role** 키는 서버 `.env`에만. Flutter에 넣지 말 것.
- Flutter에는 **anon/publishable key**만.
- `POST /v1/auth/logout`: 서버는 `{ success: true }`만 반환. **클라이언트에서 `supabase.auth.signOut()` 필수.**

### 2.2 다중 가족 그룹

- 사용자는 **여러 `family_groups`**에 동시 소속 가능.
- 멤버십: `family_group_members` (user_id ↔ family_group_id).
- 활성 탭: `user_preferences.last_active_group_id`.
- 그룹 스코프 API: query `group_id` 또는 서버가 `last_active_group_id` → 멤버 수 최다 그룹 순으로 resolve.
- 그룹 없으면 `GET /v1/home` → **400** `GROUP_ID_REQUIRED`.

### 2.3 날짜·시간

- 서버 **일별 데이터 기준**: **KST (`Asia/Seoul`)** `YYYY-MM-DD`.
- Flutter에서 `step_date`, `check_date`, `intake_date` 보낼 때 KST 날짜 문자열 사용 권장.

### 2.4 ValidationPipe 주의 (백엔드 이슈)

NestJS 전역 `ValidationPipe({ whitelist: true })` 때문에 **DTO 클래스 없는 POST/PUT body**는 필드가 제거될 수 있음.

| API | DTO | Flutter 연동 시 |
|-----|-----|-----------------|
| `POST /v1/family/groups` | ✅ CreateGroupDto | 안전 |
| `POST /v1/family/invitations` | ✅ CreateInvitationDto | 안전 |
| `POST /v1/family/invitations/join` | ✅ JoinInviteDto | 안전 |
| `PATCH /v1/user/preferences` | ✅ UpdatePreferencesDto | 안전 |
| `POST /v1/safety-checks` | ❌ | body 비워도 동작 가능 |
| `PUT /v1/mood/today` | ❌ | **백엔드 DTO 추가 전 400/500 가능** |
| `POST /v1/medications` | ❌ | **동일** |
| `POST /v1/medications/intake-logs` | ❌ | **동일** |
| `PUT /v1/steps/sync` | ❌ | **동일** |

Flutter 구현 시 위 API가 실패하면 **백엔드에 DTO 추가 요청** 또는 구현 완료 후 연동. (family API는 이미 수정됨)

---

## 3. API 전체 목록 — 구현 상태

### 3.1 ✅ 구현 완료 (Flutter가 바로 호출 가능)

#### Auth — `backend/src/modules/auth/`

| Method | Path | 설명 | Request | Response |
|--------|------|------|---------|----------|
| GET | `/v1/auth/me` | 내 프로필 | — | `{ id, display_name, birth_year, is_premium, step_daily_goal }` |
| POST | `/v1/auth/logout` | 로그아웃(클라이언트 세션 정리용) | — | `{ success: true }` |

#### Home — `backend/src/modules/home/`

| Method | Path | Query | Response 요약 |
|--------|------|-------|---------------|
| GET | `/v1/home` | `group_id?` | §4.1 참고 |

#### Family — `backend/src/modules/family/`

| Method | Path | Body | Response 요약 |
|--------|------|------|---------------|
| GET | `/v1/family/groups` | — | `[{ id, name, member_count, is_active }]` |
| POST | `/v1/family/groups` | `{ name, relationship_label? }` | `family_groups` row |
| GET | `/v1/family/groups/:groupId/dashboard/today` | — | §4.2 |
| POST | `/v1/family/invitations` | `{ family_group_id }` | `{ invite_code, invite_link }` |
| POST | `/v1/family/invitations/join` | `{ invite_code, relationship_label, member_role? }` | `{ family_group_id }` |
| PATCH | `/v1/user/preferences` | `{ last_active_group_id }` | `{ last_active_group_id }` |

#### Safety Check — `backend/src/modules/safety-check/`

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/v1/safety-checks` | `{ check_date? }` | `safety_checks` row |
| GET | `/v1/safety-checks` | `from`, `to` (query) | 배열 |

#### Mood — `backend/src/modules/mood/`

| Method | Path | Body | Response |
|--------|------|------|----------|
| PUT | `/v1/mood/today` | `{ mood_level: 1..5 }` | `{ level, label }` |
| GET | `/v1/mood/today` | — | `{ level, label }` or `null` |

`mood_level` 라벨: 1 매우 나쁨, 2 나쁨, 3 기분 보통, 4 기분 좋음, 5 매우 좋음

#### Medication — `backend/src/modules/medication/`

| Method | Path | Body / Query | Response |
|--------|------|------------|----------|
| GET | `/v1/medications` | — | 활성 약 목록 |
| POST | `/v1/medications` | `{ name, dosage_text?, meal_time, scheduled_time }` | 약 row |
| GET | `/v1/medications/family-status` | `group_id` | `{ summary, members }` |
| POST | `/v1/medications/intake-logs` | `{ medication_id, intake_date, status, taken_at? }` | log row |

`meal_time`: `morning` \| `lunch` \| `evening`  
`status`: `taken` \| `missed` \| `pending` \| `scheduled`

#### Steps — `backend/src/modules/steps/`

| Method | Path | Body / Query | Response |
|--------|------|------------|----------|
| PUT | `/v1/steps/sync` | §4.3 | `daily_steps` row |
| GET | `/v1/steps/family/today` | `group_id` | `[{ user_id, relationship_label, steps }]` |

#### Settings — `backend/src/modules/settings/`

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/v1/settings` | `group_id?` | `{ profile, my_groups, family_members, notification_settings, privacy_settings, plan_info, app_version }` |

---

### 3.2 ❌ 설계만 있고 미구현 (Flutter에서 Mock/스킵 또는 백엔드 추가 후 연동)

| API (문서) | 용도 | Flutter 1차 권장 |
|------------|------|------------------|
| `GET /v1/steps/today` | 걸음 상세 화면 | `GET /v1/home`의 `my_steps_today` + sync로 대체 |
| `GET /v1/steps/weekly` | 주간 차트 | 홈 `weekly_bars` 또는 로컬 집계 |
| `GET /v1/steps/monthly` | 월간 히트맵 | Placeholder UI |
| `GET /v1/medications/today` | 오늘 복용 스케줄 | `GET /v1/home` → `my_medications_today` + `GET /v1/medications` |
| `GET /v1/medications/adherence` | 복용률·streak | Placeholder / 백엔드 추가 |
| `GET /v1/family/members/:id/detail` | 가족 상세 기간별 | `buildMemberSnapshot` 수준만 다른 API 없음 |
| `POST /v1/family/members/:id/safety-check-requests` | 안심 확인 요청 | 미구현 |
| `POST /v1/medications/remind/:id` | 복용 리마인드 | 미구현 |
| `GET /v1/health-reports/me` | 건강 리포트 | 미구현 (`daily_health_scores` 테이블만 존재) |
| `PATCH /v1/settings/notifications` | 알림 설정 변경 | **GET만 구현** |
| `PATCH /v1/settings/privacy` | 공개범위 변경 | **GET만 구현** |
| `POST /v1/auth/kakao/callback` | — | Supabase가 대체, 불필요 |

---

## 4. API 응답 상세 (Flutter 모델 작성용)

### 4.1 `GET /v1/home`

```json
{
  "active_group_id": "uuid",
  "available_groups": [
    { "id": "uuid", "name": "우리 가족", "member_count": 2, "is_active": true }
  ],
  "my_health_score": {
    "score": 0,
    "percent": 0,
    "status_label": "보통",
    "completed_tasks": ["safety_check", "steps"]
  },
  "my_safety_check": {
    "status": "completed",
    "completed_at": "2026-06-29T...",
    "message": "가족들이 확인할 수 있어요"
  },
  "active_group": {
    "group_id": "uuid",
    "name": "우리 가족",
    "view_all_href": "/v1/family/groups/{id}/dashboard/today",
    "members": [
      {
        "user_id": "uuid",
        "relationship_label": "아버지",
        "display_name": "홍길동",
        "age": 68,
        "safety_check_status": "completed",
        "steps": 5180,
        "medications": [{ "name": "혈압약", "status": "taken" }],
        "mood_label": "기분 좋음",
        "last_updated_at": null
      }
    ]
  },
  "my_medications_today": [
    {
      "name": "혈압약",
      "status": "taken",
      "taken_at": "08:30",
      "scheduled_time": "08:00"
    }
  ],
  "my_mood_today": { "level": 4, "label": "기분 좋음" },
  "my_steps_today": {
    "steps": 6248,
    "goal": 10000,
    "remaining": 3752,
    "weekly_bars": [
      { "weekday": "mon", "steps": 5200 }
    ]
  }
}
```

- `my_health_score.score`: `daily_health_scores` 없으면 **0** (산출 로직 미구현).
- `completed_tasks`: `safety_check` | `steps` | `medication`.
- `active_group.members`: **본인 제외** 다른 멤버만.

### 4.2 `GET /v1/family/groups/:groupId/dashboard/today`

```json
{
  "group_id": "uuid",
  "name": "우리 가족",
  "available_groups": [ "...동일 구조..." ],
  "summary": {
    "total_members": 4,
    "safety_completed_count": 3,
    "safety_completion_percent": 75,
    "avg_steps": 5180,
    "medication_summary": {
      "completed_members": 2,
      "total_with_meds": 3
    }
  },
  "members": [ "...MemberSnapshot, 본인 제외..." ]
}
```

### 4.3 `PUT /v1/steps/sync`

**Request:**

```json
{
  "step_date": "2026-06-29",
  "total_steps": 6248,
  "calories_kcal": 248,
  "distance_km": 4.7,
  "duration_minutes": 52,
  "hourly": [
    { "recorded_at": "2026-06-29T09:00:00+09:00", "steps": 1200 }
  ]
}
```

- `hourly` 선택. 있으면 해당 `step_date` KST 구간 기존 hourly 삭제 후 insert.
- **Flutter**: OS/HealthKit에서 읽은 **오늘 누적 걸음**을 주기적으로 전송.

### 4.4 에러 응답

```json
{
  "statusCode": 400,
  "message": { "code": "GROUP_ID_REQUIRED", "message": "가족 그룹에 소속되어 있지 않습니다." }
}
```

| code | HTTP | Flutter 처리 |
|------|------|--------------|
| `GROUP_ID_REQUIRED` | 400 | 온보딩: 그룹 생성/초대 화면으로 |
| `NOT_GROUP_MEMBER` | 403 | 토스트 + 그룹 목록 갱신 |
| `TARGET_NOT_IN_GROUP` | 403 | 대상 멤버 UI 제거 |

---

## 5. DB 테이블 (Flutter 직접 Supabase 접근 시 참고)

> **권장**: 비즈니스 데이터는 **NestJS API만** 사용. 아래는 디버깅·Realtime 확장용.

| 테이블 | 용도 |
|--------|------|
| `profiles` | display_name, birth_year, step_daily_goal, is_premium |
| `family_groups` | name (필수) |
| `family_group_members` | relationship_label, member_role (TEXT) |
| `user_preferences` | last_active_group_id |
| `family_invitations` | invite_code |
| `safety_checks` | 일별 안심 체크 |
| `mood_logs` | mood_level 1-5 |
| `medications` / `medication_intake_logs` | 약·복용 |
| `daily_steps` / `hourly_step_counts` | 걸음 |
| `daily_health_scores` | 건강 점수 (쓰기 API 없음) |
| `user_notification_settings` | 알림 on/off |
| `user_privacy_settings` | steps/medication/mood/health_score 공개범위 |

가입 시 `handle_new_user` 트리거로 profile·알림·프라이버시·preferences 자동 생성.

---

## 6. Flutter 프로젝트 구현 가이드

### 6.1 권장 패키지

```yaml
dependencies:
  flutter:
    sdk: flutter
  supabase_flutter: ^2.x          # 카카오 OAuth + 세션
  dio: ^5.x                       # HTTP (또는 http)
  flutter_riverpod: ^2.x          # 상태관리 (또는 bloc)
  go_router: ^14.x                # 라우팅 + 딥링크
  flutter_secure_storage: ^9.x    # 토큰 (supabase가 대부분 처리)
  pedometer: ^4.x                 # 걸음 (보조)
  health: ^11.x                   # iOS HealthKit / Android Health Connect
  permission_handler: ^11.x
  intl: ^0.19.x
  freezed_annotation: ^2.x
  json_annotation: ^4.x
```

### 6.2 권장 폴더 구조

```
lib/
├── main.dart
├── app.dart
├── config/
│   ├── env.dart                 # SUPABASE_URL, ANON_KEY, API_BASE_URL
│   └── routes.dart
├── core/
│   ├── api/
│   │   ├── api_client.dart      # Dio + Auth interceptor
│   │   └── api_exception.dart
│   ├── auth/
│   │   └── auth_repository.dart # supabase auth
│   └── utils/
│       └── kst_date.dart
├── data/
│   ├── models/                  # freezed JSON
│   └── repositories/            # home, family, steps, ...
├── features/
│   ├── onboarding/
│   ├── auth/
│   ├── home/
│   ├── family/
│   ├── medication/
│   ├── steps/
│   ├── settings/
│   └── invite/
└── shared/
    └── widgets/
```

### 6.3 환경 변수 (`--dart-define` 또는 `.env`)

```dart
const supabaseUrl = 'https://nscxlpwokanlqypnyyqw.supabase.co';
const supabaseAnonKey = '<anon_key>';
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000', // Android emulator
);
```

iOS 시뮬레이터: `http://localhost:3000`  
실기기: PC LAN IP `http://192.168.x.x:3000`

### 6.4 API 클라이언트 패턴

```dart
// 의사코드 — 에이전트가 실제 구현
class ApiClient {
  final Dio _dio;
  final AuthRepository _auth;

  ApiClient(this._dio, this._auth) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _auth.accessToken;
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ));
  }
}
```

401 수신 시: `auth.refreshSession()` 후 1회 재시도 → 실패 시 로그인 화면.

---

## 7. 인증 · 온보딩 구현

### 7.1 카카오 로그인 (Flutter)

1. Supabase Dashboard → Auth → URL Configuration  
   - Redirect URLs: `family-care://login-callback`, `io.supabase.familycare://login-callback` (패키지에 맞게)
2. Android `AndroidManifest.xml` / iOS `Info.plist` 딥링크 설정
3. 코드:

```dart
await supabase.auth.signInWithOAuth(
  OAuthProvider.kakao,
  redirectTo: 'family-care://login-callback',
  authScreenLaunchMode: LaunchMode.externalApplication,
);
```

4. `supabase.auth.onAuthStateChange` → `signedIn` 시 홈 또는 온보딩 분기
5. **다른 카카오 계정**: `signOut()` 후 `queryParams: {'prompt': 'login'}` (Kakao 지원 시)

### 7.2 온보딩 분기

```
로그인 성공
  → GET /v1/auth/me
  → GET /v1/family/groups
  → groups.isEmpty ?
       YES → 그룹 생성 or 초대 코드 입력 화면
       NO  → GET /v1/home
```

**그룹 생성:**

```dart
POST /v1/family/groups
{ "name": "우리 가족", "relationship_label": "나" }
```

**초대 참가:**

```dart
POST /v1/family/invitations/join
{
  "invite_code": "ABC123",
  "relationship_label": "아버지",
  "member_role": "manager"   // 임의 문자열 가능
}
```

**딥링크 초대:** `family-care://invite?code=ABC123` → join 화면에 code prefill

---

## 8. 화면별 구현 명세 (14화면)

설계서 14화면 기준. **API는 §3 구현 상태 엄수.**

### 8.0 전체 화면 인덱스

| # | 화면 파일(추정) | 화면명 | 1차 구현 가능 | 비고 |
|---|----------------|--------|---------------|------|
| 1 | Home_Screen | 홈 | ✅ | §8.1 |
| 2 | Family_Health_Status_Full | 오늘 가족 건강 현황 | ✅ | §8.2 |
| 3 | Family_Member_Detail (일간) | 가족 구성원 상세 — 오늘 | ⚠️ 부분 | 기간별 API 없음 |
| 4 | Family_Member_Detail-1/2 | 내 건강 리포트 — 오늘 | ⚠️ 부분 | health-reports 미구현 |
| 5 | Family_Member_Detail-3 | 내 건강 리포트 — 주간 | ❌ | Placeholder |
| 6 | Family_Member_Detail___ | 리포트/가족 상세 — 월간 | ❌ | Placeholder |
| 7 | My_Medications | 약 복용 — 내 복용 | ✅ | §8.5 |
| 8 | Medication_Management | 약 복용 — 가족 현황 | ✅ | §8.6 |
| 9 | Step_Count_Detail | 내 걸음 수 | ⚠️ 부분 | today/weekly API 없음, sync+home 사용 |
| 10 | App_Settings | 설정 | ⚠️ 읽기만 | PATCH 미구현 |
| 11 | Onboarding___Invitation | 가족 초대하기 | ✅ | §8.9 |
| 12 | Lock_Screen | 잠금화면 푸시 알림 | ❌ | FCM·푸시 백엔드 없음, 2차 스프린트 |
| 13 | Family_Member_Detail (주간) | 가족 구성원 상세 — 주간 | ❌ | Placeholder |
| 14 | Family_Member_Detail (월간) | 가족 구성원 상세 — 월간 | ❌ | Placeholder |

**중요**: `GET /v1/home` 호출 시 서버가 자동으로 `user_preferences.last_active_group_id`를 갱신함. 탭 전환만 할 때는 `PATCH /v1/user/preferences` 후 홈 재호출.

### 8.1 홈 (`Home_Screen`)

| 항목 | 내용 |
|------|------|
| 로드 | `GET /v1/home?group_id={activeGroupId}` |
| 그룹 탭 | `available_groups` 가로 탭. 탭 변경 → `PATCH /v1/user/preferences` 후 `GET /v1/home?group_id=` |
| 건강 점수 카드 | `my_health_score` |
| 안심 체크 버튼 | `POST /v1/safety-checks` `{}` → 홈 refresh |
| 가족 카드 | `active_group.members` |
| 약 | `my_medications_today` |
| 기분 | `my_mood_today` — 탭 시 기분 선택 → `PUT /v1/mood/today` |
| 걸음 | `my_steps_today` — 탭 시 걸음 상세 화면 |
| completed_tasks 아이콘 | `my_health_score.completed_tasks` |

### 8.2 오늘 가족 건강 현황 (`Family_Health_Status_Full`)

| 항목 | 내용 |
|------|------|
| 로드 | `GET /v1/family/groups/{groupId}/dashboard/today` |
| UI | `summary` 집계 + `members` 리스트 |
| 그룹 탭 | `available_groups` |

### 8.3 가족 구성원 상세 (`Family_Member_Detail` 일/주/월)

| 항목 | 내용 |
|------|------|
| 현재 API | **기간별 상세 API 없음** |
| 1차 구현 | `GET /v1/home` 또는 dashboard의 member snapshot + 로컬 UI |
| 기간 탭 | UI만 준비, 데이터 동일 (백엔드 추가 대기) |

### 8.4 내 건강 리포트 (`Family_Member_Detail` 변형)

| 항목 | 내용 |
|------|------|
| API | `GET /v1/health-reports/me` **미구현** |
| 1차 | Placeholder 또는 `my_health_score` + steps/mood/medication 요약 |

### 8.5 약 복용 — 내 복용 (`My_Medications`)

| 항목 | 내용 |
|------|------|
| 로드 | `GET /v1/medications` + 홈 `my_medications_today` |
| 복용 체크 | `POST /v1/medications/intake-logs` |
| 약 등록 | `POST /v1/medications` |

### 8.6 약 복용 — 가족 현황 (`Medication_Management`)

| 항목 | 내용 |
|------|------|
| 로드 | `GET /v1/medications/family-status?group_id=` |

### 8.7 걸음 수 (`Step_Count_Detail`)

| 항목 | 내용 |
|------|------|
| 센서 | §9 참고 |
| 동기화 | `PUT /v1/steps/sync` (foreground + 주기적) |
| 오늘 표시 | `GET /v1/home` → `my_steps_today` |
| 가족 비교 | `GET /v1/steps/family/today?group_id=` |
| 주간/월간 | API 미구현 → `weekly_bars` 또는 placeholder |

### 8.8 설정 (`App_Settings`)

| 항목 | 내용 |
|------|------|
| 로드 | `GET /v1/settings?group_id=` |
| 알림/프라이버시 수정 | PATCH API **미구현** → 스위치 UI는 disabled 또는 로컬만 |
| 로그아웃 | `supabase.auth.signOut()` + `POST /v1/auth/logout` |

### 8.9 초대 (`Onboarding` / 초대하기)

| 항목 | 내용 |
|------|------|
| 초대 생성 | `POST /v1/family/invitations` |
| 공유 | `invite_link` + 카카오톡 공유 (SDK) |
| 참가 | `POST /v1/family/invitations/join` |

### 8.10 안심 체크 전용 화면

홈 버튼과 동일: `POST /v1/safety-checks`

### 8.11 잠금화면 푸시 (`Lock_Screen`) — 2차

| 항목 | 내용 |
|------|------|
| 백엔드 | FCM device token 테이블·푸시 발송 API **미구현** |
| Flutter 1차 | 화면 스킵 또는 정적 목업 |
| Flutter 2차 | `firebase_messaging` + 복용 리마인드 액션 → `POST /v1/medications/intake-logs` (remind API는 미구현) |

### 8.12 그룹 생성 시 서버 기본값

`POST /v1/family/groups` 성공 시 서버가:
- 생성자를 `family_group_members`에 추가 (`member_role`: `caregiver`, `relationship_label`: body 또는 `"나"`)
- `last_active_group_id`를 새 그룹으로 설정

---

## 8-A. Dart 모델 예시 (freezed 권장)

에이전트가 그대로 복사해 확장할 수 있는 최소 타입:

```dart
// lib/data/models/home_dashboard.dart
class HomeDashboard {
  final String activeGroupId;
  final List<FamilyGroupTab> availableGroups;
  final HealthScoreCard myHealthScore;
  final SafetyCheckCard mySafetyCheck;
  final ActiveGroupSection activeGroup;
  final List<MedicationTodayItem> myMedicationsToday;
  final MoodToday? myMoodToday;
  final StepsToday myStepsToday;

  factory HomeDashboard.fromJson(Map<String, dynamic> j) => HomeDashboard(
    activeGroupId: j['active_group_id'] as String,
    availableGroups: (j['available_groups'] as List)
        .map((e) => FamilyGroupTab.fromJson(e))
        .toList(),
    // ... 나머지 필드 동일 패턴
  );
}

class FamilyGroupTab {
  final String id;
  final String name;
  final int memberCount;
  final bool isActive;
}

class MemberSnapshot {
  final String userId;
  final String relationshipLabel;
  final String displayName;
  final int? age;
  final String safetyCheckStatus; // completed | waiting
  final int steps;
  final List<MedicationStatusItem> medications;
  final String? moodLabel;
  final String? lastUpdatedAt;
}
```

전체 필드는 §4.1·§4.2 JSON과 1:1 매핑.

---

## 9. 걸음 수 — Flutter 센서 연동 (필수)

### 9.1 책임 분리

```
[OS 센서 / HealthKit / Health Connect]
           ↓ 읽기
      [Flutter Service]
           ↓ PUT /v1/steps/sync
      [NestJS → daily_steps]
           ↓ GET /v1/home
      [UI 표시]
```

서버는 **측정하지 않음**. Postman으로 sync한 것과 동일한 API를 앱이 호출.

### 9.2 구현 단계

1. **권한 요청**
   - Android: `ACTIVITY_RECOGNITION`
   - iOS: `NSMotionUsageDescription`, HealthKit read steps
2. **오늘 누적 걸음 읽기**
   - `health` 패키지: `HealthDataType.STEPS`, 당일 00:00 KST ~ now
   - fallback: `pedometer` (기기별 편차 있음)
3. **StepSyncService**
   - 앱 시작 / 포그라운드 복귀 / 15~30분 타이머
   - 마지막 sync 값과 차이 있을 때만 API 호출
4. **요청 본문**

```dart
await api.put('/v1/steps/sync', data: {
  'step_date': kstToday(),       // '2026-06-29'
  'total_steps': steps,
  'calories_kcal': optional,
  'distance_km': optional,
  'duration_minutes': optional,
});
```

5. **UI 갱신** sync 성공 후 `HomeRepository.refresh()`

### 9.3 칼로리·거리

화면에 표시 필요 시:
- Health에서 함께 읽거나
- `total_steps * 0.04` kcal 등 **클라이언트 추정** (서버는 저장만)

---

## 10. 상태 관리 · 캐시 권장

| State | 소스 | 갱신 시점 |
|-------|------|-----------|
| `session` | supabase | auth stream |
| `profile` | GET /v1/auth/me | 로그인·설정 |
| `activeGroupId` | preferences + home | 탭 변경 |
| `homeDashboard` | GET /v1/home | 화면 진입, pull-to-refresh, 안심/기분/걸음 후 |
| `familyGroups` | GET /v1/family/groups | 온보딩·초대 후 |

---

## 11. 네비게이션 · 딥링크

```
/                     → splash → auth check
/login                → 카카오 로그인
/onboarding           → 그룹 없을 때
/home                 → 홈
/family               → 가족 현황
/family/:userId       → 구성원 상세 (API 제한적)
/medications          → 내 복용
/medications/family   → 가족 약 현황
/steps                → 걸음
/settings             → 설정
/invite/join?code=    → 초대 참가
```

**딥링크 등록**
- `family-care://login-callback` — Supabase OAuth
- `family-care://invite?code=` — 초대

---

## 12. 구현 우선순위 (스프린트)

### Sprint 1 — 뼈대
- [ ] Flutter 프로젝트 생성
- [ ] supabase_flutter 카카오 로그인
- [ ] ApiClient + 401 처리
- [ ] GET /v1/auth/me, /v1/family/groups

### Sprint 2 — 온보딩·홈
- [ ] 그룹 생성 / 초대 join
- [ ] 홈 화면 + 그룹 탭
- [ ] POST /v1/safety-checks
- [ ] PUT /v1/mood/today

### Sprint 3 — 건강 데이터
- [ ] StepSyncService + PUT /v1/steps/sync
- [ ] 약 목록·복용 로그
- [ ] 가족 현황 화면

### Sprint 4 — 나머지 UI
- [ ] 설정 (read-only)
- [ ] 걸음 상세·가족 걸음 비교
- [ ] 초대 공유
- [ ] 가족 상세 placeholder

### Sprint 5 — 백엔드 연동 확장 (백엔드 완료 후)
- [ ] health-reports, steps/today·weekly·monthly
- [ ] settings PATCH
- [ ] safety-check-requests, medication remind

---

## 13. 백엔드 로컬 실행 (Flutter 개발 시)

```bash
# 터미널 1
cd backend
cp .env.example .env   # 키 채우기
npm install
npm run start:dev      # :3000

# 터미널 2 (카카오 JWT 테스트용, 선택)
cd <project_root>
npx --yes serve tools/auth-test -p 5173
```

---

## 14. Flutter 에이전트 체크리스트 (시작 전)

- [ ] `BACKEND_ARCHITECTURE.md`의 `group_type` / `tab_label` — **무시**, `name` 사용
- [ ] API는 **§3.1 구현 목록만** 실연동
- [ ] §3.2 미구현 API 호출하지 말 것 (Placeholder)
- [ ] 모든 날짜 필드 **KST YYYY-MM-DD**
- [ ] 걸음은 **반드시 센서 → sync → API 조회** 패턴
- [ ] service_role 키 **절대 앱에 포함 금지**
- [ ] mood/medication/steps POST 실패 시 백엔드 DTO 이슈 확인 (§2.4)

---

## 15. Flutter 에이전트에게 줄 프롬프트 예시

아래를 그대로 복사해 Flutter 전용 AI에게 전달:

```
프로젝트: 가족안심 (family-care-app)
문서: docs/FLUTTER_IMPLEMENTATION_GUIDE.md 를 단일 진실 소스로 따를 것.
백엔드: NestJS http://localhost:3000/v1, Supabase 카카오 OAuth.
§3.1 구현된 API만 연동. §3.2 미구현은 Placeholder.
걸음: health/pedometer → PUT /v1/steps/sync → GET /v1/home.
인증: supabase_flutter OAuth only. service_role 앱에 넣지 말 것.
폴더: lib/ 구조는 문서 §6.2. 상태관리 Riverpod 권장.
Sprint 1~4 순서로 구현. design/ UI가 있으면 픽셀 맞춤, 없으면 Material 3.
```

---

## 16. 참고 문서

| 문서 | 용도 |
|------|------|
| `docs/BACKEND_ARCHITECTURE.md` | UI·도메인·ERD 설계 (API 일부는 미구현) |
| `docs/API_TEST_CHECKLIST.md` | Postman 수동 테스트 시나리오 |
| `tools/auth-test/index.html` | 카카오 JWT 수동 발급 (개발) |
| `README.md` | Supabase·백엔드 요약 |

---

*문서 버전: 1.0 · 백엔드 커밋 기준: family DTO, group_type 제거, member_role TEXT*
