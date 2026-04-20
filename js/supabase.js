/* ============================================================
   supabase.js - Supabase REST API 래퍼
   한국 아가스티아 협회 / 빛의 아갈탄
   ============================================================
   기존 Genspark tables/ API 호출 구조를 그대로 유지하면서
   내부적으로 Supabase REST API(PostgREST)를 호출하도록 변경.

   기존 호출 코드:  await SB.getAll('users', { limit: 100 })
   → Supabase 호출:  GET /rest/v1/users?limit=100&order=created_at.desc

   기존 API 시그니처는 모두 동일하게 유지:
     - SB.getAll(table, {limit, offset, order})
     - SB.getOne(table, id)
     - SB.findOne(table, col, val)
     - SB.findMany(table, col, val, {limit, order})
     - SB.insert(table, data)
     - SB.update(table, id, data)
     - SB.remove(table, id)
     - SB.upsertContent(key, content, label, section, sort_order)
     - SB.loadContentMap(limit)
   ============================================================ */

const SB = (() => {

  /* ── 설정 로드 (config.js 에서 주입) ── */
  const cfg = (window.SUPABASE_CONFIG || {});
  const SUPABASE_URL = cfg.SUPABASE_URL || '';
  const ANON_KEY     = cfg.SUPABASE_ANON_KEY || '';

  if (!SUPABASE_URL || !ANON_KEY || ANON_KEY.startsWith('REPLACE_')) {
    console.warn(
      '[SB] ⚠️ Supabase 설정이 누락되었습니다.\n' +
      'js/config.js 파일에 SUPABASE_URL 과 SUPABASE_ANON_KEY 를 입력해주세요.'
    );
  }

  const REST = `${SUPABASE_URL}/rest/v1`;
  const HEADERS = {
    'apikey':        ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json'
  };

  /* ── 공통 fetch 래퍼 ── */
  async function _req(url, method = 'GET', body = null, extraHeaders = {}) {
    const opts = {
      method,
      headers: { ...HEADERS, ...extraHeaders }
    };
    if (body !== null) opts.body = JSON.stringify(body);
    return fetch(url, opts);
  }

  /* ── HTML 엔티티 디코드 ── */
  function _decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function _safeJsonField(val) {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val) || (typeof val === 'object')) return val;
    if (typeof val === 'string') return _decodeHtmlEntities(val);
    return val;
  }

  /* ── 행(row) 정규화: JSON 필드 디코딩 + id 통일 ── */
  function _normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const JSON_FIELDS = ['survey_fields', 'pledge_items', 'form_notices', 'content'];
    const cleaned = { ...row };
    JSON_FIELDS.forEach(f => { if (cleaned[f] !== undefined) cleaned[f] = _safeJsonField(cleaned[f]); });
    return cleaned;
  }

  function _rows(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(_normalizeRow).filter(r => r && typeof r === 'object');
  }

  /* ── 쿼리 문자열 빌더 ── */
  function _buildQuery(params) {
    const parts = [];
    Object.keys(params).forEach(k => {
      const v = params[k];
      if (v === undefined || v === null) return;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  /* ── 목록 조회 ──
     - order: "created_at.desc" 형태 (Supabase 네이티브 문법과 동일)
     - Supabase는 기본 1000건 상한. 명시적으로 limit 지정. */
  async function getAll(table, { limit = 500, offset = 0, order = 'created_at.desc' } = {}) {
    try {
      const params = {
        select: '*',
        limit: String(limit),
        offset: String(offset)
      };
      if (order) params.order = order;

      const url = `${REST}/${table}${_buildQuery(params)}`;
      const res = await _req(url);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[SB] getAll 실패 (${table}) HTTP ${res.status}`, errText.slice(0, 200));
        return [];
      }

      const data = await res.json();
      return _rows(data);
    } catch (e) {
      console.error(`[SB] getAll 오류 (${table})`, e.message);
      return [];
    }
  }

  /* ── 단건 조회 (id) ── */
  async function getOne(table, id) {
    try {
      const url = `${REST}/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
      const res = await _req(url);

      if (!res.ok) {
        console.error(`[SB] getOne 실패 (${table}/${id}) HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      const rows = _rows(data);
      return rows[0] || null;
    } catch (e) {
      console.error(`[SB] getOne 오류 (${table}/${id})`, e.message);
      return null;
    }
  }

  /* ── 컬럼 기준 단건 조회 ── */
  async function findOne(table, col, val) {
    try {
      const url = `${REST}/${table}?${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}&select=*&limit=1`;
      const res = await _req(url);

      if (!res.ok) {
        console.error(`[SB] findOne 실패 (${table} ${col}=${val}) HTTP ${res.status}`);
        return null;
      }

      const data = await res.json();
      const rows = _rows(data);
      return rows[0] || null;
    } catch (e) {
      console.error(`[SB] findOne 오류 (${table} ${col}=${val})`, e.message);
      return null;
    }
  }

  /* ── 컬럼 기준 다건 조회 ── */
  async function findMany(table, col, val, { limit = 500, order = 'created_at.desc' } = {}) {
    try {
      const params = {
        select: '*',
        limit: String(limit)
      };
      params[col] = `eq.${val}`;
      if (order) params.order = order;

      const url = `${REST}/${table}${_buildQuery(params)}`;
      const res = await _req(url);

      if (!res.ok) {
        console.error(`[SB] findMany 실패 (${table} ${col}=${val}) HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      return _rows(data);
    } catch (e) {
      console.error(`[SB] findMany 오류 (${table} ${col}=${val})`, e.message);
      return [];
    }
  }

  /* ── 생성 (INSERT) ── */
  async function insert(table, data) {
    try {
      const url = `${REST}/${table}`;
      const res = await _req(url, 'POST', data, {
        'Prefer': 'return=representation'
      });

      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch (_) {}
        console.error(`[SB] insert 실패 (${table}) HTTP ${res.status}`, errText);
        throw new Error(`저장 실패 (${res.status})${errText ? ': ' + errText.slice(0, 200) : ''}`);
      }

      const result = await res.json();
      const rows = _rows(Array.isArray(result) ? result : [result]);
      return rows[0] || {};
    } catch (e) {
      if (e.message && e.message.startsWith('저장 실패')) throw e;
      console.error(`[SB] insert 네트워크 오류 (${table})`, e);
      throw new Error(`네트워크 오류: ${e.message}`);
    }
  }

  /* ── 수정 (UPDATE) ── */
  async function update(table, id, data) {
    if (!id) {
      console.error(`[SB] update 호출 시 id가 없음 (${table})`);
      throw new Error('수정할 ID가 없습니다.');
    }
    try {
      // updated_at 자동 갱신
      const payload = { ...data };
      if (payload.updated_at === undefined && !['users'].includes(table) === false) {
        // no-op: 테이블 마다 자동 처리하지 않음. 호출측에서 필요시 넣음.
      }

      const url = `${REST}/${table}?id=eq.${encodeURIComponent(id)}`;
      const res = await _req(url, 'PATCH', payload, {
        'Prefer': 'return=representation'
      });

      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch (_) {}
        console.error(`[SB] update 실패 (${table}/${id}) HTTP ${res.status}`, errText);
        throw new Error(`수정 실패 (${res.status})${errText ? ': ' + errText.slice(0, 200) : ''}`);
      }

      const result = await res.json();
      const rows = _rows(Array.isArray(result) ? result : [result]);
      return rows[0] || {};
    } catch (e) {
      if (e.message && e.message.startsWith('수정 실패')) throw e;
      console.error(`[SB] update 네트워크 오류 (${table}/${id})`, e);
      throw new Error(`네트워크 오류: ${e.message}`);
    }
  }

  /* ── 삭제 (DELETE) ── */
  async function remove(table, id) {
    if (!id) {
      console.error(`[SB] remove 호출 시 id가 없음 (${table})`);
      return false;
    }
    try {
      const url = `${REST}/${table}?id=eq.${encodeURIComponent(id)}`;
      const res = await _req(url, 'DELETE');

      if (res.ok || res.status === 204) {
        return true;
      }

      let errText = '';
      try { errText = await res.text(); } catch (_) {}
      console.error(`[SB] remove 실패 (${table}/${id}) HTTP ${res.status}`, errText);
      return false;
    } catch (e) {
      console.error(`[SB] remove 오류 (${table}/${id})`, e.message);
      return false;
    }
  }

  /* ── site_content upsert (key 기준 있으면 update, 없으면 insert) ── */
  async function upsertContent(key, content, label = '', section = '', sort_order = 0) {
    try {
      const existing = await findOne('site_content', 'key', key);
      if (existing && existing.id) {
        return await update('site_content', existing.id, {
          key,
          content,
          label: existing.label || label || key,
          section: existing.section || section,
          sort_order: existing.sort_order ?? sort_order,
          updated_at: Date.now()
        });
      } else {
        return await insert('site_content', {
          key,
          content,
          label: label || key,
          section,
          sort_order
        });
      }
    } catch (e) {
      console.error(`[SB] upsertContent 오류 (${key})`, e.message);
      throw e;
    }
  }

  /* ── site_content 전체 → key:row 맵 ── */
  async function loadContentMap(limit = 500) {
    try {
      const rows = await getAll('site_content', { limit, order: 'sort_order.asc' });
      const map = {};
      rows.forEach(r => { if (r && r.key) map[r.key] = r; });
      return map;
    } catch (e) {
      console.error('[SB] loadContentMap 오류', e.message);
      return {};
    }
  }

  /* ── Supabase 네이티브 쿼리 (고급 사용) ──
     필요 시 임의의 PostgREST 쿼리를 실행. 반환: 배열
     예) SB.query('applications', 'seminar_id=eq.abc&order=created_at.desc&limit=10') */
  async function query(table, queryString = '') {
    try {
      const qs = queryString
        ? (queryString.startsWith('?') ? queryString : '?' + queryString)
        : '?select=*';
      const res = await _req(`${REST}/${table}${qs}`);
      if (!res.ok) return [];
      const data = await res.json();
      return _rows(Array.isArray(data) ? data : [data]);
    } catch (e) {
      console.error(`[SB] query 오류 (${table})`, e.message);
      return [];
    }
  }

  return {
    getAll, getOne, findOne, findMany,
    insert, update, remove,
    upsertContent, loadContentMap,
    query,
    // 디버그/고급 용도
    _url: REST,
    _headers: HEADERS
  };
})();
