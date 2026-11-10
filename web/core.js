/* ============================================================
   暖暖家园利润计算器 · 计算内核
   ============================================================
   价格三段口径：
     · 主价  P = ((lv>=PG)*S)*I3            PG=价格解锁等级
     · 精粹  W = IF(lv>=EG, AA*I3, 0)       EG=精粹解锁等级
     · 树木  T = IF(lv>=TG, Z*I3, 0)        TG=树木解锁等级
     I3=甜品售卖加成；TIER(lv)=等级倍率(1/1.05/1.1)
   成长时间：
     · once   = L-20-(浇水套?6:0)（鱼无浇水套）
     · hourly = L-家族基准-(浇水套?家族减成:0)（鱼另表，无浇水套）
   动物链：
     · 家具材料用 top-7 口径
     · 饼干显示/对比表用当前数量口径
   ============================================================ */
(function (global) {
  'use strict';

  const DB = global.DB;
  const floor = Math.floor;
  /* 浮点安全向上取整：避免 300*1.2*1.1=396.00000000000006 被抬成 397 */
  const ceil = x => Math.ceil(Math.round(x * 1e6) / 1e6);
  /* 模拟 Excel 的 15 位有效数字精度（避免浮点误差导致计算偏差） */
  const xl = x => parseFloat(x.toPrecision(15));

  /* --- 等级加成 --- */
  // 产物单价：≥9 级 ×1.1，≥7 级 ×1.05，否则 ×1
  const TIER = lv => (lv >= 9 ? 1.1 : lv >= 7 ? 1.05 : 1);
  // 家具售价：建造 ≥8 级 ×1.1，≥6 级 ×1.05，否则 ×1
  const BUILD = lv => (lv >= 8 ? 1.1 : lv >= 6 ? 1.05 : 1);

  /* --- 解锁门控 --- */
  // 价格解锁：等级不足 → 主价 0（显示"没解锁"）
  const PG = {
    '沁凉迷迭枝': 2, '姜黄迷迭枝': 2, '果香迷迭枝': 2,
    '霜白铃铃草': 3, '湖蓝铃铃草': 3, '黛紫铃铃草': 3,
    '柔粉蓬蓬兰': 5, '湖蓝蓬蓬兰': 5, '橙紫双色蓬蓬兰': 5,
    '奶糖甜甜根': 6, '焦糖甜甜根': 6, '果汁甜甜根': 6,
    '湖蓝团团花': 7, '柔粉团团花': 7, '蜜粉双色团团花': 7,
    '火红爆爆辣': 4, '澄黄爆爆辣': 4, '甘梅爆爆辣': 4,
    '碧露香茗茶': 8, '红袍香茗茶': 8, '霜夜香茗茶': 8,
    '明黄叮当果': 5, '薄紫叮当果': 5, '柔粉叮当果': 5,
    '柔粉织云果': 9, '薄紫织云果': 9, '岚绿织云果': 9,
    '眼线鱼': 3, '口红鱼': 5, '针包豚鱼': 7, '瓶香鱼': 9,
    '幽陨星': 3, '蜜陨星': 6,
  };
  // 精粹解锁：等级不足 → 精粹价 0
  const EG = {
    '明黄杯杯香': 5, '洋红杯杯香': 8, '榴红杯杯香': 10,
    '沁凉迷迭枝': 5, '姜黄迷迭枝': 8, '果香迷迭枝': 10,
    '霜白铃铃草': 5, '湖蓝铃铃草': 8, '黛紫铃铃草': 10,
    '柔粉蓬蓬兰': 5, '湖蓝蓬蓬兰': 8, '橙紫双色蓬蓬兰': 10,
    '奶糖甜甜根': 5, '焦糖甜甜根': 8, '果汁甜甜根': 10,
    '湖蓝团团花': 5, '柔粉团团花': 8, '蜜粉双色团团花': 10,
    '火红爆爆辣': 5, '澄黄爆爆辣': 8, '甘梅爆爆辣': 10,
    '碧露香茗茶': 5, '红袍香茗茶': 8, '霜夜香茗茶': 10,
    '明黄叮当果': 8, '薄紫叮当果': 8, '柔粉叮当果': 10,
    '柔粉织云果': 8, '薄紫织云果': 8, '岚绿织云果': 10,
    '眼镜鱼': 7, '眼线鱼': 7, '口红鱼': 7, '针包豚鱼': 7, '瓶香鱼': 10,
  };
  // 树木解锁
  const TG = {
    '明黄叮当果': 5, '薄紫叮当果': 5, '柔粉叮当果': 5,
    '柔粉织云果': 9, '薄紫织云果': 9, '岚绿织云果': 9,
    '云绮叮当果': 9, '浅桃织云果': 9,
  };
  // 云绮/浅桃的树价不乘甜品加成（等级不足时树价为 0）
  const NO_DESSERT_TREE = { '云绮叮当果': 1, '浅桃织云果': 1 };

  /* --- 成长时间：hourly 家族切割表 --- */
  const HOURLY_CUT = [
    [/杯杯香|铃铃草/, 20, 6],          // 无额外收益，同 once
    [/迷迭枝/, 60, 6],
    [/蓬蓬兰/, 40, 12],
    [/甜甜根|团团花|爆爆辣/, 100, 30],
    [/香茗茶|叮当果/, 160, 48],
    [/织云果/, 300, 90],
  ];
  const FISH_HOURLY = { '眼镜鱼': 40, '眼线鱼': 60, '口红鱼': 120, '针包豚鱼': 180, '瓶香鱼': 300 };

  /* 默认状态 */
  function defaultState() {
    return {
      /* ===== A. 本周设置（每周更新，本地保存） ===== */
      weekCap: 600000,      // 本周家园币上限
      weekSold: 0,          // 本周已卖
      daysLeft: 4,          // 本周剩余天数
      b12: [],              // 本周 1.2 倍（最多 4 个，产物/动物/家具任意组合）
      b12a: '',             // ↓ 旧版固定槽位字段，仅作老档迁移来源，计算不再读取
      b12b: '',
      b12c: '',
      b12Animal: '',
      b12Furn: '',

      /* ===== B. 我的家园（不常变，本地保存） ===== */
      lvBuild: 10,          // 建造能力等级
      lvPlant: 10,          // 种植能力等级
      lvStar: 10,           // 采星能力等级
      lvFish: 10,           // 养鱼能力等级
      lvAnimal: 10,         // 动物邀约等级
      lvCook: 10,           // 烹饪能力等级
      dessert: 1.2,         // 甜品售卖加成：1 / 1.15 / 1.2
      waterSuit: true,      // 4 星浇水套
      boost: 'once',        // none / once / hourly
      extraSmall: 0, extraMid: 0, extraBig: 0, extraPond: 0, // 额外购买的田/塘
      sellTree: true,       // 卖树
      sellEss: true,        // 卖精粹

      /* ===== C. 筛选（每次计算时的临时条件） ===== */
      wantMats: [],         // 想用掉的材料（家具须包含）
      avoidMats: ['缤纷珠', '嫩叶石', '轻羽石', '多宝石', '飞宝珠',
                  '灿陨星', '森陨星', '幽陨星', '蜜陨星'], // 不想用掉（默认排除动物材料与陨星）
      onlyOwned: true,      // 只显示当前能力等级可制作的

      /* ===== D. 钓鱼熟练度 ===== */
      fishLv: { '眼镜鱼': 5, '眼线鱼': 5, '口红鱼': 5, '针包豚鱼': 5, '瓶香鱼': 5 },
      onlyBestFish: true,   // 收鱼你会捕鱼只收最高产量吗？（铲掉低产量重新养）

      /* ===== E. 动物好感度 / 投喂饼干 ===== */
      anAff: {},            // 动物好感度等级（默认 3；1级解锁白 3级棕 6级蓝）
      ckSlots: [            // 3 个饼干槽（第一个影响整个动物区成本利润）
        { n: '美味的独家饼干', q: 84 },
        { n: '能量饼干', q: 0 },
        { n: '能量饼干', q: 0 },
      ],
      anMode: 'many',       // many=悠食多产 / normal=常规模式
      anCount: { '缤纷珠': 2, '嫩叶石': 0, '轻羽石': 0, '多宝石': 7, '飞宝珠': 0 },
      season: '果汁甜甜根', // 制作饼干的甜味材料（影响饼干成本）
      sellExtra: 'both',    // both=树和精粹都卖 / ess=只卖精粹 / tree=只卖树 / none=不卖

      /* ===== F. 产物对比表（自选非 1.2 倍产物，不限数量） ===== */
      cmpManual: [],
    };
  }

  const STAR = ['灿陨星', '森陨星', '幽陨星', '蜜陨星'];
  const LVKEY = { 种植: 'lvPlant', 养鱼: 'lvFish', 采星: 'lvStar', 邀约: 'lvAnimal' };
  const AN_GROUPS = ['缤纷珠', '嫩叶石', '轻羽石', '多宝石', '飞宝珠'];

  /* 鱼的产量：熟练度等级 1-5 × 是否捕鱼只收最高产量 */
  function fishYield(S, name) {
    const f = DB.fish[name];
    if (!f) return 1;
    const lv = Math.max(1, Math.min(5, S.fishLv[name] || 5));
    return (S.onlyBestFish ? f.best : f.noBest)[lv - 1];
  }

  function is12(S, name) {
    if (Array.isArray(S.b12)) return S.b12.indexOf(name) >= 0;
    return S.b12a === name || S.b12b === name || S.b12c === name ||
           S.b12Animal === name || S.b12Furn === name;   // 旧字段兜底
  }

  /* 动物产物单价（sheet7 两条口径）：等级价 = baseP×甜品×TIER(邀约)（=农作物产出详情 AW 列，如 39.6）
   *   H  = ceil(等级价)                    —— matOf 动物分支同源（sheet7 H41-45），家具材料链也用它
   *   AC = ceil(1.2×等级价)                —— 本周 1.2 倍动物（sheet7 AC41-45、sheet4 AE53、sheet1 I36）
   * 注意 AC 是先乘后取整；家具材料链（sheet6 BV 恒走 H 列）不含 1.2，仍走 matOf，勿合并 */
  function anPriceRaw(S, name) {
    const m = DB.mat[name];
    return m && m[9] === '动物' ? m[6] * S.dessert * TIER(S.lvAnimal) : 0;
  }
  const anPriceH = (S, name) => ceil(anPriceRaw(S, name));
  const anPriceAC = (S, name) => ceil(anPriceRaw(S, name) * 1.2);

  /* 模式加成：悠食多产 +0.1 */
  const modeBonus = S => (S.anMode === 'many' ? 0.1 : 0);
  /* 动物产出时间（分钟）：悠食多产 180 / 常规 60 */
  const anRoundTime = S => (S.anMode === 'many' ? 180 : 60);

  const anAffOf = (S, name) => {
    const v = S.anAff[name];
    return v === undefined ? 3 : v;
  };

  /* 单只动物产量与耗能 */
  function anOne(S, a) {
    const E = anAffOf(S, a.n);
    if (a.big) return a.q >= 2 ? { y: 2 * E + 18, e: 42 } : { y: E + 9, e: 22 };
    if (a.q >= 3) return { y: 3 * E + 27, e: 26 };
    if (a.q >= 2) return { y: 2 * E + 18, e: 18 };
    return { y: E + 9, e: 9 };
  }

  /* 每组动物按（好感度降序、品质降序）排序；标记「排除」（S.anOff）的自动跳过 */
  function anSorted(S, g) {
    const off = S.anOff || [];
    return DB.an.filter(a => a.g === g && off.indexOf(a.n) < 0)
      .map(a => ({ a, aff: anAffOf(S, a.n), ...anOne(S, a) }))
      .sort((x, y) => (y.aff - x.aff) || (y.a.q - x.a.q));
  }

  /* 动物容量：邀约等级 → 小/大客房可住数量 */
  function anCaps(S) {
    const c = DB.anCap[Math.max(0, Math.min(10, S.lvAnimal || 0))] || [0, 0];
    return { small: c[0], big: c[1] };
  }

  /* 当前数量口径（供 calcBiscuit 显示块） */
  function anGroup(S, g) {
    const list = anSorted(S, g);
    const n = Math.max(0, Math.min(Math.round(S.anCount[g] || 0), list.length));
    const use = list.slice(0, n);
    return {
      group: g, count: n, all: list.length,
      yield: use.reduce((s, x) => s + x.y, 0),
      energy: use.reduce((s, x) => s + x.e, 0),
      used: use.map(x => x.a.n),
    };
  }

  /* top-7 口径（供家具材料链与动物对比表） */
  function anGroup7(S, g) {
    const list = anSorted(S, g);
    const use = list.slice(0, 7);
    return {
      group: g, count: use.length, all: list.length,
      yield: use.reduce((s, x) => s + x.y, 0),
      energy: use.reduce((s, x) => s + x.e, 0),
      used: use.map(x => x.a.n),
    };
  }

  /* 饼干的材料清单（含调味料；鱼的产量随熟练度动态变化）
   * 注意：第 3 材料槽若是"X精粹"（秘制/独家饼干），成本记 0 且不参与计算 */
  function ckMats(S, ck) {
    const sea = DB.season.find(s => s.n === S.season) || DB.season[0];
    const out = ck.mats.map(([name, y, exType], i) => {
      const isFreeEss = (i === 2 && /精粹$/.test(name));
      return {
        name, y: DB.fish[name] ? fishYield(S, name) : y, exType,
        cost: isFreeEss ? 0 : (DB.mat[name] ? DB.mat[name][1] : 0),
      };
    });
    if (ck.sea) out.push({ name: sea.n, y: sea.y, cost: sea.cost, exType: sea.exType });
    return out;
  }

  /* 饼干参数
   * div 供能 / mult 产量倍率 / price 净价(材料成本−额外产物价) / ess·tree 每块饼干摊薄的额外产物价 */
  function ckParam(S, ckName) {
    const ck = DB.ck.find(c => c.n === ckName);
    if (!ck) return { div: 100, mult: 1, price: 0, gross: 0, ess: 0, tree: 0, n: '' };
    const buy = ck.n === '能量饼干' ? 1000 : ck.n === '美味饼干' ? 4000 : 0;
    if (buy) return { div: ck.energy, mult: ck.mult, price: buy, gross: buy, ess: 0, tree: 0, n: ck.n, buy };
    const mats = ckMats(S, ck);
    const gross = mats.reduce((s, m) => s + m.cost / m.y, 0);      // 每块饼干材料成本
    const keepEss = S.sellExtra === 'both' || S.sellExtra === 'ess';
    const keepTree = S.sellExtra === 'both' || S.sellExtra === 'tree';
    let ess = 0, tree = 0;
    for (const m of mats) {
      if (keepEss && m.exType === 'ess') ess += matOf(S, m.name).essP / m.y;
      if (keepTree && m.exType === 'tree') tree += matOf(S, m.name).treeP / m.y;
    }
    return { div: ck.energy, mult: ck.mult, price: gross - ess - tree, gross, ess, tree, n: ck.n };
  }

  /* 材料价格：{price 单价, essP 精粹单价, treeP 树木单价, cost 成本, py 单次产量, grow 成熟时间, kind}
   * 口径：完全不含本周 1.2 倍；需要 1.2 倍的场景由调用方自行处理。 */
  function matOf(S, name) {
    const m = DB.mat[name];
    if (!m) return { price: 0, essP: 0, treeP: 0, cost: 0, py: 1, grow: 0, kind: '收集', ability: '种植' };
    const [ability, cost, grow, py, treeY, essY, baseP, treeP0, essP0, kind] = m;

    /* --- 动物：top-7 + 饼干动态口径 --- */
    if (kind === '动物') {
      const grp = anGroup7(S, name);
      const cp = ckParam(S, (S.ckSlots[0] || {}).n);
      const dynPy = grp.yield * (modeBonus(S) + cp.mult);
      const base = ceil(baseP * S.dessert * TIER(S.lvAnimal));   // 动物单价无 1.2 倍（sheet7 H41）
      return {
        ability, kind, py: dynPy > 0 ? dynPy : 1, grow,
        price: base,
        essP: dynPy > 0 ? grp.energy / cp.div * cp.ess : 0,
        treeP: dynPy > 0 ? grp.energy / cp.div * cp.tree : 0,
        cost: dynPy > 0 ? grp.energy * cp.price / cp.div : 1e15,
        treeY: 1, essY: 1,                       // 动物材料同时带精粹与树
      };
    }

    const lv = S[LVKEY[ability] || 'lvPlant'];
    const g = S.dessert;
    const pg = PG[name], eg = EG[name], tg = TG[name];
    /* 定价类（盐/酸/烹饪成品）：为手填静态值，不随甜品与能力等级缩放 */
    if (kind === '定价')
      return { ability, kind, py: py || 1, grow, price: baseP, essP: 0, treeP: 0,
               cost, treeY, essY };
    return {
      ability, kind,
      py: kind === '鱼' ? fishYield(S, name) : (py || 1),
      grow,
      // 主价：等级未解锁 → 0
      price: (pg === undefined || lv >= pg) ? ceil(baseP * g * TIER(lv)) : 0,
      // 精粹价：无精粹(essY=0)或等级未解锁 → 0
      essP: (essY && (eg === undefined || lv >= eg)) ? ceil(essP0 * g * TIER(lv)) : 0,
      // 树价：无树(treeY=0)或等级未解锁 → 0；云绮/浅桃不乘甜品
      treeP: (treeY && tg !== undefined && lv >= tg)
        ? ceil(treeP0 * (NO_DESSERT_TREE[name] ? 1 : g) * TIER(lv)) : 0,
      cost, treeY, essY,
    };
  }

  /* 农田 / 鱼塘数量（能力等级基础值 + 额外购买；额外可为负，但有效数量下限为 0） */
  function fields(S) {
    const p = DB.lv.种植[Math.min(S.lvPlant, 10)];
    const f = DB.lv.养鱼[Math.min(S.lvFish, 10)];
    const cl = v => Math.max(0, v);
    return {
      small: cl(p.small + S.extraSmall),
      mid: cl(p.mid + S.extraMid),
      big: cl(p.big + S.extraBig),
      pond: cl(f.pond + S.extraPond),
      total: cl(p.small + S.extraSmall + p.mid + S.extraMid + p.big + S.extraBig),
    };
  }

  /* 成熟时间（分钟） */
  function growTime(S, name, base, kind) {
    if (!base) return 0;
    if (S.boost === 'none') return base;
    const noWater = kind === '鱼';                                  // 鱼无浇水套
    const w = (S.waterSuit && !noWater) ? 1 : 0;
    if (S.boost === 'once') return Math.max(base - 20 - w * 6, 1);   // AB 列
    if (noWater) return Math.max(base - (FISH_HOURLY[name] || 40), 1); // AC 列·鱼
    for (const [re, cut, suit] of HOURLY_CUT)
      if (re.test(name)) return Math.max(base - cut - w * suit, 1);   // AC 列·作物
    return Math.max(base - 20 - w * 6, 1);
  }

  /* 工作台单次可同时制作数量 */
  const benchCount = S => DB.bench[Math.min(S.lvBuild, 10)] || 1;

  /* 等级标记：10 → "X" */
  const lvMark = lv => (lv >= 10 ? 'X' : String(lv));

  /* 家具是否可制作 */
  function canCraft(S, f) {
    if (!S.onlyOwned) return true;
    const marks = [S.lvBuild, S.lvPlant, S.lvStar, S.lvFish, S.lvAnimal].map(lvMark);
    for (let i = 0; i < 5; i++) {
      const req = f.r[i] || '';
      if (req && req.indexOf(marks[i]) < 0) return false;
    }
    return true;
  }

  /* 家具是否被材料筛选命中 */
  function passMatFilter(S, f) {
    const names = f.m.map(x => x[0]);
    for (const w of S.wantMats) if (names.indexOf(w) < 0) return false;
    const avoid = S.avoidMats.slice();
    for (const a of avoid) if (names.indexOf(a) >= 0) return false;
    return true;
  }

  /* ============ 核心：单件家具利润 ============
  *   · N 所有材料成本 = Σ(数量/动态产量 × 单位成本)
  *   · O 所有材料售卖 = Σ(数量 × 当前单价)
  *   · P 1个家具售卖 = ROUNDUP(基础价 × 甜品 × 建造等级倍率 × 1.2倍, 0)
  *   · Q 卖所有材料的利润 = O + 额外产物 − N
  *   · R 卖家具的利润 = P×产量 + 额外产物 − N
  *   · S/U 卖材料收益率（利润/成本、利润/售价）
  *   · T/V 卖家具收益率（利润/成本、利润/售价）
  *   · F 卖到上限所需数量 = ROUNDDOWN(上限/(P×产量+额外产物))
  * 材料链口径（data.js 存静态基准 sPy/sEssQ/sTreeQ/sCost，第7位 costAdj、第8位 pO 价格覆盖）：
  *   · 成本：鱼/动物材料为 VLOOKUP 公式（动态：动物成本=组耗能×饼干净价/供能，
  *     鱼/动物产量随熟练度·饼干·动物数量变化）→ 取 数量/动态产量×动态成本；
  *     其余材料（作物/陨星/精粹/定价）多为手填静态值（含精粹成本填 0 的覆盖）→ 取冻结值
  *   · 精粹数量 Q：鱼/动物为公式 M/P → 数量/动态产量；冻结值与「数量/静态产量」不符的
  *     单元格判定为手改（如初始相框横/竖的多宝石 ÷240），保持冻结值
  *   · 树木产量 S：= M/VLOOKUP 近似匹配，多宝石/飞宝珠稳定错行到 240 行，
  *     其余动物落到本行；鱼无树（仅芳菲似梦口红鱼为 =M/P 变体）；作物等用冻结值
  *   · pO：旧价格表误用的 66 处单元格，按当前显示值覆盖
   */
  /* 单个材料组的动态口径（calcFurniture 与 sheet3 家具查询共用） */
  function furMat(S, g) {
    const [name, qty, sPy, sEssQ, sTreeQ, sCost, costAdj, pO] = g;
    const m = matOf(S, name);
    const unit = m.py || 1;                      // 动态单次产量
    const isAni = m.kind === '动物', isFish = m.kind === '鱼';
    // 该组无动物时 P=0 → IFERROR(M/P×L,0)=0，Q/S 亦报错，按 0 计
    const noAni = isAni && anGroup7(S, name).yield <= 0;
    /* ---- 最多成本（U = IFERROR(M/P×L, 0)） ---- */
    const dynCost = isAni || isFish;             // L 为 VLOOKUP 公式的材料
    const cost = (noAni || unit <= 0 ? 0 : (qty / unit) * (dynCost ? m.cost : (sCost || 0)))
               + (costAdj || 0);
    const price = pO != null ? pO : m.price;
    /* ---- 精粹/树木产量 ---- */
    let essQ = sEssQ || 0, treeQ = sTreeQ || 0;
    const row240 = qty / (matOf(S, '缤纷珠').py || 1);  // VLOOKUP 近似匹配错行到缤纷珠行（÷240 基准）
    if (isFish) {
      // Q = M/P（公式）；冻结值与「数量/静态产量」不符的为手改（如 r830 芳菲似梦 Q=原始数）
      if (Math.abs(essQ - qty / sPy) < 1e-9) essQ = qty / unit;
      // S：标准公式为 0；仅 r830 芳菲似梦口红鱼为 =M/P 变体
      treeQ = (treeQ > 0 && Math.abs(treeQ - qty / sPy) < 1e-9) ? qty / unit : 0;
    } else if (isAni && !noAni) {
      // Q = M/P；初始相框横/竖(行810/819)多宝石用 ÷VLOOKUP(错行240) 变体
      if (Math.abs(essQ - qty / sPy) < 1e-9) essQ = qty / unit;
      else if (Math.abs(essQ - qty / 240) < 1e-9) essQ = row240;
      // S = M/VLOOKUP(sheet8 AO2:AS6,5) 近似匹配：多宝石/飞宝珠稳定错行到 240 行，其余落本行
      if (Math.abs(treeQ - qty / sPy) < 1e-9) treeQ = qty / unit;
      else if (Math.abs(treeQ - qty / 240) < 1e-9) treeQ = row240;
    }
    return { name, qty, m, unit, cost, price, essQ, treeQ };
  }

  function calcFurniture(S, f, force12) {
    const left = Math.max(S.weekCap - S.weekSold, 0);
    const unsellable = typeof f.p !== 'number';   // '无法售卖' → 利润类指标为静态 0
    let cost = 0, ess = 0, tree = 0, matSale = 0;
    const groups = f.m.map(g => furMat(S, g));
    for (const gr of groups) {
      cost += gr.cost;
      matSale += gr.qty * gr.price;
      if (S.sellEss) ess += gr.essQ * gr.m.essP;
      if (S.sellTree) tree += gr.treeQ * gr.m.treeP;
    }
    // 永驻林野展示箱：材料 L/N/P/V 全为 0 或空 → 成本/售卖/精粹/树均为 0
    if (f.mz) { cost = 0; matSale = 0; ess = 0; tree = 0; }
    const essPg = ess, treePg = tree;      // sheet3 查询口径：分组 Q×R / S×T 之和（不受 z 影响）
    // 64 件缺失 CD/CE 公式的家具，精粹/树售价按 0 计
    const essCE = f.z ? 0 : ess, treeCE = f.z ? 0 : tree;
    const mult = S.dessert * BUILD(S.lvBuild) * (force12 ? 1.2 : 1);
    const sell = unsellable ? 0 : ceil(f.p * mult);   // 1 个家具售卖价
    const yieldN = f.y || 1;
    const income = sell * yieldN + essCE + treeCE;      // sheet6 (CH×H)+DD+DE
    const profitPer = income - cost;                    // sheet6 CJ 卖家具的利润
    const count = unsellable ? 0 : (income > 0 ? floor(left / income) : 0);   // sheet6 CR
    const profitMat = matSale + essCE + treeCE - cost;  // sheet6 CI 卖所有材料的利润
    const totalSale = unsellable ? 0 : income * count;  // sheet1 D 卖家具总销售
    const totalProfit = unsellable ? 0 : profitPer * count;   // sheet6 CP / BZ 挣多少钱
    const saleBase = matSale + essCE + treeCE;          // sheet6 CG+DD+DE
    return {
      name: f.n, sell, cost, matSale, ess: essCE, tree: treeCE, extra: essCE + treeCE, essPg, treePg,
      income, profitPer, count,
      totalSale, totalProfit, profitMat,
      better: unsellable ? true : profitPer >= profitMat,  // sheet6 CO；无法售卖时 sheet3 D7 为文本，IF 恒真
      rateCost: cost > 0 ? profitPer / cost : 0,                    // sheet6 CL 卖家具收益率(利润/成本)
      rateSale: income > 0 ? profitPer / income : null,             // sheet6 CN 卖家具毛利率(利润/售价)
      matRateCost: cost > 0 ? profitMat / cost : 0,                 // sheet6 CK 卖材料收益率(利润/成本)
      matRateSale: saleBase > 0 ? profitMat / saleBase : null,      // sheet6 CM 卖材料毛利率(利润/售价)
      time: f.t, yield: yieldN, unsellable,
      rounds: floor(count / yieldN),
      bench: benchCount(S),
      mats: f.m, src: f.s, buy: f.b, is12: !!force12,
    };
  }

  /* ============ 制作排程（top 家具时间规划） ============
   * 口径：B1=剩余天数 / B3=工作台每轮可制作数量 / E=制作时间 / F=制作次数
   *   G 轮数 = ROUNDDOWN(F/B3, 0)
   *   H 余次 = F − B3×G
   *   I 展示 = 秒做（制作时间均为 1 分钟） ? "秒做" : G&"轮+"&H&"次"
   *   J 每日 = ROUNDUP((G+(H>0))/B1, 0) 次；间隔 = E/60<1 ? E&"分钟" : ROUNDUP(E/60,1)&"小时"
   *   K 时间 = (G+(H>0))×E/60/24 > B1 ? 不够 : 还够
   * F 即 calcFurniture 的 count（sheet6 CR 口径） */
  function craftPlan(S, count, time) {
    const n = Math.floor(count || 0);
    const bench = benchCount(S);
    const days = S.daysLeft;
    if (n <= 0 || !bench) return null;
    const full = Math.floor(n / bench);
    const rest = n - bench * full;
    const instant = time === 1;                       // 制作时间为 1 分钟 = 秒做
    const sessions = full + (rest > 0 ? 1 : 0);       // 需要上线的轮次总数
    const perDay = days > 0 ? Math.ceil(sessions / days) : null;
    const gap = time / 60 < 1 ? time + '分钟' : (Math.ceil(time / 6) / 10) + '小时';  // ROUNDUP(E/60,1)
    const needDays = sessions * time / 60 / 24;
    const enough = needDays <= days;
    return { bench, full, rest, instant, sessions, perDay, gap, needDays, enough };
  }

  /* ============ 烹饪食品 ============
   * 口径：
   *   P 材料总成本 = Σ(成本/产出)；产出：动物=top-7×饼干倍率(matOf.py)，鱼=熟练度产量，
   *     作物=静态值
   *   R 调味剂成本 = Q='无' ? 0 : 90（当前状态恒 90）
   *   S 总成本 = P + R
   *   售价（本地倍率取全局甜品倍率）：
   *     普通   C/D/E = ROUNDUP(T×甜品×{1, 1.05, 1.1}, 0)
   *     美味   C/D/E = ROUNDUP(ROUNDDOWN(T×1.1,0)×甜品×{1, 1.05, 1.1}, 0)
   *   利润 = 售价 − 总成本；收益率 = 利润/总成本、利润/售价
   *   当前售价（按烹饪等级 + 甜品 + 美味1.1）：
   *     U = ROUNDDOWN(T×1.1,0)×甜品；X = ROUNDUP(CHOOSE(等级档, U, U×1.05, U×1.1), 0)
   *   T='不可售卖' → 全部显示无法售卖；T=0 且总成本=0 → 利润 0、收益率 — */
  function calcFood(S, food) {
    const unsell = typeof food.t !== 'number';
    const mats = food.m.map(([name, cost, yf, dyn]) => {
      const y = dyn ? matOf(S, name).py : (yf || 0);
      return { name, cost, y, c: y > 0 ? cost / y : 0 };
    });
    const P = mats.reduce((s, m) => s + m.c, 0);
    const R = food.q === '无' ? 0 : 90;
    const total = P + R;
    const t = food.t, g = S.dessert;
    const mk = m => (unsell ? null : ceil(t * g * m));
    const mkD = m => (unsell ? null : ceil(Math.floor(t * 1.1) * g * m));
    const price = [1, 1.05, 1.1].map(mk);
    const priceD = [1, 1.05, 1.1].map(mkD);
    const profit = price.map(p => (p === null ? null : p - total));
    const profitD = priceD.map(p => (p === null ? null : p - total));
    const rate = profit.map(p => (p !== null && total > 0 ? p / total : null));
    const rateD = profitD.map(p => (p !== null && total > 0 ? p / total : null));
    const rateS = profit.map((p, i) => (p !== null && price[i] > 0 ? p / price[i] : null));
    const rateSD = profitD.map((p, i) => (p !== null && priceD[i] > 0 ? p / priceD[i] : null));
    /* sheet10 当前售价（烹饪等级档位：<7 → U，7-8 → ×1.05，≥9 → ×1.1） */
    let cur = null, curProfit = null, curRate = null, curRateS = null;
    if (!unsell) {
      const U = Math.floor(t * 1.1) * g;
      cur = ceil(U * TIER(S.lvCook));
      curProfit = cur - total;
      curRate = total > 0 ? curProfit / total : null;
      curRateS = cur > 0 ? curProfit / cur : null;
    }
    return {
      name: food.n, eff: food.eff, effD: food.effD, dur: food.dur, dur2: food.dur2,
      q: food.q, mats, P, R, total, unsell, zero: food.t === 0,
      price, priceD, profit, profitD, rate, rateD, rateS, rateSD,
      cur, curProfit, curRate, curRateS,
    };
  }

  /* 产物三档单价
   * 口径：单价 = ROUNDUP(基础价 × 档位倍率{当前TIER,1.05,1.1} × 甜品 × IF(1.2倍,1.2,1), 0)
   *       精粹/树单价同理（树不含甜品的有云绮/浅桃，沿用 matOf 规则）
   *       单份售价 = 单价×产量 + IF(卖精粹, 精粹数×精粹价) + IF(卖树, 树产量×树单价)
   *       单份利润 = 单份售价 − 成本；收益率 = 利润/成本、利润/售价 */
  function prodTiers(S, name) {
    const m0 = DB.mat[name];
    if (!m0) return null;
    const kind = m0[9];
    const lv = S[LVKEY[m0[0]] || 'lvPlant'];
    const k = is12(S, name) ? 1.2 : 1;
    const g = S.dessert;
    const pg = PG[name], eg = EG[name], tg = TG[name];
    const y = kind === '鱼' ? fishYield(S, name) : (kind === '陨星' ? 10 : m0[3]);
    const cost = m0[1];
    const mk = mult => {
      const price = (pg === undefined || lv >= pg) ? ceil(m0[6] * g * mult * k) : 0;
      const essP = (m0[5] && (eg === undefined || lv >= eg)) ? ceil(m0[8] * g * mult * k) : 0;
      const treeP = (m0[4] && tg !== undefined && lv >= tg)
        ? ceil(m0[7] * (NO_DESSERT_TREE[name] ? 1 : g) * mult * k) : 0;
      const sale = price * y + (S.sellEss ? m0[5] * essP : 0) + (S.sellTree ? m0[4] * treeP : 0);
      return {
        price, essP, treeP, sale,
        profit: sale - cost,
        rateCost: cost > 0 ? (sale - cost) / cost : 0,
        rateSale: sale > 0 ? (sale - cost) / sale : null,
      };
    };
    const tiers = [mk(TIER(lv)), mk(1.05), mk(1.1)];
    const hid = DB.hidden[name];
    return {
      name, kind, y, cost, tiers,
      base: mk(1),
      grow: growTime(S, name, m0[2], kind),
      hidden: hid && hid[0] !== '无' ? hid : null,
      locked: tiers[0].price <= 0,
    };
  }

  /* 家具排行 */
  function rankFurniture(S, limit) {
    const left = Math.max(S.weekCap - S.weekSold, 0);
    const out = [];
    for (const f of DB.fur) {
      if (!canCraft(S, f)) continue;
      if (!passMatFilter(S, f)) continue;
      const r = calcFurniture(S, f, false);
      if (r.count <= 0 || r.profitPer <= 0) continue;
      out.push(r);
    }
    out.sort((a, b) => b.totalProfit - a.totalProfit);
    return { list: out.slice(0, limit || 10), total: out.length, left };
  }

  /* 1.2 倍家具单独计算（1.2 列表含多件家具时展示第一件） */
  function calcFurn12(S) {
    const fn = Array.isArray(S.b12)
      ? S.b12.find(n => DB.fur.some(x => x.n === n))
      : S.b12Furn;
    if (!fn) return null;
    const f = DB.fur.find(x => x.n === fn);
    if (!f) return null;
    return calcFurniture(S, f, true);
  }

  /* ============ 产物（农作物 / 鱼 / 陨星 / 动物）利润 ============ */
  function calcProduce(S, name, force12) {
    const m0 = DB.mat[name];
    if (!m0) return null;
    const kind = m0[9];
    const left = Math.max(S.weekCap - S.weekSold, 0);
    const m = matOf(S, name);
    const k = force12 ? 1.2 : 1;
    const locked = m.price <= 0;          // 等级未解锁

    /* ---- 动物分支（top-7 口径）---- */
    if (kind === '动物') {
      const grp = anGroup7(S, name);
      const cp = ckParam(S, (S.ckSlots[0] || {}).n);
      const G = grp.yield * (modeBonus(S) + cp.mult);            // G 组产量/h
      const F = anRoundTime(S);                                  // F 产出周期（分钟）
      const price = force12 ? anPriceAC(S, name) : m.price;      // 本周1.2倍动物走 AC 口径，否则 H 口径
      const qty = price > 0 ? floor(left / price) : 0;            // Q = ROUNDDOWN(上限/H)
      // E = 组耗能 × 饼干净价 / 饼干能量（单个产物的饼干成本）
      const unitCost = cp.div > 0 ? grp.energy * cp.price / cp.div : 0;
      const ckNeed = G > 0 && cp.div > 0 ? qty / G * grp.energy / cp.div : 0;  // P
      const ckCost = floor(ckNeed) * cp.price;                    // V = ROUNDDOWN(P)×饼干净价
      const sale = price * qty;                                   // W = H×Q
      const profit = sale - ckCost;                               // X = W−V
      const gross = price * G;                                    // K = H×G（每小时总售价）
      const days = G > 0 ? Math.round(qty / G * F / 60 / 24 * 10) / 10 : 0;   // T
      return {
        name, kind, price, yield: G, cost: unitCost, locked: false,
        sale, ess: 0, tree: 0, profit, perIncome: price,
        portions: qty, plots: 0, grow: F, perDay: 0, capacity: Infinity,
        rounds: 0, enough: true,
      rateCost: unitCost > 0 ? (price - unitCost) / unitCost : 0,    // 加价率(每单位) = (H−E)/E；小时数 G 在分子分母抵消
      rateSale: price > 0 ? (price - unitCost) / price : null,        // 毛利率(每单位) = (H−E)/H，与家具/产物同口径
        is12: !!force12 || is12(S, name),
        essP: m.essP, treeP: m.treeP,
        ckCost, ckNeed,
        days,   // sheet7 T 列：全卖需要的产出天数（对比卡「还需 X 天」）
        /* 产物对比表字段 */
        fitQty: qty,
        cmpSale: sale, cmpCost: ckCost, cmpProfit: profit,
        cmpQty: qty, cmpEss: 0, cmpTree: 0,
      };
    }

    const price = ceil(m0[6] * S.dessert * TIER(S[LVKEY[m0[0]] || 'lvPlant']) * k);
    const y = kind === '鱼' ? fishYield(S, name) : (kind === '陨星' ? 10 : m0[3]);
    const sale = price * y;                // 单份售价
    const ess = S.sellEss && m0[5] ? m0[5] * m.essP : 0;
    const tree = S.sellTree && m0[4] ? m0[4] * m.treeP : 0;
    const cost = m0[1];
    const profit = sale + ess + tree - cost;
    const perIncome = sale + ess + tree;
    /* —— 产物对比表口径（数据源）——
     *   O = (上限−已卖)/K           K = 单份总收入
     *   所需数量 = ROUNDDOWN(O, 0)
     *   总销售 = 所需数量 × K
     *   总利润 = 所需数量 × (K − 成本)
     * 说明：与「地块凑整」无关，凑整只影响"需要收多少轮"的展示 */
    const fitQty = perIncome > 0 ? floor(left / perIncome) : 0;
    const F = fields(S);
    const plots = plotOf(S, name, kind);
    const grow = growTime(S, name, m0[2], kind);
    // 每天可收获次数 × 剩余天数 × 地块（陨星为探索行为，无时间约束）
    const perDay = grow > 0 ? floor((24 * 60) / grow) : 0;   // 每天可收获次数
    const capacity = kind === '陨星' ? Infinity : perDay * plots * S.daysLeft;
    const rounds = plots > 0 ? fitQty / plots : 0;
    /* 收获排程（sheet7 P/Q/R/Y 口径，作物/鱼）：
     *   轮次 = floor(份数/地块数)，余 = 份数−轮次×地块数；每天需收 = ceil((轮次+(余>0))/剩余天数)
     *   收满约需天数 = ceil(份数/(地块×每天可收))——按最大收获速率折算；陨星为探索行为，无时间约束 → null */
    const roundsFull = plots > 0 ? floor(fitQty / plots) : 0;
    const roundsRest = plots > 0 ? fitQty - roundsFull * plots : 0;
    const needDays = (kind !== '陨星' && plots > 0 && perDay > 0)
      ? Math.ceil(fitQty / (plots * perDay)) : null;
    return {
      name, kind, price, yield: y, sale, ess, tree, cost,
      profit, perIncome, portions: fitQty, plots, grow, perDay, capacity,
      rounds, enough: capacity >= fitQty,
      roundsFull, roundsRest, needDays,
      rateCost: cost > 0 ? profit / cost : 0,
      rateSale: perIncome > 0 ? profit / perIncome : 0,
      is12: !!force12 || is12(S, name),
      locked,
      /* 产物对比表字段 */
      fitQty,
      cmpSale: fitQty * perIncome,             // 总销售（全卖本产物）
      cmpCost: fitQty * cost,                  // 成本
      cmpProfit: fitQty * (perIncome - cost),  // 总利润（全卖本产物）
      cmpQty: fitQty * y,                      // 所需产物数量
      cmpEss: fitQty * (m0[5] || 0),           // 所需精粹数量
      cmpTree: fitQty * (m0[4] || 0),          // 所需树木数量
      essP: m.essP, treeP: m.treeP,
    };
  }

  function rankProduce(S, names) {
    const list = [];
    const src = names && names.length ? names : allProduce();
    for (const n of src) {
      if (!n || n === '不选') continue;
      /* 本周 1.2 倍产物按 1.2 价计入（与徽章、产物对比卡同口径——否则排行卡与对比卡上下数字对不上） */
      const r = calcProduce(S, n, is12(S, n));
      if (r) list.push(r);
    }
    const total = r => Math.min(r.capacity, r.portions) * r.profit;
    list.forEach(r => r.total = total(r));
    list.sort((a, b) => b.total - a.total);
    return list;
  }

  /* 全部作物/鱼/陨星列表（供 1.2 倍选择） */
  function allProduce() {
    return Object.keys(DB.mat).filter(k => {
      const v = DB.mat[k];
      return (v[9] === '作物' || v[9] === '鱼' || v[9] === '陨星') && v[6] > 0;
    });
  }

  /* 手动对比表可选列表（含 5 种动物） */
  function cmpProduceList() {
    return allProduce().concat(AN_GROUPS);
  }

  /* 作物田类型：
   * 小田←杯杯香/迷迭枝/铃铃草/蓬蓬兰/甜甜根/团团花；
   * 中田←爆爆辣/香茗茶/叮当果（树木）；大田←织云果（树木）
   * （树木条目"××叮当果树/××织云木"不进产物计算链，本函数只收 作物/鱼/陨星） */
  function plotOf(S, name, kind) {
    const F = fields(S);
    if (kind === '鱼') return F.pond;
    if (kind === '陨星') return 1;             // 采星无田，一次收全部
    if (/织云果/.test(name)) return F.big;
    if (/杯杯香|迷迭枝|铃铃草|蓬蓬兰|甜甜根|团团花/.test(name)) return F.small;
    return F.mid;                              // 爆爆辣/香茗茶/叮当果
  }

  /* ============ 动物好感度 / 投喂饼干 ============ */

  /* 单个饼干槽（数量 q 块） */
  function ckSlot(S, slot) {
    const ck = DB.ck.find(c => c.n === slot.n);
    const q = Math.max(0, Math.round(slot.q || 0));
    if (!ck || !q) return null;
    const mats = ckMats(S, ck);
    const buy = ck.n === '能量饼干' ? 1000 : ck.n === '美味饼干' ? 4000 : 0;
    const perCost = buy ? buy : mats.reduce((s, m) => s + m.cost / m.y, 0);   // 每块材料成本（gross 口径）
    // 制作材料时产生的额外产物（精粹/树）：数量 = ROUNDUP(数量/材料产量)
    const extras = mats.map(m => {
      let price = 0;
      if (m.exType === 'ess') price = matOf(S, m.name).essP;
      else if (m.exType === 'tree') price = matOf(S, m.name).treeP;
      return { name: m.name, exType: m.exType, n: Math.ceil(q / m.y), price };
    }).filter(x => x.price > 0 && x.n > 0);
    /* 自身材料剩余（sheet4 T 列）：做 q 块要 ceil(q/y) 批、每批产 y 个 → 剩 ceil(q/y)×y−q */
    const leftovers = mats.map(m => ({
      name: m.name, y: m.y,
      left: m.y > 0 ? Math.ceil(q / m.y) * m.y - q : 0,
    }));
    return {
      name: ck.n, q, energy: ck.energy * q, mult: ck.mult,
      perCost, mats, extras, leftovers,
      cost: perCost * q,
    };
  }

  /* 动物 + 饼干总计算 */
  function calcBiscuit(S) {
    const groups = AN_GROUPS.map(g => anGroup(S, g));
    const mb = modeBonus(S);
    const slots = S.ckSlots.map(sl => ckSlot(S, sl)).filter(Boolean);
    const energyPerRound = groups.reduce((s, g) => s + g.energy, 0);
    const totalEnergy = slots.reduce((s, x) => s + x.energy, 0);
    const roundsTotal = energyPerRound > 0 ? totalEnergy / energyPerRound : 0;
    const slot1 = slots.length ? slots[0] : null;

    // 每组总产量 = Σ槽 (槽能量/每轮耗能) × 组产量 × (模式加成 + 槽倍率)
    const qty = groups.map(g => {
      if (energyPerRound <= 0) return 0;
      let s = 0;
      for (const sl of slots) s += (sl.energy / energyPerRound) * g.yield * (mb + sl.mult);
      return s;
    });
    // 组单价：本周 1.2 倍动物按 sheet7 AC 口径（sheet1 I36 / sheet4 AE53），其余为 H 口径
    const prices = AN_GROUPS.map(g => (is12(S, g) ? anPriceAC(S, g) : matOf(S, g).price));
    // 额外产物收入（按 sellExtra 过滤）
    let extraSale = 0;
    const extrasOut = [];
    for (const sl of slots) {
      for (const x of sl.extras) {
        const keep = S.sellExtra === 'both' ||
          (S.sellExtra === 'ess' && x.exType === 'ess') ||
          (S.sellExtra === 'tree' && x.exType === 'tree');
        if (!keep) continue;
        extraSale += x.n * x.price;
        extrasOut.push({ name: x.name, n: x.n, price: x.price });
      }
    }
    const groupsOut = groups.map((g, i) => ({
      group: g.group, count: g.count, yield: g.yield, energy: g.energy,
      used: g.used, qty: qty[i], price: prices[i],
      sale: Math.floor(qty[i]) * prices[i],
    }));
    const totalSale = groupsOut.reduce((s, g) => s + g.sale, 0) + extraSale;
    const ckCost = slots.reduce((s, x) => s + x.cost, 0);
    const totalProfit = totalSale - ckCost;
    const hours = roundsTotal * anRoundTime(S) / 60;            // 饼干吃完所需时间（小时）
    const left = Math.max(0, (S.weekCap || 0) - (S.weekSold || 0));
    // 单轮产值（用第一个饼干的倍率）
    const singleRoundValue = groups.reduce((s, g, i) =>
      s + g.yield * (mb + (slot1 ? slot1.mult : 1)) * prices[i], 0);
    const leftAfterExtra = left - extraSale;
    // 卖到上限所需数量参考
    const needQty = groups.map((g, i) =>
      singleRoundValue > 0 ? leftAfterExtra / singleRoundValue * g.yield * (mb + (slot1 ? slot1.mult : 1)) : 0);
    const days = hours / 24;
    return {
      groups: groupsOut, slots, modeBonus: mb, energyPerRound, totalEnergy, roundsTotal,
      hours, days, ckCost, extraSale, extrasOut, totalSale, totalProfit,
      singleRoundValue, leftAfterExtra, needQty, left,
      rateCost: ckCost > 0 ? totalProfit / ckCost : 0,
      rateSale: totalSale > 0 ? totalProfit / totalSale : null,
      hasSlot1: !!slot1,
      // 提示
      lessHint: totalSale < leftAfterExtra - singleRoundValue && singleRoundValue > 0,
      overHint: totalSale > left,
      timeHint: S.daysLeft > 0 && days >= S.daysLeft,
      daysLeft: S.daysLeft,
    };
  }

  /* ============ 卖整凑整（参考 blog：Σ单价×数量=R 的自然数解枚举） ============
   * 需求：园宝每周收购有上限，为最大限度换光星实，求每种产物各卖多少个，
   *      使 Σ单价×数量 恰好 = R（剩余可赚），一分不浪费。
   * 逻辑（移植自 blog《无限暖暖家园园宝收购计算器》）：
   *   最多 3 种产物，解 coeff_a×A + coeff_b×B + coeff_c×C = R：
   *     枚举 c ∈ [0, cMax]、b ∈ [0, R/pb]，a = (R − pc·c − pb·b) ÷ pa 校验整除
   *   cMax 逐级放宽 10 → 100 → 1000（blog 优化版从小额产物 C≤10 起步）；
   *   始终无精确解时，回退「≤R 且最接近」的组合（差额提示）。
   * 输入：R 目标金额；items [{name, price}]（price>0，内部按单价降序取前 3）
   * 输出：{ exact, cur:{plan,total,qty}, alts:[…], diff, cMax }；R≤0 或无可售产物返回 null */
  function sellSolve(R, items) {
    const its = (items || []).filter(x => x && x.price > 0)
      .sort((a, b) => b.price - a.price).slice(0, 3);
    if (!its.length || !(R > 0)) return null;
    const pa = its[0].price;
    const pb = its.length > 1 ? its[1].price : 0;
    const pc = its.length > 2 ? its[2].price : 0;
    const pack = (a, b, c) => {
      const plan = [];
      if (its[0]) plan.push({ name: its[0].name, price: pa, qty: a });
      if (its[1]) plan.push({ name: its[1].name, price: pb, qty: b });
      if (its[2]) plan.push({ name: its[2].name, price: pc, qty: c });
      const total = plan.reduce((s, x) => s + x.price * x.qty, 0);
      return { plan, total, qty: a + b + c };
    };
    const exacts = [];
    let closest = null, usedCMax = 0;
    const passes = pc > 0 ? [10, 100, 1000] : [0];
    for (const cMax of passes) {
      usedCMax = cMax;
      const maxC = pc > 0 ? Math.min(cMax, Math.floor(R / pc)) : 0;
      const maxB = pb > 0 ? Math.floor(R / pb) : 0;
      const bCap = cMax >= 1000 ? Math.min(maxB, 5000) : maxB;   // 大放宽档限流防卡顿
      for (let c = 0; c <= maxC; c++) {
        for (let b = 0; b <= bCap; b++) {
          const rem = R - pc * c - pb * b;
          if (rem < 0) break;
          const a = Math.floor(rem / pa);
          if (a < 0) continue;
          const val = pa * a + pb * b + pc * c;
          if (rem % pa === 0 && exacts.length < 200) exacts.push(pack(a, b, c));
          if (val <= R && (!closest || val > closest.total)) closest = pack(a, b, c);
        }
      }
      if (exacts.length) break;
    }
    if (exacts.length) {
      // 默认方案：交易次数最少（数量总和最小）；备选按数量升序供切换
      const sorted = exacts.slice().sort((x, y) => x.qty - y.qty || y.total - x.total);
      return { exact: true, cur: sorted[0], alts: sorted.slice(1, 30), diff: 0, cMax: usedCMax };
    }
    return { exact: false, cur: closest, alts: [], diff: closest ? R - closest.total : R, cMax: usedCMax };
  }

  /* ================= 卖整：多产物凑整（DP 背包，blog 思路的推广） =================
   * 目标：Σ(单价×数量) = R；优先精确凑满，否则取 ≤ R 的最接近值；同等金额下件数最少。
   * 支持任意多种产物（内部按单价降序取前 maxK 种参与计算，超出部分不计）。
   * 产物可带数量上限（item.cap ≥ 1，库存不够时用）：方案中该产物数量不超过上限。
   * 实现：一维 DP，cnt[v] = 凑出恰好 v 的最少件数，from[v]/fromQ[v] = 所用产物下标与件数；
   *   无上限产物：逐产物升序松弛（无限背包）；
   *   有上限产物：按剩余类滑动窗口（单调队列，O(N)/种），转移只读「该层之前」的旧值；
   *     还原方案遇到有上限层的写入时，要切换到该层之前的快照继续回溯——
   *     否则同层多个写入会串成一条超过上限的假链。快照懒重建：回溯中层号严格递减，
   *     同一快照只在一段连续回溯里使用，用完即可弃，内存 O(N)。
   * gcd 缩减（全部单价与 R 的公因子）缩小 DP 规模；typed array 保证性能。
   * skip>0 时跳过最贵的 skip 种产物，用于生成「其他解法」。
   */
  const SELL_MAXK = 32;            // 参与计算的产物种类上限（按单价降序）
  const SELL_MAXDP = 2000000;      // DP 规模硬上限（缩减后的目标值）
  function _gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

  function _sellDP(R, items, skip) {
    const its = (items || []).filter(x => x && x.price > 0)
      .sort((a, b) => b.price - a.price);
    if (skip > 0) its.splice(0, Math.min(skip, its.length));
    if (!its.length || !(R > 0)) return null;
    // 同单价且**无上限**的产物才可合并（求解等价）；有 cap 的合并会削减总供应：
    // (37,cap2)+(37,cap2) 合并成 (37,cap2) 会把可供应的 4 件变 2 件（对拍 case283，差 74），
    // 故有 cap 的同价条目逐条保留。
    const seen = {}, use = [];
    for (const it of its) {
      const cap = (it.cap != null && isFinite(it.cap) && it.cap >= 1) ? Math.floor(it.cap) : 0;
      if (cap === 0) {
        const key = 'p' + it.price;
        if (key in seen) continue;
        seen[key] = 1;
      }
      use.push({ name: it.name, price: it.price, cap });
    }
    if (!use.length) return null;
    const K = Math.min(use.length, SELL_MAXK);
    const sel = use.slice(0, K);
    const names = sel.map(x => x.name);
    let P = sel.map(x => Math.round(x.price));
    const CAP = sel.map(x => x.cap);
    // gcd 缩减：可达金额必为 g 的倍数 → 目标与单价同步缩小（上限是件数，不受缩放影响；
    // R 非 g 倍数时仍可缩，exact 由还原后金额判定）
    let g = 0; for (const p of P) g = _gcd(g, p);
    let target = R, scaled = false;
    if (g > 1) {
      const t2 = Math.floor(R / g);
      if (t2 >= 1 && t2 <= SELL_MAXDP) { target = t2; P = P.map(p => p / g); scaled = true; }
      else if (R > SELL_MAXDP) return null;   // 规模超限且无法缩减 → 放弃
    } else if (R > SELL_MAXDP) return null;
    const n = P.length, N = target;
    const INF = 0x3fffffff;
    const hasCap = CAP.some(c => c >= 1);
    const st = {
      cnt: new Int32Array(N + 1).fill(INF),
      from: new Int32Array(N + 1).fill(-1),
      fromQ: new Int32Array(N + 1),
    };
    st.cnt[0] = 0;
    const prevC = hasCap ? new Int32Array(N + 1) : null;   // 有上限层的旧值快照（复用缓冲）
    const dq = hasCap ? new Int32Array(N + 1) : null;      // 单调队列（复用缓冲）

    /* 无上限产物：升序就地松弛（无限背包，可重复使用） */
    function applyUnbounded(s, i) {
      const p = P[i];
      for (let v = p; v <= N; v++) {
        const c0 = s.cnt[v - p];
        if (c0 < INF && c0 + 1 < s.cnt[v]) { s.cnt[v] = c0 + 1; s.from[v] = i; s.fromQ[v] = 1; }
      }
    }
    /* 有上限产物：按剩余类滑动窗口，f(v) = min_{q≤cap}( 旧cnt[v−q·p] + q )，旧 = 该层之前 */
    function applyCapped(s, i, cap) {
      const p = P[i];
      const c = Math.min(cap, Math.floor(N / p));
      if (c < 1) return;                       // 单价超过目标，一个也放不下
      prevC.set(s.cnt);
      for (let r = 0; r < p; r++) {
        let h = 0, t2 = 0;
        for (let v = r; v <= N; v += p) {
          const key = prevC[v] * p - v;        // 候选代价 = (key+v)/p，键小者优
          while (t2 > h && prevC[dq[t2 - 1]] * p - dq[t2 - 1] >= key) t2--;
          dq[t2++] = v;
          const lo = v - c * p;                // 窗口左界：件数 q ≤ cap
          while (dq[h] < lo) h++;
          const tb = dq[h], q = (v - tb) / p, cand = prevC[tb] + q;
          if (cand < s.cnt[v]) { s.cnt[v] = cand; s.from[v] = i; s.fromQ[v] = q; }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (CAP[i] >= 1) applyCapped(st, i, CAP[i]); else applyUnbounded(st, i);
    }
    // 取精确；否则从高到低找第一个可达值（最接近）
    let v = -1;
    if (st.cnt[N] < INF) v = N;
    else { for (let w = N; w >= 0; w--) { if (st.cnt[w] < INF) { v = w; break; } } }
    if (v < 0) return null;
    const gg = scaled ? g : 1;                  // 实际缩放倍数
    /* 还原方案。有上限产物的写入引用「该层之前」的旧状态，回溯到这类写入时
     * 必须切换到对应快照（重放前 i 层）再继续，否则同一产物会被串出超过上限的假链。 */
    const qtys = new Array(n).fill(0);
    let ctx = st, snap = null, t = v;
    while (t > 0) {
      const i = ctx.from[t];
      if (i < 0) break;
      const q = ctx.fromQ[t] || 1;
      qtys[i] += q;
      t -= P[i] * q;
      if (CAP[i] >= 1) {                        // 进入层 i 之前的状态
        if (!snap || snap.i !== i) {            // 层号在回溯中严格递减，快照不会重访
          const s = {
            i,
            cnt: new Int32Array(N + 1).fill(INF),
            from: new Int32Array(N + 1).fill(-1),
            fromQ: new Int32Array(N + 1),
          };
          s.cnt[0] = 0;
          for (let k = 0; k < i; k++) {
            if (CAP[k] >= 1) applyCapped(s, k, CAP[k]); else applyUnbounded(s, k);
          }
          snap = s;
        }
        ctx = snap;
      }
    }
    const realTotal = v * gg;                   // 还原真实金额
    const plan = [];
    for (let i = 0; i < n; i++) if (qtys[i] > 0) plan.push({ name: names[i], price: P[i] * gg, qty: qtys[i] });
    return { exact: realTotal === R, plan, total: realTotal, qty: plan.reduce((s, x) => s + x.qty, 0), diff: R - realTotal, used: K };
  }

  function sellSolveN(R, items, opt) {
    const skip = (opt && opt.skip) || 0;
    return _sellDP(R, items, skip);
  }
  // 「其他解法」：依次跳过最贵的 1/2/3 种产物重解（用户可能没有某种的库存）
  function sellSolveAlt(R, items, skip) {
    if (!(skip > 0)) return null;
    const s = _sellDP(R, items, skip);
    return s && s.exact ? s : null;
  }

  global.Core = {
    defaultState, matOf, fields, growTime, benchCount, lvMark, craftPlan,
    furMat,
    calcFurniture, rankFurniture, calcFurn12, calcProduce, rankProduce,
    calcFood, prodTiers,
    allProduce, cmpProduceList, STAR, TIER, BUILD, is12,
    fishYield, anAffOf, anCaps, anGroup, anGroup7, anOne, ckMats, ckSlot, ckParam,
    anPriceRaw, anPriceH, anPriceAC,
    calcBiscuit, plotOf, modeBonus, anRoundTime, sellSolve, sellSolveN, sellSolveAlt,
    AN_GROUPS, PG, EG, TG,
  };
})(typeof window !== 'undefined' ? window : globalThis);
