import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const p = (...s) => join(__dir, ...s);

const args = process.argv.slice(2);
const topArg = args.find(a => a.startsWith('--top='));
const topN = topArg ? parseInt(topArg.split('=')[1]) : null;

const trends = JSON.parse(readFileSync(p('evidence/output/trends.json'), 'utf8'));
const clusters = topN ? trends.slice(0, topN) : trends;

const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const labelCluster = t => [
  capitalize(t.design_pattern),
  capitalize(t.neck_type) + ' Neck',
  capitalize(t.sleeve_length) + ' Sleeve',
  capitalize(t.front_top_treatment) + ' Front',
].join(' · ');

const uniqueColors = colors => {
  const seen = new Set();
  return colors
    .map(c => c.primary)
    .filter(c => c && c !== 'none' && c !== 'unknown')
    .filter(c => { if (seen.has(c)) return false; seen.add(c); return true; })
    .slice(0, 8);
};

function generateHTML(clusters) {
  const cards = clusters.map(t => {
    const photos = (t.sample_images || []).slice(0, 3);
    const colors = uniqueColors(t.colors || []);
    const label = labelCluster(t);
    const key = t.cluster_key;
    const priceLabel = t.avg_price ? `₹${Math.round(t.avg_price)}` : '';

    const photoHTML = photos.length
      ? photos.map(img => `
          <a href="${img.product_url || '#'}" target="_blank" rel="noopener">
            <img src="${img.url}" alt="${img.title || label}"
              loading="lazy"
              onerror="this.parentElement.style.display='none'">
          </a>`).join('')
      : '<div class="no-photo">No photo</div>';

    const colorDots = colors.map(c =>
      `<span class="color-dot" style="background:${c}" title="${c}"></span>`
    ).join('');

    return `
  <div class="card" data-key="${key}" data-vote="none">
    <div class="photos">${photoHTML}</div>
    <div class="card-body">
      <div class="label">${label}</div>
      ${priceLabel ? `<div class="price">${priceLabel} avg · ${t.product_count} products</div>` : ''}
      ${colorDots ? `<div class="colors">${colorDots}</div>` : ''}
      <div class="vote-bar">
        <button class="btn-like" onclick="vote('${key}', 'like', this)">
          <span>👍</span> Like
        </button>
        <button class="btn-dislike" onclick="vote('${key}', 'dislike', this)">
          <span>👎</span> Dislike
        </button>
      </div>
    </div>
  </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Design Catalog</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f0f2f5;
    color: #1a1a2e;
    min-height: 100vh;
  }

  header {
    background: #fff;
    padding: 20px 24px 16px;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-top {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  h1 { font-size: 1.4rem; font-weight: 700; color: #111; }

  .subtitle {
    font-size: 0.85rem;
    color: #666;
  }

  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-btn {
    border: 1.5px solid #d1d5db;
    background: #fff;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all .15s;
    color: #444;
    font-weight: 500;
  }
  .filter-btn:hover { border-color: #6366f1; color: #6366f1; }
  .filter-btn.active { background: #6366f1; border-color: #6366f1; color: #fff; }
  .filter-btn.f-like.active { background: #16a34a; border-color: #16a34a; }
  .filter-btn.f-dislike.active { background: #dc2626; border-color: #dc2626; }

  .summary {
    margin-left: auto;
    font-size: 0.78rem;
    color: #888;
    white-space: nowrap;
  }

  main {
    max-width: 1200px;
    margin: 24px auto;
    padding: 0 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }

  .card {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
    border: 2px solid transparent;
    transition: border-color .2s, box-shadow .2s;
    display: flex;
    flex-direction: column;
  }
  .card[data-vote="like"] { border-color: #16a34a; box-shadow: 0 0 0 4px #dcfce7; }
  .card[data-vote="dislike"] { border-color: #dc2626; box-shadow: 0 0 0 4px #fee2e2; opacity: .65; }

  .photos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    background: #f0f2f5;
    min-height: 100px;
  }
  .photos a {
    display: block;
    overflow: hidden;
    aspect-ratio: 4/5;
    background: #e5e7eb;
  }
  .photos img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity .2s;
  }
  .photos a:hover img { opacity: .85; }
  .no-photo {
    grid-column: 1/-1;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-size: .8rem;
  }

  .card-body {
    padding: 12px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .label {
    font-size: 0.82rem;
    font-weight: 600;
    color: #111;
    line-height: 1.4;
  }

  .price {
    font-size: 0.75rem;
    color: #666;
  }

  .colors {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .color-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid rgba(0,0,0,.12);
    display: inline-block;
    flex-shrink: 0;
  }

  .vote-bar {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 4px;
  }

  .vote-bar button {
    flex: 1;
    border: 1.5px solid #e5e7eb;
    background: #fff;
    border-radius: 8px;
    padding: 7px 4px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all .15s;
    font-weight: 500;
    color: #555;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .btn-like:hover { border-color: #16a34a; color: #16a34a; }
  .btn-dislike:hover { border-color: #dc2626; color: #dc2626; }

  [data-vote="like"] .btn-like {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
  }
  [data-vote="dislike"] .btn-dislike {
    background: #dc2626;
    border-color: #dc2626;
    color: #fff;
  }

  .card.hidden { display: none; }

  footer {
    text-align: center;
    padding: 24px 16px 40px;
    font-size: 0.82rem;
    color: #888;
  }

  @media (max-width: 480px) {
    main { grid-template-columns: 1fr 1fr; gap: 10px; }
    h1 { font-size: 1.1rem; }
    .photos { min-height: 70px; }
  }

  @media print {
    header { position: static; box-shadow: none; }
    .filter-btn, .vote-bar, .summary { display: none !important; }
    main { display: block; columns: 3; gap: 12px; }
    .card { break-inside: avoid; margin-bottom: 12px; border: 1px solid #ddd !important; box-shadow: none !important; }
    .card[data-vote="dislike"] { display: none; }
    body { background: #fff; }
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <h1>Design Catalog</h1>
    <span class="subtitle">${clusters.length} designs · tap to share your preference</span>
    <span class="summary" id="summary">0 liked · 0 disliked</span>
  </div>
  <div class="filters">
    <button class="filter-btn active f-all" onclick="setFilter('all', this)">All</button>
    <button class="filter-btn f-like" onclick="setFilter('like', this)">👍 Liked</button>
    <button class="filter-btn f-dislike" onclick="setFilter('dislike', this)">👎 Disliked</button>
    <button class="filter-btn f-none" onclick="setFilter('none', this)">Undecided</button>
    <button class="filter-btn" onclick="window.print()" style="margin-left:auto">🖨 Print liked</button>
  </div>
</header>

<main id="grid">
${cards}
</main>

<footer id="footer-note">Like the designs you want, dislike the ones you don't. Your choices are saved automatically.</footer>

<script>
  const STORE_KEY = 'catalog_votes';
  let currentFilter = 'all';

  function loadVotes() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveVotes(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch {}
  }

  function vote(key, action, btn) {
    const card = btn.closest('.card');
    const current = card.dataset.vote;
    const next = current === action ? 'none' : action;
    card.dataset.vote = next;

    const votes = loadVotes();
    if (next === 'none') delete votes[key];
    else votes[key] = next;
    saveVotes(votes);

    updateSummary();
    if (currentFilter !== 'all') applyFilter(currentFilter);
  }

  function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilter(filter);
  }

  function applyFilter(filter) {
    document.querySelectorAll('.card').forEach(card => {
      const v = card.dataset.vote;
      const show = filter === 'all' || v === filter || (filter === 'none' && v === 'none');
      card.classList.toggle('hidden', !show);
    });
  }

  function updateSummary() {
    const cards = document.querySelectorAll('.card');
    let liked = 0, disliked = 0;
    cards.forEach(c => {
      if (c.dataset.vote === 'like') liked++;
      else if (c.dataset.vote === 'dislike') disliked++;
    });
    document.getElementById('summary').textContent =
      liked + ' liked · ' + disliked + ' disliked';
  }

  // Restore votes from localStorage on page load
  (function restoreVotes() {
    const votes = loadVotes();
    document.querySelectorAll('.card').forEach(card => {
      const key = card.dataset.key;
      if (votes[key]) card.dataset.vote = votes[key];
    });
    updateSummary();
  })();
</script>
</body>
</html>`;
}

mkdirSync(p('evidence/output'), { recursive: true });
const html = generateHTML(clusters);
writeFileSync(p('evidence/output/trend-catalog.html'), html, 'utf8');

console.log(`✓ trend-catalog.html written — ${clusters.length} design clusters`);
console.log(`  → evidence/output/trend-catalog.html`);
