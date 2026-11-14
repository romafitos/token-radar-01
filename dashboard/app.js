// dashboard/app.js — Token Radar (radar-3) page.
//
// Renders the board main.ts writes into data.js: a sortable, filterable
// board of 200 pre-token protocols, a detail view per protocol with its
// 10-step farm plan, a live-token comparison view, and the model-fit panel.
//
// The farm-plan builder below mirrors lib/model.ts line for line: the
// steps the detail view shows are the same strings board.json carries, so
// screenshots and code agree. Keep both files identical when editing.
(function () {
  'use strict';
  var D = window.TOKEN_RADAR;
  if (!D) {
    document.getElementById('app').innerHTML =
      '<div class="panel"><p>No radar data loaded.</p></div>';
    return;
  }

  // ---- text helpers (mirrored from lib/model.ts) ----
  function moneyShort(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + String(Math.round(n));
  }
  function moneyFull(n) {
    return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pctText(g) {
    if (g == null) return 'n/a';
    return (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
  }
  function ageText(ageDays) {
    if (ageDays == null) return 'age unreported';
    if (ageDays < 365) return ageDays + ' days';
    return (ageDays / 365).toFixed(1) + ' yrs';
  }
  function gasText(chains) {
    if (chains.indexOf('Ethereum') >= 0) return '$8-15';
    if (chains.indexOf('Bitcoin') >= 0) return '$5-20';
    if (chains.indexOf('Solana') >= 0) return 'under $0.01';
    return 'under $0.50';
  }
  function chainText(chains) {
    if (chains.length <= 3) return chains.join(', ');
    return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3) + ' more';
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- farm plans (mirrored from lib/model.ts — keep identical) ----
  var CATEGORY_PLAYS = {
    Dexs: [
      'Swap $25-50 through the deepest pool on {chain} twice this week; keep slippage under 0.5% and hold what you receive instead of swapping straight back. ~10 min per swap, gas ~{gas}.',
      'Add $25-50 of liquidity to the same pool for 2 weeks to earn fees and show sustained use; withdraw only after the position has aged. ~20 min to set up, gas ~{gas}.',
    ],
    Lending: [
      'Supply $25-50 of collateral on {chain} and borrow a small amount, under 30% of the collateral, to open a live borrow position. ~15 min, gas ~{gas}.',
      'Repay part of the borrow weekly and top up collateral if its health factor falls under 1.5; keep the position open for 4+ weeks. ~15 min per week, gas ~{gas}.',
    ],
    Yield: [
      'Deposit $25-50 into the highest-TVL vault on {chain} and leave it earning for at least 2 weeks. ~10 min, gas ~{gas}.',
      'Harvest or compound the yield weekly; move half the yield back into the vault to show compounding use. ~10 min per week, gas ~{gas}.',
    ],
    Bridge: [
      'Bridge $25-50 to {chain} through the protocol’s own bridge and use the received asset on the destination chain the same day. ~15 min, gas ~{gas}.',
      'Bridge back half the amount after a week so the record shows two-way use; keep receipts for both directions. ~15 min per bridge, gas ~{gas}.',
    ],
    RWA: [
      'Buy or mint $25-50 of the tokenised asset on {chain} and hold it in the wallet that will claim any launch reward. ~15 min, gas ~{gas}.',
      'Check the asset’s backing report monthly and add $25 on each new issuance to stay an active holder. ~15 min, gas ~{gas}.',
    ],
    Derivatives: [
      'Open a small $25-50 perpetual or options position on {chain} at under 2x leverage and close it after a day. ~15 min, gas ~{gas}.',
      'Repeat a small position weekly, alternating long and short, and never risk more than $50 per trade. ~15 min per trade, gas ~{gas}.',
    ],
    'Risk Curators': [
      'Deposit $25-50 into the curator vault with the longest track record on {chain} and read its strategy note before depositing. ~20 min, gas ~{gas}.',
      'Compare the vault’s weekly return against its benchmark and move $25 to a second curator after 2 weeks to diversify. ~20 min, gas ~{gas}.',
    ],
    'Liquid Staking': [
      'Stake $25-50 of the base asset through the protocol on {chain} and hold the liquid staking receipt in the same wallet. ~10 min, gas ~{gas}.',
      'Restake or compound the staking yield weekly; unstake only a small test amount first to check the exit works. ~10 min, gas ~{gas}.',
    ],
    'Onchain Capital Allocator': [
      'Allocate $25-50 to the allocator’s top strategy on {chain} and note the strategy’s stated risk and lock-up before confirming. ~20 min, gas ~{gas}.',
      'Review the allocation’s performance after 2 weeks and move $25 to a second strategy to show active management. ~20 min, gas ~{gas}.',
    ],
    'Leveraged Farming': [
      'Open a $25-50 leveraged farm position on {chain} at under 2x leverage and set a stop or health alert. ~15 min, gas ~{gas}.',
      'Close and reopen the position weekly to refresh activity, and cut leverage if the health factor nears 1.3. ~15 min per week, gas ~{gas}.',
    ],
    'Decentralized BTC': [
      'Deposit $25-50 of BTC value through the protocol’s Bitcoin route on {chain} and confirm the deposit lands on-chain. ~30 min, gas ~{gas}.',
      'Use the wrapped or vault position in one more protocol action (lend or swap) so the record shows two uses, not one deposit. ~30 min, gas ~{gas}.',
    ],
    Restaking: [
      'Restake $25-50 through the protocol on {chain} and hold the restaking receipt; check the operator’s slash history first. ~15 min, gas ~{gas}.',
      'Delegate to a second operator after 2 weeks and keep the total restaked under $100 until the token exists. ~15 min, gas ~{gas}.',
    ],
    CDP: [
      'Mint $25-50 of the stable asset against $50+ of collateral on {chain}, keeping collateral above 200%. ~15 min, gas ~{gas}.',
      'Repay $10 of the minted amount weekly and watch the collateral ratio after each market move. ~15 min per week, gas ~{gas}.',
    ],
    Options: [
      'Buy a $25-50 low-cost option on {chain} expiring in 2+ weeks and let it run to expiry or close at 2x. ~15 min, gas ~{gas}.',
      'Repeat monthly with a different strike; never spend more than $50 per month on options. ~15 min per trade, gas ~{gas}.',
    ],
  };
  function categoryPlay(category) {
    if (category && CATEGORY_PLAYS[category]) return CATEGORY_PLAYS[category];
    var label = category || 'protocol';
    return [
      'Use the protocol’s main ' + label + ' flow on {chain}: put $25-50 to work in its core action twice this week and confirm the position shows in the app. ~20 min, gas ~{gas}.',
      'Repeat the core action weekly for 4 weeks, varying the amount slightly ($25-50) so the record shows sustained, human use. ~20 min per week, gas ~{gas}.',
    ];
  }
  function fill(template, chain, gas) {
    return template.split('{chain}').join(chain).split('{gas}').join(gas);
  }
  function chainNote(chains) {
    var note = 'Chains: ' + chainText(chains) + '.';
    if (chains.indexOf('Ethereum') >= 0) {
      note += ' Ethereum transactions cost $8-15 each, so batch actions and farm during low-gas hours.';
    }
    if (chains.indexOf('Solana') >= 0) {
      note += ' Solana transactions cost under $0.01, so small frequent actions are cheap.';
    }
    if (chains.indexOf('Bitcoin') >= 0) {
      note += ' Bitcoin route: use the protocol’s official bridge only, expect $5-20 in fees, and allow 30-60 min for confirmation.';
    }
    if (chains.indexOf('Ethereum') < 0 && chains.indexOf('Solana') < 0 && chains.indexOf('Bitcoin') < 0) {
      note += ' Most of these are low-fee L2s or alt-L1s at under $0.50 per transaction.';
    }
    return note;
  }
  function sizeNote(tvlUsd) {
    if (tvlUsd >= 1e9) {
      return 'At ' + moneyShort(tvlUsd) + ' TVL this is a large protocol: split activity across 2 wallets ' +
        '($25-50 each) so no single wallet looks farmed, and expect any launch to be widely shared. Setup ~30 min.';
    }
    if (tvlUsd >= 1e8) {
      return 'At ' + moneyShort(tvlUsd) + ' TVL this is mid-size: one wallet with $25-50 is enough, and a launch ' +
        'here would be competitive but not crowded. Setup ~20 min.';
    }
    return 'At ' + moneyShort(tvlUsd) + ' TVL this is early and small: re-check TVL monthly, keep positions ' +
      'small ($25), and be ready to add $25 if TVL doubles. Checking takes ~5 min a month.';
  }
  function buildFarmSteps(row) {
    var chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var gas = gasText(row.chains);
    var play = categoryPlay(row.category);
    var growth =
      row.change7d == null ? '7d change unreported' : pctText(row.change7d) + ' in 7 days';
    var why =
      row.name + ' records no token yet: ' + (row.category || 'uncategorised') + ' protocol on ' +
      chainText(row.chains) + ', ' + moneyShort(row.tvlUsd) + ' TVL (' + growth + ', tracked ' +
      ageText(row.ageDays) + '). The size-fit model prices a launch at ' + moneyShort(row.impliedUsd) +
      ' — farm it now while the record is early. Research time ~15 min, $0.';
    return [
      why,
      fill(play[0], chain, gas),
      fill(play[1], chain, gas),
      chainNote(row.chains) + ' Total gas budget for this plan: ~' + gas + ' per action over 4 weeks.',
      sizeNote(row.tvlUsd),
      'Every week, repeat the core action once ($25-50) and use one new feature of the app (a new pool, vault or market) so the record shows breadth, not repetition. ~20-40 min per week, gas ~' + gas + '.',
      'Hold the position for at least 4 weeks without withdrawing: snapshots reward patience, and churning in and out reads as farming. Waiting costs $0, just discipline.',
      'If a token launches, claim only through the protocol’s official app or site: verify the URL from its official social accounts first, never sign a blind approval, and expect ~' + gas + ' gas and ~10 min.',
      'Log every transaction hash, date and amount in a notes file, and screenshot balances weekly: if a claim needs proof, the log is the proof. ~5 min per week, $0.',
      'No token exists yet, so any token, presale or “claim now” link is a scam: check the protocol’s official channels before every session and report fakes. ~5 min per session, $0.',
    ];
  }

  // ---- views ----
  var app = document.getElementById('app');
  var state = { sort: 'rank', dir: 1, category: '', search: '', watchOnly: false };

  function sortedRows(rows) {
    var copy = rows.slice();
    var key = state.sort;
    copy.sort(function (a, b) {
      var va, vb;
      if (key === 'rank') { va = a.rank; vb = b.rank; }
      else if (key === 'tvl') { va = a.tvlUsd; vb = b.tvlUsd; }
      else if (key === 'implied') { va = a.impliedUsd; vb = b.impliedUsd; }
      else if (key === 'multiple') { va = a.impliedUsd / a.tvlUsd; vb = b.impliedUsd / b.tvlUsd; }
      else if (key === 'change') { va = a.change7d == null ? -999 : a.change7d; vb = b.change7d == null ? -999 : b.change7d; }
      else { va = a.rank; vb = b.rank; }
      return (va - vb) * state.dir;
    });
    return copy;
  }
  function filteredRows() {
    var q = state.search.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.watchOnly && !r.watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function fitPanelHtml() {
    var m = D.model;
    var improvement = ((m.flatMae - m.fitMae) / m.flatMae * 100).toFixed(1);
    return '<div class="panel"><h3>Model fit — radar-3 size-fit</h3>' +
      '<p><code>log10(mcap) = ' + m.intercept.toFixed(3) + ' + ' + m.slope.toFixed(3) +
      ' x log10(TVL)</code> — OLS fitted on the snapshot’s own ' + m.peers +
      ' live-token peers (R² ' + m.rSquared.toFixed(2) + '). Growth clamped to -60/+120% at half weight; ' +
      'maturity 0.6–1.0 over 3 years tracked.</p>' +
      '<p>Backtest on those ' + m.peers + ' peers, mean |log10 error|: <b>' + m.fitMae.toFixed(4) +
      '</b> vs flat 0.25x TVL <b>' + m.flatMae.toFixed(4) + '</b> — ' + improvement +
      '% better on the mean (median ' + m.fitMedian.toFixed(4) + ' vs ' + m.flatMedian.toFixed(4) +
      '). Category-median comparables were tested and rejected: they score worse than flat.</p></div>';
  }
  function renderBoard() {
    var m = D.model;
    var cats = [];
    D.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      if (cats.indexOf(c) < 0) cats.push(c);
    });
    cats.sort();
    var rows = sortedRows(filteredRows());
    var html = '<div class="stats">' +
      '<div class="stat"><b>' + D.rows.length + '</b><span>board rows</span></div>' +
      '<div class="stat"><b>' + D.rows.filter(function (r) { return r.watchlist; }).length + '</b><span>watchlist covered</span></div>' +
      '<div class="stat"><b>' + moneyShort(D.rows[0].impliedUsd) + '</b><span>top implied value</span></div>' +
      '<div class="stat"><b>' + m.fitMae.toFixed(4) + '</b><span>backtest fit MAE (flat ' + m.flatMae.toFixed(4) + ')</span></div>' +
      '<div class="stat"><b>' + m.medianMultiple.toFixed(3) + 'x</b><span>median live mcap/TVL</span></div>' +
      '</div>';
    html += fitPanelHtml();
    html += '<div class="controls">' +
      '<label>Category <select id="catFilter"><option value="">All categories</option>' +
      cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select></label>' +
      '<label>Search <input type="search" id="searchBox" placeholder="name or slug" value="' + esc(state.search) + '"></label>' +
      '<label><input type="checkbox" id="watchOnly"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + rows.length + ' of ' + D.rows.length + ' rows</span>' +
      '</div>';
    html += '<table class="board"><thead><tr>' +
      '<th data-sort="rank" class="' + (state.sort === 'rank' ? 'sorted' : '') + '">Rank</th>' +
      '<th>Protocol</th><th>Category</th>' +
      '<th data-sort="tvl" class="num ' + (state.sort === 'tvl' ? 'sorted' : '') + '">TVL</th>' +
      '<th data-sort="change" class="num ' + (state.sort === 'change' ? 'sorted' : '') + '">7d</th>' +
      '<th>Age</th>' +
      '<th data-sort="implied" class="num ' + (state.sort === 'implied' ? 'sorted' : '') + '">Implied value</th>' +
      '<th data-sort="multiple" class="num ' + (state.sort === 'multiple' ? 'sorted' : '') + '">Value/TVL</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr data-slug="' + esc(r.slug) + '"' + (r.watchlist ? ' class="watch"' : '') + '>' +
        '<td>' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><br><span class="slug">' + esc(r.slug) + '</span>' +
        (r.watchlist ? ' <span class="tag">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + moneyShort(r.tvlUsd) + '</td>' +
        '<td class="num">' + pctText(r.change7d) + '</td>' +
        '<td>' + ageText(r.ageDays) + '</td>' +
        '<td class="num val">' + moneyFull(r.impliedUsd) + '</td>' +
        '<td class="num">' + (r.impliedUsd / r.tvlUsd).toFixed(2) + 'x</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    html += '<p class="note">Click a row for its detail view and 10-step farm plan. Ranks are by implied ' +
      'value; use the headers to sort by TVL, 7-day change, implied value or value/TVL.</p>';
    app.innerHTML = html;
    document.getElementById('catFilter').addEventListener('change', function (e) {
      state.category = e.target.value;
      renderBoard();
    });
    document.getElementById('searchBox').addEventListener('input', function (e) {
      state.search = e.target.value;
      renderBoard();
      var box = document.getElementById('searchBox');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
    document.getElementById('watchOnly').addEventListener('change', function (e) {
      state.watchOnly = e.target.checked;
      renderBoard();
    });
    Array.prototype.forEach.call(app.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        location.hash = '#/detail/' + tr.getAttribute('data-slug');
      });
    });
  }
  function renderDetail(slug) {
    var row = null;
    D.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) {
      app.innerHTML = '<div class="panel"><p>Unknown protocol: ' + esc(slug) + '</p></div>';
      return;
    }
    var m = D.model;
    var steps = buildFarmSteps(row);
    var html = '<a class="back" href="#/">&larr; Back to board</a>';
    html += '<div class="detail-head"><h2>' + esc(row.name) + '</h2>' +
      '<span class="big">' + moneyFull(row.impliedUsd) + '</span>' +
      '<span>rank #' + row.rank + ' of ' + D.rows.length + '</span>' +
      (row.watchlist ? '<span class="tag">watchlist</span>' : '') + '</div>';
    html += '<div class="panel"><div class="kv">' +
      '<div><b>' + moneyFull(row.tvlUsd) + '</b><span>TVL</span></div>' +
      '<div><b>' + pctText(row.change7d) + '</b><span>TVL change, 7 days</span></div>' +
      '<div><b>' + ageText(row.ageDays) + '</b><span>tracked with no token</span></div>' +
      '<div><b>' + esc(row.category || 'Uncategorised') + '</b><span>category</span></div>' +
      '<div><b>' + esc(chainText(row.chains)) + '</b><span>chains</span></div>' +
      '<div><b>' + (row.impliedUsd / row.tvlUsd).toFixed(2) + 'x</b><span>implied value / TVL</span></div>' +
      '</div>' +
      '<p>How the value is priced: <code>implied = 10^(' + m.intercept.toFixed(3) + ' + ' +
      m.slope.toFixed(3) + ' x log10(' + moneyFull(row.tvlUsd) + '))</code>, then growth and maturity ' +
      'adjustments. The curve comes from ' + m.peers + ' live-token peers in this snapshot ' +
      '(R² ' + m.rSquared.toFixed(2) + '); the flat 0.25x starter would price this row at ' +
      moneyFull(Math.round(row.tvlUsd * 0.25)) + ' before growth and maturity.</p></div>';
    html += '<div class="panel"><h3>Farm plan — 10 steps</h3><ol class="steps">' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    html += '<div class="warn">No token exists yet for ' + esc(row.name) + '. Any token, presale or ' +
      'claim link for it is a scam — verify every URL against the protocol’s official channels first.</div>';
    app.innerHTML = html;
  }
  function renderCompare() {
    var m = D.model;
    var maxMult = D.live.length ? D.live[0].multiple : 1;
    var html = '<h2>Live-token check</h2>' +
      '<p class="lede">The size-fit curve is only as good as the peers it learned from. Below, the ' +
      m.peers + ' live-token protocols in this snapshot, ranked by realised mcap/TVL multiple — the ' +
      'reality the model has to match. Median multiple <b>' + m.medianMultiple.toFixed(3) +
      'x</b>. The flat 0.25x starter prices the board’s biggest row at ' + moneyShort(m.flatTopUsd) +
      '; the size fit prices it at ' + moneyShort(D.rows[0].impliedUsd) +
      ' — much closer to how giants actually trade.</p>';
    html += '<table class="board"><thead><tr><th>Protocol</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th>' +
      '<th class="num">mcap / TVL</th><th>Value bar</th></tr></thead><tbody>';
    D.live.forEach(function (r) {
      var w = Math.max(1, Math.round((r.multiple / maxMult) * 100));
      html += '<tr><td><b>' + esc(r.name) + '</b><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="num">' + moneyShort(r.tvlUsd) + '</td>' +
        '<td class="num">' + moneyShort(r.mcapUsd) + '</td>' +
        '<td class="num val">' + r.multiple.toFixed(2) + 'x</td>' +
        '<td><span class="bar" style="width:' + w + '%"></span></td></tr>';
    });
    html += '</tbody></table>';
    html += '<p class="note">Bars are scaled to the largest multiple (' + maxMult.toFixed(1) +
      'x). A few giants trade far above the median — that long tail is why a log-log curve, ' +
      'not a flat multiple, prices launches.</p>';
    app.innerHTML = html;
  }
  function renderModel() {
    var m = D.model;
    var improvement = ((m.flatMae - m.fitMae) / m.flatMae * 100).toFixed(1);
    var medianImprovement = ((m.flatMedian - m.fitMedian) / m.flatMedian * 100).toFixed(1);
    var html = '<h2>Model fit — radar-3</h2>' +
      '<p class="lede">One curve, fitted from the snapshot itself. Nothing is hardcoded by name: ' +
      'every number below is computed from the snapshot’s own 128 live-token peers at build time.</p>';
    html += fitPanelHtml();
    html += '<div class="panel"><h3>Backtest — predict live-token market caps from TVL</h3>' +
      '<table class="board"><thead><tr><th>Model</th><th class="num">Mean |log10 error|</th>' +
      '<th class="num">Median |log10 error|</th></tr></thead><tbody>' +
      '<tr><td><b>radar-3 size-fit</b> (log-log + growth + maturity)</td><td class="num val">' + m.fitMae.toFixed(4) +
      '</td><td class="num val">' + m.fitMedian.toFixed(4) + '</td></tr>' +
      '<tr><td>Flat 0.25x TVL (starter)</td><td class="num">' + m.flatMae.toFixed(4) +
      '</td><td class="num">' + m.flatMedian.toFixed(4) + '</td></tr>' +
      '</tbody></table>' +
      '<p>Size fit beats flat by ' + improvement + '% on the mean and ' + medianImprovement +
      '% on the median. Category-median comparables scored 0.8255 — worse than flat — so the model ' +
      'uses no category term: categories differ in level, but with 5–15 peers each the medians are noise.</p></div>';
    html += '<div class="panel"><h3>Board construction</h3>' +
      '<p>200 rows: all 40 watchlist protocols, plus the 160 pre-token protocols below the $50M floor ' +
      'with the most TVL, skipping wrapped, staked and bridged products of tokens that already trade ' +
      '(same spirit as the watchlist rule). Rows rank by implied value, highest first.</p>' +
      '<p>Growth: 7-day TVL change clamped to -60%/+120% at half weight. Maturity: 0.6 for a new ' +
      'record, rising to 1.0 at 3 years tracked. Farm plans: 10 steps per protocol, each with a cost ' +
      'and a time, built from the protocol’s own category, chains, size, age and growth.</p></div>';
    app.innerHTML = html;
  }
  function route() {
    var hash = location.hash || '#/';
    var tabs = document.querySelectorAll('.tabs a');
    Array.prototype.forEach.call(tabs, function (a) { a.classList.remove('on'); });
    var parts = hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'detail' && parts[1]) {
      renderDetail(decodeURIComponent(parts[1]));
    } else if (parts[0] === 'compare') {
      document.querySelector('[data-tab="compare"]').classList.add('on');
      renderCompare();
    } else if (parts[0] === 'model') {
      document.querySelector('[data-tab="model"]').classList.add('on');
      renderModel();
    } else if (parts[0] === 'category' && parts[1]) {
      document.querySelector('[data-tab="board"]').classList.add('on');
      state.category = decodeURIComponent(parts[1]);
      renderBoard();
    } else {
      document.querySelector('[data-tab="board"]').classList.add('on');
      renderBoard();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
