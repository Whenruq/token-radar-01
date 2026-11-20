// Token Launch Radar — the dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts from the same board that board.json carries) and renders the ranked board, filters, a
// per-protocol detail drawer with the model's own arithmetic, and the live-token calibration the
// model was priced from. No network: every byte it shows is already in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, sort: 'implied_value_usd', dir: -1, selected: null };

  // Hash state lets a screenshot (or a shared link) open the exact view: #q=lend&category=Lending,
  // #detail=<slug>, #watchlist=1, #sort=tvl_usd. Reading it here keeps the page deterministic.
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var at = pair.indexOf('=');
      if (at < 0) return;
      var key = pair.slice(0, at);
      var value = decodeURIComponent(pair.slice(at + 1));
      if (key === 'q') state.q = value;
      else if (key === 'category') state.category = value;
      else if (key === 'chain') state.chain = value;
      else if (key === 'watchlist') state.watchlistOnly = value === '1';
      else if (key === 'sort') state.sort = value;
      else if (key === 'detail') state.selected = value;
    });
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x';
  }

  // The model, recomputed in the page from the row's own snapshot figures: the detail drawer shows
  // this arithmetic next to the board's number, so the code and the data visibly agree.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return {
      value: Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity)),
      growthPct: growth,
      growthMult: growthMult,
      maturityMult: maturity,
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function stat(value, label) {
    return el('div', { class: 'stat' }, el('span', { class: 'v', text: value }), el('span', { class: 'k', text: label }));
  }

  function renderHeader() {
    var head = el('div', { class: 'head' },
      el('div', { class: 'radar', 'aria-hidden': 'true' }),
      el('div', { class: 'head-text' },
        el('h1', null, 'Token Launch ', el('span', { class: 'thin', text: 'Radar' })),
        el('p', { class: 'tagline' },
          'Every protocol in the sealed snapshot, scanned for the ones that ', el('strong', { text: 'record no token yet' }),
          ' — ranked by what a launch would be worth if their record stayed as it is, with a concrete plan to farm each one. Snapshot of ',
          el('strong', { text: DATA.as_of }), ' · model ', el('strong', { text: DATA.model_version }), '.'),
        el('div', { class: 'stats' },
          stat(String(DATA.scanned), 'protocols scanned'),
          stat(String(DATA.watchlist_size), 'on the watchlist'),
          stat(String(DATA.board_size), 'ranked pre-token'),
          stat(String(DATA.early_size), 'early, below the floor'),
          stat(fmtUsd(DATA.total_implied_usd), 'total implied value'),
          stat(fmtMult(DATA.global_multiple), 'global mcap / TVL'))));
    return head;
  }

  function renderMethod() {
    var m = DATA.model;
    var card = el('section', { class: 'card' },
      el('h2', { text: 'How the radar prices a launch' }),
      el('div', { class: 'formula' },
        'implied value = ', el('b', { text: 'TVL' }), ' × ', el('b', { text: 'category multiple' }), ' × ',
        el('b', { text: 'growth' }), ' × ', el('b', { text: 'maturity' })),
      el('div', { class: 'method-grid' },
        el('div', { class: 'm' },
          el('h3', null, 'Category multiple — read off the market'),
          el('p', null, 'For each category, the median market-cap / TVL of protocols whose token already trades (',
            el('span', { class: 'n', text: '≥' + m.multiple_min_samples + ' samples' }), ', clamped ', el('span', { class: 'n', text: m.multiple_floor + '–' + m.multiple_cap + 'x' }),
            '), else the global median ', el('span', { class: 'n', text: fmtMult(DATA.global_multiple) }), '. A pre-token protocol is priced the way the market prices its trading peers.')),
        el('div', { class: 'm' },
          el('h3', null, 'Growth — seven-day momentum'),
          el('p', null, 'TVL change over seven days, clamped to ', el('span', { class: 'n', text: m.growth_floor + '%…' + m.growth_cap + '%' }),
            ', weighted ', el('span', { class: 'n', text: '×' + m.growth_weight }), '. A protocol gaining TVL fast is worth more at launch than one bleeding it.')),
        el('div', { class: 'm' },
          el('h3', null, 'Maturity — time run with no token'),
          el('p', null, 'Days since DefiLlama began tracking it, saturating at ', el('span', { class: 'n', text: m.maturity_days + ' days' }),
            ': multiplier ', el('span', { class: 'n', text: m.maturity_floor + ' → ' + (m.maturity_floor + m.maturity_range).toFixed(2) }),
            '. A protocol that has run for years without a token has more to distribute.')),
        el('div', { class: 'm' },
          el('h3', null, 'Signal — a reading aid'),
          el('p', null, 'A 0–100 blend of scale, momentum, endurance and chain reach, shown as a bar. Rank is always by implied value; the signal just helps a reader scan.'))));
    return card;
  }

  function distinct(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    return out.sort();
  }

  function renderControls(onChange) {
    var categories = distinct(DATA.rows.map(function (r) { return r.category; }));
    var chains = distinct([].concat.apply([], DATA.rows.map(function (r) { return r.chains; })));

    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; onChange(); });

    var catSel = el('select', { 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; onChange(); });

    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; onChange(); });

    var watch = el('input', { type: 'checkbox' });
    watch.checked = state.watchlistOnly;
    watch.addEventListener('change', function () { state.watchlistOnly = watch.checked; onChange(); });

    var count = el('span', { class: 'count', id: 'row-count' });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel),
      el('label', { class: 'toggle' }, watch, 'Watchlist only'),
      count);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sortedRows(rows) {
    var key = state.sort;
    var dir = state.dir;
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (typeof av === 'string' || typeof bv === 'string') {
        av = String(av || '');
        bv = String(bv || '');
        return dir * (av < bv ? -1 : av > bv ? 1 : 0) || a.rank - b.rank;
      }
      av = av === null || av === undefined ? -Infinity : av;
      bv = bv === null || bv === undefined ? -Infinity : bv;
      return dir * (av - bv) || a.rank - b.rank;
    });
  }

  var COLUMNS = [
    { key: 'rank', label: '#', left: false },
    { key: 'name', label: 'Protocol', left: true },
    { key: 'category', label: 'Category', left: true },
    { key: 'tvl_usd', label: 'TVL' },
    { key: 'change_7d', label: '7d change' },
    { key: 'age_days', label: 'Age' },
    { key: 'signal_score', label: 'Signal' },
    { key: 'implied_value_usd', label: 'Implied value' },
  ];

  function renderTable(onSort, onSelect) {
    var rows = sortedRows(filteredRows());
    var count = document.getElementById('row-count');
    if (count) count.innerHTML = 'showing <b>' + rows.length + '</b> of ' + DATA.board_size + ' ranked';

    var head = el('tr', null, COLUMNS.map(function (col) {
      var active = state.sort === col.key;
      var btn = el('button', {
        type: 'button',
        onclick: function () { onSort(col.key); },
      }, col.label, active ? el('span', { class: 'arr', text: state.dir < 0 ? '▼' : '▲' }) : null);
      return el('th', { class: col.left ? 'l' : null }, btn);
    }));

    var body = el('tbody', null);
    if (rows.length === 0) {
      body.appendChild(el('tr', null, el('td', { colspan: '8', class: 'l' },
        el('div', { class: 'empty', text: 'No protocol matches those filters. Clear the search or pick another category.' }))));
    }
    rows.forEach(function (r) {
      var pct = r.change_7d;
      var pctCls = pct === null || pct === undefined ? 'flat' : pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
      var tr = el('tr', {
        class: state.selected === r.slug ? 'sel' : null,
        onclick: function () { onSelect(r.slug); },
        title: 'Open ' + r.name + ' — farm plan and model breakdown',
      },
        el('td', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) }),
        el('td', { class: 'l' },
          el('span', { class: 'pname', text: r.name }),
          el('span', { class: r.on_watchlist ? 'badge' : 'badge early', text: r.on_watchlist ? 'watchlist' : 'early' }),
          el('span', { class: 'pslug', text: r.slug })),
        el('td', { class: 'l' },
          el('span', { text: r.category || '—' }),
          el('span', { class: 'chains', text: r.chains.length ? ' · ' + r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : '' })),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { class: pctCls, text: fmtPct(pct) }),
        el('td', { text: fmtAge(r.age_days) }),
        el('td', null, el('span', { class: 'signal' },
          el('span', { class: 'bar' }, el('i', { style: 'width:' + r.signal_score + '%' })),
          el('span', { class: 'sv', text: String(r.signal_score) }))),
        el('td', { class: 'implied', text: fmtUsd(r.implied_value_usd) }));
      body.appendChild(tr);
    });

    return el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, head), body));
  }

  function fact(value, label) {
    return el('div', { class: 'fact' }, el('span', { class: 'v', text: value }), el('span', { class: 'k', text: label }));
  }

  // A farm step string is "Action. Cost: X. Time: Y." — split it back for display.
  function stepParts(s) {
    var costAt = s.indexOf(' Cost: ');
    var timeAt = s.indexOf('. Time: ');
    if (costAt < 0 || timeAt < 0) return { action: s, meta: null };
    return {
      action: s.slice(0, costAt),
      cost: s.slice(costAt + 7, timeAt),
      time: s.slice(timeAt + 8).replace(/\.$/, ''),
    };
  }

  function renderDrawer(slug, onClose) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return null;
    var calc = impliedOf(row);

    var steps = el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
      var parts = stepParts(s);
      var meta = parts.meta === null ? null : el('span', { class: 'meta' },
        'Cost: ', el('b', { text: parts.cost }), ' · Time: ', el('b', { text: parts.time }));
      return el('li', null, parts.action, meta);
    }));

    var drawer = el('aside', { class: 'drawer', role: 'dialog', 'aria-label': row.name + ' detail' },
      el('button', { class: 'close', type: 'button', onclick: onClose, text: 'Close ×' }),
      el('h2', { text: row.name }),
      el('div', { class: 'sub', text: row.slug + ' · rank #' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · watchlist' : ' · early, below the floor') }),
      el('div', { class: 'facts' },
        fact(fmtUsd(row.implied_value_usd), 'implied value'),
        fact(fmtUsd(row.tvl_usd), 'TVL'),
        fact(fmtPct(row.change_7d), '7-day change'),
        fact(fmtAge(row.age_days), 'age, no token'),
        fact(String(row.signal_score) + ' / 100', 'signal'),
        fact(row.category || '—', 'category')),
      el('p', { class: 'note' },
        'Chains: ', row.chains.length ? row.chains.join(', ') : 'not listed',
        row.listed_at ? ' · tracked since ' + row.listed_at : ' · listing date not recorded',
        '. This protocol records no token in the snapshot — that is a statement about the record, not proof none exists.'),
      el('h3', { text: 'The model, on this protocol' }),
      el('div', { class: 'breakdown' },
        el('div', null, el('span', { text: 'TVL' }), el('span', { text: fmtFull(row.tvl_usd) })),
        el('div', null, el('span', { text: '× category multiple (' + (row.multiple_source === 'category' ? row.category + ' median' : 'global median') + ')' }), el('span', { text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: '× growth (' + fmtPct(calc.growthPct) + ' clamped)' }), el('span', { text: calc.growthMult.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: '× maturity (' + fmtAge(row.age_days) + ' run)' }), el('span', { text: calc.maturityMult.toFixed(3) + 'x' })),
        el('div', { class: 'tot' }, el('span', { text: 'implied value' }), el('span', { text: fmtFull(calc.value) }))),
      el('p', { class: 'note', text: 'Recomputed in this page from the row above; it matches the board\u2019s figure because both run the same arithmetic on the same snapshot.' }),
      el('h3', { text: 'Farm plan' }),
      steps,
      el('p', { class: 'note', text: 'Costs are estimates from the protocol\u2019s own scale (TVL tier, chain gas, age). Farming is not financial advice: smart-contract risk is real, and a token may never come.' }));

    var back = el('div', { class: 'drawer-back', onclick: onClose });
    return el('div', null, back, drawer);
  }

  function renderCalibration() {
    var calibRows = DATA.calibration.map(function (c) {
      return el('tr', null,
        el('td', { class: 'l', text: c.category }),
        el('td', { text: String(c.samples) }),
        el('td', { text: fmtMult(c.median_multiple) }));
    });
    var liveRows = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', { class: 'l', text: r.name }),
        el('td', { text: fmtUsd(r.mcap_usd) }),
        el('td', { text: fmtUsd(r.tvl_usd) }),
        el('td', { text: fmtMult(r.mcap_tvl_multiple) }));
    });
    return el('section', { class: 'card' },
      el('h2', { text: 'Calibration — how the market prices what already trades' }),
      el('p', { class: 'note' },
        'The board never ranks a protocol whose token trades. Instead, those protocols price the model: ',
        'each category\u2019s median market-cap / TVL becomes the multiple applied to its pre-token peers. ',
        'Global median across the snapshot: ', el('strong', { text: fmtMult(DATA.global_multiple) }), '.'),
      el('div', { class: 'calib-grid' },
        el('div', null,
          el('h3', { text: 'Category multiples' }),
          el('table', { class: 'mini' },
            el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Samples' }), el('th', { text: 'Median' }))),
            el('tbody', null, calibRows))),
        el('div', null,
          el('h3', { text: 'Largest live tokens (set aside, not ranked)' }),
          el('table', { class: 'mini' },
            el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { text: 'Market cap' }), el('th', { text: 'TVL' }), el('th', { text: 'Mcap/TVL' }))),
            el('tbody', null, liveRows)))));
  }

  function renderFooter() {
    return el('footer', null,
      'Data: ', DATA.source, ' · snapshot of ', DATA.as_of, ', floor ', fmtUsd(DATA.floor_usd),
      '. "Records no token" describes the snapshot\u2019s record, never proof that none exists. ',
      'Implied value is this radar\u2019s model claim, not a prediction that a token will be issued, and nothing here is financial advice.');
  }

  var tableHost = el('div', null);
  var drawerHost = el('div', null);

  function refreshTable() {
    tableHost.innerHTML = '';
    tableHost.appendChild(renderTable(function (key) {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      refreshTable();
    }, function (slug) {
      state.selected = slug;
      refreshTable();
      refreshDrawer();
    }));
  }

  function refreshDrawer() {
    drawerHost.innerHTML = '';
    if (!state.selected) return;
    var node = renderDrawer(state.selected, function () {
      state.selected = null;
      refreshTable();
      refreshDrawer();
    });
    if (node) drawerHost.appendChild(node);
  }

  readHash();
  app.appendChild(renderHeader());
  app.appendChild(renderMethod());
  app.appendChild(renderControls(refreshTable));
  app.appendChild(tableHost);
  app.appendChild(renderCalibration());
  app.appendChild(renderFooter());
  app.appendChild(drawerHost);
  refreshTable();
  refreshDrawer();
  app.setAttribute('aria-busy', 'false');
})();
