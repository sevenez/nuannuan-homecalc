/* 暖暖家园利润计算器 · 界面层 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const D = window.DB, C = window.Core;

  /* ---- 存储：本周设置 与 我的家园 分开存 ---- */
  const K_HOME = 'nd_home_v1', K_WEEK = 'nd_week_v1', K_SELL = 'nd_sell_v1';
  const HOME_KEYS = ['lvBuild','lvPlant','lvStar','lvFish','lvAnimal','lvCook',
                     'dessert','waterSuit','boost','extraSmall','extraMid','extraBig','extraPond',
                     'sellTree','sellEss','onlyOwned',
                     'fishLv','onlyBestFish','anAff','anOff','ckSlots','anMode','anCount','season','sellExtra',
                     'cmpManual'];
  const WEEK_KEYS = ['weekCap','weekSold','daysLeft','b12',
                     'wantMats','avoidMats','excludeStar'];

  let S = C.defaultState();

  function load() {
    try {
      const h = JSON.parse(localStorage.getItem(K_HOME) || '{}');
      const w = JSON.parse(localStorage.getItem(K_WEEK) || '{}');
      HOME_KEYS.forEach(k => { if (h[k] !== undefined) S[k] = h[k]; });
      WEEK_KEYS.forEach(k => { if (w[k] !== undefined) S[k] = w[k]; });
      // 旧档迁移：固定 5 字段（3 产物+1 动物+1 家具）→ b12 数组。
      // 不截断：老档可能 5 项全填，slice 会静默丢掉 1.2 倍家具（槽位渲染按 max(4,已选数) 兼容）；
      // 「新增最多 4 个」只限制弹层添加，已迁移的 5 项保留、可手动 × 移除
      if (!Array.isArray(S.b12)) S.b12 = [];
      if (!S.b12.length) {
        const oldB12 = [w.b12a, w.b12b, w.b12c, w.b12Animal, w.b12Furn].filter(Boolean);
        if (oldB12.length) S.b12 = oldB12;
      }
      // 兼容：合并式对象补默认键
      if (!S.fishLv || typeof S.fishLv !== 'object') S.fishLv = C.defaultState().fishLv;
      if (!S.anCount || typeof S.anCount !== 'object') S.anCount = C.defaultState().anCount;
      if (!Array.isArray(S.ckSlots) || S.ckSlots.length !== 3) S.ckSlots = C.defaultState().ckSlots;
      if (!Array.isArray(S.cmpManual) || S.cmpManual.length !== 3) S.cmpManual = ['', '', ''];
      if (!Array.isArray(S.anOff)) S.anOff = [];
      if (S.excludeStar) {   // 旧档迁移：一键排除陨星 → 陨星写入排除列表（状态改由列表推导）
        C.STAR.forEach(st => { if (S.avoidMats.indexOf(st) < 0) S.avoidMats.push(st); });
        delete S.excludeStar;
      }
      S.anOff = S.anOff.filter(n => typeof n === 'string' && D.an.some(a => a.n === n));
      // 旧档清洗：曾经误选进「想用掉 / 不想用掉」的占位项「不选」清掉
      S.wantMats = (S.wantMats || []).filter(m => m && m !== '不选');
      S.avoidMats = (S.avoidMats || []).filter(m => m && m !== '不选');
      Object.keys(D.fish).forEach(f => { if (S.fishLv[f] === undefined) S.fishLv[f] = 5; });
      C.AN_GROUPS.forEach(g => { if (S.anCount[g] === undefined) S.anCount[g] = 0; });
      // 兼容：旧版好感度下拉曾误开 1-9，钳回合法值 1-3
      if (S.anAff && typeof S.anAff === 'object') {
        for (const k of Object.keys(S.anAff)) {
          const v = S.anAff[k];
          S.anAff[k] = Math.max(1, Math.min(3, typeof v === 'number' ? Math.round(v) : 3));
        }
      }
    } catch (e) { }
  }
  function save() {
    const h = {}, w = {};
    HOME_KEYS.forEach(k => h[k] = S[k]);
    WEEK_KEYS.forEach(k => w[k] = S[k]);
    try {
      localStorage.setItem(K_HOME, JSON.stringify(h));
      localStorage.setItem(K_WEEK, JSON.stringify(w));
    } catch (e) { }
    catCache = null; slotCache = null;   // 选择弹层目录含单价，参数一变即失效（声明见 getCatalog）
  }
  /* 卖整配置：勾选状态独立保存（blog 凑整方案）
   * v2.10+ 口径：精粹仅由本周 1.2 倍产物自动带出，不再有手动勾选；手动添加走 pick */
  let sellCfg = { b12off: [], essOn: [], essOff: [], pick: [], caps: {} };
  function loadSellCfg() {
    try { Object.assign(sellCfg, JSON.parse(localStorage.getItem(K_SELL) || '{}')); } catch (e) { }
    delete sellCfg.essAll;   // v2.10 口径：移除"全部精粹"总开关，精粹仅由 1.2 倍产物自动带出
    sellCfg.essOn = [];      // v2.10 口径：精粹不再手动勾选，清理旧档 essOn 残留（修复幽灵精粹 bug）
    // 旧档迁移：priExtra（自选）+ fit（凑整勾选）→ pick；priOff 中属 1.2 物品的 → b12off
    if (Array.isArray(sellCfg.priExtra) || Array.isArray(sellCfg.fit) || sellCfg.priOff) {
      const old = [].concat(sellCfg.priExtra || [], sellCfg.fit || []);
      old.forEach(n => { if (typeof n === 'string' && sellCfg.pick.indexOf(n) < 0) sellCfg.pick.push(n); });
      (S.b12 || []).forEach(n => {
        if (n && sellCfg.priOff && sellCfg.priOff.indexOf(n) >= 0 && sellCfg.b12off.indexOf(n) < 0) sellCfg.b12off.push(n);
      });
      delete sellCfg.priExtra; delete sellCfg.fit; delete sellCfg.priOff; delete sellCfg.padOff;
    }
    // 脏数据钳制
    const arr = k => { if (!Array.isArray(sellCfg[k])) sellCfg[k] = []; sellCfg[k] = sellCfg[k].filter(n => typeof n === 'string'); };
    ['b12off', 'essOn', 'essOff', 'pick'].forEach(arr);
    // 数量上限：{ 名称: 件数 }，仅保留 ≥1 的整数（留空/0 = 不限，不存档）
    if (!sellCfg.caps || typeof sellCfg.caps !== 'object' || Array.isArray(sellCfg.caps)) sellCfg.caps = {};
    Object.keys(sellCfg.caps).forEach(k => {
      const v = Math.floor(+sellCfg.caps[k]);
      if (v >= 1) sellCfg.caps[k] = v; else delete sellCfg.caps[k];
    });
    saveSellCfg();   // 迁移/钳制结果写回，避免每次加载重复迁移
  }
  function saveSellCfg() {
    try { localStorage.setItem(K_SELL, JSON.stringify(sellCfg)); } catch (e) { }
  }

  const nfmt = n => Math.round(n).toLocaleString('zh-CN');
  /* 小数格式：≤2 位小数，去尾零（查询页材料/成本用） */
  const nf2 = n => {
    if (n == null || !isFinite(n)) return '—';
    const r = Math.round(n * 100) / 100;
    return (Number.isInteger(r) ? r.toLocaleString('zh-CN') : r.toLocaleString('zh-CN', { maximumFractionDigits: 2 }));
  };
  /* 百分比（查询页收益率用） */
  const pct = x => (x == null || !isFinite(x) ? '—' : (x * 100).toFixed(1) + '%');
  // 小时 → "X 天 Y 小时"
  function dayTxt(h) {
    const d = Math.floor(h / 24), r = Math.round((h / 24 - d) * 24 * 100) / 100;
    return d > 0 ? `${d} 天 ${r} 小时` : `${Math.round(h * 100) / 100} 小时`;
  }
  /* 应用版本（与 sw.js 的 VER 保持一致；改动任何网页文件都要同步升级，用于刷新离线缓存） */
  const APP_VER = '1.210.6.57';
  /* 打包时间：每次改版发布时更新，显示在「关于与免责」第一条 */
  const BUILD_AT = '2026-11-10 14:20';
  /* 安卓版安装包下载（百度网盘）：链接自带 ?pwd= 提取码参数，复制后可直接打开，无需另填提取码 */
  const ANDROID_DL_URL = 'https://pan.baidu.com/s/1R72ZaiRu5CAzUPRBSVi94w?pwd=1206';
  const ANDROID_DL_CODE = '1206';
  /* 输入防抖：搜索类输入每键全量重绘前的缓冲 */
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  /* 返回键可关闭的浮层登记（APK 返回键先关浮层再退出，见 window.__app.onBack） */
  const popclosers = [];

  /* ================= 初始化表单 ================= */
  const LVCONF = [['建造','lvBuild'],['种植','lvPlant'],['采星','lvStar'],
                  ['养鱼','lvFish'],['邀约','lvAnimal'],['烹饪','lvCook']];

  function buildLvGrid() {
    $('#lvGrid').innerHTML = LVCONF.map(([label, key]) => `
      <button type="button" class="lvchip" data-lv="${key}" data-label="${label}">
        <span class="ln">${label}</span><span class="lv" data-lvnum="${key}">${S[key]}</span>
      </button>`).join('');
    $$('#lvGrid .lvchip').forEach(el => {
      el.onclick = () => openStepper(S[el.dataset.lv], 0, 10, v => {
        S[el.dataset.lv] = v; save(); refreshLv(); refreshFields(); calc();
      }, el, { title: false, buttons: false });
    });
    refreshLv();
  }
  function refreshLv() {
    LVCONF.forEach(([label, key]) => {
      const el = document.querySelector(`[data-lvnum="${key}"]`);
      if (el) el.textContent = S[key];
    });
  }

  /* 农田 / 鱼塘：四卡（总数 = 等级赠送 + 额外购买；额外可为负，总数下限 0） */
  const FCONF = [
    { name: '小田', kind: '种植', gk: 'small', ek: 'extraSmall' },
    { name: '中田', kind: '种植', gk: 'mid',   ek: 'extraMid' },
    { name: '大田', kind: '种植', gk: 'big',   ek: 'extraBig' },
    { name: '鱼塘', kind: '养鱼', gk: 'pond',  ek: 'extraPond' },
  ];
  function giftOf(c) {
    const lv = c.kind === '种植' ? S.lvPlant : S.lvFish;
    return D.lv[c.kind][Math.max(0, Math.min(lv, 10))][c.gk];
  }
  function renderFields() {
    const wrap = $('#fieldCards');
    wrap.innerHTML = FCONF.map(c => {
      const g = giftOf(c), e = S[c.ek] || 0, t = Math.max(0, g + e);
      return `<div class="fcard" data-fk="${c.ek}">
        <button type="button" class="fch" data-ek="${c.ek}">
          <span class="fn">${c.name}</span>
          <span class="fbig">${t}</span>
        </button>
      </div>`;
    }).join('');
    $$('#fieldCards .fch').forEach(h => h.onclick = () => {
      const card = h.closest('.fcard');
      const ek = h.dataset.ek;
      const c = FCONF.find(x => x.ek === ek);
      if (!c) return;
      /* 气泡：无标题无按钮，信息行=卡片名 + 等级赠送（只读），步进器=额外购买（实时生效）
         下限 = -等级赠送：总数不能为负，最多只能把赠送的田/塘全部减掉 */
      const g = giftOf(c), lo = -g, hi = 99;
      const cur = Math.max(lo, Math.min(hi, S[ek] || 0));
      if (cur !== (S[ek] || 0)) { S[ek] = cur; save(); }   // 等级变化后清洗越界的旧值
      openStepper(cur, lo, hi, v => {
        let nv = v; if (isNaN(nv)) nv = 0;
        S[ek] = nv; save();
        card.querySelector('.fbig').textContent = Math.max(0, giftOf(c) + nv);
        calc();
      }, h, { title: false, buttons: false, info: c.name + ' · 等级赠送 ' + giftOf(c) });
    });
    /* ⓘ 各等级赠送明细（一次构建） */
    const tip = document.getElementById('tip-field');
    if (tip && !tip.dataset.built) {
      tip.dataset.built = '1';
      const plant = D.lv.种植, fish = D.lv.养鱼;
      let rows = '';
      for (let lv = 0; lv <= 10; lv++)
        rows += `<tr><td>${lv}</td><td>${plant[lv].small}</td><td>${plant[lv].mid}</td><td>${plant[lv].big}</td><td>${fish[lv].pond}</td></tr>`;
      tip.innerHTML = `<div class="lvtbl-hd">小田 / 中田 / 大田 由「种植能力」决定，鱼塘 由「养鱼能力」决定；下表为各等级（0–10）赠送数量。</div>
        <table class="lvtbl"><thead><tr><th>等级</th><th>小田</th><th>中田</th><th>大田</th><th>鱼塘</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }
  }
  function refreshFields() {
    FCONF.forEach(c => {
      const card = document.querySelector(`#fieldCards .fcard[data-fk="${c.ek}"]`);
      if (!card) return;
      card.querySelector('.fbig').textContent = Math.max(0, giftOf(c) + (S[c.ek] || 0));
    });
  }

  /* 步进器气泡：能力等级编辑（0–10），锚定在触发卡片旁，无全屏遮罩 */
  function placeStep(anchor) {
    const card = $('#stepCard');
    const r = (anchor || document.body).getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const vw = innerWidth, vh = innerHeight;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, vw - cw - 8));
    const above = r.top > vh / 2;                 // 芯片在屏幕下半 → 气泡放上方
    let top = above ? r.top - ch - 10 : r.bottom + 10;
    if (top < 8) top = r.bottom + 10;
    if (top + ch > vh - 8) top = r.top - ch - 10;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    const caret = $('#stepCaret');
    const cx = r.left + r.width / 2 - left;
    caret.style.left = (Math.max(12, Math.min(cx, cw - 12)) - 8) + 'px';
    caret.classList.toggle('up', above);
    caret.classList.toggle('down', !above);
  }
  /* 会打开气泡的触发元素：点它们时不能被"点外部关闭"逻辑误关，
     否则会出现"第一次能点开、之后再点任意卡片都没反应" */
  const POPUP_TRIGGER = '.lvchip, .fch, .fsel, .aff, .stpb, .pick-item';
  function onDocStep(e) {
    if (e.target.closest('#stepCard') || e.target.closest(POPUP_TRIGGER)) return;
    closeStep();
  }
  // 轻量气泡：缺省即无标题、无确定/取消，每次 ± 通过 onStep 实时生效
  function openStepper(value, min, max, onStep, anchor, opts) {
    closePick();                          // 两种气泡互斥，避免同时浮着
    opts = opts || {};
    const t = $('#stepTitle'); t.hidden = !opts.title; if (opts.title) t.textContent = opts.title;
    const info = $('#stepInfo'); info.hidden = !opts.info; if (opts.info) info.textContent = opts.info;
    const btns = $('#stepBtns'); btns.hidden = !opts.buttons;
    const inp = $('#stepInput');
    inp.value = value; inp.min = min; inp.max = max;
    inp.classList.toggle('neg', value < 0);
    /* 输入框为 0 时不能被 `|| min` 吞掉（农田卡 min 为负，否则从 0 点减会直接跳到下限） */
    const num = () => { const n = parseInt(inp.value, 10); return isNaN(n) ? 0 : n; };
    const apply = () => {
      let v = Math.max(min, Math.min(max, num()));
      inp.value = v; inp.classList.toggle('neg', v < 0);
      if (onStep) onStep(v);
    };
    $('#stepMinus').onclick = () => { inp.value = Math.max(min, num() - 1); apply(); };
    $('#stepPlus').onclick = () => { inp.value = Math.min(max, num() + 1); apply(); };
    inp.onchange = apply;   // 手动输入完成后同样实时生效
    if (opts.buttons) {
      $('#stepOk').onclick = () => { let v = parseInt(inp.value, 10); if (isNaN(v)) v = min; v = Math.max(min, Math.min(max, v)); closeStep(); if (opts.onDone) opts.onDone(v); };
      $('#stepCancel').onclick = closeStep;
    } else { $('#stepOk').onclick = null; $('#stepCancel').onclick = null; }
    $('#stepBox').hidden = false;
    placeStep(anchor);
    document.removeEventListener('click', onDocStep);
    document.addEventListener('click', onDocStep);   // 同步注册：本次点击由 POPUP_TRIGGER 豁免
    setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 20);
  }
  function closeStep() {
    document.removeEventListener('click', onDocStep);
    const box = $('#stepBox');
    if (box.hidden) return;
    box.hidden = true;
  }

  /* 气泡选择框：≤8 选项的场景替代下拉；锚定在触发元素旁，点击选项即生效，无确认/取消 */
  function onDocPick(e) {
    if (e.target.closest('#pickCard') || e.target.closest(POPUP_TRIGGER)) return;
    closePick();
  }
  function closePick() {
    document.removeEventListener('click', onDocPick);
    const box = $('#pickBox');
    if (box.hidden) return;
    box.hidden = true;
  }
  function placePick(anchor) {
    const card = $('#pickCard');
    const r = (anchor || document.body).getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const vw = innerWidth, vh = innerHeight;
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(8, Math.min(left, vw - cw - 8));
    const above = r.top > vh / 2;
    let top = above ? r.top - ch - 10 : r.bottom + 10;
    if (top < 8) top = r.bottom + 10;
    if (top + ch > vh - 8) top = r.top - ch - 10;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    const caret = $('#pickCaret');
    const cx = r.left + r.width / 2 - left;
    caret.style.left = (Math.max(12, Math.min(cx, cw - 12)) - 8) + 'px';
    caret.classList.toggle('up', above);
    caret.classList.toggle('down', !above);
  }
  function openBubblePick(anchor, items, currentV, onPick) {
    closeStep();                          // 两种气泡互斥
    const list = $('#pickOpts');
    list.innerHTML = items.map((it, i) =>
      `<button type="button" class="pick-item${String(it.v) === String(currentV) ? ' on' : ''}" data-i="${i}">${it.label}</button>`
    ).join('');
    $$('#pickOpts .pick-item').forEach(b => b.onclick = () => {
      const it = items[+b.dataset.i];
      closePick();
      if (onPick) onPick(it.v);
    });
    $('#pickBox').hidden = false;
    placePick(anchor);
    document.removeEventListener('click', onDocPick);
    document.addEventListener('click', onDocPick);   // 同步注册：本次点击由 POPUP_TRIGGER 豁免
  }

  /* 产物类别权重：植物（作物）→ 鱼 → 陨星 → 动物，同类别内保持 data.js 原序 */
  const CAT_W = { '作物': 0, '鱼': 1, '陨星': 2, '动物': 3 };
  const byCat = list => list.slice().sort((a, b) =>
    ((CAT_W[D.mat[a] && D.mat[a][9]]) ?? 9) - ((CAT_W[D.mat[b] && D.mat[b][9]]) ?? 9));

  const produceList = byCat(C.allProduce());   // 1.2 倍产物（植物 / 鱼 / 陨星）
  const cmpList = byCat(C.cmpProduceList());   // 手动对比表（含 5 种动物）
  /* 产物序列（植物→鱼→陨星→动物），供精粹/树木"参考产物排序"使用 */
  const PROD_SEQ = produceList.concat(Object.keys(D.mat).filter(k => D.mat[k][9] === '动物'));
  const prodIdx = n => { const i = PROD_SEQ.indexOf(n); return i < 0 ? 999 : i; };
  /* 树木名 → 对应产物名：叮当果树去"树"；织云木去"木"补"果" */
  const treeProdName = n => { const base = n.slice(0, -1); return D.mat[base + '果'] ? base + '果' : base; };

  function buildSelects() {
    // 选项 ≤8 的选择已改为 fsel 按钮 + openBubblePick 气泡（点选即生效）；这里只刷按钮标签
    $('#sWeekCap').textContent = (S.weekCap / 10000) + ' 万';
    const des = D.desserts.find(x => x.v === S.dessert) || D.desserts[0];
    $('#sDessert').textContent = des.t;
    $('#sBoost').textContent = { none: '不使用', once: '使用 1 次', hourly: '每小时 1 次' }[S.boost] || '不使用';
    const sea = D.season.find(x => x.n === S.season) || D.season[0];
    $('#sSeason').textContent = sea.n;
  }

  /* 「排除陨星」按钮：点亮 = 四颗陨星在排除列表内；再点 = 移除。
   * 状态由列表推导（任意一颗在列表内即点亮）；手动 × 逐颗删除不改灯，全删光才变暗 */
  const starOn = () => C.STAR.some(st => S.avoidMats.indexOf(st) >= 0);
  function renderStarSw() {
    const el = document.getElementById('cStar');
    if (!el) return;
    const on = starOn();
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', on);
  }
  const animalMatsOn = () => C.AN_GROUPS.some(m => S.avoidMats.indexOf(m) >= 0);
  function renderAnimalBtn() {
    const el = document.getElementById('cAnimal');
    if (!el) return;
    const on = animalMatsOn();
    el.classList.toggle('on', on);
    el.setAttribute('aria-pressed', on);
  }
  function animalBtnClick() {
    if (animalMatsOn()) C.AN_GROUPS.forEach(m => { const i = S.avoidMats.indexOf(m); if (i >= 0) S.avoidMats.splice(i, 1); });
    else C.AN_GROUPS.forEach(m => { if (S.avoidMats.indexOf(m) < 0) S.avoidMats.push(m); });
    save(); renderTags(); renderAnimalBtn(); calc();
  }

  function starBtnClick() {
    if (starOn()) C.STAR.forEach(st => { const i = S.avoidMats.indexOf(st); if (i >= 0) S.avoidMats.splice(i, 1); });
    else C.STAR.forEach(st => { if (S.avoidMats.indexOf(st) < 0) S.avoidMats.push(st); });
    save(); renderTags(); renderStarSw(); calc();
  }

  /* 数量步进器：±按钮 + 长按连发（0.42s 起步、90ms 连发）；输入框保留直接输入。
   * 幂等（dataset.stp 标记）；±通过 input/change 事件驱动既有监听，不改数据流 */
  function makeStp(input, o) {
    const o2 = o || {};
    if (input.dataset.stp === '1') return;
    input.dataset.stp = '1';
    const min = o2.min != null ? o2.min : 0;
    const max = o2.max != null ? o2.max : Infinity;
    const mk = dir => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stpb';
      b.textContent = dir < 0 ? '−' : '+';
      b.setAttribute('aria-label', dir < 0 ? '减少' : '增加');
      let t1 = null, t2 = null;
      const doStep = () => {
        const v = Math.max(min, Math.min(max, (parseInt(input.value, 10) || 0) + dir));
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      b.addEventListener('click', doStep);
      b.addEventListener('pointerdown', () => { t1 = setTimeout(() => { t2 = setInterval(doStep, 90); }, 420); });
      const stop = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('pointerleave', stop);
      return b;
    };
    const wrap = document.createElement('span');
    wrap.className = 'stp';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(mk(-1));
    wrap.appendChild(input);
    wrap.appendChild(mk(1));
  }

  /* ================= 材料标签 ================= */
  function renderTags() {
    $('#tWant').innerHTML = S.wantMats.map(m => `<span class="tg">${m}<x data-rm="want" data-m="${m}">×</x></span>`).join('');
    $('#tAvoid').innerHTML = S.avoidMats.map(m => `<span class="tg av">${m}<x data-rm="avoid" data-m="${m}">×</x></span>`).join('');
    $$('.tg x').forEach(x => x.onclick = () => {
      const arr = x.dataset.rm === 'want' ? S.wantMats : S.avoidMats;
      const i = arr.indexOf(x.dataset.m); if (i >= 0) arr.splice(i, 1);
      save(); renderTags(); calc();
    });
    renderStarSw();   // 排除列表变化 → 按钮状态跟随（全删光才变暗）
    renderAnimalBtn();
  }
  /* buildFinder 材料下拉已移除：改用全屏选择弹层（openPickSheet('mat', 'want'/'avoid')） */

  /* ================= 计算与渲染 ================= */
  let raf = null;
  function calc() {
    clearTimeout(raf);
    raf = setTimeout(render, 60);
  }

  /* 空状态：一句话 + 一个操作按钮（data-go 按钮由 bind() 里的委托统一处理：按需切页签、展开折叠卡并滚动到目标） */
  function emptyGo(msg, label, sel, page) {
    return '<div class="empty">' + msg +
      '<div style="margin-top:8px"><button class="btn" data-go="1"' +
      (page ? ' data-gopage="' + page + '"' : '') +
      (sel ? ' data-gosel="' + sel + '"' : '') + '>' + label + '</button></div></div>';
  }

  let furTotal = 0;
  function render() {
    const left = Math.max(S.weekCap - S.weekSold, 0);
    $('#hdrSub').textContent = `剩余家园币 ${nfmt(left)} · 还剩 ${S.daysLeft} 天`;

    /* 家具排行 */
    const R = C.rankFurniture(S, 10);
    furTotal = R.total;
    const rc = document.getElementById('resCnt');
    if (rc) rc.textContent = `${R.total} 件可选`;
    $('#outFur').innerHTML = R.list.length
      ? R.list.map((r, i) => furCard(r, i + 1)).join('')
      : emptyGo('没有符合条件的家具', '调整筛选', '#filtInner');

    /* 1.2 倍家具 */
    const f12 = C.calcFurn12(S);
    $('#card12').style.display = f12 ? '' : 'none';
    if (f12) $('#furn12Body').innerHTML = furCard(f12, '★');

    /* 产物排行 */
    const b12 = (S.b12 || []).filter(n => D.mat[n]);   // 1.2 倍产物（家具名不在 D.mat，自动排除）置顶
    let P = C.rankProduce(S, null).filter(p => !p.locked);
    // 本周 1.2 倍产物置顶
    const top = b12.map(n => P.find(x => x.name === n)).filter(Boolean);
    P = top.concat(P.filter(x => top.indexOf(x) < 0)).slice(0, 12);
    $('#outProdList').innerHTML = P.length ? P.map(prodCard).join('') : '<div class="empty">暂无</div>';

    /* 产物对比表 */
    renderCmp();

    /* 槽位卡片：本周 1.2 倍（5 槽）；对比表 3 槽在 renderCmp 内 */
    renderB12Slots();

    /* 家园页 / 动物页 懒渲染 */
    if (!$('#page-home').hidden) renderFish();
    if (!$('#page-animal').hidden) { renderAnimals(); renderAnCount(); renderCk(); }

    renderSell();
    renderFurnSum();
  }

  /* 「不能包含」概要：展开成具体材料名；整组全选时合并为「所有动物」「所有陨星」 */
  function avoidLabels() {
    const list = S.avoidMats || [];
    const allAn = C.AN_GROUPS.every(g => list.indexOf(g) >= 0);
    const allStar = C.STAR.every(s => list.indexOf(s) >= 0);
    const out = [];
    if (allAn) out.push('所有动物');
    if (allStar) out.push('所有陨星');
    list.forEach(n => {
      if (allAn && C.AN_GROUPS.indexOf(n) >= 0) return;
      if (allStar && C.STAR.indexOf(n) >= 0) return;
      out.push(n);
    });
    return out;
  }

  /* 家具利润卡：折叠态卡头筛选概要 */
  function renderFurnSum() {
    const items = [];
    if (furTotal) items.push('共 ' + furTotal + ' 件可选');
    if (S.wantMats && S.wantMats.length) items.push('想用: ' + S.wantMats.join('、'));
    const av = avoidLabels();
    if (av.length) items.push('不想用: ' + av.join('、'));
    const box = document.getElementById('furnSum');
    if (!box) return;
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<span class="si muted">无筛选条件</span>'; layoutFurnSum(); renderFiltSum(); return; }
    items.forEach((t, i) => {
      if (i) { const sep = document.createElement('span'); sep.className = 'sep'; sep.textContent = '·'; box.appendChild(sep); }
      const s = document.createElement('span'); s.className = 'si'; s.textContent = t; box.appendChild(s);
    });
    layoutFurnSum();
    renderFiltSum();
  }
  function layoutFurnSum() {
    const box = document.getElementById('furnSum');
    if (!box || box.offsetParent === null) return;
    box.querySelectorAll('.si.hide,.sep.hide').forEach(e => e.classList.remove('hide'));
    const old = box.querySelector('.more'); if (old) old.remove();
    const sis = [...box.querySelectorAll('.si')];
    if (!sis.length) return;
    const lh = sis[0].offsetHeight || 18;
    let over = 0; const hide = [];
    sis.forEach(si => { if (si.offsetTop >= lh * 2 - 1) { over++; hide.push(si); } });
    hide.forEach(si => {
      si.classList.add('hide');
      const prev = si.previousElementSibling;
      if (prev && prev.classList.contains('sep')) prev.classList.add('hide');
    });
    if (over) { const m = document.createElement('span'); m.className = 'more'; m.textContent = '+' + over; box.appendChild(m); }
  }

  /* 材料筛选小节：折叠态标题栏两行纯文字概要（每行只占一行，放不下的材料折成 +X） */
  let sumCtx = null;
  function sumW(t) {
    const cs = getComputedStyle(document.getElementById('filtSum'));
    if (!sumCtx) sumCtx = document.createElement('canvas').getContext('2d');
    sumCtx.font = cs.fontSize + ' ' + cs.fontFamily;
    return sumCtx.measureText(t).width;
  }
  function fitSum(names, maxW) {
    const sepW = sumW('、');
    const scan = lim => {
      let used = 0, n = 0;
      for (let i = 0; i < names.length; i++) {
        const w = sumW(names[i]) + (i ? sepW : 0);
        if (used + w > lim) break;
        used += w; n++;
      }
      return n;
    };
    let shown = scan(maxW);
    let over = names.length - shown;
    if (over) { shown = scan(maxW - sumW('+99') - 4); over = names.length - shown; }
    return { text: names.slice(0, shown).join('、'), over };
  }
  function renderFiltSum() {
    const box = document.getElementById('filtSum');
    if (!box) return;
    const want = (S.wantMats || []).slice();
    const av = avoidLabels();
    const rows = [];
    if (want.length) rows.push(['必须包含', want]);
    if (av.length) rows.push(['不能包含', av]);
    box.dataset.rows = JSON.stringify(rows);
    layoutFiltSum();
  }
  function layoutFiltSum() {
    const box = document.getElementById('filtSum');
    if (!box || box.offsetParent === null) return;
    const rows = JSON.parse(box.dataset.rows || '[]');
    const W = box.clientWidth;
    box.innerHTML = '';
    rows.forEach(([lb, names]) => {
      const f = fitSum(names, Math.max(20, W - sumW(lb) - 6));
      const row = document.createElement('span'); row.className = 'fr';
      const l = document.createElement('span'); l.className = 'lb'; l.textContent = lb;
      const v = document.createElement('span'); v.className = 'vl'; v.textContent = f.text;
      row.appendChild(l); row.appendChild(v);
      if (f.over) { const m = document.createElement('span'); m.className = 'more'; m.textContent = '+' + f.over; row.appendChild(m); }
      box.appendChild(row);
    });
  }

  /* 家具卡片 */
  function furCard(r, rank) {
    const mats = r.mats.map(([n, q]) => `${n}×${q}`).join('、');
    const better = r.better
      ? '<span class="warnb no">做家具卖更赚</span>'
      : '<span class="warnb yes">直接卖材料更赚</span>';
    /* sheet9 排程：轮次/每日上线/间隔/时间是否够（count=sheet6 CR，bench=工作台产能，time=制作分钟） */
    const plan = C.craftPlan(S, r.count, r.time);
    const mid = 'fur-' + rank;
    /* 三层结构：头行(名称+总利润) / 主行(售卖·排程·利润对比) / 详情▾（全称口径，供对拍核对） */
    return `<div class="it${rank === 1 ? ' g1' : ''}">
      <div class="h">
        <span class="rk">${rank}</span>
        <span class="nm">${r.name}</span>
        <span class="src">${r.src || '-'}</span>
        <span class="pf">${nfmt(r.totalProfit)}</span>
      </div>
      <div class="kv main">
        <span>售卖 <b>${nfmt(r.sell)}</b></span>
        <span>做 <b>${nfmt(r.count)}</b> 个</span>
      </div>
      ${plan ? `<div class="kv main">
        <span>排程 <b>${plan.instant ? '秒做' : plan.full + '轮+' + plan.rest + '次'}</b></span>
        <span>每日上线 <b>${plan.perDay == null ? '—' : plan.perDay + ' 次'}</b></span>
        <span>间隔 <b>${plan.gap}</b></span>
        <span class="warnb ${plan.enough ? 'no' : 'yes'}">${S.daysLeft} 天时间${plan.enough ? '还够' : '不够'}</span>
      </div>` : ''}
      <div class="kv main">
        <span>做家具利润 <b>${nfmt(r.profitPer)}</b></span>
        <span>卖材料利润 <b>${nfmt(r.profitMat)}</b></span>
      </div>
      <div class="ftrow">${better}<button class="more" data-mid="${mid}">详情 ▾</button></div>
      <div class="det" id="det-${mid}" hidden>
        <div class="kv">
          <span>所有材料成本 <b>${nfmt(r.cost)}</b></span>
          <span>所有材料售卖 <b>${nfmt(r.matSale)}</b></span>
          <span>额外产物 <b>${nfmt(r.extra)}</b></span>
          <span>卖家具总销售 <b>${nfmt(r.totalSale)}</b></span>
          <span>卖家具总利润 <b>${nfmt(r.totalProfit)}</b></span>
          <span>家具产量 <b>${r.yield}</b></span>
          <span>制作 <b>${r.time}</b> 分钟</span>
        </div>
        <div class="kv one">
          <span>材料毛利率 <b>${pct(r.matRateSale)}</b></span>
          <span>家具毛利率 <b>${pct(r.rateSale)}</b></span>
        </div>
        <div class="kv"><span class="wide">制作1次额外产物售价 <b>精粹 ${nfmt(r.ess)} · 树 ${nfmt(r.tree)} · 合计 ${nfmt(r.extra)}</b></span></div>
        <div class="mats">${mats}</div>
      </div>
    </div>`;
  }

  /* 产物收获排程 spans（sheet7 P/Q/R/Y 口径）：需要收几轮+余几次 · 每天需收几次 · 收满约需几天
   * 返回 span 片段（供卡片主行内联拼接）；陨星为探索行为，无时间约束 → 空串 */
  function schedSpans(p) {
    if (p.kind === '陨星') return '';
    const sess = (p.roundsFull || 0) + ((p.roundsRest || 0) > 0 ? 1 : 0);
    const perDayNeed = S.daysLeft > 0 ? Math.ceil(sess / S.daysLeft) : '—';
    const days = p.needDays == null ? '—' : p.needDays + ' 天';
    return `<span>需要收 <b>${p.roundsFull || 0}轮${(p.roundsRest || 0) > 0 ? '+' + p.roundsRest + '次' : ''}</b></span>
      <span>每天需收 <b>${perDayNeed} 次</b></span>
      <span>收满约需 <b>${days}</b></span>`;
  }

  function prodCard(p) {
    if (p.locked) {
      return `<div class="it">
        <div class="h"><span class="nm">${p.name}${p.is12 ? ' <span class="src">1.2倍</span>' : ''}</span></div>
        <div class="kv"><span class="warnb yes">能力等级不足，还没解锁</span></div>
      </div>`;
    }
    const sched = schedSpans(p);
    const mid = 'prod-' + p.name;    return `<div class="it">
      <div class="h">
        <span class="nm">${p.name}${p.is12 ? ' <span class="src">1.2倍</span>' : ''}</span>
        <span class="pf">${nfmt(p.total)}</span>
      </div>
      <div class="kv main">
        <span>单价 <b>${nfmt(p.price)}</b></span>
        <span>单份赚 <b>${nfmt(p.profit)}</b></span>
        <span>产量 <b>${p.yield}</b></span>
        <span>成本 <b>${nfmt(p.cost)}</b></span>
      </div>
      <div class="kv main">${sched || ''}<span class="warnb ${p.enough ? 'no' : 'yes'}">${p.enough ? '时间够' : S.daysLeft + ' 天时间不够'}</span></div>
      <div class="ftrow"><button class="more" data-mid="${mid}">详情 ▾</button></div>
      <div class="det" id="det-${mid}" hidden>
        <div class="kv">
          <span>卖满需 <b>${nfmt(p.portions)}</b> 份</span>
          <span>${p.kind === '鱼' ? '鱼塘' : p.kind === '陨星' ? '采星' : '农田'} <b>${p.plots}</b></span>
          <span>成熟 <b>${p.grow}</b> 分</span>
          <span>每天可收 <b>${p.perDay}</b> 次</span>
        </div>
      </div>
    </div>`;
  }

  /* ================= 产物对比 ================= */
  function cmpRow(p) {
    if (!p) return '';
    if (p.locked) {
      return `<div class="cmprow"><div class="cmpname">${p.name}</div>
        <div class="kv"><span class="warnb yes">能力等级不足，还没解锁</span></div></div>`;
    }
    const qtyExtra = p.kind === '陨星'
      ? `${nfmt(p.cmpQty)} 个（约 ${Math.round(p.cmpQty / 10)} kg）`
      : `${nfmt(p.cmpQty)} 个${S.sellEss && p.cmpEss ? ` + ${nfmt(p.cmpEss)} 个精粹` : ''}${S.sellTree && p.cmpTree ? ` + ${nfmt(p.cmpTree)} 颗树` : ''}`;
    const sched = schedSpans(p);
    if (p.kind === '动物') {
      const mid = 'cmp-' + p.name;
      return `<div class="cmprow">
      <div class="cmpname">${p.name}${p.is12 ? ' <span class="b12t">1.2倍</span>' : ''} <span class="tag">动物</span><span class="pf">${nfmt(p.cmpProfit)}</span></div>
      <div class="kv main">
        <span>所需数量 <b>${nfmt(p.cmpQty)} 个</b></span>
        <span>饼干成本 <b>${nfmt(p.cmpCost)}</b></span>
      </div>
      <div class="kv main">
        <span>饼干约需 <b>${nfmt(Math.floor(p.ckNeed || 0))}</b> 块</span>
        <span>全卖还需 <b>${p.days == null ? '—' : p.days + ' 天'}</b></span>
        <span class="warnb ${p.days > S.daysLeft ? 'yes' : 'no'}">${p.days > S.daysLeft ? S.daysLeft + ' 天时间不够' : '时间够'}</span>
      </div>
      <div class="ftrow"><button class="more" data-mid="${mid}">详情 ▾</button></div>
      <div class="det" id="det-${mid}" hidden>
        <div class="kv">
          <span>成本 <b>${nfmt(p.cost)}</b></span>
          <span>产出周期 <b>${p.grow} 分钟</b></span>
          <span>最低产量 <b>${nfmt(p.yield)}</b></span>
          <span>毛利率 <b>${pct(p.rateSale)}</b></span>
          <span>产物单价 <b>${nfmt(p.price)}</b></span>
          <span>精粹价 <b>${nfmt(p.essP)}</b></span>
          <span>树木价 <b>${nfmt(p.treeP)}</b></span>
        </div>
      </div>
    </div>`;
    }
    return `<div class="cmprow">
      <div class="cmpname">${p.name}${p.is12 ? ' <span class="b12t">1.2倍</span>' : ''}<span class="pf">${nfmt(p.cmpProfit)}</span></div>
      <div class="kv main">
        <span>总销售 <b>${nfmt(p.cmpSale)}</b></span>
        <span>总利润 <b>${nfmt(p.cmpProfit)}</b></span>
        <span>成本 <b>${nfmt(p.cmpCost)}</b></span>
        <span class="wide">所需数量 <b>${qtyExtra}</b></span>
      </div>
      <div class="kv main">${sched}<span class="warnb ${p.enough ? 'no' : 'yes'}">${p.enough ? '时间够' : S.daysLeft + ' 天时间不够'}</span></div>
      <div class="ftrow"><button class="more" data-mid="cmp-${p.name}">详情 ▾</button></div>
      <div class="det" id="det-cmp-${p.name}" hidden>
        <div class="kv">
          <span>成本/份 <b>${nfmt(p.cost)}</b></span>
          <span>成熟 <b>${p.grow}</b> 分钟</span>
          <span>最低产量 <b>${p.yield}</b></span>
          <span>毛利率 <b>${pct(p.rateSale)}</b></span>
          <span>产物单价 <b>${nfmt(p.price)}</b></span>
          <span>精粹价 <b>${nfmt(p.essP)}</b></span>
          <span>树木价 <b>${nfmt(p.treeP)}</b></span>
        </div>
      </div>
    </div>`;
  }

  function renderCmp() {
    const b12 = (S.b12 || []).filter(n => D.mat[n]);
    $('#cmp12').innerHTML = b12.length
      ? b12.map(n => cmpRow(C.calcProduce(S, n, true))).join('')
      : '';
    const man = S.cmpManual.filter(Boolean);
    $('#cmpMan').innerHTML = man.length
      ? man.map(n => cmpRow(C.calcProduce(S, n, false))).join('')
      : '';
  }

  /* ================= 家园页：钓鱼 ================= */
  const FISHES = Object.keys(D.fish);
  function renderFish() {
    $('#fishGrid').innerHTML = FISHES.map(f => `
      <div class="fishrow">
        <span class="fn">${f}</span>
        <button type="button" class="fsel sm" data-fish="${f}">${S.fishLv[f] || 5} 级</button>
        <span class="fy">当前产量 <b>${(C.fishYield(S, f) / 10).toFixed(1)} kg</b></span>
      </div>`).join('');
    $$('#fishGrid .fsel').forEach(el => el.onclick = () => {
      const f = el.dataset.fish;
      openBubblePick(el, [1, 2, 3, 4, 5].map(l => ({ v: l, label: l + ' 级' })),
        S.fishLv[f], v => { S.fishLv[f] = v; save(); renderFish(); calc(); });
    });
    const anyLow = FISHES.some(f => S.fishLv[f] < 5);
    $('#fishTip').textContent = anyLow
      ? '熟练度不满 5 时产量会下降；做饼干需要的鱼也会变多，成本随之上升。'
      : '';
  }

  /* ================= 动物页：好感度 · 实时收益 ================= */
  /* 好感度 ∈ {1,2,3}；产量 = 品质系数×好感度+基数（蓝 3E+27/棕 2E+18/白 E+9）；
   * 「1级解锁白/3级解锁棕/6级解锁蓝」是动物邀约等级的说明，与好感度无关 */
  /* 单只动物实时收益（每小时口径，随当前好感度/单价实时变化）：
   *   产出/h = anOne.y、能量/h = anOne.e（常规 60min/轮基准；悠食与饼干倍率对所有动物同乘，不计入）
   *   成本基准 = 能量饼干 10/能量（1000 币/100 能量，与社区基准表同口径；自制饼干更省，实际利润更高）
   *   利润/h = 产出/h × 单价(含甜品/等级/本周1.2) − 能量/h × 10
   * 用户 1 心基准表（利润率 33.3%~42.9%）在「1 心 + 基础价」下被本口径逐行复现 */
  function animalRate(a) {
    const one = C.anOne(S, a);                       // {y, e} 每轮（当前好感度）
    const price = C.is12(S, a.g) ? C.anPriceAC(S, a.g) : C.anPriceH(S, a.g);
    const costH = one.e * 10;                        // 能量饼干基准：10 币/能量
    const profitH = one.y * price - costH;
    return { profitH, rate: costH > 0 ? profitH / costH : 0 };
  }
  const QNAME = { 3: '蓝', 2: '棕', 1: '白' };
  function renderAnimals() {
    const off = S.anOff || [];
    let h = '';
    for (const g of C.AN_GROUPS) {
      const grp = C.anGroup(S, g);
      const cap = grp.group === '多宝石' || grp.group === '飞宝珠' ? '大动物' : '小动物';
      h += `<div class="angrp">
        <div class="angrph">${g} <span class="tag">${cap} · 参与生产 ${grp.count} 只</span></div>`;
      for (const q of [3, 2, 1]) {
        const list = D.an.filter(a => a.g === g && a.q === q);
        if (!list.length) continue;
        const act = list.filter(a => off.indexOf(a.n) < 0);          // 参与候选（未灰显）
        const part = list.filter(a => grp.used.indexOf(a.n) >= 0);   // 实际参与生产
        /* 同档内全部活跃动物毛利率一致 → 收进节头（同档数据同构，逐行显示是冗余）；
         * 好感度不同导致毛利率不同时 → 回退为逐行显示 */
        let headRate = null;
        if (act.length) {
          const k0 = animalRate(act[0]);
          const key = a => { const r = animalRate(a); return r.profitH + '|' + r.rate.toFixed(4); };
          if (act.every(a => key(a) === key(act[0]))) headRate = k0;
        }
        h += `<div class="qhead"><span class="qdot q${q}"></span>` +
          `<span class="ql">${QNAME[q]}品质 · ${list.length} 只 · 参与 ${part.length}</span>` +
          (headRate ? `<span class="qrate">+${nfmt(headRate.profitH)}/h · ${(headRate.rate * 100).toFixed(1)}%</span>` : '') +
          `</div><div class="anlist">` +
          list.map(a => {
            const aff = C.anAffOf(S, a.n);
            const isOff = off.indexOf(a.n) >= 0;
            const inUse = grp.used.indexOf(a.n) >= 0;
            return `<div class="anrow${inUse ? ' inuse' : ''}${isOff ? ' off' : ''}">
              <span class="ann" data-toggle="${a.n}" title="点击切换 排除 / 参与">${a.n}</span>
              <span class="aff" data-aff="${a.n}" title="点击选择心数">${isOff ? '排除' : aff + ' 心'}</span>
            </div>`;
          }).join('') + '</div>';
      }
      h += '</div>';
    }
    $('#anGroups').innerHTML = h;
    $$('#anGroups .fsel').forEach(el => el.onclick = () => {
      const a = el.dataset.an;
      openBubblePick(el, [1, 2, 3].map(l => ({ v: l, label: l + ' 心' })),
        C.anAffOf(S, a), v => { S.anAff[a] = v; save(); renderAnimals(); renderAnCount(); calc(); });
    });
    // 左（名字）：切换「排除 / 参与」
    $$('#anGroups .ann').forEach(el => el.onclick = () => {
      const n = el.dataset.toggle;
      const i = S.anOff.indexOf(n);
      if (i >= 0) S.anOff.splice(i, 1); else S.anOff.push(n);
      save(); renderAnimals(); renderAnCount(); calc();
    });
    // 右（心数）：弹层选心数；排除中的动物选了心数 = 恢复参与
    $$('#anGroups .aff').forEach(el => el.onclick = () => {
      const n = el.dataset.aff;
      openBubblePick(el, [1, 2, 3].map(l => ({ v: l, label: l + ' 心' })),
        C.anAffOf(S, n), v => {
          S.anAff[n] = v;
          const i = S.anOff.indexOf(n); if (i >= 0) S.anOff.splice(i, 1);
          save(); renderAnimals(); renderAnCount(); calc();
        });
    });
  }

  /* ================= 家园页：动物数量 ================= */
  function renderAnCount() {
    const caps = C.anCaps(S);
    let smallSum = 0, bigSum = 0;
    C.AN_GROUPS.forEach(g => {
      const v = S.anCount[g] || 0;
      if (g === '多宝石' || g === '飞宝珠') bigSum += v; else smallSum += v;
    });
    const CROW_DOT = { '缤纷珠': 'hm', '嫩叶石': 'ft', '轻羽石': 'pd', '多宝石': 'b12', '飞宝珠': 'wk' };
    const tile = g => {
      const grp = C.anGroup(S, g);
      return `<div class="tile">
        <div class="thead"><span class="cdot dot ${CROW_DOT[g]}"></span><span class="cn">${g}</span><span class="cap">/${grp.all}</span></div>
        <div class="tin"><input type="number" inputmode="numeric" min="0" max="14" data-anc="${g}" value="${S.anCount[g] || 0}"></div>
      </div>`;
    };
    /* 分组头（小动物/大动物）置于对应 tile 排之上；数量 X/7 靠右，超限红字 */
    const capline = (txt, dotCls, used, capV) =>
      `<div class="qhead capline"><span class="qdot ${dotCls}"></span><span class="ql">${txt}</span>` +
      `<span class="qnum${used > capV ? ' over' : ''}">${used}/${capV}</span></div>`;
    $('#anCount').innerHTML =
      capline('小动物', 'hm', smallSum, caps.small) +
      '<div class="tiles">' + ['缤纷珠', '嫩叶石', '轻羽石'].map(tile).join('') + '</div>' +
      capline('大动物', 'b12', bigSum, caps.big) +
      '<div class="tiles two">' + ['多宝石', '飞宝珠'].map(tile).join('') + '</div>';
    $$('#anCount input').forEach(el => {
      el.addEventListener('input', () => {
        S.anCount[el.dataset.anc] = Math.max(0, +el.value || 0);
        save(); updateAnCap(); calc();   // 只更新数字与提示，不重建输入框（保住输入焦点）
      });
      makeStp(el, { min: 0, max: 14 });
    });
    updateAnCap();
  }

  /* 容量数字与超限提示：只标红提示，不拦截输入 */
  function updateAnCap() {
    const caps = C.anCaps(S);
    let smallSum = 0, bigSum = 0;
    C.AN_GROUPS.forEach(g => {
      const v = S.anCount[g] || 0;
      if (g === '多宝石' || g === '飞宝珠') bigSum += v; else smallSum += v;
    });
    const qn = document.querySelectorAll('#anCount .qnum');
    if (qn[0]) { qn[0].textContent = smallSum + '/' + caps.small; qn[0].classList.toggle('over', smallSum > caps.small); }
    if (qn[1]) { qn[1].textContent = bigSum + '/' + caps.big; qn[1].classList.toggle('over', bigSum > caps.big); }
    const warn = smallSum > caps.small || bigSum > caps.big;
    const tip = document.getElementById('anCapTip');
    tip.innerHTML = warn ? '<b style="color:#c25b5b">超出可养数量，请减少</b>' : '';
    tip.hidden = !warn;                     // 只在超限时显示红警；邀约说明收进右上角 ⓘ
    const sum = document.getElementById('anCountSum');
    if (sum) {                              // 折叠态卡头概要：总用量/总上限
      sum.textContent = (smallSum + bigSum) + '/' + (caps.small + caps.big);
      sum.classList.toggle('over', warn);
    }
    const lv = document.getElementById('capLv');
    if (lv) lv.textContent = S.lvAnimal;
  }

  /* ================= 家园页：投喂饼干 ================= */
  const CK_NAMES = D.ck.map(c => c.n);
  function renderCkSlots() {
    $('#ckSlots').innerHTML = S.ckSlots.map((sl, i) => `
      <div class="ckrow">
        <button type="button" class="fsel grow" data-ck="${i}">${sl.n}</button>
        <input type="number" inputmode="numeric" min="0" data-ckq="${i}" value="${sl.q}">
        <span class="fy">个</span>
      </div>`).join('');
    $$('#ckSlots .fsel').forEach(el => el.onclick = () => {
      const i = +el.dataset.ck;
      openBubblePick(el, CK_NAMES.map(n => ({ v: n, label: n })), S.ckSlots[i].n,
        v => { S.ckSlots[i].n = v; save(); renderCkSlots(); renderCk(); calc(); });
    });
    $$('#ckSlots input').forEach(el => {
      el.addEventListener('input', () => {
        S.ckSlots[+el.dataset.ckq].q = Math.max(0, +el.value || 0);
        save(); renderCk(); calc();
      });
      makeStp(el, { min: 0 });
    });
  }

  function renderCk() {
    const r = C.calcBiscuit(S);
    let h = '';
    if (!r.hasSlot1) {
      h = emptyGo('先选一种饼干并填数量', '去选择', '#ckSlots');
      $('#ckOut').innerHTML = h;
      return;
    }
    if (r.energyPerRound <= 0) {
      h = emptyGo('还没有选择要养的动物', '去选择', '#anCount');
      $('#ckOut').innerHTML = h;
      return;
    }
    // 提示
    if (r.overHint) h += '<p class="tip" style="color:#c25b5b">当前售卖会超出上限，饼干可能喂多了</p>';
    else if (r.lessHint) h += '<p class="tip" style="color:#c25b5b">当前售卖的有点少，动物产出不够</p>';
    if (r.timeHint) h += `<p class="tip" style="color:#c25b5b">注意：当前吃饭时间超出 ${r.daysLeft} 天了，可以增加动物数量</p>`;

    h += '<div class="kv"><span>当前总售卖价格 <b>' + nfmt(r.totalSale) + '</b></span>' +
         '<span>当前总利润 <b>' + nfmt(r.totalProfit) + '</b></span></div>';
    h += '<div class="kv" style="margin-top:4px"><span>饼干吃完所需时间 <b>' + dayTxt(r.hours) + '</b></span>' +
         '<span>总轮次 <b>' + (Math.round(r.roundsTotal * 100) / 100) + '</b></span></div>';
    h += '<div class="kv" style="margin-top:4px"><span>饼干总成本 <b>' + nfmt(r.ckCost) + '</b></span>' +
         '<span>额外产物售卖 <b>' + nfmt(r.extraSale) + '</b></span></div>';
    h += '<div class="kv" style="margin-top:4px"><span>总毛利率 <b>' + pct(r.rateSale) + '</b></span></div>';

    // 各材料明细
    h += '<div class="grp" style="margin-top:10px">各动物材料明细</div>';
    r.groups.forEach((g, gi) => {
      if (g.count <= 0) return;
      /* 参与数写材料名右侧，具体名单点击折叠展开 */
      h += `<div class="sellrow"><span class="sn">${g.group}<button type="button" class="useTgl" data-u="${gi}">${g.count} 只</button></span>
        <span class="sq">×${nfmt(Math.floor(g.qty))} · 单价 ${nfmt(g.price)} · 单轮 ${nfmt(g.yield)}</span>
        <span class="sp">${nfmt(g.sale)}</span></div>`;
      h += `<div class="ckmats" data-ul="${gi}" hidden>${g.used.join('、')}</div>`;
    });

    // 饼干材料成本明细
    h += '<div class="grp" style="margin-top:10px">饼干用料</div>';
    r.slots.forEach(sl => {
      h += `<div class="sellrow"><span class="sn">${sl.name}</span>
        <span class="sq">×${nfmt(sl.q)} · 能量 ${nfmt(sl.energy)} · 倍率 ${sl.mult}</span>
        <span class="sp">${nfmt(sl.cost)}</span></div>`;
      /* 需要的原材料（含季节甜味材料） */
      const mats = (sl.mats || []).map(m => m.name);
      if (mats.length) h += `<div class="ckmats">需要：${mats.join(' · ')}</div>`;
    });
    if (r.extrasOut.length) {
      h += '<div class="grp" style="margin-top:6px">制作饼干产出的额外产物</div>';
      r.extrasOut.forEach(x => {
        h += `<div class="sellrow"><span class="sn">${x.name}</span>
          <span class="sq">×${nfmt(x.n)} · 单价 ${nfmt(x.price)}</span>
          <span class="sp">${nfmt(x.n * x.price)}</span></div>`;
      });
    }
    $('#ckOut').innerHTML = h;
  }

  /* ================= 查询页 ================= */
  let qMode = 'fur';
  /* ================= 查询页 =================
   * 口径：
   *  · 家具：材料 5 组明细（成本/数量/单个售价/最低产量/精粹/树木/最多成本/总售价）
   *    + 所有材料成本(B5=Σ最多成本) / 所有材料售卖(C5=Σ总售价) / 1个家具售卖(D5)
   *    + 卖材料利润(C7=C5−B5) / 卖家具利润(D7=D5×产量+精粹树−B5) / 要不要做家具卖(B7)
   *    + 2 个毛利率（材料毛利率 / 家具毛利率，分母均为各自总售价）
   *  · 作物/鱼：最低产量/成熟/成本 + 产物单价·单份售价·单份利润·收益率 的 当前/7级/9级 三档
   *  · 烹饪：材料总成本(Σ成本/产出) + 调味剂90 + 售价/利润/收益率 的 普通·美味 × 当前/7级/9级
   *  · 材料价格：单价/精粹/树/成本
   * 说明：本地倍率单元格均为静态 1，应用按全局甜品倍率计算；
   *   卖精粹/卖树/1.2倍 用全局开关而非本地开关。 */
  function renderQuery() {
    const q = $('#qFind').value.trim();
    let html = '';
    /* 三档指标表：固定三档（1级/7级/9级），行 = 指标；act = 当前生效档列（表头浅粉底高亮）
     * rows 元素：[标签, 三档数组, 'n'|'p', 可选行类 hot(核心)/dim(副产)]；字符串元素 = 组头（烹饪 普通/美味） */
    const tierTable = (rows, act) => {
      const th = '<thead><tr><th></th>' + ['1级', '7级', '9级'].map((t, i) =>
        `<th${i === act ? ' class="act"' : ''}>${t}</th>`).join('') + '</tr></thead>';
      const body = rows.map(rw => {
        if (typeof rw === 'string') return `<tr class="grp"><td colspan="4"><div class="grow">${rw}</div></td></tr>`;
        const [lab, arr, f, cls] = rw;
        return `<tr${cls ? ` class="${cls}"` : ''}><td>${lab}</td>` +
          arr.map((v, i) => `<td${i === act ? ' class="act"' : ''}>${v == null ? '—' : f === 'p' ? pct(v) : nf2(v)}</td>`).join('') + '</tr>';
      }).join('');
      return `<div class="t3wrap"><table class="t3">${th}<tbody>${body}</tbody></table></div>`;
    };
    /* 当前档从「随等级浮动的 tiers[0]」与固定档的值相等性推导：=9级值 → 高亮 9 级列；=7级值 → 高亮 7 级列；都不等（<7级）→ 高亮 1 级列 */
    const actTier = ts => {
      const keys = ['price', 'sale', 'profit', 'rateCost', 'rateSale'];
      const eq = (x, y) => keys.every(k => x[k] === y[k]);
      if (eq(ts[0], ts[2])) return 2;
      if (eq(ts[0], ts[1])) return 1;
      return 0;
    };
    if (qMode === 'fur') {
      const list = D.fur.filter(f => !q || f.n.indexOf(q) >= 0).slice(0, 40);
      html = list.map(f => {
        const r = C.calcFurniture(S, f, false);
        const rows = f.m.map(g => {
          const gr = C.furMat(S, g);
          const isDyn = gr.m.kind === '动物' || gr.m.kind === '鱼';
          const costShow = isDyn ? gr.m.cost : (g[5] || 0);   // 动物/鱼为 VLOOKUP 动态成本
          // 永驻林野展示箱：N/P/R/T/V 均为手改静态 0 → 材料经济列全 0
          const z0 = !!f.mz;
          const price = z0 ? 0 : gr.price, unit = z0 ? 0 : gr.unit;
          const essP = z0 ? 0 : gr.m.essP, treeP = z0 ? 0 : gr.m.treeP;
          const maxCost = z0 ? 0 : gr.cost;
          const totalSale = z0 ? 0 : gr.qty * gr.price
            + (S.sellEss ? gr.essQ * gr.m.essP : 0)
            + (S.sellTree ? gr.treeQ * gr.m.treeP : 0);       // 总售价列
          return `<tr>
            <td>${gr.name}</td><td>${nf2(costShow)}</td><td>${nf2(gr.qty)}</td>
            <td>${nf2(price)}</td><td>${nf2(unit)}</td>
            <td>${nf2(gr.essQ)}</td><td>${nf2(essP)}</td>
            <td>${nf2(gr.treeQ)}</td><td>${nf2(treeP)}</td>
            <td>${nf2(maxCost)}</td><td>${nf2(totalSale)}</td>
          </tr>`;
        }).join('');
        /* ---- sheet3 汇总口径 ---- */
        const allCost = r.cost;                              // B5 = Σ最多成本
        const allSale = r.matSale + r.essPg + r.treePg;      // C5 = Σ总售价
        const d5 = r.unsellable ? null : r.sell;             // D5 1个家具售卖
        const extraPg = r.essPg + r.treePg;                  // 精粹+树（sheet3 D7 口径，不受 z 影响）
        const d7 = r.unsellable ? null : d5 * (f.y || 1) + extraPg - allCost;
        const c7 = allSale - allCost;                        // C7 卖所有材料的利润
        const better = r.unsellable ? true : d7 > c7;        // B7 = IF(D7>C7,"要","不要")
        const d11Base = r.unsellable ? null : d5 + extraPg;  // D11 分母（不含家具产量）
        return `<div class="qr">
          <div class="qn">${f.n} <span class="src" style="font-size:0.6875rem;color:#8a7580">${f.s || '-'}</span></div>
          <div class="qm">
            <div class="kv">
              <span>制作 <b>${f.t} 分钟</b></span>
              <span>家具产量 <b>${f.y || 1}</b></span>
              <span>基础价 <b>${typeof f.p === 'number' ? nfmt(f.p) : '无法售卖'}</b></span>
              <span>直购 <b>${f.b ? nfmt(f.b) : '—'}</b></span>
              <span>1个家具售卖 <b>${r.unsellable ? '无法售卖' : nfmt(d5)}</b></span>
              <span>所有材料成本 <b>${nf2(allCost)}</b></span>
              <span>所有材料售卖 <b>${nf2(allSale)}</b></span>
              <span>卖所有材料的利润 <b>${nf2(c7)}</b></span>
              <span>卖家具的利润(含产量) <b>${r.unsellable ? '无法售卖' : nfmt(d7)}</b></span>
              <span>材料毛利率 <b>${pct(allSale > 0 ? c7 / allSale : null)}</b></span>
              <span>家具毛利率 <b>${pct(!r.unsellable && d11Base > 0 ? d7 / d11Base : null)}</b></span>
              <span class="wide">${better ? '<span class="warnb no">做家具卖更赚</span>' : '<span class="warnb yes">直接卖材料更赚</span>'}</span>
            </div>
          </div>
          <div class="mtwrap"><table class="mtab"><thead><tr>
            <th>材料</th><th>成本</th><th>数量</th><th>单价</th><th>最低产量</th>
            <th>精粹数</th><th>精粹单价</th><th>树木数</th><th>树木单价</th>
            <th>最多成本</th><th>总售价</th>
          </tr></thead><tbody>${rows}</tbody></table></div>
        </div>`;
      }).join('') || '<div class="empty">无匹配</div>';
    } else if (qMode === 'plant' || qMode === 'fish' || qMode === 'star') {
      /* 植物/鱼/陨星查询：标量紧凑行 + 副产条件显示（鱼只精粹、陨星无副产、陨星无成熟）+ 三档决策表
       * 隐藏产物（如瑰霞双色杯杯香）不打单独行，而是在其自身条目旁打「隐藏+类别」标签 */
      const KIND_Q = { plant: ['作物', '植物'], fish: ['鱼', '鱼'], star: ['陨星', '陨星'] };
      const hiddenNames = new Set(Object.values(D.hidden).filter(h => h && h[0] !== '无').map(h => h[0]));
      /* 田类型（用户口径）：小田=杯杯香/迷迭枝/铃铃草/蓬蓬兰/甜甜根/团团花；中田=爆爆辣/香茗茶/叮当果；大田=织云果 */
      const FIELD = [
        ['小田', /杯杯香|迷迭枝|铃铃草|蓬蓬兰|甜甜根|团团花/],
        ['中田', /爆爆辣|香茗茶|叮当果/],
        ['大田', /织云果/],
      ];
      const fieldOf = n => (FIELD.find(([t, re]) => re.test(n)) || [null])[0];
      const list = produceList.filter(n => D.mat[n][9] === KIND_Q[qMode][0] && (!q || n.indexOf(q) >= 0)).slice(0, 80);
      html = list.map(n => {
        const pt = C.prodTiers(S, n);
        const disp = hiddenNames.has(n) ? '隐藏' + KIND_Q[qMode][1] : KIND_Q[qMode][1];
        const fld = fieldOf(n);
        const qnHead = n + (fld ? ` <span class="ftag">${fld}</span>` : '') + ` <span class="src" style="font-size:0.6875rem;color:#8a7580">${disp}</span>`;
        if (pt.locked) {
          return `<div class="qr"><div class="qn">${qnHead}</div>
            <div class="qm"><span class="warnb yes">能力等级不足，还没解锁</span></div></div>`;
        }
        const base = pt.base, b = pt.tiers[1], c = pt.tiers[2];
        const essBase = D.mat[n][5] || 0, treeBase = D.mat[n][4] || 0;
        const rows3 = [
          ['产物单价', [base.price, b.price, c.price], 'n'],
          ['单份售价', [base.sale, b.sale, c.sale], 'n'],
          ['单份利润', [base.profit, b.profit, c.profit], 'n'],
          ['毛利率', [base.rateSale, b.rateSale, c.rateSale], 'p'],
        ];
        if (essBase) rows3.push(['精粹单价', [base.essP, b.essP, c.essP], 'n', 'dim']);
        if (treeBase) rows3.push(['树木单价', [base.treeP, b.treeP, c.treeP], 'n', 'dim']);
        const extras =
          (essBase ? `<span>精粹产量 <b>${nf2(essBase)}</b></span>` : '') +
          (treeBase ? `<span>树木产量 <b>${nf2(treeBase)}</b></span>` : '');
        return `<div class="qr"><div class="qn">${qnHead}</div>
          <div class="qm">
            <div class="kv three">
              <span>最低产量 <b>${nf2(pt.y)}</b></span>
              <span>成本 <b>${nf2(pt.cost)}</b></span>
              ${qMode === 'star' ? '' : `<span>成熟 <b>${pt.grow} 分钟</b></span>`}
              ${extras}
            </div>
            ${tierTable(rows3, actTier(pt.tiers))}
          </div></div>`;
      }).join('') || '<div class="empty">无匹配</div>';
    } else if (qMode === 'food') {
      /* 烹饪查询：标量速览 + 普通/美味 分组三档表 + 材料表 */
      const list = D.food.filter(f => !q || f.n.indexOf(q) >= 0).slice(0, 60);
      html = list.map(f => {
        const r = C.calcFood(S, f);
        const matRows = r.mats.map(m =>
          `<tr><td>${m.name}</td><td>${nf2(m.cost)}</td><td>${nf2(m.y)}</td><td>${nf2(m.c)}</td></tr>`).join('');
        const unsell = r.unsell;
        const rows3 = unsell ? [] : [
          `普通<span class="gseg">${f.eff}</span><span class="gseg">持续 ${f.dur} 小时</span>`,
          ['售价', r.price, 'n'],
          ['利润', r.profit, 'n'],
          ['毛利率', r.rateS, 'p'],
          `美味<span class="gseg">${f.effD}</span><span class="gseg">持续 ${f.dur2} 小时</span>`,
          ['售价', r.priceD, 'n'],
          ['利润', r.profitD, 'n'],
          ['毛利率', r.rateSD, 'p'],
        ];
        return `<div class="qr">
          <div class="qn">${f.n}${r.q === '无' ? '' : ` <span class="src" style="font-size:0.6875rem;color:#8a7580">${r.q} · 调料 90</span>`}</div>
          <div class="qm">
            <div class="kv">
              <span>材料成本 <b>${nf2(r.P)}</b></span>
              <span>含调料总成本 <b>${nf2(r.total)}</b></span>
              <span>当前售价 <b>${unsell ? '无法售卖' : nfmt(r.cur)}</b></span>
              <span>利润 <b>${unsell ? '无法售卖' : nfmt(r.curProfit)}</b></span>
              <span>毛利率 <b>${pct(r.curRateS)}</b></span>
            </div>
            ${unsell ? '<div class="kv" style="margin-top:7px"><span class="wide"><span class="warnb no">无法售卖</span></span></div>' : tierTable(rows3, (S.lvCook || 0) >= 9 ? 2 : (S.lvCook || 0) >= 7 ? 1 : 0)}
          </div>
          <div class="mtwrap"><table class="mtab"><thead><tr>
            <th>材料</th><th>成本</th><th>产出</th><th>单位成本</th>
          </tr></thead><tbody>${matRows || '<tr><td colspan="4" style="text-align:center;color:#8a7580">无材料</td></tr>'}</tbody></table></div>
        </div>`;
      }).join('') || '<div class="empty">无匹配</div>';
    } else {
      /* 其他：定价物（盐/酸等调料）+ 动物——烹饪成品（奶昔/饼，属烹饪模式）与可产出物（精粹/树已在产物三档表）排除 */
      const foodNames = new Set(D.food.map(f => f.n));
      const keys = Object.keys(D.mat)
        .filter(k => (D.mat[k][9] === '定价' || D.mat[k][9] === '动物') && !foodNames.has(k) && (!q || k.indexOf(q) >= 0))
        .slice(0, 80);
      html = keys.map(k => {
        const m = C.matOf(S, k);
        const essBase = D.mat[k][5] || 0, treeBase = D.mat[k][4] || 0;
        return `<div class="qr"><div class="qn">${k} <span class="src" style="font-size:0.6875rem;color:#8a7580">${D.mat[k][9]}</span></div>
          <div class="qm"><div class="kv three">
            <span>单价 <b>${nfmt(m.price)}</b></span>
            <span>成本 <b>${nfmt(D.mat[k][1])}</b></span>
            ${essBase ? `<span>精粹 <b>${nfmt(m.essP)}</b></span>` : ''}
            ${treeBase ? `<span>树 <b>${nfmt(m.treeP)}</b></span>` : ''}
          </div></div></div>`;
      }).join('') || '<div class="empty">无匹配</div>';
    }
    $('#qOut').innerHTML = html;
  }


  /* ================= 卖整模块（blog 凑整逻辑） =================
   * 勾选式选择：本周 1.2 倍直接勾选 → 相应精粹自动带出 → 可补其他产物/精粹/树木/家具；
   * 下方按凑整逻辑（core.sellSolveN：DP 背包，支持多种产物与每产物数量上限）自动算每种卖多少个。
   * sellCfg：{ b12off: 本周不卖的1.2倍物品, essOn: 手动勾选的精粹,
   *            essOff: 排除的精粹, pick: 手动添加的产物/家具名, caps: { 名称: 数量上限 } }
   * 精粹只随本周 1.2 倍产物自动带出（选了 1.2 倍才出现相应精粹），无"全部精粹"总开关 */
  let pickAddOpen = false;                             // 全屏选择弹层开关
  let sheetMode = 'multi', sheetSlot = null, sheetMat = '';  // multi=卖整添加 / single=槽位单选 / mat=材料筛选
  let pickQ = '', pickGrp = 'all', pickSort = 'def';   // 弹层内搜索 / 分组 / 排序
  let sheetRowsCache = [], sheetRaf = 0, sheetTimer = 0;
  let altIdx = 0, altList = null, altKey = '';          // 其他解法缓存
  const onPickQInput = debounce(() => { pickQ = $('#fPickAdd').value; renderSheetList(false); }, 160);
  /* 上限输入的防抖重算：只重算方案卡片，不重建勾选列表（保持输入焦点） */
  const fitRefresh = debounce(() => {
    if ($('#page-sell').hidden) return;
    renderFit(sellPool(), Math.max(0, S.weekCap - S.weekSold));
  }, 250);
  /* 数量上限输入框（留空 = 不限；输入即存档并防抖重算下方方案） */
  const capInput = n => '<input class="capin" type="number" inputmode="numeric" min="1" placeholder="∞" data-cap="' + n + '"' +
    (sellCfg.caps[n] >= 1 ? ' value="' + sellCfg.caps[n] + '"' : '') + '>';

  /* 全部可卖名录：产物/动物/精粹/树木/家具（单价含当前参数与本周 1.2 倍） */
  function sellCatalog() {
    const out = [];
    const addProd = n => {
      const p = C.calcProduce(S, n, C.is12(S, n));
      if (p && p.price > 0) out.push({ name: n, group: 'prod', price: p.price });
    };
    C.allProduce().forEach(addProd);
    Object.keys(D.mat).filter(k => D.mat[k][9] === '动物').forEach(addProd);
    /* 精粹/树木排序参考产物（精粹名 = 产物名+"精粹"；树木名映射回产物名后按产物序列排序） */
    Object.keys(D.mat).filter(k => D.mat[k][9] === '精粹')
      .sort((a, b) => prodIdx(a.replace(/精粹$/, '')) - prodIdx(b.replace(/精粹$/, '')))
      .forEach(n => {
        const p = C.matOf(S, n).price;
        if (p > 0) out.push({ name: n, group: 'ess', price: p });
      });
    Object.keys(D.mat).filter(k => D.mat[k][9] === '树木')
      .sort((a, b) => prodIdx(treeProdName(a)) - prodIdx(treeProdName(b)))
      .forEach(n => {
        const p = C.matOf(S, n).price;
        if (p > 0) out.push({ name: n, group: 'tree', price: p });
      });
    D.fur.slice().sort((a, b) => a.n.localeCompare(b.n, 'zh')).forEach(f => {   // 家具按拼音排序
      const s = C.calcFurniture(S, f, C.is12(S, f.n));
      if (s && s.sell > 0) out.push({ name: f.n, group: 'fur', price: s.sell });
    });
    return out;
  }

  /* 本周 1.2 倍物品（名称 + 分组 + 含 1.2 的单价） */
  function b12Items() {
    const out = [];
    const push = (n, g) => {
      if (!n) return;
      let price = 0;
      if (g === 'fur') {
        const f = D.fur.find(x => x.n === n);
        if (f) price = (C.calcFurniture(S, f, true) || {}).sell || 0;
      } else {
        const p = C.calcProduce(S, n, true);
        price = p ? p.price : 0;
      }
      if (price > 0) out.push({ name: n, group: g, price, is12: true });
    };
    (S.b12 || []).forEach(n => push(n, D.fur.some(f => f.n === n) ? 'fur' : 'prod'));
    return out;
  }

  /* 1.2 倍产物对应的精粹（"相应精粹自动带出"；家具无对应精粹） */
  function autoEssNames() {
    const out = [];
    b12Items().forEach(x => {
      if (x.group === 'fur' || sellCfg.b12off.indexOf(x.name) >= 0) return;
      const e = x.name + '精粹';
      if (D.mat[e]) out.push(e);
    });
    return out;
  }
  /* 精粹是否参与出售：仅本周 1.2 倍产物自动带出的相应精粹，再减去排除项
   * v2.10 口径：精粹不再允许手动勾选，旧档 essOn 残留会被 loadSellCfg 自动清理 */
  function essIncluded(n) {
    if (sellCfg.essOff.indexOf(n) >= 0) return false;
    return autoEssNames().indexOf(n) >= 0;
  }

  /* 参与凑整的池子（去重）：1.2 勾选 + 精粹 + 手动添加 */
  function sellPool() {
    const byName = {}; sellCatalog().forEach(x => byName[x.name] = x);
    const pool = [], seen = {};
    const push = it => {
      if (!it || !(it.price > 0) || seen[it.name]) return;
      seen[it.name] = 1;
      const cap = sellCfg.caps[it.name];          // 数量上限（库存不够时用），随池子进求解器
      if (cap >= 1) it.cap = cap;
      pool.push(it);
    };
    b12Items().forEach(x => { if (sellCfg.b12off.indexOf(x.name) < 0) push(x); });
    Object.keys(D.mat).filter(k => D.mat[k][9] === '精粹')
      .sort((a, b) => prodIdx(a.replace(/精粹$/, '')) - prodIdx(b.replace(/精粹$/, '')))
      .forEach(n => {
        if (essIncluded(n)) push({ name: n, group: 'ess', price: C.matOf(S, n).price });
      });
    sellCfg.pick.forEach(n => push(byName[n]));
    return pool.filter(Boolean);
  }

  /* ---------- 出售勾选卡片 ---------- */
  function renderPick(pool) {
    const h = [];
    const byName = {}; pool.forEach(x => byName[x.name] = x);
    // 本周 1.2 倍
    const b12s = b12Items();
    h.push('<div class="pickhd">本周 1.2 倍' + (b12s.length ? '' : '（未设置）') + '</div>');
    if (!b12s.length) {
      h.push('<div class="empty">本周还没设置 1.2 倍物品<div style="margin-top:8px"><button class="btn" id="btnSetB12">去设置</button></div></div>');
    }
    b12s.forEach(it => {
      const on = sellCfg.b12off.indexOf(it.name) < 0;
      h.push('<div class="prirow"><label class="prilab"><input type="checkbox" data-b12="' + it.name + '"' + (on ? ' checked' : '') + '>' +
        '<span class="pn">' + it.name + ' <span class="b12t">1.2倍</span></span></label>' +
        '<span class="pp">' + nfmt(it.price) + '</span>' + capInput(it.name) + '</div>');
    });
    // 相应精粹（自动带出）：选了 1.2 倍产物才出现，可逐项取消勾选（排除）
    const auto = autoEssNames();
    if (auto.length) {
      h.push('<div class="pickhd">相应精粹（自动带出）</div>');
      auto.forEach(n => {
        const on = essIncluded(n);
        h.push('<div class="prirow"><label class="prilab"><input type="checkbox" data-ess="' + n + '"' + (on ? ' checked' : '') + '>' +
          '<span class="pn">' + n + ' <span class="b12t auto">自动</span></span></label>' +
          '<span class="pp">' + nfmt(C.matOf(S, n).price) + '</span>' + capInput(n) + '</div>');
      });
    }
    // 手动添加的产物/家具
    if (sellCfg.pick.length) {
      h.push('<div class="pickhd">手动添加</div>');
      sellCfg.pick.forEach(n => {
        const it = byName[n];
        h.push('<div class="prirow"><span class="pn">' + n + '</span>' +
          '<span class="pp">' + (it ? nfmt(it.price) : '已失效') + '</span>' +
          (it ? capInput(n) : '') +
          '<span class="rm" data-unpick="' + n + '">×</span></div>');
      });
    }
    $('#pickList').innerHTML = h.join('');
    $('#pickTag').textContent = '已选 ' + pool.length + ' 种';
    const sb = document.getElementById('btnSetB12');
    if (sb) sb.onclick = () => openPickSheet('b12');
    // 事件
    $$('#pickList [data-b12]').forEach(el => el.onchange = () => {
      const n = el.dataset.b12;
      if (el.checked) sellCfg.b12off = sellCfg.b12off.filter(x => x !== n);
      else if (sellCfg.b12off.indexOf(n) < 0) sellCfg.b12off.push(n);
      saveSellCfg(); renderSell();
    });
    $$('#pickList [data-ess]').forEach(el => el.onchange = () => {
      const n = el.dataset.ess;
      if (essIncluded(n)) {
        if (sellCfg.essOff.indexOf(n) < 0) sellCfg.essOff.push(n);
      } else {
        sellCfg.essOff = sellCfg.essOff.filter(x => x !== n);
      }
      saveSellCfg(); renderSell();
    });
    $$('#pickList [data-unpick]').forEach(el => el.onclick = () => {
      sellCfg.pick = sellCfg.pick.filter(x => x !== el.dataset.unpick);
      saveSellCfg(); renderSell();
    });
    $$('#pickList [data-cap]').forEach(el => el.oninput = () => {
      const n = el.dataset.cap, v = parseInt(el.value, 10);
      if (v >= 1) sellCfg.caps[n] = v; else delete sellCfg.caps[n];   // 留空/0 = 不限
      saveSellCfg();
      fitRefresh();   // 只重算方案，不重建本列表（保持输入焦点）
    });
  }

  /* ================= 全屏选择弹层 =================
   * multi：卖整·手动添加（分组/排序/搜索，点行勾选，底部完成）
   * single：本周 1.2 倍槽位 / 对比表槽位（固定类别，点行即选并关闭；清除用槽位卡 ×）
   * mat：材料筛选·想用掉/要避开（无价格，点行即勾入对应数组，两侧互斥自动迁移）
   * 列表虚拟滚动（只渲染可视区 ±6 行，988 项也不卡）；搜索支持名称与拼音首字母
   * （拼音用 localeCompare zh 边界法免字典，环境不支持时自动降级为仅名称搜索） */
  const ROW_H = 44, ROW_OVS = 6;
  /* 上次渲染的可视行范围：滚动时范围没变就不重建行 DOM，
     否则拖滚动条每一像素都整表替换，会产生肉眼可见的抖动 */
  let sheetRangeKey = '';
  function sheetRange() {
    const sc = $('#sheetList');
    const n = sheetRowsCache.length;
    const st = sc.scrollTop, vh = sc.clientHeight || 480;
    const start = Math.max(0, Math.floor(st / ROW_H) - ROW_OVS);
    const end = Math.min(n, Math.ceil((st + vh) / ROW_H) + ROW_OVS);
    return start + '|' + end + '|' + n;
  }

  /* 拼音首字母：A-Z 各取一个锚字，字符与锚字按 zh 序比较取最后一个 ≤ 它的锚 */
  const PY_ANCHORS = '啊芭擦搭蛾发噶哈击喀垃呣拿哦啪期然撒塌挖昔压匝';
  const PY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z'];
  const PY_OK = (() => {
    try { return '中'.localeCompare('啊', 'zh') > 0 && '八'.localeCompare('啊', 'zh') > 0; }
    catch (e) { return false; }
  })();
  const pyCache = {};
  function pyOf(name) {
    if (!PY_OK) return '';
    if (pyCache[name]) return pyCache[name];
    let s = '';
    for (const ch of name) {
      if (/[a-z0-9]/i.test(ch)) { s += ch.toUpperCase(); continue; }
      let c = '';
      for (let i = 0; i < PY_ANCHORS.length; i++) {
        if (ch.localeCompare(PY_ANCHORS[i], 'zh') >= 0) c = PY_LETTERS[i]; else break;
      }
      s += c;
    }
    pyCache[name] = s;
    return s;
  }

  /* 目录缓存：S 一变（save()）即失效，避免搜索每次重算 895 件家具 */
  let catCache = null, slotCache = null;
  /* 产物细分页签：作物=植物 / 鱼 / 陨星=星 / 动物 */
  const SUBCAT = { '作物': 'crop', '鱼': 'fish', '陨星': 'meteor', '动物': 'animal' };
  function getCatalog() {
    if (!catCache) {
      catCache = sellCatalog();
      catCache.forEach(x => {
        x.py = pyOf(x.name);
        x.cat = x.group === 'prod' ? (SUBCAT[D.mat[x.name] && D.mat[x.name][9]] || 'prod') : x.group;
      });
    }
    return catCache;
  }
  /* 候选列表（按选中后 1.2 价展示；0 价/不可售条目直接隐藏）：prod=产物(非动物) animal=动物 cmp=对比表45项 fur=家具 */
  function getSlotList(kind) {
    if (!slotCache) {
      const px = n => { const p = C.calcProduce(S, n, true); return p ? p.price : 0; };
      const catOf = n => SUBCAT[D.mat[n] && D.mat[n][9]] || 'prod';
      slotCache = {
        prod: produceList.map(n => ({ name: n, price: px(n), group: 'prod', cat: catOf(n) })).filter(x => x.price > 0),
        animal: Object.keys(D.mat).filter(k => D.mat[k][9] === '动物')
          .map(n => ({ name: n, price: px(n), group: 'prod', cat: 'animal' })).filter(x => x.price > 0),
        cmp: cmpList.map(n => { const p = C.calcProduce(S, n, false); return { name: n, price: p ? p.price : 0, group: 'prod', cat: catOf(n) }; })
          .filter(x => x.price > 0),
        fur: D.fur.map(f => ({ name: f.n, price: (C.calcFurniture(S, f, true) || {}).sell || 0, group: 'fur', cat: 'fur' }))
          .filter(x => x.price > 0)
          .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      };
      for (const k in slotCache) slotCache[k].forEach(x => { x.py = pyOf(x.name); });
    }
    return slotCache[kind];
  }
  /* 1.2 倍多选候选：产物 + 动物 + 家具（不含精粹/树木） */
  function getB12List() {
    if (!getB12List.c) getB12List.c = getSlotList('prod').concat(getSlotList('animal'), getSlotList('fur'));
    return getB12List.c;
  }
  /* 材料检索清单（静态，不随参数变） */
  function getMatList() {
    // 数据源清单里含占位项「不选」（原表的分隔/占位），不是真材料，不进选择列表
    if (!getMatList.c) getMatList.c = D.ml.filter(n => n && n !== '不选').map(n => ({ name: n, price: null, group: 'mat', py: pyOf(n) }));
    return getMatList.c;
  }

  function sheetTitle() {
    if (sheetMode === 'pick') return (listPick && listPick.title) || '选择';
    if (sheetMode === 'multi') return '选择要卖的物品';
    if (sheetMode === 'b12') return '选择本周 1.2 倍（点选添加）';
    if (sheetMode === 'mat') return sheetMat === 'want' ? '添加想用掉的材料' : '添加不想用掉的材料';
    if (sheetMode === 'cmp') return '选择非1.2倍对比产物（最多 3 个）';
    return '选择手动对比产物';
  }
  let sheetOpenT = 0;
  /* 锁滚：先记录滚动位置，再把 body 固定住。
     直接给 body 加 overflow:hidden 有两个副作用：移动端 WebView 会丢滚动位置（页面回顶），
     桌面端滚动条消失会让居中限宽的 body 重新居中（整页横移，看起来像"页面飘"）。 */
  let lockY = 0;
  function lockScroll() {
    if (document.body.classList.contains('noscroll')) return;
    lockY = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.style.top = (-lockY) + 'px';
    document.body.classList.add('noscroll');
  }
  function unlockScroll() {
    if (!document.body.classList.contains('noscroll')) return;
    document.body.classList.remove('noscroll');
    document.body.style.top = '';
    if (!lockY) return;
    window.scrollTo(0, lockY);
    // 部分 WebView 恢复可滚动的同一帧还读不到新高度，下一帧再补一次
    requestAnimationFrame(() => {
      if (Math.abs((window.pageYOffset || 0) - lockY) > 2) window.scrollTo(0, lockY);
    });
  }
  let listPick = null;   // pick 模式：{ title, items:[{v,label}], currentV, onPick }
  /* 已停用：选项 ≤8 的选择统一走 openBubblePick 气泡（点选即生效，无全屏弹层）。
     保留实现仅作长选项弹层的备用，当前无调用点。 */
  function openListSheet(title, items, currentV, onPick) {
    listPick = { title, items, currentV, onPick };
    sheetMode = 'pick';
    pickAddOpen = true; pickQ = ''; pickGrp = 'all'; pickSort = 'def'; pickTop = 'prod';
    const box = $('#pickSheet');
    clearTimeout(sheetOpenT);
    box.hidden = false;
    box.classList.add('pick');
    lockScroll();
    renderSheetChrome();
    renderSheetList(false);
    requestAnimationFrame(() => box.classList.add('open'));
  }
  function openPickSheet(mode, arg) {
    sheetMode = mode;
    if (mode === 'single') sheetSlot = arg;
    if (mode === 'mat') sheetMat = arg;
    pickAddOpen = true; pickQ = ''; pickSort = 'def'; pickGrp = 'all'; pickTop = 'prod';
    const box = $('#pickSheet');
    clearTimeout(sheetOpenT);
    box.hidden = false;                       // 先挂载（面板在屏外），量好尺寸再滑入
    lockScroll();
    $('#fPickAdd').value = '';
    renderSheetChrome();
    renderSheetList(false);
    requestAnimationFrame(() => box.classList.add('open'));
    // 搜索聚焦策略：不自动聚焦（避免键盘首帧遮住列表），点搜索框再弹键盘
  }
  function closePickSheet() {
    if (!pickAddOpen) return;
    pickAddOpen = false; pickQ = ''; listPick = null;
    const box = $('#pickSheet');
    box.classList.remove('open');
    unlockScroll();
    sheetOpenT = setTimeout(() => { box.hidden = true; box.classList.remove('pick'); }, 240);
  }

  /* 各模式的分类页签：multi=平铺 8 项；b12=两级（横向 产物/家具，产物内纵向 植物/鱼/星/动物） */
  const GRP_SETS = {
    multi: [['all', '全部'], ['crop', '植物'], ['fish', '鱼'], ['meteor', '星'], ['animal', '动物'], ['ess', '精粹'], ['tree', '树木'], ['fur', '家具']],
    b12top: [['prod', '产物'], ['fur', '家具']],
    b12sub: [['all', '全部'], ['crop', '植物'], ['fish', '鱼'], ['meteor', '星'], ['animal', '动物']],
    single: [['all', '全部'], ['crop', '植物'], ['fish', '鱼'], ['meteor', '星'], ['animal', '动物']],
    cmp: [['all', '全部'], ['crop', '植物'], ['fish', '鱼'], ['meteor', '星'], ['animal', '动物']],
    mat: []
  };
  let pickTop = 'prod';   // b12 模式一级页签
  /* 已选回看 chips：弹层底部完成按钮上方显示当前已选项（跨页签多选后不用凭记忆） */
  function renderSheetChips() {
    const box = $('#sheetChips');
    if (!box) return;
    let names = [];
    if (sheetMode === 'b12') names = (S.b12 || []).slice();
    else if (sheetMode === 'multi') { const pool = sellPool(); names = pool.slice(0, 12).map(x => x.name); if (pool.length > 12) names.push('…等 ' + pool.length + ' 项'); }
    else if (sheetMode === 'mat') names = (sheetMat === 'want' ? S.wantMats : S.avoidMats).slice();
    else if (sheetMode === 'cmp') names = S.cmpManual.filter(Boolean);
    box.innerHTML = names.length
      ? '<span class="chiplab">已选</span>' + names.map(n => '<span class="chip">✓ ' + n + '</span>').join('')
      : '';
  }

  function renderSheetChrome() {
    $('#sheetTitle').textContent = sheetTitle();
    renderSheetChips();
    const grp = $('#pickGrp'), grp2 = $('#pickGrp2');
    if (sheetMode === 'b12') {
      grp.hidden = false; grp2.hidden = pickTop !== 'prod';
      grp.innerHTML = GRP_SETS.b12top.map(t =>
        '<button data-t="' + t[0] + '"' + (pickTop === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>').join('');
      grp2.innerHTML = pickTop === 'prod' ? GRP_SETS.b12sub.map(s =>
        '<button data-v="' + s[0] + '"' + (pickGrp === s[0] ? ' class="on"' : '') + '>' + s[1] + '</button>').join('') : '';
      grp.querySelectorAll('button').forEach(b => b.onclick = () => {
        pickTop = b.dataset.t; pickGrp = 'all';
        renderSheetChrome(); renderSheetList(false);
      });
      grp2.querySelectorAll('button').forEach(b => b.onclick = () => {
        pickGrp = b.dataset.v; renderSheetChrome(); renderSheetList(false);
      });
    } else {
      grp2.hidden = true;
      const set = GRP_SETS[sheetMode] || [];
      grp.hidden = !set.length;
      grp.innerHTML = set.map(g =>
        '<button data-v="' + g[0] + '"' + (pickGrp === g[0] ? ' class="on"' : '') + '>' + g[1] + '</button>').join('');
      grp.querySelectorAll('button').forEach(b => b.onclick = () => {
        pickGrp = b.dataset.v; renderSheetChrome(); renderSheetList(false);
      });
    }
    $('#sheetFt').style.display = (sheetMode === 'single' || sheetMode === 'pick') ? 'none' : '';
    $('#sheetSort').hidden = sheetMode === 'pick';
    $('#sheetSearch').hidden = sheetMode === 'pick';
    const tag = $('#sheetTag');
    if (sheetMode === 'pick' || sheetMode === 'single') tag.textContent = '';
    
    else if (sheetMode === 'b12') tag.textContent = '已选 ' + (S.b12 || []).length + '/4';
    else if (sheetMode === 'mat') tag.textContent = '已选 ' + (sheetMat === 'want' ? S.wantMats : S.avoidMats).length + ' 种';
    else if (sheetMode === 'cmp') tag.textContent = '已选 ' + S.cmpManual.filter(Boolean).length + '/3';
    else tag.textContent = '已选 ' + sellPool().length + ' 种';
    $$('#sheetSort button').forEach(b => b.classList.toggle('on', b.dataset.v === pickSort));
  }

  function sheetItems() {
    let list;
    if (sheetMode === 'mat') list = getMatList();
    else if (sheetMode === 'cmp') list = getSlotList('cmp');
    else if (sheetMode === 'pick') list = (listPick ? listPick.items : []).map(it => ({ name: it.label, v: it.v }));
    else if (sheetMode === 'single') list = getSlotList('cmp');
    else if (sheetMode === 'b12') {
      const all = getB12List();
      list = pickTop === 'fur' ? all.filter(x => x.cat === 'fur') : all.filter(x => x.cat !== 'fur');
    } else list = getCatalog();
    list = list.filter(Boolean);   // 任一候选源出现空项时先剔除，避免下游读 .name 抛异常
    if (pickGrp !== 'all' && list.length && list[0].cat) list = list.filter(x => x.cat === pickGrp);
    const qt = pickQ.trim(), q = qt.toUpperCase();
    if (q) list = list.filter(x => x.name.indexOf(qt) >= 0 || (x.py && x.py.indexOf(q) >= 0));
    if (pickSort === 'price' && list.length && list[0].price != null)
      list = list.slice().sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'zh'));
    return list;
  }

  function renderSheetList(keepScroll) {
    const sc = $('#sheetList');
    if (!keepScroll) sc.scrollTop = 0;
    const list = sheetItems();
    sheetRowsCache = list;
    const n = list.length;
    const st = sc.scrollTop, vh = sc.clientHeight || 480;
    const start = Math.max(0, Math.floor(st / ROW_H) - ROW_OVS);
    const end = Math.min(n, Math.ceil((st + vh) / ROW_H) + ROW_OVS);
    $('#sheetSpTop').style.height = (start * ROW_H) + 'px';
    $('#sheetSpBot').style.height = (Math.max(0, n - end) * ROW_H) + 'px';
    sheetRangeKey = start + '|' + end + '|' + n;
    /* multi：1.2 倍物品点按=勾选/取消（同主列表语义），自动精粹点按=排除/恢复 */
    const b12set = {}, autoSet = {};
    if (sheetMode === 'multi') {
      b12Items().forEach(x => { b12set[x.name] = 1; });
      autoEssNames().forEach(m => { autoSet[m] = 1; });
    }
    const h = [];
    const curVal = sheetMode === 'single' ? S.cmpManual[+sheetSlot.slice(3)] : null;
    for (let i = start; i < end; i++) {
      const x = list[i];
      let on, badge = '', tap = 'pick';
      if (sheetMode === 'pick') {
        on = !!(listPick && x.v === listPick.currentV);
        h.push('<div class="prow' + (on ? ' on' : '') + '" data-pick="' + x.name + '" style="height:' + ROW_H + 'px">' +
          '<span class="pn">' + x.name + '</span>' + (on ? '<span class="pck">✓</span>' : '') + '</div>');
        continue;
      }
      if (sheetMode === 'single') on = curVal === x.name;
      else if (sheetMode === 'cmp') on = S.cmpManual.indexOf(x.name) >= 0;
      else if (sheetMode === 'b12') on = (S.b12 || []).indexOf(x.name) >= 0;
      else if (sheetMode === 'mat') on = (sheetMat === 'want' ? S.wantMats : S.avoidMats).indexOf(x.name) >= 0;
      else if (b12set[x.name]) { on = sellCfg.b12off.indexOf(x.name) < 0; badge = '<span class="b12t">1.2倍</span>'; tap = 'b12'; }
      else if (autoSet[x.name]) { on = essIncluded(x.name); badge = '<span class="b12t auto">自动</span>'; tap = 'ess'; }
      else on = sellCfg.pick.indexOf(x.name) >= 0;
      h.push('<div class="srow' + (on ? ' on' : '') + '" data-tap="' + tap + '" data-pick="' + x.name + '" data-cat="' + (x.cat || '') + '" style="height:' + ROW_H + 'px">' +
        '<span class="sn">' + x.name + badge + '</span>' +
        (x.price == null ? '' : '<span class="pp">' + (x.price > 0 ? nfmt(x.price) : '—') + '</span>') +
        '<span class="st">' + (on ? '✓' : '+') + '</span></div>');
    }
    $('#sheetRows').innerHTML = h.length ? h.join('') : '<div class="empty">无匹配项</div>';
    renderSheetChips();   // 行勾选变化后同步底部已选 chips
    renderSheetIndex();
    /* 兜底：不支持 overflow-anchor 的内核会在 DOM 重建后偷偷改 scrollTop，
       写回本次读数，避免"滚动 → 补偿 → 再滚动"级联放大到直接冲底 */
    if (keepScroll && sc.scrollTop !== st) sc.scrollTop = st;
  }

  /* A-Z 侧栏：仅家具分类（默认排序、无搜索）时出现，点字母跳到该首字母第一项 */
  function renderSheetIndex() {
    const box = $('#sheetIndex');
    const furOnly = sheetMode === 'multi' ? pickGrp === 'fur' : (sheetMode === 'b12' && pickTop === 'fur');
    if (!furOnly || pickQ.trim() || pickSort !== 'def' || !sheetRowsCache.length) { box.hidden = true; box.innerHTML = ''; return; }
    const first = {}, letters = [];
    sheetRowsCache.forEach((x, i) => {
      const c = pyOf(x.name)[0] || '#';
      const k = /[A-Z]/.test(c) ? c : '#';
      if (first[k] === undefined) { first[k] = i; letters.push(k); }
    });
    box.hidden = false;
    box.innerHTML = letters.map(L => '<button data-i="' + first[L] + '">' + L + '</button>').join('');
    $$('#sheetIndex button').forEach(b => b.onclick = () => {
      $('#sheetList').scrollTop = (+b.dataset.i) * ROW_H;
      renderSheetList(true);
    });
  }

  /* ---------- 本周 1.2 倍：2×2 格子（新增最多 4 个任意组合）；点格子开弹层多选，× 移除 ----------
   * 老档迁移可能带来 5 项（3产物+1动物+1家具），格子按 max(4, 已选数) 渲染，全部可见可删 */
  function renderB12Slots() {
    const list = S.b12 || [];
    let h = '';
    for (let i = 0; i < Math.max(4, list.length); i++) {
      const v = list[i];
      h += '<button class="slot' + (v ? ' on' : '') + '" ' + (v ? 'data-sloti="' + i + '"' : 'data-addb12="1"') + '>' +
        '<span class="vl">' + (v || '＋ 选择') + '</span>' +
        (v ? '<span class="cl" data-deli="' + i + '">×</span>' : '') +
        '</button>';
    }
    $('#b12Slots').innerHTML = h;
  }
  /* 轻提示（弹层内超限等） */
  let toastT = 0;
  function toast(msg) {
    let el = document.getElementById('toastBox');
    if (!el) { el = document.createElement('div'); el.id = 'toastBox'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ---------- 凑整方案卡片（blog 逻辑） ---------- */
  function copyText(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = '已复制 ✓'; setTimeout(() => btn.textContent = t, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove(); done();
  }

  /* 当前方案 + 懒计算的「其他解法」（依次跳过最贵的 1/2/3 种产物） */
  function curSolution(pool, R) {
    const key = R + '|' + pool.filter(Boolean).map(x => x.name + (x.cap >= 1 ? '~' + x.cap : '')).join(',');   // 上限变化也要换缓存
    if (altKey !== key) { altKey = key; altList = null; altIdx = 0; }
    const prim = C.sellSolveN(R, pool);
    if (!prim) return null;
    if (!altList) {
      altList = [];
      for (let skip = 1; skip <= 3; skip++) {
        const a = C.sellSolveAlt(R, pool, skip);
        if (a && a.exact) altList.push(a);
      }
    }
    const n = altList.length + 1;               // 1 = 主方案
    if (altIdx >= n) altIdx = 0;
    return { prim, cur: altIdx === 0 ? prim : altList[altIdx - 1], altIdx, nAlts: n };
  }

  function renderFit(pool, R) {
    const box = $('#sellOutList');   /* 说明 tip-fit 常驻容器外，只重写列表部分 */
    if (R <= 0) { box.innerHTML = '<div class="empty">本周家园币已卖满</div>'; $('#fitTag').textContent = ''; return; }
    if (!pool.length) {
      box.innerHTML = emptyGo('先在上方勾选要卖的产物', '去勾选', '#pickList');
      $('#fitTag').textContent = '未选择';
      return;
    }
    const cs = curSolution(pool, R);
    if (!cs) { box.innerHTML = '<div class="empty">当前金额超出可算范围</div>'; $('#fitTag').textContent = ''; return; }
    const sol = cs.cur;
    $('#fitTag').textContent = pool.length + ' 种参与';
    const h = [];
    h.push('<div class="kv" style="margin-top:2px"><span>目标 <b>' + nfmt(R) + '</b></span><span>' +
      (sol.exact ? '<b style="color:#3c8a5f">精确凑满 ✓</b>'
        : '最接近（差 <b style="color:#c25b5b">' + nfmt(sol.diff) + '</b>）') + '</span></div>');
    h.push('<div class="mtwrap"><table class="mtab"><thead><tr><th>产物</th><th>单价</th><th>数量</th><th>小计</th></tr></thead><tbody>');
    sol.plan.forEach(p => {
      const cap = sellCfg.caps[p.name];   // 有上限的产物在名称旁标记 ≤N
      h.push('<tr><td>' + p.name + (cap >= 1 ? ' <span class="capbd">≤' + cap + '</span>' : '') + '</td><td>' + nfmt(p.price) + '</td><td>' + nfmt(p.qty) + '</td><td>' + nfmt(p.price * p.qty) + '</td></tr>');
    });
    h.push('</tbody><tfoot><tr><td colspan="3">合计（' + sol.qty + ' 件）</td><td><b>' + nfmt(sol.total) + '</b></td></tr></tfoot></table></div>');
    h.push('<div class="btnrow" style="margin-top:8px;margin-bottom:0">');
    if (cs.nAlts > 1) h.push('<button class="btn sm" id="btnFitAlt">‹ 其他解法 ' + (cs.altIdx + 1) + '/' + cs.nAlts + ' ›</button>');
    else h.push('<button class="btn sm" id="btnFitAlt" disabled>其他解法</button>');
    h.push('<button class="btn sm" id="btnFitCopy">复制方案</button></div>');
    box.innerHTML = h.join('');
    const bAlt = $('#btnFitAlt');
    if (bAlt && cs.nAlts > 1) bAlt.onclick = () => { altIdx = (altIdx + 1) % cs.nAlts; renderFit(pool, R); };
    const bCopy = $('#btnFitCopy');
    if (bCopy) bCopy.onclick = () => {
      const txt = '凑整方案（目标 ' + R + ' 家园币）\n' +
        sol.plan.map(p => p.name + ' × ' + p.qty + '（单价 ' + p.price + '，小计 ' + p.price * p.qty +
          (sellCfg.caps[p.name] >= 1 ? '，上限 ' + sellCfg.caps[p.name] : '') + '）').join('\n') +
        '\n合计 ' + sol.total + '（' + sol.qty + ' 件）' + (sol.exact ? '（精确凑满）' : '（差 ' + sol.diff + '）');
      copyText(txt, bCopy);
    };
  }

  function renderSell() {
    if ($('#page-sell').hidden) return;
    const pool = sellPool();
    const R = Math.max(0, S.weekCap - S.weekSold);
    $('#sellR').textContent = nfmt(R);
    renderPick(pool);
    renderFit(pool, R);
  }

  /* APK 返回键钩子：先关浮层/面板再退出。
   * 返回 'handled' 表示已消费本次返回（关掉了东西），'exit' 表示无浮层、可以退出。 */
  function onBack() {
    for (const fn of popclosers) { if (fn()) return 'handled'; }
    if (pickAddOpen) { closePickSheet(); return 'handled'; }
    return 'exit';
  }

  /* ================= 自研 Dialog（替代原生 alert/confirm） ================= */
  function buildDialog() { }   // 骨架在 index.html 内置
  function showDialog(title, msg, opts) {
    buildDialog();
    const o = opts || {};
    document.getElementById('dlgTitle').textContent = title || '提示';
    document.getElementById('dlgMsg').textContent = msg || '';
    const ok = document.getElementById('dlgOk'), no = document.getElementById('dlgNo');
    ok.textContent = o.okText || '确定';
    ok.classList.toggle('danger', !!o.danger);
    no.hidden = !o.confirm;
    document.getElementById('dlgBox').classList.add('open');
    return new Promise(res => {
      const done = v => { document.getElementById('dlgBox').classList.remove('open'); ok.onclick = no.onclick = null; res(v); };
      ok.onclick = () => done(true);
      no.onclick = () => done(false);
    });
  }
  const dlgAlert = (msg) => showDialog('提示', msg, { okText: '知道了' });
  const dlgConfirm = (title, msg, danger) => showDialog(title, msg, { confirm: true, okText: '确定', danger });

  /* ================= 事件绑定 ================= */
  function bind() {
    // 分段按钮（无 data-k 的 seg 属于弹层等专用控件，另行绑定）
    $$('.seg').forEach(seg => {
      const k = seg.dataset.k;
      if (!k) return;
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', String(S[k]) === b.dataset.v);
        b.onclick = () => {
          S[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
          seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          save(); calc();
        };
      });
    });
    // 数字输入
    const bindNum = (sel, key) => {
      const el = $(sel); el.value = S[key];
      el.addEventListener('input', () => {
        S[key] = Math.max(0, +el.value || 0); save(); calc();
      });
    };
    bindNum('#iWeekSold', 'weekSold');
    // 剩余天数：滑动选择器（数字直接显示在滑钮上）
    const paintDay = v => {
      const pct = (v - 1) / 6 * 100;
      $('#dayFill').style.width = pct + '%';
      const th = $('#dayThumb');
      th.style.left = pct + '%';
      th.textContent = v;
      $('#dayPick').setAttribute('aria-valuenow', v);
    };
    paintDay(S.daysLeft);
    const dayEl = $('#dayPick');
    const dayFromX = x => {
      const r = dayEl.querySelector('.dtrack').getBoundingClientRect();
      return Math.min(7, Math.max(1, 1 + Math.round((x - r.left) / r.width * 6)));
    };
    let dayDrag = false;
    dayEl.addEventListener('pointerdown', e => {
      dayDrag = true;
      try { dayEl.setPointerCapture(e.pointerId); } catch (err) { }
      S.daysLeft = dayFromX(e.clientX); paintDay(S.daysLeft); save(); calc();
    });
    dayEl.addEventListener('pointermove', e => {
      if (!dayDrag) return;
      const v = dayFromX(e.clientX);
      if (v !== S.daysLeft) { S.daysLeft = v; paintDay(v); save(); calc(); }
    });
    const dayUp = () => { dayDrag = false; };
    dayEl.addEventListener('pointerup', dayUp);
    dayEl.addEventListener('pointercancel', dayUp);
    dayEl.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      S.daysLeft = Math.min(7, Math.max(1, S.daysLeft + (e.key === 'ArrowRight' ? 1 : -1)));
      paintDay(S.daysLeft); save(); calc();
    });
    // 下拉
    const bindSel = (sel, key, isnum) => {
      const el = $(sel);
      el.addEventListener('change', () => {
        S[key] = isnum ? +el.value : el.value; save(); calc();
      });
    };
    // 弹层选择器（替代原生下拉）
    $('#sWeekCap').onclick = () => openBubblePick($('#sWeekCap'),
      [600000, 500000, 400000, 300000, 250000, 200000, 150000, 100000].map(v => ({ v, label: (v / 10000) + ' 万' })),
      S.weekCap, v => { S.weekCap = v; save(); buildSelects(); calc(); });
    $('#sDessert').onclick = () => openBubblePick($('#sDessert'),
      D.desserts.map(x => ({ v: x.v, label: x.t })), S.dessert,
      v => { S.dessert = v; save(); buildSelects(); calc(); });
    $('#sBoost').onclick = () => openBubblePick($('#sBoost'),
      [{ v: 'none', label: '不使用' }, { v: 'once', label: '使用 1 次' }, { v: 'hourly', label: '每小时 1 次' }],
      S.boost, v => { S.boost = v; save(); buildSelects(); calc(); });
    $('#sSeason').onclick = () => openBubblePick($('#sSeason'),
      D.season.map(x => ({ v: x.n, label: x.n })),
      S.season, v => { S.season = v; save(); buildSelects(); calc(); });
    // 复选
    // 开关（替代勾选框）：label 在开关内，滑钮带 开/关 字样
    const SW = [['cWater', 'waterSuit'], ['cOnlyOwned', 'onlyOwned'], ['cTree', 'sellTree'],
                ['cEss', 'sellEss'], ['cBestFish', 'onlyBestFish']];
    const renderSw = () => SW.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = !!S[key];
      el.classList.toggle('on', on);
      el.setAttribute('aria-checked', on);
      el.querySelector('.kn').textContent = on ? el.dataset.on : el.dataset.off;
    });
    SW.forEach(([id, key]) => document.getElementById(id).onclick = () => {
      S[key] = !S[key]; save(); renderSw(); calc();
    });
    renderSw();
    document.getElementById('cStar').onclick = starBtnClick;
    document.getElementById('cAnimal').onclick = animalBtnClick;
    renderStarSw();
    renderAnimalBtn();
    // 折叠（点 ⓘ 不触发折叠）
    $$('.chd.fold').forEach(h => h.onclick = ev => {
      if (ev.target.closest('.iinfo')) return;
      const b = $('#' + h.dataset.fold);
      b.style.display = b.style.display === 'none' ? '' : 'none';
      h.classList.toggle('up');
      if (h.dataset.fold === 'furnBody') layoutFurnSum();
      if (h.dataset.fold === 'filtBox') layoutFiltSum();
    });
    // 动物页：养殖数量/动物好感度默认收起（折叠态卡头显示概要数字）
    ['anCountBody', 'anGroupsBody'].forEach(id => {
      $('#'+id).style.display = 'none';
      $$('.chd.fold').forEach(h => { if (h.dataset.fold === id) h.classList.add('up'); });
    });
    // 对比卡默认收起（首屏让位给 Top10）
    $('#cmpBody').style.display = 'none';
    $$('.chd.fold').forEach(h => { if (h.dataset.fold === 'cmpBody') h.classList.add('up'); });
    // 「我的」两项（已移入家园底部）默认折叠
    ['meBody2', 'meBody3'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.style.display = 'none';
    });
    $$('.chd.fold').forEach(h => {
      if (h.dataset.fold === 'meBody2' || h.dataset.fold === 'meBody3') h.classList.add('up');
    });
    // 卡片「详情 ▾」折叠：事件委托，卡片重渲染后无需重绑
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('.more');
      if (!btn) return;
      const det = document.getElementById('det-' + btn.dataset.mid);
      if (!det) return;
      det.hidden = !det.hidden;
      btn.textContent = det.hidden ? '详情 ▾' : '收起 ▴';
    });
    // 「N 只」参与名单折叠（动物材料明细）：委托同上
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('.useTgl');
      if (!btn) return;
      const ul = document.querySelector(`[data-ul="${btn.dataset.u}"]`);
      if (!ul) return;
      ul.hidden = !ul.hidden;
      btn.classList.toggle('on', !ul.hidden);
    });
    // ⓘ 说明折叠：默认收起，点击展开/收起（渐进披露，长说明不占版面）
    document.addEventListener('click', ev => {
      const b = ev.target.closest('.iinfo');
      if (!b) return;
      const t = document.getElementById(b.dataset.tipid);
      if (!t) return;
      t.hidden = !t.hidden;
      b.classList.toggle('on', !t.hidden);
    });
    // 空状态操作按钮：按需切到对应页签，展开折叠卡，再滚动到目标位置
    document.addEventListener('click', ev => {
      const b = ev.target.closest('[data-go]');
      if (!b) return;
      const page = b.dataset.gopage;
      if (page) {
        const tb = document.querySelector('#tabbar button[data-p="' + page + '"]');
        if (tb) tb.click();
      }
      const sel = b.dataset.gosel;
      if (!sel) return;
      const el = document.querySelector(sel);
      if (!el) return;
      const cbd = el.closest('.cbd');
      if (cbd && cbd.style.display === 'none') {
        const h = document.querySelector('.chd.fold[data-fold="' + cbd.id + '"]');
        if (h) h.click();
      }
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), page ? 120 : 0);
    });
    // 弹层焦点圈禁：Tab 在弹层内循环（aria-modal 配套）
    $('#pickSheet').addEventListener('keydown', ev => {
      if (ev.key !== 'Tab') return;
      const box = document.getElementById('pickSheet');
      const f = [...box.querySelectorAll('button,input,[tabindex="0"]')]
        .filter(e => !e.hidden && e.offsetParent !== null && !e.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { last.focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
    });
    // Esc 关闭弹层（PC）
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && pickAddOpen) closePickSheet();
    });
    // 卖整：全屏选择弹层（multi）
    $('#btnAddPick').onclick = () => openPickSheet('multi');
    // 本周 1.2 倍：格子 × 移除 / 点格子开多选弹层（b12）
    $('#b12Slots').addEventListener('click', ev => {
      const del = ev.target.closest('[data-deli]');
      if (del) { S.b12.splice(+del.dataset.deli, 1); save(); calc(); return; }
      if (ev.target.closest('[data-addb12]') || ev.target.closest('[data-sloti]')) openPickSheet('b12');
    });
    // 产物对比：两个「设置」分别开 1.2 倍多选 / 非1.2 倍对比多选（不再用行内槽位卡片）
    $('#btnSetCmp12').onclick = () => openPickSheet('b12');
    $('#btnSetCmpMan').onclick = () => openPickSheet('cmp');
    // 材料筛选：弹层（mat）
    $('#btnMatWant').onclick = () => openPickSheet('mat', 'want');
    $('#btnMatAvoid').onclick = () => openPickSheet('mat', 'avoid');
    // 选择弹层内部：搜索 / 排序 / 关闭 / 虚拟滚动 / 点行（分组页签在 renderSheetChrome 内绑定）
    $('#fPickAdd').oninput = onPickQInput;
    $$('#sheetSort button').forEach(b => b.onclick = () => { pickSort = b.dataset.v; renderSheetChrome(); renderSheetList(false); });
    $('#btnSheetClose').onclick = closePickSheet;
    $('#sheetMask').onclick = closePickSheet;
    $('#btnSheetDone').onclick = closePickSheet;
    $('#sheetList').addEventListener('scroll', () => {
      if (!pickAddOpen || sheetRaf) return;
      sheetRaf = requestAnimationFrame(() => {
        sheetRaf = 0;
        if (sheetRange() !== sheetRangeKey) renderSheetList(true);
      });
    }, { passive: true });
    $('#sheetRows').addEventListener('click', ev => {
      if (!pickAddOpen) return;
      const el = ev.target.closest('[data-pick]');
      if (!el) return;
      const n = el.dataset.pick;
      if (sheetMode === 'pick') {
        const it = listPick && listPick.items.find(i2 => i2.label === n);
        const lp = listPick;
        closePickSheet();
        listPick = null;
        if (it && lp) lp.onPick(it.v);
        return;
      }
      if (sheetMode === 'single') {
        S.cmpManual[+sheetSlot.slice(3)] = n;
        save(); calc(); closePickSheet(); return;
      }
      if (sheetMode === 'cmp') {
        const arr = S.cmpManual;
        const i = arr.indexOf(n);
        if (i >= 0) arr[i] = '';                                // 再点已选 = 取消
        else {
          const slot = arr.indexOf('');
          if (slot < 0) { toast('最多选 3 个（点已选的可取消）'); return; }
          arr[slot] = n;
        }
        save(); calc(); renderSheetChrome(); renderSheetList(true); return;
      }
      if (sheetMode === 'b12') {
        if (!S.b12) S.b12 = [];
        const idx = S.b12.indexOf(n);
        if (idx >= 0) S.b12.splice(idx, 1);                    // 再点已选 = 移除
        else if (S.b12.length >= 4) { toast('最多选 4 个（点已选的可移除）'); return; }
        else S.b12.push(n);
        save(); calc(); renderSheetChrome(); renderSheetList(true); return;
      }
      if (sheetMode === 'mat') {
        const arr = sheetMat === 'want' ? S.wantMats : S.avoidMats;
        const other = sheetMat === 'want' ? S.avoidMats : S.wantMats;
        const i = arr.indexOf(n);
        if (i >= 0) arr.splice(i, 1);
        else { arr.push(n); const j = other.indexOf(n); if (j >= 0) other.splice(j, 1); }
        save(); renderTags(); calc(); renderSheetChrome(); renderSheetList(true); return;
      }
      // multi：b12 物品=勾选/取消，自动精粹=排除/恢复，其余=手动添加/移除
      if (el.dataset.tap === 'b12') {
        const i = sellCfg.b12off.indexOf(n);
        if (i >= 0) sellCfg.b12off.splice(i, 1); else sellCfg.b12off.push(n);
      } else if (el.dataset.tap === 'ess') {
        if (essIncluded(n)) { if (sellCfg.essOff.indexOf(n) < 0) sellCfg.essOff.push(n); }
        else sellCfg.essOff = sellCfg.essOff.filter(x => x !== n);
      } else {
        const i = sellCfg.pick.indexOf(n);
        if (i >= 0) sellCfg.pick.splice(i, 1); else sellCfg.pick.push(n);
      }
      saveSellCfg(); renderSell(); renderSheetChrome(); renderSheetList(true);
    });
    // 新的一周 / 撤销：同一个按钮切换，3 秒内可撤销；外圈流光 + 秒数提示限时
    let weekUndoPrev = null, weekUndoTimer = null, weekUndoRaf = 0, weekUndoEnd = 0, weekUndoSec = 0;
    const rb = $('#btnResetWeek');
    const rbW = rb.getBoundingClientRect().width;
    if (rbW) rb.style.width = rbW + 'px';   // 锁定初始宽度：文字变「撤销」后按钮大小不变
    function stopWeekUndo() {
      clearTimeout(weekUndoTimer); weekUndoTimer = null;
      if (weekUndoRaf) cancelAnimationFrame(weekUndoRaf);
      weekUndoRaf = 0; weekUndoPrev = null;
      rb.textContent = '新的一周';
      rb.classList.remove('undo', 'counting', 'hurry');
      rb.removeAttribute('data-count');
      rb.style.removeProperty('--wkP');
      rb.removeAttribute('title');
    }
    function tickWeekUndo() {
      const left = Math.max(0, weekUndoEnd - Date.now());
      rb.style.setProperty('--wkP', (left / 3000).toFixed(3));
      const sec = Math.ceil(left / 1000);
      if (sec !== weekUndoSec) {
        weekUndoSec = sec;
        rb.dataset.count = sec;
        rb.title = `剩余 ${sec} 秒可撤销`;
      }
      rb.classList.toggle('hurry', left < 1000);
      if (left > 0) weekUndoRaf = requestAnimationFrame(tickWeekUndo);
    }
    function startWeekUndo() {
      rb.textContent = '撤销';
      rb.classList.add('undo', 'counting');
      weekUndoEnd = Date.now() + 3000;
      weekUndoSec = 0;
      clearTimeout(weekUndoTimer);
      weekUndoTimer = setTimeout(stopWeekUndo, 3000);
      if (weekUndoRaf) cancelAnimationFrame(weekUndoRaf);
      tickWeekUndo();
    }
    rb.onclick = () => {
      if (weekUndoPrev) {                       // 倒计时内再点 = 撤销本次清零
        S.weekSold = weekUndoPrev.weekSold;
        S.daysLeft = weekUndoPrev.daysLeft;
        S.b12 = weekUndoPrev.b12.slice();
        $('#iWeekSold').value = S.weekSold;
        paintDay(S.daysLeft);
        buildSelects(); save(); calc();
        stopWeekUndo();
        return;
      }
      weekUndoPrev = { weekSold: S.weekSold, daysLeft: S.daysLeft, b12: S.b12.slice() };
      S.weekSold = 0; S.daysLeft = 7;
      S.b12 = [];
      $('#iWeekSold').value = 0;
      paintDay(7);
      buildSelects(); save(); calc();
      startWeekUndo();
    };
    // Tab
    $$('#tabbar button').forEach(b => b.onclick = () => {
      $$('#tabbar button').forEach(x => x.classList.toggle('on', x === b));
      ['calc', 'sell', 'query', 'home', 'animal'].forEach(p => $('#page-' + p).hidden = p !== b.dataset.p);
      if (b.dataset.p === 'query') renderQuery();
      if (b.dataset.p === 'sell') renderSell();
      if (b.dataset.p === 'home') renderFish();
      if (b.dataset.p === 'animal') { renderAnimals(); renderAnCount(); renderCk(); }
      window.scrollTo(0, 0);
    });
    $$('.tabs2 button').forEach(b => b.onclick = () => {
      $$('.tabs2 button').forEach(x => x.classList.toggle('on', x === b));
      qMode = b.dataset.q; renderQuery();
    });
    $('#qFind').addEventListener('input', debounce(renderQuery, 180));
    // 安卓版下载链接（关于与免责）：一键复制链接；APK 内点链接改为复制，避免 WebView 被带走
    const dlLink = $('#dlLink'), dlBtn = $('#btnCopyDl');
    if (dlLink && dlBtn) {
      dlLink.href = ANDROID_DL_URL;
      dlLink.addEventListener('click', e => {
        if (location.protocol !== 'file:') return;   // 浏览器 / PWA：新标签打开网盘
        e.preventDefault();                          // APK 内：改为复制，页面不跳转
        copyText(ANDROID_DL_URL, dlBtn);
        toast('链接已复制，请到浏览器打开网盘');
      });
      dlBtn.onclick = () => {
        copyText(ANDROID_DL_URL, dlBtn);
        toast('下载链接已复制（提取码 ' + ANDROID_DL_CODE + '）');
      };
    }
    // 备份
    $('#btnExport').onclick = () => {
      const json = JSON.stringify({
        home: JSON.parse(localStorage.getItem(K_HOME) || '{}'),
        week: JSON.parse(localStorage.getItem(K_WEEK) || '{}'),
        sell: sellCfg
      });
      $('#ioBox').value = json;
      copyText(json, $('#btnExport'));   // 顺带复制到剪贴板，免去长按全选
    };
    $('#btnPaste').onclick = () => {
      const box = $('#ioBox');
      const fallback = () => { box.focus(); dlgAlert('此环境不能自动读取剪贴板，请长按下方文本框选「粘贴」'); };
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(t => { if (t) box.value = t; else fallback(); }, fallback);
        } else fallback();
      } catch (e) { fallback(); }
    };
    $('#btnImport').onclick = () => {
      try {
        const o = JSON.parse($('#ioBox').value);
        if (o.home) HOME_KEYS.forEach(k => { if (o.home[k] !== undefined) S[k] = o.home[k]; });
        if (o.week) WEEK_KEYS.forEach(k => { if (o.week[k] !== undefined) S[k] = o.week[k]; });
        if (o.sell) { sellCfg = Object.assign({ b12off: [], essOn: [], essOff: [], pick: [], caps: {} }, o.sell); loadSellCfg(); saveSellCfg(); }
        save(); location.reload();
      } catch (e) { dlgAlert('配置格式不正确，请检查粘贴内容'); }
    };
    $('#btnClear').onclick = () => {
      dlgConfirm('清空我的家园', '将清空等级与配置（含钓鱼熟练度、动物好感度、饼干设置），本周设置不受影响。', true).then(v => {
        if (!v) return;
        localStorage.removeItem(K_HOME); location.reload();
      });
      localStorage.removeItem(K_HOME); location.reload();
    };
    $('#btnClearWeek').onclick = () => {
      dlgConfirm('清空本周设置', '将清空上限 / 已卖 / 剩余天数 / 1.2 倍 / 材料筛选，「我的家园」不受影响。', true).then(v => {
        if (!v) return;
        localStorage.removeItem(K_WEEK); location.reload();
      });
      localStorage.removeItem(K_WEEK); location.reload();
    };
    $('#btnClearSell').onclick = () => {
      dlgConfirm('重置卖整勾选', '将重置 1.2 倍排除、精粹勾选、手动添加的产物 / 家具与数量上限。', true).then(v => {
        if (!v) return;
        sellCfg = { b12off: [], essOn: [], essOff: [], pick: [], caps: {} };
        saveSellCfg(); renderSell();
      });
      sellCfg = { b12off: [], essOn: [], essOff: [], pick: [], caps: {} };
      saveSellCfg(); renderSell();
    };
  }

  /* ================= 启动 ================= */
  load();
  loadSellCfg();
  buildLvGrid();
  renderFields();
  buildSelects();
  renderCkSlots();
  bind();
  renderTags();
  /* 版本信息：只在「关于与免责」第一条出现一次（应用版本 + 打包时间） */
  $('#verLine').innerHTML =
    `本应用版本 <b>v${APP_VER}</b> · 打包于 <b>${BUILD_AT}</b>`;
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      /* 新版本 SW 接管后自动刷新一次，避免继续跑在旧缓存上（首次安装不刷新） */
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !hadController) return;
        refreshing = true;
        location.reload();
      });
    });
  }

  // 调试/自动化测试句柄（只读引用，不影响正常使用）；onBack 供 APK 返回键调用
  window.__app = { get S() { return S; }, render, save, calc, renderTags, Core: C, DB: D, onBack };
})();
