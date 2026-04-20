/* ========================================
   auth.js - 회원 인증 공통 모듈 (Supabase 직접 연동)
   - 로그인/로그아웃/회원가입
   - 세션 관리 (sessionStorage, 자동만료 2h)
   - 보안: PBKDF2 + 고유 salt
======================================== */

const Auth = (() => {
  const SESSION_KEY = 'agastya_session';
  const SESSION_TTL = 2 * 60 * 60 * 1000; // 2시간
  const PBKDF2_ITER = 100000;

  function generateSalt() {
    const arr = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function hashPassword(password, salt) {
    const useSalt = salt || generateSalt();
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(useSalt), iterations: PBKDF2_ITER },
      keyMaterial, 256
    );
    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
    return { hash: `pbkdf2:${useSalt}:${hashHex}`, salt: useSalt };
  }

  async function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (!storedHash.startsWith('pbkdf2:')) {
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
      const legacyHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
      return legacyHash === storedHash;
    }
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const { hash } = await hashPassword(password, parts[1]);
    return hash === storedHash;
  }

  function saveSession(user) {
    const sessionData = {
      id: user.id, username: user.username, name: user.name,
      email: user.email, phone: user.phone || '',
      birthdate: user.birthdate || '',
      role: user.role,
      loginAt: Date.now(), expiresAt: Date.now() + SESSION_TTL
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.expiresAt && Date.now() > data.expiresAt) { logout(); return null; }
      return data;
    } catch { return null; }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  }

  function isLoggedIn() { return getSession() !== null; }
  function isAdmin() { const s = getSession(); return s && (s.role === 'admin' || s.role === 'superadmin'); }

  function requireLogin(redirectUrl) {
    if (!isLoggedIn()) {
      window.location.href = `login.html?redirect=${encodeURIComponent(redirectUrl || window.location.href)}`;
      return false;
    }
    return true;
  }

  function requireAdmin() {
    if (!isLoggedIn()) { window.location.href = 'login.html?redirect=admin.html'; return false; }
    if (!isAdmin()) {
      Toast.show('관리자 권한이 필요합니다.', 'error');
      setTimeout(() => window.location.href = 'index.html', 1500);
      return false;
    }
    return true;
  }

  /* ── 로그인 (Supabase 직접) ── */
  async function login(username, password) {
    try {
      const user = await SB.findOne('users', 'username', username);
      if (!user || user.is_active === false)
        return { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
      const match = await verifyPassword(password, user.password_hash);
      if (!match)
        return { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
      // 레거시 해시 업그레이드
      if (!user.password_hash.startsWith('pbkdf2:')) {
        const { hash: newHash } = await hashPassword(password);
        await SB.update('users', user.id, { password_hash: newHash });
      }
      // superadmin 역할을 admin으로 정규화
      if (user.role === 'superadmin') {
        user.role = 'admin';
        try { await SB.update('users', user.id, { role: 'admin' }); } catch(_) {}
      }
      saveSession(user);
      return { success: true, user };
    } catch (e) {
      return { success: false, message: '로그인 중 오류가 발생했습니다.' };
    }
  }

  /* ── 회원가입 (Supabase 직접) ── */
  async function register({ username, password, name, email, phone }) {
    try {
      const existUser = await SB.findOne('users', 'username', username);
      if (existUser) return { success: false, message: '이미 사용 중인 아이디입니다.' };
      const existEmail = await SB.findOne('users', 'email', email);
      if (existEmail) return { success: false, message: '이미 가입된 이메일입니다.' };
      const { hash } = await hashPassword(password);
      const created = await SB.insert('users', {
        username, password_hash: hash, name, email,
        phone: phone || '', role: 'user',
        reset_code: '', reset_code_expires: '', is_active: true
      });
      return { success: true, user: created };
    } catch (e) {
      return { success: false, message: '회원가입 중 오류가 발생했습니다.' };
    }
  }

  /* ── 비밀번호 재설정 코드 저장 ── */
  async function saveResetCode(email, code) {
    try {
      const user = await SB.findOne('users', 'email', email);
      if (!user || user.is_active === false)
        return { success: false, message: '등록되지 않은 이메일입니다.' };
      const expires = (Date.now() + 10 * 60 * 1000).toString();
      await SB.update('users', user.id, { reset_code: code, reset_code_expires: expires });
      return { success: true, userId: user.id, name: user.name };
    } catch (e) {
      return { success: false, message: '오류가 발생했습니다.' };
    }
  }

  /* ── 재설정 코드 검증 ── */
  async function verifyResetCode(email, code) {
    try {
      const user = await SB.findOne('users', 'email', email);
      if (!user) return { success: false, message: '사용자를 찾을 수 없습니다.' };
      if (user.reset_code !== code) return { success: false, message: '인증 코드가 올바르지 않습니다.' };
      if (Date.now() > parseInt(user.reset_code_expires)) return { success: false, message: '인증 코드가 만료되었습니다.' };
      return { success: true, userId: user.id };
    } catch (e) {
      return { success: false, message: '오류가 발생했습니다.' };
    }
  }

  /* ── 비밀번호 변경 ── */
  async function changePassword(userId, newPassword) {
    try {
      const { hash } = await hashPassword(newPassword);
      await SB.update('users', userId, { password_hash: hash, reset_code: '', reset_code_expires: '' });
      return { success: true };
    } catch (e) {
      return { success: false, message: '비밀번호 변경 중 오류가 발생했습니다.' };
    }
  }

  function updateNavAuth() {
    const session = getSession();
    const authArea = document.getElementById('nav-auth');
    if (!authArea) return;
    if (session) {
      authArea.innerHTML = `
        <span style="font-size:0.8rem; color:var(--text-mid); margin-right:4px;">${session.name}님</span>
        ${session.role === 'admin' ? `<a href="admin.html" class="btn-nav-login" style="color:var(--gold);border-color:var(--gold);">관리자</a>` : ''}
        <a href="mypage.html" class="btn-nav-login">마이페이지</a>
        <button onclick="Auth.logout()" class="btn-nav-signup">로그아웃</button>
      `;
    } else {
      authArea.innerHTML = `
        <a href="login.html" class="btn-nav-login">로그인</a>
        <a href="register.html" class="btn-nav-signup">회원가입</a>
      `;
    }
  }

  /* ── 기본 admin 계정 자동 생성 (데이터 초기화되어도 항상 유지) ──
     아이디: admin / 비밀번호: admin5162
     - 세션당 1회만 체크 (성능 부담 없음)
     - Supabase 연결 실패/오류 시 조용히 넘어감 */
  const BOOTSTRAP_FLAG = 'agastya_admin_bootstrap_v2';
  async function bootstrapAdmin(force = false) {
    try {
      if (!force && sessionStorage.getItem(BOOTSTRAP_FLAG) === 'done') return;
      if (typeof SB === 'undefined' || !SB.findOne) return;

      const existing = await SB.findOne('users', 'username', 'admin');
      if (existing) {
        sessionStorage.setItem(BOOTSTRAP_FLAG, 'done');
        return;
      }

      const { hash } = await hashPassword('admin5162');
      await SB.insert('users', {
        username:        'admin',
        password_hash:   hash,
        name:            '관리자',
        email:           'kor.agastya@gmail.com',
        phone:           '',
        role:            'admin',
        is_active:       true,
        reset_code:      '',
        reset_code_expires: ''
      });
      console.info('[Auth] 기본 admin 계정 자동 생성 (비밀번호: admin5162)');
      sessionStorage.setItem(BOOTSTRAP_FLAG, 'done');
    } catch (e) {
      console.warn('[Auth] bootstrapAdmin 건너뜀:', e.message);
    }
  }

  // 페이지 로드 후 백그라운드 실행 (비동기)
  if (typeof window !== 'undefined') {
    setTimeout(() => bootstrapAdmin().catch(() => {}), 1500);
  }

  return {
    hashPassword, verifyPassword, generateSalt,
    saveSession, getSession, logout,
    isLoggedIn, isAdmin, requireLogin, requireAdmin,
    login, register, saveResetCode, verifyResetCode, changePassword,
    updateNavAuth,
    bootstrapAdmin
  };
})();

/* ── Toast ── */
const Toast = (() => {
  function getContainer() {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
    return c;
  }
  function show(message, type = 'info', duration = 3500) {
    const container = getContainer();
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  return { show };
})();

/* ── 공통 네비게이션 ── */
function renderNavbar(activePage) {
  const navHtml = `
  <nav class="navbar" id="navbar">
    <div class="navbar__inner">
      <a href="index.html" class="navbar__logo">
        <span class="navbar__logo-main">빛의 아갈탄</span>
        <span class="navbar__logo-sub">Agartan of Light: Agastya</span>
      </a>
      <ul class="navbar__menu" id="navbar-menu">
        <li><a href="index.html" class="navbar__link ${activePage==='home'?'active':''}">홈</a></li>
        <li><a href="philosophy.html" class="navbar__link ${activePage==='philosophy'?'active':''}">소개</a></li>
        <li><a href="service.html" class="navbar__link ${activePage==='service'?'active':''}">서비스</a></li>
        <li><a href="news.html" class="navbar__link ${activePage==='news'?'active':''}">소식 &amp; 기사</a></li>
        <li><a href="seminar.html" class="navbar__link ${activePage==='seminar'?'active':''}">신청</a></li>
        <li><a href="contact.html" class="navbar__link ${activePage==='contact'?'active':''}">문의</a></li>
      </ul>
      <div class="navbar__auth" id="nav-auth">
        <a href="login.html" class="btn-nav-login">로그인</a>
        <a href="register.html" class="btn-nav-signup">회원가입</a>
      </div>
      <div class="navbar__hamburger" id="hamburger" onclick="toggleMenu()">
        <span></span><span></span><span></span>
      </div>
    </div>
  </nav>`;
  document.body.insertAdjacentHTML('afterbegin', navHtml);
  window.addEventListener('scroll', () => {
    const nb = document.getElementById('navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 20);
  });
  Auth.updateNavAuth();
}

function toggleMenu() {
  const menu = document.getElementById('navbar-menu');
  const auth = document.getElementById('nav-auth');
  if (menu) menu.classList.toggle('open');
  if (auth) auth.classList.toggle('open');
}

/* ── 공통 푸터 ── */
function renderFooter() {
  const footerHtml = `
  <footer class="footer">
    <div class="footer__inner">
      <div>
        <div class="footer__logo-main">빛의 아갈탄</div>
        <div class="footer__logo-sub">Agartan of Light: Agastya</div>
        <p style="font-size:0.82rem; line-height:1.7; margin-top:8px;">고대의 지혜를 현대를 살아가는<br>확신으로 연결합니다.</p>
        <div class="footer__social">
          <a href="https://cafe.daum.net/argartan-light" target="_blank" rel="noopener" class="footer__social-btn footer__social-btn--daum" aria-label="다음카페">카페</a>
          <a href="https://www.youtube.com/@agartanoflight" target="_blank" rel="noopener" class="footer__social-btn footer__social-btn--yt" aria-label="YouTube">▶</a>
        </div>
      </div>
      <div>
        <div class="footer__menu-title">Menu</div>
        <div class="footer__menu-grid">
          <a href="index.html" class="footer__menu-link">홈</a>
          <a href="philosophy.html" class="footer__menu-link">소개</a>
          <a href="service.html" class="footer__menu-link">서비스</a>
          <a href="news.html" class="footer__menu-link">소식 &amp; 기사</a>
          <a href="seminar.html" class="footer__menu-link">신청</a>
          <a href="contact.html" class="footer__menu-link">문의</a>
        </div>
      </div>
    </div>
    <div class="footer__biz-info" style="background:rgba(0,0,0,0.15);padding:14px 24px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;">
      <p style="font-size:0.72rem;color:rgba(255,255,255,0.4);line-height:2;margin:0;word-break:keep-all;">
        주식회사 빛의아갈탄
        <span style="color:rgba(255,255,255,0.18);margin:0 8px;">|</span>대표: 이승훈
        <span style="color:rgba(255,255,255,0.18);margin:0 8px;">|</span>사업자등록번호: 258-86-00525
        <span style="color:rgba(255,255,255,0.18);margin:0 8px;">|</span>전화: 02-336-0996
        <span style="color:rgba(255,255,255,0.18);margin:0 8px;">|</span>주소: 서울특별시 마포구 월드컵로 37, 3층 301호 (합정동, 합정동웰빙센터)
      </p>
    </div>
    <div class="footer__bottom">
      <div class="footer__bottom-links">
        <a href="privacy.html" class="footer__bottom-link">개인정보처리방침</a>
        <a href="terms.html" class="footer__bottom-link">서비스 이용약관</a>
      </div>
      <span id="footer-copyright-text">© 2026 빛의 아갈탄 (AGARTAN OF LIGHT: AGASTYA). ALL RIGHTS RESERVED.</span>
    </div>
  </footer>`;
  document.body.insertAdjacentHTML('beforeend', footerHtml);
}

function formatPrice(num) { return Number(num).toLocaleString('ko-KR') + '원'; }

/* ════════════════════════════════════════════════
   서비스 준비중 / 사이트 점검 접근 차단 시스템
   site_content 키:
     service_coming_soon_pages : 쉼표구분 경로 목록
     site_maintenance_mode     : "true" 이면 점검중
     site_maintenance_msg      : 점검 메시지
     site_maintenance_time     : 점검 예정 시간 (예: "2026-04-13 02:00 ~ 06:00")
════════════════════════════════════════════════ */

/* ── 차단 화면 렌더링 ── */
function renderBlockScreen(title, message, isMaintenance, timeStr) {
  document.body.style.visibility = 'hidden';
  document.body.style.overflow = 'hidden';

  const timeBlock = (isMaintenance && timeStr)
    ? '<div style="margin:0 0 20px;padding:10px 16px;background:#f0f4ff;border-radius:6px;border:1px solid #c7d6f5;font-size:0.82rem;color:#334;">🕒 점검 예정 시간: <strong>' + timeStr + '</strong></div>'
    : '';

  const urgentBox = isMaintenance
    ? '<div style="margin-top:24px;padding:14px 18px;background:#f8f4ed;border-radius:8px;border:1px solid #e8dcc8;text-align:center;"><p style="font-size:0.78rem;color:#888;margin:0 0 6px;letter-spacing:0.05em;">긴급 문의 · 오류 제보</p><p style="font-size:0.85rem;color:#444;line-height:1.8;margin:0;">관리자 <strong style="color:#0b1629;">정지수</strong><br><a href="tel:01039992175" style="color:#c8973a;font-weight:600;text-decoration:none;font-size:0.95rem;">010-3999-2175</a></p></div>' +
      '<div style="margin-top:12px;text-align:center;"><a href="login.html" style="font-size:0.75rem;color:transparent;text-decoration:none;user-select:none;" tabindex="-1">관리자 로그인</a></div>'
    : '';

  const contactLink = !isMaintenance
    ? '<br><a href="contact.html" style="display:inline-block;margin-top:14px;font-size:0.82rem;color:#c8973a;text-decoration:underline;">문의하기</a>'
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'block-screen-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b1629;display:flex;align-items:center;justify-content:center;padding:20px;visibility:visible;';
  overlay.innerHTML =
    '<div style="background:white;border-radius:12px;padding:52px 44px;text-align:center;max-width:440px;width:100%;box-shadow:0 32px 96px rgba(0,0,0,0.6);">' +
    '<div style="font-size:3rem;margin-bottom:20px;">' + (isMaintenance ? '🔧' : '🌿') + '</div>' +
    '<div style="font-family:\'Noto Serif KR\',serif;font-size:1.25rem;color:#0b1629;font-weight:600;margin-bottom:14px;letter-spacing:-0.01em;">' + (isMaintenance ? '사이트 점검 중' : title) + '</div>' +
    '<p style="font-size:0.88rem;color:#666;line-height:2;white-space:pre-line;margin-bottom:16px;">' + message + '</p>' +
    timeBlock +
    '<a href="index.html" style="display:inline-block;padding:13px 32px;background:#c8973a;color:white;text-decoration:none;border-radius:4px;font-size:0.9rem;font-weight:500;">홈으로 돌아가기</a>' +
    contactLink +
    urgentBox +
    '</div>';
  document.body.appendChild(overlay);
}

/* ── 점검 모드 빠른 선차단: 스크립트 실행 즉시 숨김 (DB 조회 전 노출 방지) ── */
(function earlyBlock() {
  try {
    const session = JSON.parse(sessionStorage.getItem('agastya_session') || 'null');
    const isAdmin = session && (session.role === 'admin' || session.role === 'superadmin');
    if (isAdmin) return;
    const pagePath = window.location.pathname.split('/').pop() || 'index.html';
    const allowedPages = ['index.html', '', 'login.html', 'admin.html'];
    if (allowedPages.includes(pagePath)) return;
    // 허용 페이지가 아닌 모든 페이지는 DB 확인 전까지 무조건 숨김
    document.documentElement.style.visibility = 'hidden';
  } catch(e) {}
})();

/* 현재 페이지 접근 권한 확인 */
async function checkPageAccess() {
  const session = Auth.getSession ? Auth.getSession() : null;
  const isAdmin = session && (session.role === 'admin' || session.role === 'superadmin');

  // 관리자: 숨김 해제 후 완전 통과
  if (isAdmin) {
    document.documentElement.style.visibility = '';
    document.body.style.visibility = '';
    document.body.style.opacity = '1';
    return;
  }

  const pagePath = window.location.pathname.split('/').pop() || 'index.html';
  const allowedPages = ['index.html', '', 'login.html', 'admin.html'];

  // index / login / admin 은 항상 허용
  if (allowedPages.includes(pagePath)) {
    document.documentElement.style.visibility = '';
    return;
  }

  // DB 조회 전 화면 숨기기
  document.documentElement.style.visibility = 'hidden';

  try {
    // site_content 전체를 한 번에 로드 → key 맵으로 변환
    const rawMap = await SB.loadContentMap(500);
    const map = {};
    Object.keys(rawMap).forEach(key => {
      const row = rawMap[key];
      if (row) map[key] = String(row.content ?? '');
    });

    // ① 점검 모드 확인
    // DB에 site_maintenance_mode 키가 'true'로 명시된 경우에만 점검중. 기본은 공개.
    const maintVal = map.hasOwnProperty('site_maintenance_mode')
      ? map['site_maintenance_mode']
      : 'false';                       // ← 키 없으면 공개 (admin이 필요시 ON)
    const isMaint = (maintVal === 'true');

    if (isMaint) {
      const msg = map['site_maintenance_msg'] || '현재 사이트 점검 중입니다.\n잠시 후 다시 방문해 주세요.';
      const timeStr = map['site_maintenance_time'] || '';
      renderBlockScreen('사이트 점검 중', msg, true, timeStr);
      return;
    }

    // ② 준비중 페이지 목록 확인
    const blockedPages = map['service_coming_soon_pages']
      ? map['service_coming_soon_pages'].split(',').map(p => p.trim()).filter(Boolean)
      : [];

    if (blockedPages.includes(pagePath)) {
      renderBlockScreen(
        '서비스 준비 중',
        '해당 서비스는 현재 준비 중입니다.\n보다 나은 서비스로 곧 찾아뵙겠습니다.\n\n이용에 불편을 드려 죄송합니다.',
        false, ''
      );
    } else {
      document.documentElement.style.visibility = '';
    }
  } catch(e) {
    // 오류 시 점검 화면 표시 (보안 우선)
    console.warn('[checkPageAccess] 오류, 점검 화면 표시:', e);
    renderBlockScreen('사이트 점검 중', '현재 사이트 점검 중입니다.\n잠시 후 다시 방문해 주세요.', true, '');
  }
}

/* 페이지 로드 시 자동 실행
   auth.js는 </body> 직전에 로드되므로 DOMContentLoaded는 이미 발화된 상태.
   readyState 체크 후 즉시 실행하거나 이벤트 대기. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkPageAccess);
} else {
  checkPageAccess();
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
