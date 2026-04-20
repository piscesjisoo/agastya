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
  // agastya-kr 프로젝트 (한국 Seoul 서버)
  SUPABASE_URL: 'https://tecwrcqhrhejhphsfzoc.supabase.co',

  // anon public 키 (브라우저 노출 정상 - RLS로 보안 관리)
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlY3dyY3FocmhlamhwaHNmem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NjM2OTYsImV4cCI6MjA5MjIzOTY5Nn0.26D62YvUMyL6-rtQ3Hhkv_vcgGpnQKctpgu6BQajZzY'
};
