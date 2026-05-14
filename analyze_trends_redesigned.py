#!/usr/bin/env python3
"""
Redesigned B2B Trends Report - Compact Grid + Expandable Details
Modern, scannable, beautiful for TN wholesale buyers
"""

import json
import os
from pathlib import Path
from collections import defaultdict
from statistics import mean
from datetime import datetime
import sys

PROJECT_ROOT = Path('/Users/ravi-19780/git/trend-scanner')
MERGED_FILE = PROJECT_ROOT / 'evidence' / 'clean' / '_merged.json'
OUTPUT_DIR = PROJECT_ROOT / 'evidence' / 'output'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Parse args
args = {'top': 10, 'source': None, 'min_count': 1, 'json': False}
for arg in sys.argv[1:]:
    if arg.startswith('--'):
        if '=' in arg:
            k, v = arg[2:].split('=', 1)
            if k == 'top':
                args['top'] = int(v)
            elif k == 'source':
                args['source'] = v
            elif k == 'min-count':
                args['min_count'] = int(v)
        else:
            if arg[2:] == 'json':
                args['json'] = True

# Load data
if not MERGED_FILE.exists():
    print(f"Error: {MERGED_FILE} not found")
    sys.exit(1)

with open(MERGED_FILE, 'r') as f:
    products = json.load(f)

if args['source']:
    products = [p for p in products if p.get('source') == args['source']]

print(f"📊 Loaded {len(products)} products")

# Scoring functions (same as before)
def score_evidence_strength(cluster):
    sources = set(p.get('source') for p in cluster['products'] if p.get('source'))
    rated = [p for p in cluster['products'] if p.get('rating_numeric')]
    avg_rating = mean([p['rating_numeric'] for p in rated]) if rated else 0
    base = 1
    if len(sources) >= 2 and avg_rating >= 3.8:
        base = 5
    elif len(sources) >= 2 or (len(sources) == 1 and len(cluster['products']) >= 3 and len(rated) >= 2):
        base = 3
    nursing_products = sum(1 for p in cluster['products']
                          if p.get('nursing_label') and p.get('nursing_label') not in ['None', None])
    if nursing_products > 0:
        base = min(5, base + 1)
    return base

def score_trend_signal(cluster):
    rated = [p for p in cluster['products'] if p.get('rating_numeric')]
    avg_rating = mean([p['rating_numeric'] for p in rated]) if rated else 0
    keywords = set(p.get('keyword') for p in cluster['products'] if p.get('keyword'))
    if avg_rating >= 4.0 and len(keywords) >= 3:
        return 5
    if avg_rating >= 3.9 and len(keywords) >= 2:
        return 3
    if avg_rating >= 3.7:
        return 1
    return 0

def score_tn_b2b_fit(cluster):
    score = 5
    prices = [p.get('price_numeric') for p in cluster['products'] if p.get('price_numeric')]
    if prices:
        avg_price = mean(prices)
        if avg_price > 600:
            score -= 2
    else:
        score -= 1
    fabrics = []
    for p in cluster['products']:
        if p.get('fabric_resolved'):
            fabrics.append(p['fabric_resolved'].lower())
    if fabrics:
        fabric_tiers = {'cotton': 0, 'modal': -1, 'rayon': -1, 'satin': -2, 'silk': -2, 'silk-like': -2}
        penalty = 0
        for fabric in fabrics:
            for tier_fabric, tier_penalty in fabric_tiers.items():
                if tier_fabric in fabric:
                    penalty += tier_penalty
                    break
        if len(fabrics) > 0:
            avg_penalty = penalty / len(fabrics)
            score += round(avg_penalty)
    treatments = [p.get('front_top_treatment') for p in cluster['products'] if p.get('front_top_treatment')]
    if treatments:
        complex_count = sum(1 for t in treatments if t and t.lower() in ['embroidery', 'lace'])
        if complex_count > len(treatments) * 0.3:
            score -= 1
    return max(0, score)

def score_production_simplicity(cluster):
    treatment_scores = {'plain': 5, 'print': 3, 'lace': 2, 'embroidery': 1}
    sleeve_scores = {'half': 5, 'sleeveless': 4, '3/4': 3, 'full': 2}
    treatments = [p.get('front_top_treatment') for p in cluster['products'] if p.get('front_top_treatment')]
    sleeves = [p.get('sleeve_length') for p in cluster['products'] if p.get('sleeve_length')]
    size_counts = [p.get('size_count', 0) for p in cluster['products'] if p.get('size_count')]
    treatment_score = mean([treatment_scores.get(t.lower(), 2) for t in treatments]) if treatments else 3
    sleeve_score = mean([sleeve_scores.get(s.lower(), 2) for s in sleeves]) if sleeves else 3
    if size_counts:
        avg_size_count = mean(size_counts)
        if avg_size_count >= 7:
            size_score = 3
        elif avg_size_count >= 4:
            size_score = 4
        elif avg_size_count > 0:
            size_score = 5
        else:
            size_score = 4
    else:
        size_score = 4
    return round((treatment_score + sleeve_score + size_score) / 3)

def score_margin_possibility(cluster):
    prices = [p.get('price_numeric') for p in cluster['products'] if p.get('price_numeric')]
    if not prices:
        return 1
    avg_price = mean(prices)
    if avg_price <= 450:
        return 5
    elif avg_price <= 600:
        return 3
    else:
        return 1

def get_persona_tags(cluster):
    """Get minimal emoji tags for compact display"""
    tags = []
    prices = [p.get('price_numeric', 0) for p in cluster['products'] if p.get('price_numeric')]
    if prices:
        avg_price = mean(prices)
        if avg_price <= 600:
            tags.append("💰")
        elif avg_price >= 1200:
            tags.append("💎")
    fabrics = [p.get('fabric_resolved') for p in cluster['products'] if p.get('fabric_resolved')]
    if fabrics and any('cotton' in str(f).lower() for f in fabrics):
        tags.append("🧵")
    treatment = cluster.get('front_top_treatment', '')
    if treatment and treatment.lower() in ['lace', 'embroidery']:
        tags.append("💍")
    nursing = sum(1 for p in cluster['products'] if p.get('nursing_label'))
    if nursing > 0:
        tags.append("👶")
    plus = sum(1 for p in cluster['products'] if p.get('has_plus_sizes'))
    if plus > len(cluster['products']) * 0.5:
        tags.append("📏")
    return tags

# Cluster and score
clusters = {}
for p in products:
    if not (p.get('design_pattern') or p.get('neck_type') or p.get('sleeve_length') or p.get('front_top_treatment')):
        continue
    key = '|'.join([str(p.get('design_pattern') or 'unknown'), str(p.get('neck_type') or 'unknown'),
                    str(p.get('sleeve_length') or 'unknown'), str(p.get('front_top_treatment') or 'unknown')])
    if key not in clusters:
        clusters[key] = {
            'cluster_key': key,
            'design_pattern': p.get('design_pattern'),
            'neck_type': p.get('neck_type'),
            'sleeve_length': p.get('sleeve_length'),
            'front_top_treatment': p.get('front_top_treatment'),
            'products': []
        }
    clusters[key]['products'].append(p)

# Score clusters
scored_clusters = []
for cluster in clusters.values():
    if len(cluster['products']) < args['min_count']:
        continue
    scores = {
        'evidence_strength': score_evidence_strength(cluster),
        'trend_signal': score_trend_signal(cluster),
        'tn_b2b_fit': score_tn_b2b_fit(cluster),
        'production_simplicity': score_production_simplicity(cluster),
        'margin_possibility': score_margin_possibility(cluster)
    }
    total = sum(scores.values())
    capped = False
    if scores['evidence_strength'] < 3:
        if total > 14:
            total = 14
            capped = True
    sources = {}
    for p in cluster['products']:
        s = p.get('source', 'unknown')
        sources[s] = sources.get(s, 0) + 1
    keywords = set(p.get('keyword') for p in cluster['products'] if p.get('keyword'))
    ratings = [p.get('rating_numeric') for p in cluster['products'] if p.get('rating_numeric') is not None]
    prices = [p.get('price_numeric') for p in cluster['products'] if p.get('price_numeric')]
    if total >= 20:
        decision = 'Send Now'
    elif total >= 15:
        decision = 'Send as Backup'
    elif total >= 10:
        decision = 'Needs More Evidence'
    else:
        decision = 'Do Not Send'
    avg_price = round(mean(prices), 0) if prices else 0
    cluster_data = {
        'rank': 0,
        'design_pattern': cluster['design_pattern'],
        'neck_type': cluster['neck_type'],
        'sleeve_length': cluster['sleeve_length'],
        'front_top_treatment': cluster['front_top_treatment'],
        'product_count': len(cluster['products']),
        'keyword_count': len(keywords),
        'sources': sources,
        'avg_rating': round(mean(ratings), 2) if ratings else 0,
        'avg_price': avg_price,
        'price_range': f"₹{min(prices)}-₹{max(prices)}" if prices else 'N/A',
        'score': {
            'total': total,
            'evidence_strength': scores['evidence_strength'],
            'trend_signal': scores['trend_signal'],
            'tn_b2b_fit': scores['tn_b2b_fit'],
            'production_simplicity': scores['production_simplicity'],
            'margin_possibility': scores['margin_possibility'],
            'capped': capped
        },
        'decision': decision,
        'persona_tags': get_persona_tags(cluster),
        'sample_products': [{'product_id': p.get('product_id'), 'title': p.get('title')[:50], 'image': p.get('image'), 'url': p.get('url')} for p in cluster['products'][:4] if p.get('image')]
    }
    scored_clusters.append(cluster_data)

# Sort and rank
scored_clusters.sort(key=lambda x: x['score']['total'], reverse=True)
for i, cluster in enumerate(scored_clusters, 1):
    cluster['rank'] = i

# Write JSON
json_output = {
    'timestamp': datetime.now().isoformat(),
    'total_products': len(products),
    'total_clusters': len(scored_clusters),
    'top_trends': scored_clusters
}

json_file = OUTPUT_DIR / 'trends.json'
with open(json_file, 'w') as f:
    json.dump(json_output, f, indent=2)

print(f"\n✅ Analyzed {len(scored_clusters)} design clusters")
print(f"📈 Top {min(args['top'], len(scored_clusters))} trends:\n")

for cluster in scored_clusters[:args['top']]:
    archetype = ' · '.join([str(cluster[k]) for k in ['design_pattern', 'neck_type', 'sleeve_length', 'front_top_treatment'] if cluster.get(k)])
    tags = ' '.join(cluster['persona_tags'])
    print(f"#{cluster['rank']} {cluster['decision']:20} {cluster['score']['total']}/25 | {archetype}")
    print(f"    {cluster['product_count']} products | ⭐ {cluster['avg_rating']} | {len(cluster['sources'])} sources | {tags}")

# Generate HTML
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Design Trends - B2B Decision Guide</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        :root {{
            --send-now: #10b981;
            --backup: #2563eb;
            --evidence: #f59e0b;
            --do-not: #dc2626;
            --bg: #f3f4f6;
            --card: #ffffff;
            --text: #1f2937;
            --text-light: #6b7280;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 20px;
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}

        /* HEADER */
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 16px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }}

        .header h1 {{
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 12px;
        }}

        .header p {{
            font-size: 16px;
            opacity: 0.95;
            margin-bottom: 20px;
        }}

        .header-stats {{
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }}

        .stat {{
            background: rgba(255,255,255,0.15);
            padding: 12px 20px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            backdrop-filter: blur(10px);
        }}

        /* LEGEND */
        .legend {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }}

        .legend-item {{
            background: var(--card);
            padding: 16px;
            border-radius: 12px;
            border-left: 4px solid;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }}

        .legend-item.send-now {{ border-left-color: var(--send-now); }}
        .legend-item.backup {{ border-left-color: var(--backup); }}
        .legend-item.evidence {{ border-left-color: var(--evidence); }}
        .legend-item.do-not {{ border-left-color: var(--do-not); }}

        .legend-item strong {{
            display: block;
            font-size: 14px;
            margin-bottom: 4px;
        }}

        .legend-item span {{
            font-size: 12px;
            color: var(--text-light);
        }}

        /* GRID */
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
            margin-bottom: 40px;
        }}

        /* CARD */
        .card {{
            background: var(--card);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            transition: all 0.3s ease;
            border-top: 4px solid;
            cursor: pointer;
        }}

        .card.send-now {{ border-top-color: var(--send-now); }}
        .card.backup {{ border-top-color: var(--backup); }}
        .card.evidence {{ border-top-color: var(--evidence); }}
        .card.do-not {{ border-top-color: var(--do-not); }}

        .card:hover {{
            transform: translateY(-4px);
            box-shadow: 0 12px 24px rgba(0,0,0,0.1);
        }}

        .card-header {{
            padding: 16px;
            background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
            border-bottom: 1px solid #e5e7eb;
        }}

        .card-rank {{
            font-size: 12px;
            font-weight: 700;
            color: var(--text-light);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }}

        .card-decision {{
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            color: white;
            margin-bottom: 12px;
        }}

        .card-decision.send-now {{ background: var(--send-now); }}
        .card-decision.backup {{ background: var(--backup); }}
        .card-decision.evidence {{ background: var(--evidence); color: #fff; }}
        .card-decision.do-not {{ background: var(--do-not); }}

        .card-design {{
            font-size: 15px;
            font-weight: 700;
            line-height: 1.4;
            color: var(--text);
        }}

        .card-body {{
            padding: 16px;
        }}

        .card-metrics {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }}

        .card-score {{
            font-size: 24px;
            font-weight: 800;
            color: var(--text);
        }}

        .card-score-max {{
            font-size: 12px;
            color: var(--text-light);
            margin-top: -4px;
        }}

        .card-rating {{
            text-align: right;
        }}

        .card-rating-stars {{
            font-size: 14px;
            color: #fbbf24;
        }}

        .card-rating-num {{
            font-size: 13px;
            font-weight: 700;
            color: var(--text);
        }}

        .card-signal {{
            font-size: 12px;
            color: var(--text-light);
            margin-bottom: 12px;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
        }}

        .card-tags {{
            display: flex;
            gap: 4px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }}

        .tag {{
            font-size: 18px;
        }}

        .card-expand {{
            background: var(--bg);
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: var(--text);
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
        }}

        .card-expand:hover {{
            background: #e5e7eb;
        }}

        .card-details {{
            display: none;
            padding: 16px;
            border-top: 1px solid #e5e7eb;
            background: #fafbfc;
        }}

        .card-details.open {{
            display: block;
        }}

        .detail-row {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 12px;
        }}

        .detail-label {{
            color: var(--text-light);
            font-weight: 600;
        }}

        .detail-value {{
            font-weight: 700;
            color: var(--text);
        }}

        .score-bar {{
            margin: 8px 0;
            font-size: 11px;
        }}

        .score-bar-label {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }}

        .score-bar-fill {{
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
        }}

        .score-bar-progress {{
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            transition: width 0.3s ease;
        }}

        /* PRODUCT GALLERY */
        .product-gallery {{
            margin: 12px 0;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
        }}

        .gallery-label {{
            font-size: 11px;
            font-weight: 700;
            color: var(--text-light);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        .gallery-images {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
            gap: 8px;
        }}

        .gallery-item {{
            display: block;
            overflow: hidden;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
            aspect-ratio: 1;
            transition: all 0.2s ease;
        }}

        .gallery-item:hover {{
            border-color: #667eea;
            box-shadow: 0 4px 8px rgba(102, 126, 234, 0.15);
            transform: scale(1.05);
        }}

        .gallery-item img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
        }}

        /* FOOTER */
        .footer {{
            text-align: center;
            padding: 24px;
            color: var(--text-light);
            font-size: 12px;
            border-top: 1px solid #e5e7eb;
        }}

        /* RESPONSIVE */
        @media (max-width: 768px) {{
            .grid {{
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            }}
            .header {{
                padding: 24px;
            }}
            .header h1 {{
                font-size: 24px;
            }}
        }}

        @media (max-width: 480px) {{
            .grid {{
                grid-template-columns: 1fr;
            }}
        }}

        @media print {{
            body {{
                background: white;
                padding: 0;
            }}
            .card {{
                page-break-inside: avoid;
            }}
            .card-details {{
                display: block !important;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- HEADER -->
        <div class="header">
            <h1>🎨 Design Trends Guide</h1>
            <p>B2B Wholesale Recommendations for Tamil Nadu Retailers</p>
            <div class="header-stats">
                <div class="stat">✨ {len(scored_clusters)} Clusters Analyzed</div>
                <div class="stat">🟢 {sum(1 for c in scored_clusters if c['decision'] == 'Send Now')} Send Now</div>
                <div class="stat">📦 {len(products)} Products</div>
                <div class="stat">📅 {datetime.now().strftime('%b %d, %Y')}</div>
            </div>
        </div>

        <!-- LEGEND -->
        <div class="legend">
            <div class="legend-item send-now">
                <strong>🟢 Send Now (≥20)</strong>
                <span>Strong evidence, proven demand, recommended order</span>
            </div>
            <div class="legend-item backup">
                <strong>🔵 Send as Backup (15-19)</strong>
                <span>Good market signals, solid secondary choice</span>
            </div>
            <div class="legend-item evidence">
                <strong>🟡 Needs Evidence (10-14)</strong>
                <span>Promising but needs more data before full order</span>
            </div>
            <div class="legend-item do-not">
                <strong>🔴 Do Not Send (&lt;10)</strong>
                <span>Poor fit for this market, skip this design</span>
            </div>
        </div>

        <!-- GRID -->
        <div class="grid">
"""

# Function to generate product images HTML
def get_product_images_html(cluster):
    """Generate HTML for product image gallery"""
    images_html = ""
    for product in cluster.get('sample_products', []):
        if product.get('image'):
            img_url = product['image']
            title = product.get('title', '')[:30]
            product_url = product.get('url', '#')
            images_html += f'<a href="{product_url}" target="_blank" class="gallery-item" title="{title}"><img src="{img_url}" alt="{title}" loading="lazy"></a>'
    return images_html

for cluster in scored_clusters:
    score = cluster['score']['total']
    decision = cluster['decision']

    if decision == 'Send Now':
        card_class = 'send-now'
    elif decision == 'Send as Backup':
        card_class = 'backup'
    elif decision == 'Needs More Evidence':
        card_class = 'evidence'
    else:
        card_class = 'do-not'

    design = f"{cluster['design_pattern'] or '—'} · {cluster['neck_type'] or '—'} · {cluster['sleeve_length'] or '—'}"
    tags = ' '.join(cluster['persona_tags'])
    rating_stars = '⭐' * int(cluster['avg_rating']) if cluster['avg_rating'] else '—'

    # Score bars for details
    score_bars = ''
    for label, key in [('Evidence', 'evidence_strength'), ('Trend', 'trend_signal'), ('TN Fit', 'tn_b2b_fit'), ('Simplicity', 'production_simplicity'), ('Margin', 'margin_possibility')]:
        val = cluster['score'][key]
        pct = (val / 5) * 100
        score_bars += f"""
                <div class="score-bar">
                    <div class="score-bar-label">
                        <span>{label}</span>
                        <span>{val}/5</span>
                    </div>
                    <div class="score-bar-fill">
                        <div class="score-bar-progress" style="width: {pct}%"></div>
                    </div>
                </div>
"""

    html += f"""
            <div class="card {card_class}">
                <div class="card-header">
                    <div class="card-rank">#{cluster['rank']}</div>
                    <div class="card-decision {card_class}">{decision}</div>
                    <div class="card-design">{design}</div>
                </div>

                <div class="card-body">
                    <div class="card-metrics">
                        <div>
                            <div class="card-score">{score}</div>
                            <div class="card-score-max">/ 25</div>
                        </div>
                        <div class="card-rating">
                            <div class="card-rating-stars">{rating_stars}</div>
                            <div class="card-rating-num">{cluster['avg_rating']}</div>
                        </div>
                    </div>

                    <div class="card-signal">
                        {cluster['product_count']} products · {len(cluster['sources'])} platforms
                    </div>

                    <div class="card-tags">
                        {tags}
                    </div>

                    <button class="card-expand" onclick="this.parentElement.parentElement.querySelector('.card-details').classList.toggle('open'); this.textContent = this.parentElement.parentElement.querySelector('.card-details').classList.contains('open') ? '▲ Hide Details' : '▼ View Details'">
                        ▼ View Details
                    </button>

                    <div class="card-details">
                        <div class="detail-row">
                            <span class="detail-label">Price Range:</span>
                            <span class="detail-value">{cluster['price_range']}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Avg Price:</span>
                            <span class="detail-value">₹{int(cluster['avg_price'])}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Sources:</span>
                            <span class="detail-value">{', '.join([f"{p}({c})" for p,c in cluster['sources'].items()])}</span>
                        </div>

                        <div class="product-gallery">
                            <div class="gallery-label">Sample Products:</div>
                            <div class="gallery-images">
                                {get_product_images_html(cluster)}
                            </div>
                        </div>

                        {score_bars}
                    </div>
                </div>
            </div>
"""

html += """
        </div>

        <!-- FOOTER -->
        <div class="footer">
            <p>This guide is based on {total_products} products from {sources} e-commerce platforms across Tamil Nadu.<br>
            Scores reflect market evidence, customer ratings, production feasibility, and wholesale viability.<br>
            <strong>Print this page</strong> for offline sharing with your production team.</p>
        </div>
    </div>

    <script>
        // Mobile-friendly: close other cards when opening one
        document.querySelectorAll('.card-expand').forEach(btn => {{
            btn.addEventListener('click', function(e) {{
                e.stopPropagation();
                const details = this.parentElement.parentElement.querySelector('.card-details');
                const isOpen = details.classList.toggle('open');
                this.textContent = isOpen ? '▲ Hide Details' : '▼ View Details';
            }});
        }});
    </script>
</body>
</html>
""".format(
    total_products=len(products),
    sources=len(set(p.get('source') for p in products if p.get('source')))
)

html_file = OUTPUT_DIR / 'trends.html'
with open(html_file, 'w') as f:
    f.write(html)

print(f"\n📊 Full results:")
print(f"   JSON: {json_file}")
print(f"   HTML: {html_file}")
