# 빛의 아갈탄 (Light of Agaltan) 웹사이트 — 국내 서버 배포 가이드

Genspark에서 벗어나 독립 호스팅(국내 서버 등)으로 이전하기 위해 정리된 버전입니다.
데이터는 **Supabase**(클라우드 DB)에 그대로 유지되고, 웹사이트 파일만 다른 서버에 올리면 됩니다.

## 🆕 이번 버전에서 변경된 것 (2026-04-20)

### 관리자
- **admin 계정이 항상 자동 생성됨** (비번: `admin5162`)
  → 데이터 초기화/재배포 후에도 로그인 가능. 페이지 열 때 자동 체크
- **`admin` 계정만 설문 답변 편집 가능** (다른 관리자 계정은 읽기 전용)
- **설문 답변과 관리자 메모가 완전히 분리됨**
  → 장문 답변·줄바꿈이 관리자 메모 칸으로 넘어가던 버그 해결
  → 내부적으로 `━━━ 관리자 메모 ━━━` 구분자 사용

### 신청내역 목록 (관리자 → 신청 내역)
- **세미나 필터** 추가: 특정 세미나 신청자만 필터링
- **⚙️ 목록 컬럼 설정**: 설문 답변 중 보고 싶은 것을 체크해서 목록 컬럼으로 바로 표시
  - 예: "친목회 참가여부", "생년월일" 등을 목록에서 바로 확인
  - 체크한 설정은 브라우저에 저장되어 다음 접속 시에도 유지
- **📥 세미나 엑셀**: 선택한 세미나의 신청자만 엑셀로 다운로드

### 엑셀 다운로드 — 질문이 컬럼으로 자동 분리
기존 "메모" 한 칸에 뭉쳐있던 설문 답변이 이제 **질문별로 컬럼 분리**:

| 이전 (메모 컬럼 1개) | 지금 |
|---|---|
| `[친목회] 참가 \| [생년월일] 1960... \| [주소] 서울...` | 친목회 · 생년월일 · 주소 **각각 별도 컬럼** |

- 세미나마다 질문이 달라도 **자동으로 컬럼이 생기고 빠짐** (하드코딩 없음)
- "확인사항" 같이 모두 똑같이 답하는 안내 항목은 자동 제외

---

## 📁 폴더 구조

```
agastya-website/
├── index.html              ← 메인 (반드시 루트)
├── about.html, admin.html, contact.html 등 (24개)
├── css/
│   ├── style.css
│   └── index.css
├── js/
│   ├── config.js           ⭐ Supabase 연결 설정 (여기 키 입력)
│   ├── supabase.js         ⭐ Supabase REST API 래퍼
│   └── auth.js             인증 + admin 자동 부트스트랩
├── images/
│   ├── agastya-muni-portrait.jpg
│   ├── agastya-sage.jpg
│   ├── nadi-leaves.jpg
│   └── cafe-icon.png
├── supabase-setup.sql      Supabase 테이블 생성 SQL
└── README.md
```

---

## 🚀 배포 순서 (처음 한 번)

### 1단계. Supabase 준비

Supabase에 이미 프로젝트가 있으시면(`jxzwsophknbarhxnaeka.supabase.co`) 로그인만 하시면 됩니다.

1. https://supabase.com 접속 → 로그인
2. 해당 프로젝트 선택
3. 왼쪽 메뉴 **SQL Editor** → **New query** 클릭
4. `supabase-setup.sql` 파일 내용 전체를 복사해서 붙여넣기
5. **Run** 버튼 클릭 → 테이블 6개 생성 확인
   - `users`, `seminars`, `applications`, `news`, `inquiries`, `site_content`

### 2단계. Supabase anon 키 확인 및 입력

1. Supabase 대시보드 → 왼쪽 메뉴 **Settings (⚙️)** → **API**
2. "Project API keys" 섹션에서 **`anon` `public`** 키 복사
   (아주 긴 JWT 토큰 형태. `eyJhbGc...`로 시작)
3. `js/config.js` 파일을 열고 아래 부분을 교체:

```javascript
window.SUPABASE_CONFIG = {
  SUPABASE_URL: 'https://jxzwsophknbarhxnaeka.supabase.co',
  SUPABASE_ANON_KEY: '여기에_복사한_anon_키_붙여넣기'  // ← 교체!
};
```

> ⚠️ **anon 키는 브라우저에 노출되는 게 정상**입니다 (공개되어도 안전하도록 설계됨).
> 진짜 보안은 Supabase의 **RLS 정책**이 담당합니다.

### 3단계. Genspark에서 기존 데이터 내보내기 (있다면)

기존에 Genspark에서 수집한 회원/신청/문의 데이터가 있다면:

1. 현재 운영 중인 Genspark 사이트 → `admin.html` 로그인
2. 슈퍼어드바이저 패널 → **📤 전체 내보내기 (JSON)** 클릭
3. 다운로드된 JSON 파일 보관

이 데이터를 새 Supabase에 가져오려면 *배포 완료 후* 관리자 패널의 **📥 전체 가져오기**를 쓰면 됩니다.

### 4단계. 국내 호스팅 업체에 파일 업로드

이 프로젝트는 **순수 정적 웹사이트**라서 어떤 웹호스팅이든 작동합니다.

**추천 (저렴한 국내 웹호스팅)**

| 업체 | 월 요금 | 특징 |
|---|---|---|
| **가비아 웹호스팅 Light** | 약 2,200원/월 | 한국어 지원, 관리 편함, SSL 무료 |
| **카페24 저용량** | 약 550원/월~ | 가장 저렴, 복잡한 관리페이지 |
| **닷홈 무료호스팅** | 무료 (광고 있음) | 테스트용 |
| **NHN Cloud / 네이버 클라우드** | 수만원~ | 본격 운영 시 |

**공통 업로드 방법:**
1. 호스팅 업체 가입 → 웹호스팅 신청
2. FTP 접속 정보 확인 (주소, 아이디, 비밀번호)
3. FTP 프로그램 설치 (FileZilla 추천 — https://filezilla-project.org/)
4. FTP로 서버의 `public_html` 또는 `www` 폴더에 접속
5. 이 폴더(`agastya-website/`) **안의 모든 파일과 하위 폴더**를 업로드
   - ⚠️ `agastya-website/` 폴더 자체가 아니라, **그 안의 내용물**을 올려야 함
   - `index.html`이 반드시 서버 루트에 있어야 함

### 5단계. 도메인(`agastya-kr.com`) 연결

1. 도메인 구매처(가비아, 후이즈 등) 관리 페이지 로그인
2. **네임서버 변경** 또는 **DNS 레코드 설정**
   - 호스팅 업체가 네임서버 정보를 알려주면 그것으로 변경하는 게 가장 간단
3. DNS 전파 대기 (보통 1~2시간, 최대 48시간)
4. 접속 확인: `https://agastya-kr.com`

### 6단계. 관리자 계정 생성

1. 배포된 사이트에 접속: `https://agastya-kr.com/admin-pw-reset.html`
2. "관리자 계정 생성하기" 버튼 클릭
3. 계정 생성 후 `admin-pw-reset.html` 파일을 서버에서 **삭제** (보안)
4. `https://agastya-kr.com/login.html` 로그인

---

## ✅ 정상 작동 체크리스트

- [ ] `index.html` 접속 → 히어로 이미지와 텍스트 정상 표시
- [ ] `news.html` → 소식 목록 로드됨 (빈 목록도 정상)
- [ ] `seminar.html` → 세미나 목록 로드됨
- [ ] `contact.html` → 문의 폼 제출 시 "접수되었습니다" 메시지
- [ ] `admin.html` → 로그인 후 대시보드 표시
- [ ] 브라우저 개발자 도구(F12) → Console 탭에 빨간 오류 없음

---

## 🔧 문제 해결

### 사이트 접속은 되는데 데이터가 안 보여요

**원인**: `js/config.js`의 anon 키가 잘못됨 또는 Supabase 테이블이 안 만들어짐

**해결**:
1. F12 → Console 탭 열어서 빨간 오류 메시지 확인
2. `[SB] ... HTTP 401` → anon 키 잘못됨 (Supabase에서 다시 복사)
3. `[SB] ... HTTP 404` → 테이블이 없음 (`supabase-setup.sql` 재실행)

### 관리자 페이지에서 저장이 안 돼요

**원인**: Supabase의 RLS(Row Level Security) 정책이 너무 엄격하거나 비활성화됨

**해결**: `supabase-setup.sql`의 RLS 정책 부분이 다 실행됐는지 확인.
제공된 SQL에는 `anon`에 모든 작업을 허용하는 정책이 포함되어 있음.

### 이메일 발송이 안 돼요

EmailJS 설정을 admin.html의 이메일 설정 섹션에서 재입력해야 합니다 (Public Key, Service ID, Template ID).

---

## ⚠️ 보안 관련 안내 (중요)

이 사이트는 **회원 개인정보**(이름, 이메일, 전화번호 등)를 수집합니다. 배포 전/후로 꼭 확인하세요:

### 개인정보보호법 관점

**Supabase는 해외(주로 미국) 서버**입니다. 한국 개인정보보호법에서는 해외 이전 시:
- 개인정보처리방침에 **처리위탁/국외이전 내용 명시** 필요
- 회원가입 시 **국외 이전 동의** 받기 권장

현재 `privacy.html`에 이 내용이 반영되어 있는지 확인하시고, 필요하면 법무 자문 받으시길 권장드립니다.

> 엄격한 법적 준수가 필요하면 DB도 국내로(네이버 클라우드 DB, NHN Cloud RDS 등) 옮겨야 합니다. 그 경우는 별도 마이그레이션이 필요합니다.

### HTTPS 필수

비밀번호·개인정보를 다루는 사이트는 반드시 HTTPS로 운영해야 합니다.
- 가비아, 카페24 등 대부분의 국내 호스팅은 **Let's Encrypt 무료 SSL**을 지원
- 호스팅 관리 페이지에서 SSL 활성화 필수

### 정기 백업

- 관리자 패널 → **📤 전체 내보내기 (JSON)** 을 **최소 월 1회** 실행
- Supabase 대시보드 → Database → Backups에서 **Point-in-time recovery** 활성화 권장

---

## 📦 기술 스택

- **프론트엔드**: HTML5 / CSS3 / Vanilla JavaScript
- **데이터**: Supabase (PostgreSQL + PostgREST)
- **인증**: Web Crypto API (PBKDF2-SHA256, 100,000 iterations)
- **이메일**: EmailJS (비밀번호 재설정, 신청 확인)
- **폰트**: Google Fonts (Noto Serif KR, Cormorant Garamond)

---

## 📞 문의

기술적 문의는 개발자/개발업체 측에 문의해주세요.
설정 변경 관련 안내는 `admin.html`의 슈퍼어드바이저 패널에서 가능합니다.
