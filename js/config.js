/* ============================================================
   config.js - Supabase 연결 설정
   ============================================================
   👉 이 파일에 Supabase 프로젝트 URL과 anon 키를 입력하세요.

   1. https://supabase.com 로그인
   2. 프로젝트 → Settings → API
   3. Project URL → SUPABASE_URL 에 입력
   4. Project API keys → anon public → SUPABASE_ANON_KEY 에 입력

   ⚠️ anon 키는 브라우저에 노출되는 것이 정상입니다.
      실제 보안은 Supabase의 RLS(Row Level Security) 정책으로 제어됩니다.
   ============================================================ */

window.SUPABASE_CONFIG = {
  // 기존 프로젝트 URL (supabase-setup.sql 파일에 명시된 프로젝트)
  SUPABASE_URL: 'https://jxzwsophknbarhxnaeka.supabase.co',

  // ⚠️ 아래 값을 Supabase Dashboard → Settings → API → anon public 키로 교체하세요
  SUPABASE_ANON_KEY: 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY'
};
