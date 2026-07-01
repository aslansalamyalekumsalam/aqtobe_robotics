// <video-slot> — user-fillable VIDEO placeholder.
//
// Drag an .mp4 (or .webm / .ogg) onto it, or click to browse. The chosen
// video is stored in the browser's IndexedDB (keyed by the slot's id) and
// restored on reload, so it survives refreshes on this device/browser.
//
// Because video files are large, they are NOT written into a shareable
// sidecar like <image-slot> — the upload lives in this browser only. To ship
// a fixed video with the site, set the `src` attribute to a file path /
// URL (e.g. src="images/promo.mp4"); a user upload overrides it, and
// "Remove" falls back to that src again.
//
// Attributes:
//   id           Persistence key (REQUIRED to survive reload). Distinct per slot.
//   src          Optional fallback video URL/path baked into the page.
//   poster       Optional poster image shown before play (path/URL).
//   placeholder  Empty-state caption.            (default 'Видео жүктеңіз')
//   radius       Corner radius px.               (default 18)
//   autoplay     Present → muted autoplay loop (great for hero ambience).
//   loop         Present → loop playback.
//   muted        Present → start muted.
//   controls     Present → show native controls (default ON unless autoplay).
//
// Size comes from ordinary CSS (width/height) on the element.

(() => {
  const ACCEPT = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
  const DB_NAME = 'ar_video_slots';
  const STORE = 'videos';

  // ── IndexedDB helpers ────────────────────────────────────────────────
  let dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbP;
  }
  async function idbGet(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        tx.onsuccess = () => res(tx.result || null);
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { return null; }
  }
  async function idbSet(key, blob) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
        tx.onsuccess = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { return false; }
  }
  async function idbDel(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const tx = d.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
        tx.onsuccess = () => res(true);
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { return false; }
  }

  const css =
    ':host{display:inline-block;position:relative;vertical-align:top;width:100%;height:100%;' +
    '  font:13px/1.4 Manrope,system-ui,-apple-system,sans-serif;color:rgba(234,240,255,.7)}' +
    '.frame{position:absolute;inset:0;overflow:hidden;background:#0a1120;' +
    '  border:1px solid rgba(255,255,255,.12)}' +
    'video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;background:#000}' +
    '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
    '  justify-content:center;gap:10px;text-align:center;padding:18px;box-sizing:border-box;' +
    '  cursor:pointer;user-select:none}' +
    '.empty .ic{display:flex;align-items:center;justify-content:center;width:58px;height:58px;' +
    '  border-radius:50%;background:linear-gradient(100deg,#5b9dff,#38e1ff);color:#04111f;' +
    '  box-shadow:0 12px 30px -8px rgba(56,225,255,.6)}' +
    '.empty .cap{font-weight:700;font-size:15px;color:#cdd6ee;max-width:90%}' +
    '.empty .sub{font-size:12px;color:#8190b0}' +
    '.empty .sub u{text-underline-offset:2px}' +
    '.empty:hover .ic{transform:translateY(-2px)}' +
    '.empty .ic{transition:transform .2s}' +
    ':host([data-over]) .frame{outline:2px solid #38e1ff;outline-offset:-2px;background:rgba(56,225,255,.08)}' +
    '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(255,255,255,.18)}' +
    ':host([data-over]) .ring{border-color:#38e1ff}' +
    ':host([data-filled]) .ring,:host([data-filled]) .empty{display:none}' +
    '.ctl{position:absolute;top:12px;right:12px;display:flex;gap:8px;opacity:0;pointer-events:none;' +
    '  transition:opacity .15s;z-index:3}' +
    ':host([data-filled][data-editable]:hover) .ctl{opacity:1;pointer-events:auto}' +
    '.ctl button{appearance:none;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;' +
    '  font:600 12px/1 Manrope,system-ui,sans-serif;color:#fff;background:rgba(8,12,24,.78);' +
    '  backdrop-filter:blur(8px);box-shadow:0 4px 14px -4px rgba(0,0,0,.6)}' +
    '.ctl button:hover{background:rgba(8,12,24,.95)}' +
    '.err{position:absolute;left:12px;bottom:12px;right:12px;color:#fff;font-size:12px;' +
    '  background:rgba(179,38,30,.92);padding:7px 10px;border-radius:8px;pointer-events:none}';

  const playIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="#04111f" stroke="none"><path d="M8 5v14l11-7z"/></svg>';

  class VideoSlot extends HTMLElement {
    static get observedAttributes() {
      return ['radius', 'placeholder', 'src', 'poster', 'autoplay', 'loop', 'muted', 'controls', 'id', 'locked'];
    }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' + css + '</style>' +
        '<div class="frame" part="frame">' +
        '  <video playsinline preload="metadata"></video>' +
        '  <div class="empty" part="empty">' +
        '    <div class="ic">' + playIcon + '</div>' +
        '    <div class="cap"></div>' +
        '    <div class="sub">немесе <u>файл таңдау</u> (.mp4)</div>' +
        '  </div>' +
        '  <div class="ring"></div>' +
        '</div>' +
        '<div class="ctl">' +
        '  <button data-act="replace">Ауыстыру</button>' +
        '  <button data-act="clear">Жою</button>' +
        '</div>' +
        '<input type="file" accept="' + ACCEPT.join(',') + ',.mp4,.webm,.mov" hidden>';
      this._frame = root.querySelector('.frame');
      this._video = root.querySelector('video');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._ring = root.querySelector('.ring');
      this._input = root.querySelector('input');
      this._err = null;
      this._depth = 0;
      this._objUrl = null;

      this._empty.addEventListener('click', () => { if (!this._locked()) this._input.click(); });
      root.addEventListener('click', (e) => {
        if (this._locked()) return;
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'replace') this._input.click();
        if (act === 'clear') this._clear();
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
    }

    connectedCallback() {
      if (!this.id && !VideoSlot._warned) {
        VideoSlot._warned = true;
        console.warn('<video-slot> without an id will not persist its uploaded video.');
      }
      this.addEventListener('dragenter', this);
      this.addEventListener('dragover', this);
      this.addEventListener('dragleave', this);
      this.addEventListener('drop', this);
      this._render();
      this._restore();
    }

    disconnectedCallback() {
      this.removeEventListener('dragenter', this);
      this.removeEventListener('dragover', this);
      this.removeEventListener('dragleave', this);
      this.removeEventListener('drop', this);
      if (this._objUrl) { URL.revokeObjectURL(this._objUrl); this._objUrl = null; }
    }

    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    _locked() { return this.hasAttribute('locked'); }

    async _restore() {
      if (!this.id) return;
<<<<<<< HEAD
      if (this._locked()) return; // locked slots always play their file src
=======
>>>>>>> 6e66ab13626beb4cf5ef692593cb9f068ba84d86
      const blob = await idbGet(this.id);
      if (blob) this._setBlob(blob);
    }

    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault(); e.stopPropagation();
        this._depth = 0; this.removeAttribute('data-over');
        if (this._locked()) return;
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }

    _ok(file) {
      if (!file) return false;
      if (file.type && file.type.indexOf('video/') === 0) return true;
      return /\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(file.name || '');
    }

    async _ingest(file) {
      this._setError(null);
      if (!this._ok(file)) { this._setError('Видео файлын жүктеңіз (.mp4 / .webm).'); return; }
      // ~80MB guard — IndexedDB can hold more, but warn against huge files.
      if (file.size > 80 * 1024 * 1024) {
        this._setError('Файл тым үлкен (80MB-тан көп). Қысыңыз.');
        return;
      }
      this._setBlob(file);
      if (this.id) await idbSet(this.id, file);
    }

    _setBlob(blob) {
      if (this._objUrl) { URL.revokeObjectURL(this._objUrl); this._objUrl = null; }
      this._objUrl = URL.createObjectURL(blob);
      this._userFilled = true;
      this._showVideo(this._objUrl);
    }

    async _clear() {
      if (this._objUrl) { URL.revokeObjectURL(this._objUrl); this._objUrl = null; }
      this._userFilled = false;
      if (this.id) await idbDel(this.id);
      this._render();
    }

    _showVideo(url) {
      const v = this._video;
      const autoplay = this.hasAttribute('autoplay');
      const wantControls = this.hasAttribute('controls') || !autoplay;
      v.loop = this.hasAttribute('loop') || autoplay;
      v.muted = this.hasAttribute('muted') || autoplay;
      v.controls = wantControls;
      v.autoplay = autoplay;
      const poster = this.getAttribute('poster');
      if (poster) v.poster = poster; else v.removeAttribute('poster');
      if (v.getAttribute('src') !== url) { v.src = url; v.load(); }
      v.style.display = 'block';
      this.setAttribute('data-filled', '');
      if (autoplay) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    }

    _setError(msg) {
      if (this._err) { this._err.remove(); this._err = null; }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err'; d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => { if (this._err === d) { d.remove(); this._err = null; } }, 3500);
    }

    _render() {
      const r = parseFloat(this.getAttribute('radius'));
      const radius = (Number.isFinite(r) ? r : 18) + 'px';
      this._frame.style.borderRadius = radius;
      this._ring.style.borderRadius = radius;
      this._cap.textContent = this.getAttribute('placeholder') || 'Видео жүктеңіз';

      const editable = !this._locked();
      this.toggleAttribute('data-editable', editable);
      // When locked and empty, hide the upload prompt entirely.
      this._empty.style.cursor = editable ? 'pointer' : 'default';
      if (this._sub) this._sub.style.display = editable ? '' : 'none';
      if (this._empty.querySelector('.ic')) this._empty.querySelector('.ic').style.display = editable ? '' : 'none';

      // If user hasn't filled it this session, fall back to baked-in src.
      if (!this._userFilled) {
        const src = this.getAttribute('src');
        if (src) { this._showVideo(src); return; }
        // empty state
        this._video.pause && this._video.pause();
        this._video.removeAttribute('src');
        this._video.style.display = 'none';
        this.removeAttribute('data-filled');
      }
    }
  }

  if (!customElements.get('video-slot')) {
    customElements.define('video-slot', VideoSlot);
  }
})();
