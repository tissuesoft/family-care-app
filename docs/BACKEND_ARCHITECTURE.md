# 가족안심 Flutter 앱 — 백엔드 아키텍처 설계서

> **기준**: design 폴더 14개 화면 UI만 분석. 화면에 없는 필드는 추가하지 않음.  
> **인증**: 카카오 로그인만 (Supabase Auth Kakao OAuth)  
> **DB**: Supabase (PostgreSQL) · **API**: NestJS  
> **문서 버전**: 1.1

---

## 0. 앱 개요 · 화면 흐름 (구현 기준)

### 0.1 앱 정체성

| 축 | 설명 | 화면 근거 |
|----|------|-----------|
| 본인 건강 관리 | 약·걸음·기분·건강 점수 | 홈, 약, 걸음, 리포트 |
| 가족 안심 | “오늘도 괜찮아요” 체크 → 가족이 확인 | 홈, 가족 탭 |
| 이상 징후 대응 | 미복용·미체크·활동 급감 → 알림 | 가족 상세, 잠금화면, 걸음 |
| 장기 추적 | 일/주/월 리포트·인사이트 | 건강 리포트, 가족 상세 |

### 0.2 하단 탭 역할

| 탭 | 역할 | 홈과의 관계 |
|----|------|-------------|
| **홈** | 오늘 나 + 선택 그룹 가족 요약 | 매일 첫 진입·대시보드 |
| **가족** | 그룹 전체 현황·구성원 상세 | 홈 가족 섹션 `전체보기` 확장 |
| **걸음** | 목표·주간·월간·가족 비교 | 홈 걸음 섹션 확장 |
| **약** | 내 복용 / 가족 현황 | 홈 약 섹션 확장 |
| **설정** | 알림·공개범위·그룹 관리 | 전역 설정 |

### 0.3 홈 화면 구조 (위 → 아래, 구현 순서)

홈은 **“오늘 내 상태 + 선택 그룹 가족 요약”** 대시보드이다. 상세·차트·알림 발송은 각 탭/전용 화면으로 위임한다.

| 순서 | UI 섹션 | 사용자 행동 | 연결 API/화면 |
|------|---------|-------------|---------------|
| ① | 오늘 내 건강 점수 | 조회 | `daily_health_scores` · 탭 → 건강 리포트 |
| ② | 오늘 안심 체크 | `오늘도 괜찮아요` 탭 | `POST /safety-checks` |
| ③ | 오늘 가족 건강 현황 | 그룹 탭 전환 · `전체보기` | `GET /home?group_id=` · 가족 탭 |
| ④ | 오늘 약 복용 | 복용 체크 | `POST /medications/intake-logs` · 약 탭 |
| ⑤ | 오늘 기분 | 이모지 선택 | `PUT /mood/today` |
| ⑥ | 내 걸음 수 | 조회 | `PUT /steps/sync` · 걸음 탭 |

**건강 점수 카드 하단 아이콘 3개**(안심·걸음·약)는 `completed_tasks`로 표현 — 오늘 핵심 항목 완료 여부.

### 0.4 화면 네비게이션 맵

```
[카카오 로그인]
    → (선택) 가족 초대하기 ──► POST /family/invitations/join
    → 홈

홈
 ├─ [건강 점수 카드] ──────────► 내 건강 리포트 (일/주/월)
 ├─ [안심 체크 버튼] ──────────► POST /safety-checks
 ├─ [가족 섹션 · 전체보기] ────► 가족 탭 · GET /family/groups/:id/dashboard/today
 │       └─ [구성원 행 탭] ────► GET /family/members/:userId/detail?group_id=
 ├─ [약 섹션] ─────────────────► 약 탭 · GET /medications/today
 ├─ [기분] ────────────────────► PUT /mood/today
 └─ [걸음] ────────────────────► 걸음 탭 · GET /steps/today

가족 탭
 ├─ 그룹 탭 전환 (우리 가족 / 나와 아내 / 친구들)
 ├─ [상세 >] ─────────────────► 구성원 상세 (일/주/월)
 ├─ [알림 보내기] ─────────────► POST /medications/remind/:userId
 ├─ [안심 확인 요청] ──────────► POST /family/members/:id/safety-check-requests
 └─ [+ 가족 초대하기] ─────────► 가족 초대 화면

설정
 ├─ 건강 리포트 ───────────────► GET /health-reports/me
 ├─ 가족 구성원 / 초대 ────────► GET /family/groups
 └─ 알림·공개범위 ─────────────► PATCH /settings/*
```

### 0.5 하루 데이터 흐름

```
아침   앱 실행 → GET /home?group_id=
       → POST /safety-checks (괜찮아요)
       → POST /medications/intake-logs (혈압약 등)

낮    PUT /steps/sync (센서)
       → 푸시: 당뇨약 예정 → 잠금화면 [복용완료|나중에]

저녁   PUT /mood/today
       → 배치: daily_health_scores 계산

가족  GET /home 또는 가족 탭에서 미체크·미복용 확인
       → remind / safety-check-request → FCM
```

### 0.6 다중 그룹 모델 (핵심)

**한 사용자는 여러 `family_groups`에 동시에 속할 수 있다.**

| 개념 | 설명 |
|------|------|
| `family_groups` | 독립된 그룹 단위 (예: 우리 가족, 나와 아내, 친구들) |
| `family_group_members` | 사용자 ↔ 그룹 M:N. **관계 라벨은 그룹마다 다름** (A그룹에선 `아들`, B그룹에선 `나`) |
| `group_type` | `family` \| `couple` \| `friends` — 기본 탭 스타일 힌트 |
| `name` | 탭에 표시되는 라벨 (예: `우리 가족`). null이면 `group_type` 기본 문구 |
| `active_group_id` | 홈·가족·약(가족현황) 등 **현재 선택된 그룹**. 클라이언트 저장 + 서버 `user_preferences` 동기화 |

**그룹 스코프 규칙**

- 대시보드·가족 목록·가족 비교 API → **반드시 `group_id`로 필터**
- 프라이버시(걸음/약/기분/점수) → **사용자 단위** (`user_privacy_settings`). 그룹과 무관
- 타인 데이터 조회 권한 → **요청한 `group_id` 안에서 둘 다 멤버**인지 검증 (`is_group_member`)
- 동일 두 사용자가 여러 그룹에 함께 있어도, API는 호출 시 넘긴 `group_id` 기준으로만 멤버 목록·집계

---

## 화면 목록 (14개)

| # | 화면 파일(추정) | 화면명 |
|---|----------------|--------|
| 1 | Home_Screen | 홈 |
| 2 | Family_Health_Status_Full | 오늘 가족 건강 현황 |
| 3 | Family_Member_Detail (일간) | 가족 구성원 상세 — 오늘 (아버지) |
| 4 | Family_Member_Detail-1/2 | 내 건강 리포트 — 오늘 |
| 5 | Family_Member_Detail-3 | 내 건강 리포트 — 주간 |
| 6 | Family_Member_Detail___ | 내 건강 리포트 / 가족 상세 — 월간 |
| 7 | My_Medications | 약 복용 관리 — 내 복용 |
| 8 | Medication_Management | 약 복용 관리 — 가족 현황 |
| 9 | Step_Count_Detail | 내 걸음 수 |
| 10 | App_Settings | 설정 |
| 11 | Onboarding___Invitation | 가족 초대하기 |
| 12 | Lock_Screen | 잠금화면 푸시 알림 |
| 13 | Family_Member_Detail (주간) | 가족 구성원 상세 — 주간 |
| 14 | Family_Member_Detail (월간) | 가족 구성원 상세 — 월간 |

---

## 1. 필요한 기능 분석

### 1.1 인증 · 온보딩

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 카카오 OAuth 로그인 | 설정(로그아웃), 초대 화면(카카오톡 공유) | 유일한 로그인 수단 |
| 프로필 조회/수정 | 설정(김민준, 프리미엄 뱃지) | 이름·프리미엄 상태 |
| 가족 초대 코드 생성 | 가족 초대하기 | 초대 코드·링크 |
| 카카오톡 초대 링크 공유 | 가족 초대하기 | 클라이언트 SDK, 서버는 코드 검증 |
| 초대 코드로 가족 그룹 가입 | 가족 초대하기 | |
| 온보딩 스킵(나중에) | 가족 초대하기 | 클라이언트 상태만, 서버 필수 아님 |

### 1.2 가족 · 그룹

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| **다중 그룹 소속** | 홈, 가족 현황 | 탭 3종 = 최소 3개 그룹 예시. 사용자는 N개 그룹 가능 |
| 그룹 생성 | (탭·초대 흐름상 필요) | 첫 초대 시 그룹 자동 생성 또는 명시적 생성 |
| 그룹 탭 전환 | 홈, 가족 현황 | `우리 가족` / `나와 아내` / `친구들` |
| 선택 그룹 유지 | 홈 UX | `active_group_id` — 앱 재실행 시 마지막 탭 복원 |
| 가족 그룹 멤버 목록 | 홈, 가족 현황, 설정 | **선택된 group_id 기준** |
| 구성원 관계 라벨 | 전 화면 | 어머니, 아버지, 아들, 딸 — **그룹별로 다를 수 있음** |
| 구성원 역할 뱃지 | 설정 | 부모, 뒷바라지(후원자) |
| 구성원 나이·이름 표시 | 홈, 가족 현황 | 김순자 68세 등 |
| 가족 초대 (그룹 단위) | 가족 현황, 설정, 초대 화면 | `family_group_id` 지정 |
| 가족 구성원 상세 진입 | 가족 현황 `상세 >` | `group_id` + `user_id` |

### 1.3 안심 체크

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 오늘 안심 체크 완료 | 홈, 리포트 | `오늘도 괜찮아요` |
| 완료 시각 기록 | 홈, 리포트 | 13:24 등 |
| 가족에게 상태 공개 | 홈, 리포트 | 문구: 가족들이 확인할 수 있어요 |
| 안심 체크 이력(일별) | 리포트, 가족 상세 | 완료/미완료, 타임스탬프 |
| 안심 확인 요청 보내기 | 가족 상세(아버지) | 푸시 트리거 |
| 그룹 안심 완료 집계 | 가족 현황 | 3/4, 75% |

### 1.4 약 복용

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 약 등록/수정/목록 | 내 복용 | 혈압약·당뇨약·수면영양제 |
| 복용 스케줄(아침/점심/저녁 + 시각) | 내 복용 | 08:00, 13:00, 19:00 |
| 오늘 복용 체크/상태 | 홈, 내 복용, 가족 현황 | 완료·예정·미복용 |
| 복용 완료 시각 기록 | 내 복용, 가족 현황 | 8:12, 12:45 등 |
| 복용 연속 일수(streak) | 내 복용, 가족 현황 | 12일째 |
| 월/주 복용률 · 차트 | 내 복용, 리포트 | 94%, 주간 바차트 |
| 주간 복용 그리드(약×요일) | 리포트 주간 | |
| 월간 복용 캘린더 | 리포트 월간 | |
| 가족 복용 현황 집계 | 가족 현황 탭 | 3명 완료·1명 미복용 |
| 가족 미복용 알림 보내기 | 가족 현황, 가족 상세 | |
| 복용 알림 ON/OFF | 내 복용 | |
| 복용 N분 전 알림 | 내 복용 | 30분 전 |
| 알림 액션: 나중에/복용완료 | 잠금화면 | |
| 약 상세(용량) | 잠금화면 | 메트포르민 500mg |

### 1.5 걸음 수

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 일일 걸음 수 | 홈, 걸음, 리포트 | 6,248보 등 |
| 일일 목표(10,000보) | 걸음 | |
| 목표 대비 % · 남은 보수 | 홈, 걸음 | 62%, 3,752보 |
| 칼로리·거리·시간 | 걸음 | 248kcal, 4.7km, 52분 |
| 시간대별 추이 그래프 | 리포트 일간, 가족 상세 | 7h~18h |
| 주간 바 차트 | 홈, 걸음, 리포트 | 월~일 |
| 월간 히트맵 | 걸음 | |
| 월간 통계(평균·최고·연속달성) | 걸음 | |
| 가족 오늘 걸음 비교 | 걸음, 홈 | |
| 가족 평균 걸음 | 가족 현황 | 5,180보 |
| 활동량 급감 경고 | 걸음, 리포트 인사이트 | 아버지 3일 감소 |

### 1.6 기분

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 오늘 기분 5단계 선택 | 홈, 리포트 | 이모지 5개 |
| 가족 기분 표시 | 홈, 가족 현황 | 기분 좋음/보통 |

### 1.7 건강 점수 · 리포트

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 종합 건강 점수(일/주/월) | 홈, 리포트, 가족 상세 | 82점, 87점 등 |
| 전기간 대비 증감 | 리포트, 가족 상세 | +7점 |
| 4개 하위 지표(%) | 리포트, 가족 상세 | 화면마다 라벨 상이(아래 참고) |
| 가족 점수 비교 바차트 | 리포트, 가족 상세 | 딸·아버지·어머니·나 |
| 주의 필요 알림 | 리포트, 가족 상세 | 아버지 주의 필요 |
| 건강 인사이트(텍스트) | 리포트 주간/월간 | 걸음 증가, 복용률, 활동 감소 |
| 기간 탭(오늘/주간/월간) | 리포트, 가족 상세 | |
| 날짜·주·월 네비게이션 | 리포트 | |

**하위 지표 라벨 (화면에 표시된 그대로, DB는 공통 4슬롯으로 저장)**

| 화면 | 슬롯1 | 슬롯2 | 슬롯3 | 슬롯4 |
|------|-------|-------|-------|-------|
| 홈 점수 카드 | (아이콘만) | | | |
| 리포트 일간 | 만성체크 | 걸음 수 | 내 복용 | 비타민 |
| 가족 상세 | 안심체크 | 걸음 수 | 약 복용 | 비타민 |

→ DB: `metric_1_pct`~`metric_4_pct` + API 응답 시 화면 컨텍스트별 라벨 매핑 (화면에 없는 5번째 지표 추가 금지)

### 1.8 알림 · 설정

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 안심 체크 미완료 알림 | 설정 | |
| 약 미복용 알림 | 설정, 잠금화면 | |
| 걸음 수 현저히 감소 | 설정 | |
| 건강 점수 하락 | 설정 | |
| 가족 SOS 호출 | 설정 | 항상 활성 문구 |
| 일일 건강 요약 알림 | 설정 | 매일 21:00 |
| 정보 공개 범위(4종) | 설정 | 걸음/약/기분/건강점수 |
| 공개 대상 | 설정 | 가족 전체 / 나만 보기 |

### 1.9 프리미엄 (화면에 보이는 범위만)

| 기능 | 근거 화면 | 비고 |
|------|-----------|------|
| 무료/프리미엄 플랜 표시 | 설정 | 월 4,900원 문구 |
| 프리미엄 혜택 목록 표시 | 설정 | UI 문구만, 결제 플로우 화면 없음 |

### 1.10 화면에 없어서 DB/API에 넣지 않은 것

- 이메일·비밀번호 로그인
- 결제/구독 결제 API (가격 문구만 존재)
- SOS 발동 UI (설정 토글만 존재)
- 채팅/커뮤니티 피드 (하단 탭 아이콘만 일부 화면에 보이나 전용 화면 없음 → API 미설계)
- AI 건강 분석 (프리미엄 문구만)

---

## 2. 화면별 필요한 데이터

### 2.0 공통 타입 (코드 생성용)

**`safety_check_status`** (가족 카드·홈): `completed` | `waiting`  
- UI: `안심 완료` / `안심 대기`  
- 본인 이력·리포트: `completed` | `incomplete`

**`medication_status`**: `taken` | `missed` | `scheduled` | `pending`

**`mood_level`**: `1`~`5` (1=매우 나쁨 … 5=매우 좋음, 홈에서 4번 선택 예시)

| level | UI 라벨 (화면 예시) |
|-------|---------------------|
| 1~2 | (슬픈 쪽 이모지) |
| 3 | 기분 보통 |
| 4~5 | 기분 좋음 |

**`health_score_status_label`**: `좋음` 등 — 점수 구간별. 홈 87점=`좋음` (구간 테이블은 클라이언트 또는 서버 상수)

**`FamilyGroupSummary`** (탭·목록 공통):

```typescript
{
  id: string;
  group_type: 'family' | 'couple' | 'friends';
  tab_label: string;        // name ?? group_type 기본 라벨
  member_count: number;
  is_active: boolean;       // 현재 선택 탭
}
```

### 2.1 홈

**역할**: §0.3 참고. `GET /v1/home?group_id=` 한 번에 로드.

```json
{
  "active_group_id": "grp-family-uuid",
  "available_groups": [
    { "id": "grp-family-uuid", "group_type": "family", "tab_label": "우리 가족", "member_count": 4, "is_active": true },
    { "id": "grp-couple-uuid", "group_type": "couple", "tab_label": "나와 아내", "member_count": 2, "is_active": false },
    { "id": "grp-friends-uuid", "group_type": "friends", "tab_label": "친구들", "member_count": 5, "is_active": false }
  ],
  "my_health_score": {
    "score": 87,
    "percent": 87,
    "status_label": "좋음",
    "completed_tasks": ["safety_check", "steps", "medication"]
  },
  "my_safety_check": {
    "status": "completed",
    "completed_at": "2025-01-27T13:24:00+09:00",
    "message": "가족들이 확인할 수 있어요"
  },
  "active_group": {
    "group_id": "grp-family-uuid",
    "tab_label": "우리 가족",
    "view_all_href": "/family/groups/grp-family-uuid/dashboard/today",
    "members": []
  },
  "my_medications_today": [],
  "my_mood_today": { "level": 4, "label": "기분 좋음" },
  "my_steps_today": {
    "steps": 6248,
    "goal": 10000,
    "remaining": 3752,
    "weekly_bars": [{ "weekday": "mon", "steps": 5200 }]
  }
}
```

**`active_group.members[]` 각 항목**  
`user_id`, `relationship_label`, `display_name`, `age`, `safety_check_status`, `steps`, `medications[{name, status}]`, `mood_label`

**서버 검증**: `group_id` 없으면 `user_preferences.last_active_group_id` 사용. 둘 다 없으면 가입 그룹 중 `joined_at` 최신 또는 `member_count` 최대 그룹.

### 2.2 오늘 가족 건강 현황

- **필수 query**: `group_id`
- 집계: `total_members`, `safety_completed_count`, `safety_completion_percent`, `avg_steps`, `medication_summary` (2/3)
- `available_groups[]`: 홈과 동일 (탭 전환)
- 멤버 카드: 홈 `active_group.members`와 동일 + `last_updated_at`, `detail_href` (`/family/members/:userId/detail?group_id=`)
- CTA: `+ 가족 초대하기` → `POST /family/invitations` body에 `family_group_id`

### 2.3 가족 구성원 상세 (일/주/월 공통 골격)

- **필수 query**: `group_id`, `period` (today|week|month), `date`
- **권한**: 요청자와 대상이 **동일 group_id의 멤버**인지 검증
- `member`: 이름·관계·나이 (관계는 **이 그룹 기준** relationship_label)
- `safety_check_status`, `last_safety_check_at`
- `can_send_safety_request`: boolean
- `period`: today | week | month + `date_range`
- `health_score`: score, delta, 4 metrics
- `safety_check_card`, `mood_card`
- `steps`: total, max, min, `hourly[]` 또는 `daily[]`
- `medications_today[]`, `intake_progress_percent`
- `safety_check_history[]`
- `family_score_comparison[]`
- `attention_alert` (nullable)
- `insights[]` (주간/월간만)

### 2.4 내 건강 리포트 (일/주/월)

- 가족 상세와 유사하나 **본인** 기준
- 일간: 안심체크 버튼, 복용 스케줄, 기분, 시간대별 걸음
- 주간: 주간 걸음 차트, 약×요일 그리드, 인사이트
- 월간: 월간 걸음, 복용 캘린더, 인사이트

### 2.5 약 복용 — 내 복용

- `medications_today[]`
- `streak_days`, `monthly_adherence_percent`, `weekly_adherence_bars[]`
- `medication_list[]` (이름, meal_time, scheduled_time)
- `notification_enabled`, `reminder_minutes_before`

### 2.6 약 복용 — 가족 현황

- **필수 query**: `group_id`
- `summary`: completed_count, missed_count
- `family_members[]`: meds + status + `send_notification` 가능 여부
- `my_schedule_preview[]`, `my_streak`, `my_monthly_rate`, `weekly_chart`

### 2.7 내 걸음 수

- `today`: steps, percent, goal, remaining, kcal, distance_km, duration_min
- `family_activity_alert` (nullable) — **특정 그룹 멤버** 기준. query `group_id` 권장
- `weekly_chart[]`, `family_steps_today[]` — **query `group_id`** 시 해당 그룹 멤버만
- `monthly_stats`: daily_avg, max_record, max_date, streak_days, `heatmap[]`

### 2.8 설정

- `profile`: name, is_premium
- `my_groups[]`: `{ group_id, tab_label, member_count, my_relationship_label, my_role_badge }` — **소속 그룹 전체 목록**
- `family_members[]`: **기본 표시 그룹** 구성원 (query `group_id` 또는 last_active)
- `notification_settings` (6 toggles + time)
- `privacy_settings[]`: data_type, visibility
- `plan_info`, `app_version`

### 2.9 가족 초대하기

- `invite_code`, `invite_link` (서버 생성)

### 2.10 잠금화면 알림 (푸시 payload)

- 가족 미복용: `member_name`, `medication_name`, `scheduled_time`
- 본인 복용: `medication_name`, `dosage_text`, `scheduled_time`, actions

---

## 3. ERD 설계 (정규화)

```
┌─────────────────┐       ┌──────────────────────┐
│   auth.users    │1────1│      profiles         │
│   (Supabase)    │       │ id (PK, FK)          │
└─────────────────┘       │ display_name         │
                          │ is_premium           │
                          │ step_daily_goal      │
                          └──────────┬───────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────────┐
│  family_groups  │1─────*│family_group_    │*─────1│     profiles        │
│ id (PK)         │       │members          │       └─────────────────────┘
│ group_type      │       │ id (PK)         │
└────────┬────────┘       │ relationship_   │
         │                │   label         │
         │                │ member_role     │
         │                └─────────────────┘
         │
         │1─────*
         ▼
┌─────────────────┐
│family_invitations│
│ invite_code     │
│ created_by (FK) │
└─────────────────┘

profiles 1──1 user_notification_settings
profiles 1──1 user_preferences (last_active_group_id)
profiles 1──* user_privacy_settings (data_type별 행)

profiles 1──* medications
medications 1──* medication_intake_logs (intake_date별)

profiles 1──* safety_checks
profiles 1──* safety_check_requests (target/requester)

profiles 1──* mood_logs (log_date UNIQUE)
profiles 1──* daily_steps (step_date UNIQUE)
profiles 1──* hourly_step_counts
profiles 1──* daily_health_scores (score_date UNIQUE)
```

### 테이블 정의 요약

| 테이블 | 목적 | 화면 근거 |
|--------|------|-----------|
| profiles | 사용자 프로필 | 설정, 홈 이름 |
| family_groups | **독립 그룹 N개**. 사용자는 여러 그룹 소속 가능 | 홈 탭 3종 |
| family_group_members | 그룹-사용자 M:N + **그룹별** 관계 라벨 | 전 화면 |
| user_preferences | 마지막 선택 그룹 `last_active_group_id` | 홈 탭 복원 |
| family_invitations | 초대 코드 | 초대 화면 |
| medications | 약 마스터 | 내 복용 목록 |
| medication_intake_logs | 일별 복용 기록 | 복용 체크 전 화면 |
| safety_checks | 일별 안심 체크 | 안심 체크 전 화면 |
| safety_check_requests | 안심 확인 요청 | 가족 상세 버튼 |
| mood_logs | 일별 기분 | 기분 선택 UI |
| daily_steps | 일별 걸음 집계 | 걸음 전 화면 |
| hourly_step_counts | 시간대별 걸음 | 일간 그래프 |
| daily_health_scores | 일별 건강 점수 | 점수 카드 |
| user_notification_settings | 알림 6종+시간 | 설정 |
| user_privacy_settings | 공개 범위 4종 | 설정 |

**의도적으로 테이블을 만들지 않은 것**

| 항목 | 이유 |
|------|------|
| health_insights | 화면은 계산 결과 텍스트. 일/주/월 집계 쿼리로 생성 |
| subscription / payment | 결제 화면 없음. `profiles.is_premium`만 |
| push_notifications | 디바이스 토큰·발송은 FCM 연동 레이어(NestJS). 잠금화면은 payload 스펙만 |
| medication_categories | UI에 분류 입력 없음. 이름 문자열로 표시 |

---

## 4. API 설계

**Base URL**: `https://api.example.com/v1`  
**인증**: `Authorization: Bearer <supabase_jwt>`  

### 공통 Query 파라미터

| 파라미터 | 필수 | 사용 API | 설명 |
|----------|------|----------|------|
| `group_id` | 가족 스코프 API에서 **필수** | `/home`, `/family/*`, `/medications/family-status`, `/steps/family/*`, `/health-reports/family-comparison` | 현재 선택 그룹 |
| `date` | 선택 | 리포트·상세 | 기준일 `YYYY-MM-DD` |
| `period` | 선택 | 리포트·상세 | `today` \| `week` \| `month` |

**`group_id` 생략 시**: `user_preferences.last_active_group_id` → 없으면 400 `GROUP_ID_REQUIRED`.

### 4.1 Auth

| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/kakao/callback` | 카카오 토큰 → Supabase 세션 교환 (NestJS 래핑) |
| GET | `/auth/me` | 내 프로필 |
| POST | `/auth/logout` | 세션 무효화 |

### 4.2 Family

| Method | Path | 설명 |
|--------|------|------|
| GET | `/family/groups` | 내가 속한 **전체** 그룹 목록 (탭용) |
| POST | `/family/groups` | 새 그룹 생성 (body: `group_type`, `name?`) |
| PATCH | `/family/groups/:groupId` | 그룹 이름 수정 |
| GET | `/family/groups/:groupId/members` | 해당 그룹 구성원만 |
| GET | `/family/groups/:groupId/dashboard/today` | 가족 현황 집계+카드 |
| GET | `/family/members/:userId/detail` | 구성원 상세. **query: `group_id`, `period`, `date`** |
| POST | `/family/invitations` | 초대 코드 생성 (body: `family_group_id`) |
| POST | `/family/invitations/join` | 코드로 **지정 그룹** 가입 |
| POST | `/family/members/:userId/safety-check-requests` | 안심 확인 요청. **query: `group_id`** |
| PATCH | `/user/preferences` | `last_active_group_id` 저장 (탭 전환 시) |

### 4.3 Safety Check

| Method | Path | 설명 |
|--------|------|------|
| POST | `/safety-checks` | 오늘 안심 체크 완료 |
| GET | `/safety-checks` | 기간별 이력 (query: from, to) |

### 4.4 Medications

| Method | Path | 설명 |
|--------|------|------|
| GET | `/medications` | 내 약 목록 |
| POST | `/medications` | 약 추가 |
| PATCH | `/medications/:id` | 약 수정 |
| GET | `/medications/today` | 오늘 스케줄+상태 |
| GET | `/medications/family-status` | 가족 현황 탭. **query: `group_id` 필수** |
| POST | `/medications/intake-logs` | 복용 완료 기록 |
| POST | `/medications/intake-logs/:id/snooze` | 나중에 알림 |
| POST | `/medications/remind/:userId` | 가족에게 알림 보내기 |
| GET | `/medications/adherence` | streak, 월/주 복용률 (query: period) |

### 4.5 Steps

| Method | Path | 설명 |
|--------|------|------|
| GET | `/steps/today` | 오늘 상세 |
| GET | `/steps/weekly` | 주간 차트 |
| GET | `/steps/monthly` | 월간 통계+히트맵 |
| GET | `/steps/family/today` | 가족 오늘 비교. **query: `group_id` 필수** |
| PUT | `/steps/sync` | 걸음 데이터 동기화 (클라이언트 센서) |

### 4.6 Mood

| Method | Path | 설명 |
|--------|------|------|
| PUT | `/mood/today` | 오늘 기분 저장 |
| GET | `/mood/today` | 오늘 기분 조회 |

### 4.7 Health Report

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health-reports/me` | 내 리포트 (query: period, date) |
| GET | `/health-reports/family-comparison` | 가족 점수 비교. **query: `group_id`, `period`, `date`** |

### 4.8 Home

| Method | Path | 설명 |
|--------|------|------|
| GET | `/home` | 홈 대시보드. **query: `group_id` 권장** (없으면 last_active) |

### 4.9 Settings

| Method | Path | 설명 |
|--------|------|------|
| GET | `/settings` | 설정 전체 |
| PATCH | `/settings/notifications` | 알림 설정 |
| PATCH | `/settings/privacy` | 공개 범위 |
| PATCH | `/settings/step-goal` | 걸음 목표 |

---

## 5. DB Index

```sql
-- family_group_members: 그룹별 멤버 조회
CREATE INDEX idx_fgm_group_id ON family_group_members (family_group_id);
CREATE INDEX idx_fgm_user_id ON family_group_members (user_id);

-- medication_intake_logs: 일별·약별 조회
CREATE INDEX idx_mil_medication_date ON medication_intake_logs (medication_id, intake_date DESC);
CREATE INDEX idx_mil_date_status ON medication_intake_logs (intake_date, status);

-- safety_checks
CREATE UNIQUE INDEX idx_safety_checks_user_date ON safety_checks (user_id, check_date);
CREATE INDEX idx_safety_checks_date ON safety_checks (check_date DESC);

-- daily_steps
CREATE UNIQUE INDEX idx_daily_steps_user_date ON daily_steps (user_id, step_date);
CREATE INDEX idx_daily_steps_date ON daily_steps (step_date DESC);

-- hourly_step_counts
CREATE INDEX idx_hourly_steps_user_time ON hourly_step_counts (user_id, recorded_at DESC);

-- daily_health_scores
CREATE UNIQUE INDEX idx_health_scores_user_date ON daily_health_scores (user_id, score_date);

-- mood_logs
CREATE UNIQUE INDEX idx_mood_logs_user_date ON mood_logs (user_id, log_date);

-- family_invitations
CREATE UNIQUE INDEX idx_invitations_code ON family_invitations (invite_code) WHERE accepted_at IS NULL;

-- medications
CREATE INDEX idx_medications_user_active ON medications (user_id) WHERE is_active = true;

-- user_preferences
CREATE INDEX idx_user_prefs_group ON user_preferences (last_active_group_id);

-- safety_check_requests
CREATE INDEX idx_scr_group_date ON safety_check_requests (family_group_id, request_date DESC);
```

---

## 6. 권한 설계

### 6.1 역할

| 역할 | 설명 |
|------|------|
| authenticated | 카카오 로그인 사용자 |
| service_role | NestJS 서버만 (배치·푸시) |

### 6.2 접근 규칙

1. **본인 데이터**: 항상 CRUD (자기 `user_id`)
2. **그룹 스코프 API**: 호출자가 `group_id`의 `family_group_members`에 있어야 함 (`is_group_member(auth.uid(), group_id)`)
3. **타인 데이터 조회**: 위 그룹 멤버십 + `user_privacy_settings` 통과
4. **쓰기 권한**: 타인의 안심체크·복용·기분 기록 불가. 예외: `safety_check_requests`, `medications/remind` (요청·알림만)
5. **다중 그룹**: 동일 두 사용자가 그룹 A·B에 함께 있어도, API는 **요청 `group_id`의 멤버만** 목록·집계에 포함

### 6.3 RLS 헬퍼

```sql
-- 특정 그룹의 멤버인지
is_group_member(user_id UUID, group_id UUID) → boolean

-- 특정 그룹 안에서 viewer가 target 데이터를 볼 수 있는지
can_view_data_in_group(viewer, target, group_id, dtype) → boolean
  := is_group_member(viewer, group_id)
  AND is_group_member(target, group_id)
  AND (viewer = target OR privacy allows)
```

기존 `is_same_family_group(viewer, target)` — **어느 그룹이든** 함께 있으면 true. 대시보드 필터용이 아니라 레거시·보조 검증용. **신규 API는 `group_id` 스코프 우선.**

### 6.4 RLS 정책 요약

| 테이블 | SELECT | INSERT/UPDATE |
|--------|--------|---------------|
| profiles | 본인 + 같은 그룹 멤버(이름·나이만) | 본인만 |
| medications | 본인 + privacy 허용 시 가족 | 본인만 |
| medication_intake_logs | 동일 | 본인만 |
| safety_checks | 본인 + 가족 | 본인만 |
| daily_steps | 본인 + privacy(steps) | 본인만 |
| mood_logs | 본인 + privacy(mood) | 본인만 |
| daily_health_scores | 본인 + privacy(health_score) | 서버 계산만 |
| user_notification_settings | 본인만 | 본인만 |
| user_privacy_settings | 본인만 | 본인만 |

---

## 7. Supabase (PostgreSQL) SQL

```sql
-- extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- enums (화면에 나타난 값만)
CREATE TYPE group_type AS ENUM ('family', 'couple', 'friends');
CREATE TYPE member_role AS ENUM ('parent', 'caregiver');  -- 부모, 뒷바라지
CREATE TYPE meal_time AS ENUM ('morning', 'lunch', 'evening');
CREATE TYPE intake_status AS ENUM ('taken', 'missed', 'pending', 'scheduled');
CREATE TYPE safety_status AS ENUM ('completed', 'incomplete');
CREATE TYPE privacy_data_type AS ENUM ('steps', 'medication', 'mood', 'health_score');
CREATE TYPE privacy_visibility AS ENUM ('family', 'only_me');

-- profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_year SMALLINT,  -- 화면: "68세" → 클라이언트가 연도 계산 또는 age 표시용
  is_premium BOOLEAN NOT NULL DEFAULT false,
  step_daily_goal INTEGER NOT NULL DEFAULT 10000,  -- 화면: 목표 10,000보
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- family
CREATE TABLE family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type group_type NOT NULL,
  name TEXT,  -- 탭 라벨: "우리 가족", "나와 아내", "친구들". null이면 group_type 기본 문구
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_label TEXT NOT NULL,  -- 이 그룹 안에서의 호칭: 어머니, 아버지, 아들, 딸
  member_role member_role,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_group_id, user_id)
);

-- 사용자당 1행: 마지막 선택 그룹 (홈 탭 복원)
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_active_group_id UUID REFERENCES family_groups(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id),
  UNIQUE (invite_code)
);

-- medications
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage_text TEXT,  -- 잠금화면: 메트포르민 500mg
  meal_time meal_time NOT NULL,
  scheduled_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE medication_intake_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  intake_date DATE NOT NULL,
  status intake_status NOT NULL DEFAULT 'pending',
  taken_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  UNIQUE (medication_id, intake_date)
);

-- safety
CREATE TABLE safety_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  status safety_status NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, check_date)
);

CREATE TABLE safety_check_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id),
  requester_user_id UUID NOT NULL REFERENCES profiles(id),
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mood
CREATE TABLE mood_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  mood_level SMALLINT NOT NULL CHECK (mood_level BETWEEN 1 AND 5),
  UNIQUE (user_id, log_date)
);

-- steps
CREATE TABLE daily_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  step_date DATE NOT NULL,
  total_steps INTEGER NOT NULL DEFAULT 0,
  calories_kcal NUMERIC(8,2),
  distance_km NUMERIC(8,2),
  duration_minutes INTEGER,
  UNIQUE (user_id, step_date)
);

CREATE TABLE hourly_step_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  steps INTEGER NOT NULL
);

-- health scores
CREATE TABLE daily_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  total_score SMALLINT NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  metric_1_pct NUMERIC(5,2) NOT NULL,
  metric_2_pct NUMERIC(5,2) NOT NULL,
  metric_3_pct NUMERIC(5,2) NOT NULL,
  metric_4_pct NUMERIC(5,2) NOT NULL,
  UNIQUE (user_id, score_date)
);

-- settings
CREATE TABLE user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  safety_check_incomplete BOOLEAN NOT NULL DEFAULT true,
  medication_missed BOOLEAN NOT NULL DEFAULT true,
  step_decrease BOOLEAN NOT NULL DEFAULT true,
  health_score_drop BOOLEAN NOT NULL DEFAULT true,
  family_sos BOOLEAN NOT NULL DEFAULT true,
  daily_health_summary BOOLEAN NOT NULL DEFAULT false,
  daily_summary_time TIME NOT NULL DEFAULT '21:00',
  medication_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  medication_reminder_minutes_before SMALLINT NOT NULL DEFAULT 30
);

CREATE TABLE user_privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data_type privacy_data_type NOT NULL,
  visibility privacy_visibility NOT NULL DEFAULT 'family',
  UNIQUE (user_id, data_type)
);

-- indexes (section 5)
-- ... (위 index SQL 동일)

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_intake_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- helper: group membership
CREATE OR REPLACE FUNCTION is_group_member(check_user UUID, check_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_group_members
    WHERE user_id = check_user AND family_group_id = check_group
  );
$$;

-- helper: same family group (any shared group)
CREATE OR REPLACE FUNCTION is_same_family_group(viewer UUID, target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_group_members a
    JOIN family_group_members b ON a.family_group_id = b.family_group_id
    WHERE a.user_id = viewer AND b.user_id = target
  );
$$;

CREATE OR REPLACE FUNCTION can_view_data_in_group(
  viewer UUID, target UUID, check_group UUID, dtype privacy_data_type
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    is_group_member(viewer, check_group)
    AND is_group_member(target, check_group)
    AND (
      viewer = target
      OR COALESCE(
        (SELECT visibility FROM user_privacy_settings
         WHERE user_id = target AND data_type = dtype),
        'family'::privacy_visibility
      ) = 'family'
    );
$$;

CREATE OR REPLACE FUNCTION can_view_data(viewer UUID, owner UUID, dtype privacy_data_type)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    viewer = owner
    OR (
      is_same_family_group(viewer, owner)
      AND COALESCE(
        (SELECT visibility FROM user_privacy_settings
         WHERE user_id = owner AND data_type = dtype),
        'family'::privacy_visibility
      ) = 'family'
    );
$$;

-- example policies
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_same_family_group(auth.uid(), id));

CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY steps_select ON daily_steps FOR SELECT TO authenticated
  USING (can_view_data(auth.uid(), user_id, 'steps'));

CREATE POLICY steps_upsert ON daily_steps FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## 8. NestJS API 구조

```
src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/supabase-auth.guard.ts
│   ├── decorators/current-user.decorator.ts
│   └── filters/http-exception.filter.ts
├── config/
│   └── supabase.config.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   └── auth.service.ts
│   ├── family/
│   │   ├── family.module.ts
│   │   ├── family.controller.ts
│   │   ├── family.service.ts
│   │   └── dto/
│   ├── safety-check/
│   ├── medication/
│   ├── steps/
│   ├── mood/
│   ├── health-report/
│   ├── home/
│   └── settings/
└── database/
    └── supabase.service.ts   # service_role 클라이언트
```

### 핵심 Guard 예시

```typescript
// supabase-auth.guard.ts
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private supabase: SupabaseService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException();
    const { data, error } = await this.supabase.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();
    req.user = data.user;
    return true;
  }
}
```

### Home Service 조립 로직 (구현 가이드)

```typescript
async getDashboard(userId: string, groupId?: string) {
  const groups = await this.familyService.listMyGroups(userId);
  const activeGroupId = groupId
    ?? (await this.prefs.getLastActiveGroupId(userId))
    ?? groups[0]?.id;
  if (!activeGroupId) throw new BadRequestException('GROUP_ID_REQUIRED');

  await this.prefs.setLastActiveGroupId(userId, activeGroupId);
  await this.familyService.assertMember(userId, activeGroupId);

  const memberIds = await this.familyService.getMemberUserIds(activeGroupId);
  const today = startOfDayKST();

  const [myScore, mySafety, myMeds, myMood, mySteps, ...memberSnapshots] =
    await Promise.all([
      this.healthScore.getForUser(userId, today),
      this.safetyCheck.getToday(userId, today),
      this.medication.getTodaySchedule(userId, today),
      this.mood.getToday(userId, today),
      this.steps.getTodayWithWeekly(userId, today),
      ...memberIds
        .filter((id) => id !== userId)
        .map((id) => this.buildMemberSnapshot(userId, id, activeGroupId, today)),
    ]);

  return {
    active_group_id: activeGroupId,
    available_groups: groups.map((g) => ({
      ...g,
      is_active: g.id === activeGroupId,
    })),
    my_health_score: myScore,
    my_safety_check: mySafety,
    active_group: {
      group_id: activeGroupId,
      tab_label: groups.find((g) => g.id === activeGroupId)!.tab_label,
      view_all_href: `/family/groups/${activeGroupId}/dashboard/today`,
      members: memberSnapshots,
    },
    my_medications_today: myMeds,
    my_mood_today: myMood,
    my_steps_today: mySteps,
  };
}

// 멤버 스냅샷: can_view_data_in_group 실패 시 해당 필드 null 또는 생략
```

### Home Controller

```typescript
@Controller('v1/home')
@UseGuards(SupabaseAuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome(
    @CurrentUser() user: User,
    @Query('group_id') groupId?: string,
  ) {
    return this.homeService.getDashboard(user.id, groupId);
  }
}
```

---

## 9. API Response 예시

### GET `/v1/home?group_id=grp-family-uuid`

```json
{
  "active_group_id": "grp-family-uuid",
  "available_groups": [
    { "id": "grp-family-uuid", "group_type": "family", "tab_label": "우리 가족", "member_count": 4, "is_active": true },
    { "id": "grp-couple-uuid", "group_type": "couple", "tab_label": "나와 아내", "member_count": 2, "is_active": false },
    { "id": "grp-friends-uuid", "group_type": "friends", "tab_label": "친구들", "member_count": 5, "is_active": false }
  ],
  "my_health_score": {
    "score": 87,
    "percent": 87,
    "status_label": "좋음",
    "completed_tasks": ["safety_check", "steps", "medication"]
  },
  "my_safety_check": {
    "status": "completed",
    "completed_at": "2025-01-27T13:24:00+09:00",
    "message": "가족들이 확인할 수 있어요"
  },
  "active_group": {
    "group_id": "grp-family-uuid",
    "tab_label": "우리 가족",
    "view_all_href": "/family/groups/grp-family-uuid/dashboard/today",
    "members": [
      {
        "user_id": "u-mother",
        "relationship_label": "어머니",
        "display_name": "김순자",
        "age": 68,
        "safety_check_status": "completed",
        "steps": 4523,
        "medications": [
          { "name": "혈압약", "status": "taken" },
          { "name": "비타민", "status": "taken" }
        ],
        "mood_label": "기분 좋음"
      },
      {
        "user_id": "u-father",
        "relationship_label": "아버지",
        "display_name": "김철수",
        "age": 71,
        "safety_check_status": "waiting",
        "steps": 2103,
        "medications": [
          { "name": "혈압약", "status": "missed" }
        ],
        "mood_label": "기분 보통"
      },
      {
        "user_id": "u-son",
        "relationship_label": "아들",
        "display_name": "김민준",
        "age": 35,
        "safety_check_status": "completed",
        "steps": 3112,
        "medications": [],
        "mood_label": "기분 좋음"
      },
      {
        "user_id": "u-daughter",
        "relationship_label": "딸",
        "display_name": "김지영",
        "age": 32,
        "safety_check_status": "completed",
        "steps": 5953,
        "medications": [
          { "name": "비타민", "status": "taken" }
        ],
        "mood_label": "기분 좋음"
      }
    ]
  },
  "my_medications_today": [
    { "name": "혈압약", "status": "taken", "taken_at": "08:00" },
    { "name": "당뇨약", "status": "scheduled", "scheduled_time": "13:00" },
    { "name": "비타민C", "status": "taken" }
  ],
  "my_mood_today": { "level": 4, "label": "기분 좋음" },
  "my_steps_today": {
    "steps": 6248,
    "goal": 10000,
    "remaining": 3752,
    "weekly_bars": [
      { "weekday": "mon", "steps": 5200 },
      { "weekday": "tue", "steps": 6100 },
      { "weekday": "wed", "steps": 5800 },
      { "weekday": "thu", "steps": 7200 },
      { "weekday": "fri", "steps": 6248 }
    ]
  }
}
```

### GET `/v1/family/groups`

```json
{
  "groups": [
    { "id": "grp-family-uuid", "group_type": "family", "tab_label": "우리 가족", "member_count": 4 },
    { "id": "grp-couple-uuid", "group_type": "couple", "tab_label": "나와 아내", "member_count": 2 }
  ]
}
```

### GET `/v1/family/groups/:groupId/dashboard/today`

```json
{
  "group_id": "grp-family-uuid",
  "tab_label": "우리 가족",
  "available_groups": [
    { "id": "grp-family-uuid", "tab_label": "우리 가족", "is_active": true }
  ],
  "summary": {
    "total_members": 4,
    "safety_completed_count": 3,
    "safety_completion_percent": 75,
    "avg_steps": 5180,
    "medication_summary": { "completed_members": 2, "total_with_meds": 3 }
  },
  "members": [
    {
      "user_id": "u-father",
      "relationship_label": "아버지",
      "display_name": "김철수",
      "age": 71,
      "safety_check_status": "waiting",
      "warning_message": "아직 오늘 안심 체크를 하지 않았어요",
      "steps": 2103,
      "medications": [{ "name": "혈압약", "status": "missed" }],
      "mood_label": "기분 보통",
      "last_updated_at": "2025-01-27T09:12:00+09:00"
    }
  ]
}
```

### GET `/v1/health-reports/me?period=week&date=2025-01-13`

```json
{
  "period": "week",
  "date_range": { "from": "2025-01-13", "to": "2025-01-19" },
  "health_score": {
    "score": 82,
    "delta": 7,
    "delta_label": "지난주 대비 +7점 상승",
    "metrics": [
      { "key": "safety_check", "label": "안심체크", "percent": 95 },
      { "key": "steps", "label": "걸음 수", "percent": 78, "trend": "up" },
      { "key": "medication", "label": "약 복용", "percent": 94 },
      { "key": "vitamin", "label": "비타민", "percent": 88 }
    ]
  },
  "steps_trend": {
    "daily_average": 7234,
    "max": 12847,
    "min": 1203,
    "daily": [
      { "date": "2025-01-13", "steps": 6800 },
      { "date": "2025-01-14", "steps": 7500 }
    ]
  },
  "medication_adherence": {
    "percent": 96,
    "grid": [
      {
        "medication_name": "아침 혈압약",
        "days": [
          { "date": "2025-01-13", "status": "taken" },
          { "date": "2025-01-16", "status": "missed" }
        ]
      }
    ]
  },
  "safety_check_history": [
    { "date": "2025-01-27", "status": "incomplete" },
    { "date": "2025-01-26", "status": "completed", "completed_at": "23:42" }
  ],
  "family_comparison": [
    { "relationship_label": "딸", "score": 87 },
    { "relationship_label": "아버지", "score": 55, "needs_attention": true },
    { "relationship_label": "어머니", "score": 91 },
    { "relationship_label": "나", "score": 82 }
  ],
  "attention_alert": {
    "target_relationship_label": "아버지",
    "message": "아버지 주의 필요"
  },
  "insights": [
    { "type": "positive", "title": "걸음 수가 늘었어요", "body": "지난주보다 12% 더 많이 걸었어요" },
    { "type": "stable", "title": "약 복용률이 꾸준해요", "body": "이번 주도 94% 복용률을 유지하고 있어요" },
    { "type": "warning", "title": "아버지 활동량 감소", "body": "이번 주 활동량이 많이 줄었어요. 확인해보세요" }
  ]
}
```

---

## 10. API Request 예시

### POST `/v1/auth/kakao/callback`

```json
{
  "kakao_access_token": "kakao_token_from_sdk"
}
```

### POST `/v1/family/groups`

```json
{
  "group_type": "family",
  "name": "우리 가족"
}
```

### PATCH `/v1/user/preferences`

```json
{
  "last_active_group_id": "grp-family-uuid"
}
```

### POST `/v1/family/invitations`

```json
{
  "family_group_id": "grp-uuid"
}
```

### POST `/v1/family/invitations/join`

```json
{
  "invite_code": "A3K9X2",
  "relationship_label": "딸",
  "member_role": "caregiver"
}
```

### POST `/v1/safety-checks`

```json
{
  "check_date": "2025-01-27"
}
```

### POST `/v1/family/members/u-father/safety-check-requests?group_id=grp-family-uuid`

```json
{}
```

### POST `/v1/medications/remind/u-father?group_id=grp-family-uuid`

```json
{
  "medication_id": "med-uuid",
  "intake_date": "2025-01-27"
}
```

### POST `/v1/medications`

```json
{
  "name": "혈압약",
  "dosage_text": null,
  "meal_time": "morning",
  "scheduled_time": "08:00"
}
```

### POST `/v1/medications/intake-logs`

```json
{
  "medication_id": "med-uuid",
  "intake_date": "2025-01-27",
  "status": "taken",
  "taken_at": "2025-01-27T08:12:00+09:00"
}
```

### POST `/v1/medications/intake-logs/:id/snooze`

```json
{
  "snoozed_until": "2025-01-27T13:30:00+09:00"
}
```

### PUT `/v1/steps/sync`

```json
{
  "step_date": "2025-01-27",
  "total_steps": 6248,
  "calories_kcal": 248,
  "distance_km": 4.7,
  "duration_minutes": 52,
  "hourly": [
    { "recorded_at": "2025-01-27T07:00:00+09:00", "steps": 420 },
    { "recorded_at": "2025-01-27T09:00:00+09:00", "steps": 1100 }
  ]
}
```

### PUT `/v1/mood/today`

```json
{
  "mood_level": 4
}
```

### PATCH `/v1/settings/notifications`

```json
{
  "safety_check_incomplete": true,
  "medication_missed": true,
  "step_decrease": true,
  "health_score_drop": true,
  "family_sos": true,
  "daily_health_summary": false,
  "daily_summary_time": "21:00",
  "medication_reminder_enabled": true,
  "medication_reminder_minutes_before": 30
}
```

### PATCH `/v1/settings/privacy`

```json
{
  "settings": [
    { "data_type": "steps", "visibility": "family" },
    { "data_type": "medication", "visibility": "family" },
    { "data_type": "mood", "visibility": "family" },
    { "data_type": "health_score", "visibility": "only_me" }
  ]
}
```

---

## 부록: 화면에 없지만 인프라상 필요한 항목

| 항목 | 이유 |
|------|------|
| `auth.users` | Supabase Auth + 카카오 OAuth 필수 |
| `created_at` / `updated_at` | 감사·`last_updated_at` 표시(가족 카드) |
| `user_id` FK | 관계형 DB 정규화 필수 |
| `birth_year` vs `age` | 화면은 "68세" 표시. 출생연도 저장 시 매년 자동 계산 가능 |
| `metric_1~4` 통합 컬럼 | 화면마다 하위 지표 **라벨**만 다르고 구조 동일 |
| FCM device token 테이블 | 푸시 발송에 필요하나 **푸시 설정 UI에 토큰 관리 화면 없음** → NestJS 내부 테이블로 분리 권장, 본 설계 범위 외 |

---

## 11. 구현 체크리스트 (Flutter · NestJS)

### 11.1 Flutter 화면 → API 매핑

| 화면 | 최초 로드 API | 사용자 액션 API |
|------|---------------|-----------------|
| 홈 | `GET /home?group_id=` | `POST /safety-checks`, `PUT /mood/today`, `PATCH /user/preferences` (탭 전환) |
| 가족 현황 | `GET /family/groups/:id/dashboard/today` | `PATCH /user/preferences`, 초대·상세 네비 |
| 가족 상세 | `GET /family/members/:id/detail?group_id=&period=` | safety-request, remind |
| 내 복용 | `GET /medications/today`, `GET /medications/adherence` | CRUD medications, intake-logs |
| 가족 현황(약) | `GET /medications/family-status?group_id=` | `POST /medications/remind/:id` |
| 걸음 | `GET /steps/today`, `weekly`, `monthly`, `family/today?group_id=` | `PUT /steps/sync` |
| 건강 리포트 | `GET /health-reports/me?period=&date=` | — |
| 설정 | `GET /settings?group_id=` | PATCH notifications, privacy |
| 초대 | `POST /family/invitations` | `POST /family/invitations/join` |

### 11.2 그룹 탭 전환 시 클라이언트 동작

1. `PATCH /user/preferences` `{ last_active_group_id }`
2. 현재 화면이 홈/가족/약(가족)/걸음(가족)이면 **동일 API 재호출** with 새 `group_id`
3. `available_groups[].is_active` UI 반영

### 11.3 `tab_label` 결정 규칙 (서버)

```typescript
const DEFAULT_LABELS: Record<GroupType, string> = {
  family: '우리 가족',
  couple: '나와 아내',
  friends: '친구들',
};
tab_label = group.name ?? DEFAULT_LABELS[group.group_type];
```

### 11.4 건강 점수 `completed_tasks` (홈 카드용)

| task key | 완료 조건 (오늘) |
|----------|------------------|
| `safety_check` | `safety_checks.status = completed` |
| `steps` | `daily_steps.total_steps > 0` (또는 목표 % 임계값 — UI는 체크만 표시) |
| `medication` | 오늘 스케줄 약 전부 `taken` (스케줄 없으면 true) |

`total_score` 산식은 화면에 미표기 → **4개 하위 metric 평균** 또는 가중 평균으로 서버 상수화 후 `daily_health_scores`에 저장.

### 11.5 에러 코드

| code | HTTP | 상황 |
|------|------|------|
| `GROUP_ID_REQUIRED` | 400 | 그룹 API에 group_id 없음 |
| `NOT_GROUP_MEMBER` | 403 | 요청자가 해당 group_id 비멤버 |
| `TARGET_NOT_IN_GROUP` | 403 | 대상 사용자가 group_id에 없음 |
| `PRIVACY_DENIED` | 403 | 공개범위 `only_me` |

---

*문서 버전: 1.1 · 화면 14개 기준 · 다중 그룹 · 홈 흐름 반영*
