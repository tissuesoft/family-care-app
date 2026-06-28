# 가족안심 (Family Care App)

## Supabase

- **Project**: `family-care-app`
- **Project ID**: `nscxlpwokanlqypnyyqw`
- **URL**: https://nscxlpwokanlqypnyyqw.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/nscxlpwokanlqypnyyqw

스키마는 `supabase/migrations/`에 있으며 원격 DB에 적용 완료되었습니다.

### 카카오 로그인 설정 (Supabase Dashboard)

1. [Authentication → Providers → Kakao](https://supabase.com/dashboard/project/nscxlpwokanlqypnyyqw/auth/providers) 활성화
2. Kakao Developers에서 REST API 키·Redirect URI 설정  
   Redirect: `https://nscxlpwokanlqypnyyqw.supabase.co/auth/v1/callback`

Flutter에서는 `supabase_flutter`로 직접 로그인 후, 받은 JWT를 NestJS API에 전달합니다.

## Backend (NestJS)

```bash
cd backend
cp .env.example .env
# Supabase Dashboard → Settings → API 에서 키 복사
npm install
npm run start:dev
```

### `.env` 필수 값

| 변수 | 설명 |
|------|------|
| `SUPABASE_URL` | `https://nscxlpwokanlqypnyyqw.supabase.co` |
| `SUPABASE_ANON_KEY` | publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (서버 전용, 절대 Flutter에 넣지 말 것) |

### API 예시

```http
GET http://localhost:3000/v1/home?group_id=<uuid>
Authorization: Bearer <supabase_jwt>
```

## 문서

- [BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md)
