-- ============================================================
-- 한국 아가스티아 협회 - Supabase 테이블 생성 SQL
-- Supabase 프로젝트: https://jxzwsophknbarhxnaeka.supabase.co
-- 실행방법: Supabase Dashboard → SQL Editor → 아래 전체 복사 붙여넣기 → Run
-- ============================================================

-- ── 1. 사용자 테이블 ──
CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username            text UNIQUE NOT NULL,
  password_hash       text NOT NULL,
  name                text NOT NULL,
  email               text UNIQUE NOT NULL,
  phone               text DEFAULT '',
  role                text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  reset_code          text DEFAULT '',
  reset_code_expires  text DEFAULT '',
  is_active           boolean DEFAULT true,
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ── 2. 세미나 테이블 ──
CREATE TABLE IF NOT EXISTS public.seminars (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title               text NOT NULL,
  subtitle            text DEFAULT '',
  description         text DEFAULT '',
  date                text DEFAULT '',
  time                text DEFAULT '',
  location            text DEFAULT '',
  organizer           text DEFAULT '',
  price               integer DEFAULT 0,
  capacity            integer DEFAULT 0,
  current_applicants  integer DEFAULT 0,
  category            text DEFAULT '',
  image_url           text DEFAULT '',
  status              text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'closed', 'cancelled')),
  tags                text DEFAULT '',
  survey_fields       text DEFAULT '',
  form_title          text DEFAULT '',
  form_subtitle       text DEFAULT '',
  form_notices        text DEFAULT '',
  apply_type          text DEFAULT 'internal' CHECK (apply_type IN ('internal', 'external')),
  external_url        text DEFAULT '',
  member_only         boolean DEFAULT false,
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ── 3. 신청 테이블 ──
CREATE TABLE IF NOT EXISTS public.applications (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             text DEFAULT '',
  seminar_id          text NOT NULL,
  seminar_title       text DEFAULT '',
  applicant_name      text NOT NULL,
  applicant_email     text NOT NULL,
  applicant_phone     text DEFAULT '',
  payment_method      text DEFAULT '',
  payment_status      text DEFAULT '결제대기',
  payment_amount      integer DEFAULT 0,
  memo                text DEFAULT '',
  seminar_date        text DEFAULT '',
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ── 4. 소식/기사 테이블 ──
CREATE TABLE IF NOT EXISTS public.news (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title               text NOT NULL,
  subtitle            text DEFAULT '',
  content             text DEFAULT '',
  category            text DEFAULT '',
  image_url           text DEFAULT '',
  youtube_url         text DEFAULT '',
  published_date      text DEFAULT '',
  is_featured         boolean DEFAULT false,
  status              text DEFAULT '발행',
  tags                text DEFAULT '',
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ── 5. 문의 테이블 ──
CREATE TABLE IF NOT EXISTS public.inquiries (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text DEFAULT '',
  inquiry_type        text DEFAULT '',
  message             text NOT NULL,
  status              text DEFAULT '신규',
  admin_note          text DEFAULT '',
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ── 6. 사이트 콘텐츠 테이블 ──
CREATE TABLE IF NOT EXISTS public.site_content (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key                 text UNIQUE NOT NULL,
  label               text DEFAULT '',
  content             text DEFAULT '',
  section             text DEFAULT '',
  sort_order          integer DEFAULT 0,
  created_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000,
  updated_at          bigint DEFAULT EXTRACT(EPOCH FROM NOW())::bigint * 1000
);

-- ============================================================
-- 기존 테이블 제약조건 수정 (이미 테이블이 있는 경우 실행)
-- CHECK 제약조건이 한국어 값을 막고 있으면 제거합니다
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  -- applications.payment_method 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.applications'::regclass AND contype = 'c' AND conname LIKE '%payment_method%') LOOP
    EXECUTE 'ALTER TABLE public.applications DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- applications.payment_status 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.applications'::regclass AND contype = 'c' AND conname LIKE '%payment_status%') LOOP
    EXECUTE 'ALTER TABLE public.applications DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- news.status 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.news'::regclass AND contype = 'c' AND conname LIKE '%status%') LOOP
    EXECUTE 'ALTER TABLE public.news DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- inquiries.status 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.inquiries'::regclass AND contype = 'c' AND conname LIKE '%status%') LOOP
    EXECUTE 'ALTER TABLE public.inquiries DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- seminars.status 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.seminars'::regclass AND contype = 'c' AND conname LIKE '%status%') LOOP
    EXECUTE 'ALTER TABLE public.seminars DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- seminars.apply_type 제약 제거
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'public.seminars'::regclass AND contype = 'c' AND conname LIKE '%apply_type%') LOOP
    EXECUTE 'ALTER TABLE public.seminars DROP CONSTRAINT ' || r.conname;
  END LOOP;
  -- seminars.member_only 타입 확인 및 수정 (boolean -> text)
  -- (이미 text면 무시됨)
END
$$;

-- member_only 컬럼을 text 타입으로 변경 (값: 'member', 'all')
ALTER TABLE public.seminars ALTER COLUMN member_only TYPE text USING CASE WHEN member_only THEN 'member' ELSE 'all' END;

-- ============================================================
-- Row Level Security (RLS) 설정
-- anon key 로 읽기/쓰기 모두 허용 (프론트엔드 전용 앱)
-- ============================================================

ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seminars      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content  ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 anon 전체 허용 정책
CREATE POLICY "anon_all_users"        ON public.users        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_seminars"     ON public.seminars     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_applications" ON public.applications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_news"         ON public.news         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_inquiries"    ON public.inquiries    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_site_content" ON public.site_content FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 완료 확인
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users','seminars','applications','news','inquiries','site_content')
ORDER BY table_name;
