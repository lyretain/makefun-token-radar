(function () {
  const data = globalThis.ASHLAR;
  const rowsEl = document.getElementById('rows');
  const detailEl = document.getElementById('detail');
  const countEl = document.getElementById('count');
  const metaEl = document.getElementById('meta');
  const methodEl = document.getElementById('method');
  const qEl = document.getElementById('q');
  const catEl = document.getElementById('cat');
  const chainEl = document.getElementById('chain');
  const watchEl = document.getElementById('watch');
  const gapEl = document.getElementById('gap');
  const clearEl = document.getElementById('clear');
  if (!data || !Array.isArray(data.rows)) {
    metaEl.textContent = 'No board was written beside this page.';
    return;
  }

  const usd = (n) => {
    const sign = n < 0 ? '-' : '';
    return sign + '$' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  const mult = (bps) => {
    const whole = Math.trunc(bps / 10000);
    return whole + '.' + String(Math.abs(bps % 10000)).padStart(4, '0') + '×';
  };
  const pct = (n) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n + '%');
  const roleName = (role) => (role === 'watch' ? 'Watchlist' : role === 'gap' ? 'Off list' : 'Below floor');

  function fillSelect(select, values, allLabel) {
    const first = select.options[0];
    select.replaceChildren(first);
    first.textContent = allLabel;
    for (const value of values) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.append(opt);
    }
  }
  const categories = [...new Set(data.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(data.rows.flatMap((r) => r.chains))].sort();
  fillSelect(catEl, categories, 'All categories');
  fillSelect(chainEl, chains, 'All chains');

  metaEl.textContent = data.as_of + ' · ' + data.row_count + ' rows · ' + data.watchlist_size + ' watchlist · floor ' + usd(data.floor_usd) + ' · ' + data.peer_n + ' tokenized peers';
  methodEl.textContent = 'Implied value = recorded TVL × a category mcap/TVL median. Peer ratios are clipped to this file’s ' + mult(data.clip_low_bps) + '–' + mult(data.clip_high_bps) + ' band before the median, then shrunk toward the file-wide median (' + mult(data.global_median_bps) + ', ' + data.shrink_pseudo + ' pseudo-peers). Breadth, momentum and tenure move the result by only a few percent. A missing gecko id is not proof that no token exists. Nothing here is a price, a yield or a promise that a token will be issued.';

  function hashState() {
    const q = new URLSearchParams(location.hash.replace(/^#/, ''));
    return {
      q: q.get('q') || '',
      cat: q.get('cat') || '',
      chain: q.get('chain') || '',
      watch: q.get('watch') === '1',
      gap: q.get('gap') === '1',
      p: q.get('p') || '',
    };
  }
  function writeHash(picked) {
    const q = new URLSearchParams();
    if (qEl.value) q.set('q', qEl.value);
    if (catEl.value) q.set('cat', catEl.value);
    if (chainEl.value) q.set('chain', chainEl.value);
    if (watchEl.checked) q.set('watch', '1');
    if (gapEl.checked) q.set('gap', '1');
    if (picked) q.set('p', picked);
    const next = q.toString();
    if (location.hash.replace(/^#/, '') !== next) history.replaceState(null, '', next ? '#' + next : location.pathname);
  }
  function applyHash() {
    const s = hashState();
    qEl.value = s.q;
    catEl.value = [...catEl.options].some((o) => o.value === s.cat) ? s.cat : '';
    chainEl.value = [...chainEl.options].some((o) => o.value === s.chain) ? s.chain : '';
    watchEl.checked = s.watch;
    gapEl.checked = s.gap;
    return s.p;
  }

  let picked = '';

  function matches(row) {
    const needle = qEl.value.trim().toLowerCase();
    if (needle && !row.name.toLowerCase().includes(needle) && !row.slug.toLowerCase().includes(needle)) return false;
    if (catEl.value && row.category !== catEl.value) return false;
    if (chainEl.value && !row.chains.includes(chainEl.value)) return false;
    if (watchEl.checked && !row.on_watchlist) return false;
    if (gapEl.checked && row.list_role !== 'gap') return false;
    return true;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showDetail(row) {
    detailEl.hidden = false;
    detailEl.replaceChildren();
    detailEl.append(el('p', 'kicker', 'Rank ' + row.rank + ' · ' + roleName(row.list_role)));
    detailEl.append(el('h2', '', row.name));
    detailEl.append(el('p', 'sub', row.slug + ' · ' + (row.category || 'Uncategorized')));
    if (row.list_role === 'gap') {
      detailEl.append(el('p', 'warn', 'Above the floor and off the house watchlist. This file has no parentProtocol field, so the house may already class it as another product.'));
    }
    const tvlPct = 100;
    const impPct = Math.max(2, Math.min(100, Math.round((row.implied_value_usd / row.tvl_usd) * 100)));
    const bars = el('div', 'bars');
    for (const [label, width, cls] of [['Recorded TVL', tvlPct, 'tvl'], ['Implied value', impPct, '']]) {
      const wrap = el('div');
      wrap.append(el('div', 'tag', label));
      const bar = el('div', 'bar ' + cls);
      const span = document.createElement('span');
      span.style.width = width + '%';
      bar.append(span);
      wrap.append(bar);
      bars.append(wrap);
    }
    detailEl.append(bars);
    const dl = document.createElement('dl');
    const facts = [
      ['Implied value', usd(row.implied_value_usd)],
      ['Recorded TVL', usd(row.tvl_usd)],
      ['Multiple used', mult(row.multiple_bps)],
      ['Category median', row.category_median_bps === null ? 'none' : mult(row.category_median_bps)],
      ['Tokenized peers', String(row.peer_n)],
      ['7-day TVL', pct(row.change_7d)],
      ['Chains', String(row.chains.length)],
      ['Tracked since', row.listed_at || 'unknown'],
      ['Age, days', row.age_days === null ? 'unknown' : String(row.age_days)],
      ['Breadth', mult(row.breadth_bps)],
      ['Momentum', mult(row.momentum_bps)],
      ['Tenure', mult(row.tenure_bps)],
    ];
    for (const [k, v] of facts) {
      dl.append(el('dt', '', k), el('dd', '', v));
    }
    detailEl.append(dl);
    detailEl.append(el('p', 'kicker', 'What a reader can actually do'));
    const ol = document.createElement('ol');
    for (const step of row.farm_steps) ol.append(el('li', '', step));
    detailEl.append(ol);
    detailEl.append(el('p', 'sub', 'Uncertainty: the multiple is other protocols’ recorded market caps, not a clearing price for a token this file does not record. Breadth, momentum and tenure move it by only a few percent. The page cannot see your wallet.'));
  }

  function render(fromHash) {
    const shown = data.rows.filter(matches);
    if (!fromHash) writeHash(picked);
    countEl.textContent = shown.length + ' of ' + data.rows.length + ' shown. Rank 1 is the highest implied value. Values may tie; they do not rise as rank rises.';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const name of ['#', 'Protocol', 'List', 'Category', 'TVL', '7d', 'Multiple', 'Implied']) {
      hr.append(el('th', name === 'TVL' || name === '7d' || name === 'Multiple' || name === 'Implied' ? 'num' : '', name));
    }
    thead.append(hr);
    table.append(thead);
    const tb = document.createElement('tbody');
    if (shown.length === 0) {
      const tr = document.createElement('tr');
      const td = el('td', '', 'No protocol matches these filters. Clear them to return to the full board.');
      td.colSpan = 8;
      td.className = 'empty';
      tr.append(td);
      tb.append(tr);
    }
    for (const row of shown) {
      const tr = document.createElement('tr');
      if (row.slug === picked) tr.classList.add('pick');
      if (row.list_role === 'gap') tr.classList.add('gap');
      const cells = [
        ['', String(row.rank)],
        ['', row.name],
        ['tag ' + row.list_role, roleName(row.list_role)],
        ['', row.category || '—'],
        ['num', usd(row.tvl_usd)],
        ['num', pct(row.change_7d)],
        ['num', mult(row.multiple_bps)],
        ['num', usd(row.implied_value_usd)],
      ];
      cells.forEach(([cls, text], i) => {
        const td = el('td', cls);
        if (i === 1) {
          const btn = el('button', 'rowbtn', text);
          btn.type = 'button';
          btn.addEventListener('click', () => {
            picked = row.slug;
            writeHash(picked);
            render(true);
            showDetail(row);
          });
          td.append(btn);
        } else td.textContent = text;
        tr.append(td);
      });
      tb.append(tr);
    }
    table.append(tb);
    rowsEl.replaceChildren(table);
    const open = data.rows.find((r) => r.slug === picked);
    if (open && shown.some((r) => r.slug === picked)) showDetail(open);
    else if (!open) detailEl.hidden = true;
  }

  function onFilter() {
    render(false);
  }
  for (const node of [qEl, catEl, chainEl, watchEl, gapEl]) node.addEventListener('input', onFilter);
  catEl.addEventListener('change', onFilter);
  chainEl.addEventListener('change', onFilter);
  clearEl.addEventListener('click', () => {
    qEl.value = '';
    catEl.value = '';
    chainEl.value = '';
    watchEl.checked = false;
    gapEl.checked = false;
    picked = '';
    detailEl.hidden = true;
    render(false);
  });

  const wanted = applyHash();
  if (wanted === '1' || wanted === 'top') picked = data.rows[0].slug;
  else if (data.rows.some((r) => r.slug === wanted)) picked = wanted;
  else {
    const byRank = data.rows.find((r) => String(r.rank) === wanted);
    if (byRank) picked = byRank.slug;
  }
  render(true);
  document.documentElement.dataset.ready = '1';
})();
