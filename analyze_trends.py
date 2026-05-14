#!/usr/bin/env python3
"""
B2B Trend Scorer - Python implementation
Analyzes design clusters and scores them on the 25-point B2B framework
Generates compelling HTML report with persona insights baked in
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
args = {
    'top': 10,
    'source': None,
    'min_count': 1,
    'json': False
}
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
            k = arg[2:]
            if k == 'json':
                args['json'] = True

# Load data
if not MERGED_FILE.exists():
    print(f"Error: {MERGED_FILE} not found")
    sys.exit(1)

with open(MERGED_FILE, 'r') as f:
    products = json.load(f)

# Filter by source
if args['source']:
    products = [p for p in products if p.get('source') == args['source']]

print(f"📊 Loaded {len(products)} products")

# Helper functions
def score_evidence_strength(cluster):
    sources = set(p.get('source') for p in cluster['products'] if p.get('source'))
    rated = [p for p in cluster['products'] if p.get('rating_numeric')]
    avg_rating = mean([p['rating_numeric'] for p in rated]) if rated else 0

    base = 1
    if len(sources) >= 2 and avg_rating >= 3.8:
        base = 5
    elif len(sources) >= 2 or (len(sources) == 1 and len(cluster['products']) >= 3 and len(rated) >= 2):
        base = 3

    # Nursing bonus: if cluster has nursing-friendly products, boost by 1
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

    # Check price
    prices = [p.get('price_numeric') for p in cluster['products'] if p.get('price_numeric')]
    if prices:
        avg_price = mean(prices)
        if avg_price > 600:
            score -= 2
    else:
        score -= 1

    # Check fabric — prefer fabric_type from original enrichment, fall back to cloth_texture
    fabrics = []
    for p in cluster['products']:
        # Prefer fabric_resolved (which is the merged result of fabric_type or cloth_texture)
        if p.get('fabric_resolved'):
            fabrics.append(p['fabric_resolved'].lower())

    if fabrics:
        # Grade by fabric quality tier for TN wholesale market
        fabric_tiers = {
            'cotton': 0,         # ideal, no penalty
            'modal': -1,         # acceptable premium
            'rayon': -1,         # acceptable but less preferred
            'satin': -2,         # luxury niche only
            'silk': -2,          # luxury niche only
            'silk-like': -2      # polyester satin, penalized
        }

        penalty = 0
        for fabric in fabrics:
            # Check if fabric matches any key
            for tier_fabric, tier_penalty in fabric_tiers.items():
                if tier_fabric in fabric:
                    penalty += tier_penalty
                    break

        # Apply average penalty
        if len(fabrics) > 0:
            avg_penalty = penalty / len(fabrics)
            score += round(avg_penalty)  # Already negative, will subtract

    # Check treatment complexity
    treatments = [p.get('front_top_treatment') for p in cluster['products'] if p.get('front_top_treatment')]
    if treatments:
        complex_count = sum(1 for t in treatments if t and t.lower() in ['embroidery', 'lace'])
        if complex_count > len(treatments) * 0.3:
            score -= 1

    return max(0, score)

def score_production_simplicity(cluster):
    treatment_scores = {
        'plain': 5, 'print': 3, 'lace': 2, 'embroidery': 1
    }
    sleeve_scores = {
        'half': 5, 'sleeveless': 4, '3/4': 3, 'full': 2
    }

    treatments = [p.get('front_top_treatment') for p in cluster['products'] if p.get('front_top_treatment')]
    sleeves = [p.get('sleeve_length') for p in cluster['products'] if p.get('sleeve_length')]
    size_counts = [p.get('size_count', 0) for p in cluster['products'] if p.get('size_count')]

    treatment_score = mean([treatment_scores.get(t.lower(), 2) for t in treatments]) if treatments else 3
    sleeve_score = mean([sleeve_scores.get(s.lower(), 2) for s in sleeves]) if sleeves else 3

    # Size range complexity: more sizes = more SKUs = harder production, but also more market reach
    if size_counts:
        avg_size_count = mean(size_counts)
        if avg_size_count >= 7:
            size_score = 3   # many sizes, complex production
        elif avg_size_count >= 4:
            size_score = 4   # standard range
        elif avg_size_count > 0:
            size_score = 5   # small/freesize, simplest
        else:
            size_score = 4
    else:
        size_score = 4   # unknown size range, neutral

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

def get_persona_tags(cluster, avg_price):
    """Generate persona-driven tags based on cluster attributes"""
    tags = []

    # Price segment
    if avg_price <= 600:
        tags.append(("💰", "Mass Market (₹250–600)", "mass"))
    elif avg_price <= 800:
        tags.append(("💼", "Mid Segment (₹600–800)", "mid"))
    elif avg_price >= 1200:
        tags.append(("💎", "Premium (₹1200+)", "premium"))

    # Fabric enrichment tag
    fabrics = [p.get('fabric_resolved') for p in cluster.get('products', []) if p.get('fabric_resolved')]
    if fabrics:
        fabric_counts = {}
        for f in fabrics:
            f_lower = f.lower()
            for key in ['cotton', 'rayon', 'modal', 'satin', 'silk']:
                if key in f_lower:
                    fabric_counts[key] = fabric_counts.get(key, 0) + 1
                    break
        if fabric_counts:
            top_fabric = max(fabric_counts, key=fabric_counts.get)
            if top_fabric == 'cotton':
                tags.append(("🧵", "100% Cotton", "cotton"))
            elif top_fabric in ['rayon', 'modal']:
                tags.append(("✨", "Premium Fabric", "premium_fabric"))

    # Occasion/segment
    treatment = cluster.get('front_top_treatment', '')
    if treatment and treatment.lower() in ['lace', 'embroidery']:
        tags.append(("💍", "Wedding / Trousseau Niche", "trousseau"))

    # Nursing-friendly from enrichment field
    nursing_products = sum(1 for p in cluster.get('products', [])
                          if p.get('nursing_label') and p.get('nursing_label') not in ['None', None])
    if nursing_products > 0:
        tags.append(("👶", f"Nursing-Friendly ({nursing_products})", "nursing"))

    # Size range tag
    plus_sizes = sum(1 for p in cluster.get('products', []) if p.get('has_plus_sizes'))
    if plus_sizes > len(cluster.get('products', [])) * 0.5:
        tags.append(("📏", "Plus Sizes (XXL+)", "plus_sizes"))

    # Sleeve prominence
    sleeve = cluster.get('sleeve_length', '')
    if sleeve and sleeve.lower() in ['three-quarter', '3/4']:
        tags.append(("👕", "Three-Quarter Sleeves", "sleeve34"))

    return tags

def format_design_archetype(cluster):
    """Format design attributes for display"""
    parts = []
    if cluster.get('design_pattern'):
        parts.append(cluster['design_pattern'].title())
    if cluster.get('neck_type'):
        parts.append(f"{cluster['neck_type'].title()} Neck")
    if cluster.get('sleeve_length'):
        parts.append(f"{cluster['sleeve_length'].title()} Sleeve")
    if cluster.get('front_top_treatment'):
        parts.append(f"{cluster['front_top_treatment'].title()} Front")

    return ' · '.join(parts) if parts else 'Mixed Design'

def format_platform_coverage(sources):
    """Format platform coverage badge"""
    platform_colors = {
        'amazon': '#FF9900',
        'myntra': '#FC1741',
        'flipkart': '#1F3FEF',
        'ajio': '#FF0000',
        'meesho': '#FF6347',
        'clovia': '#8B4789',
        'tatacliq': '#1E3C72',
        'shyaway': '#E91E63'
    }

    badges = []
    for platform in sorted(sources.keys()):
        count = sources[platform]
        color = platform_colors.get(platform, '#999')
        badges.append(f'<span class="platform-badge" style="background:{color}">{platform}({count})</span>')

    return ''.join(badges)

# Cluster products
clusters = {}
for p in products:
    if not (p.get('design_pattern') or p.get('neck_type') or p.get('sleeve_length') or p.get('front_top_treatment')):
        continue

    key = '|'.join([
        str(p.get('design_pattern') or 'unknown'),
        str(p.get('neck_type') or 'unknown'),
        str(p.get('sleeve_length') or 'unknown'),
        str(p.get('front_top_treatment') or 'unknown')
    ])

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

    # Apply capping rule
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

    # Determine decision
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
        'design_pattern': cluster['design_pattern'],
        'neck_type': cluster['neck_type'],
        'sleeve_length': cluster['sleeve_length'],
        'front_top_treatment': cluster['front_top_treatment'],
        'product_count': len(cluster['products']),
        'keyword_count': len(keywords),
        'sources': sources,
        'avg_rating': round(mean(ratings), 2) if ratings else 0,
        'price_range': f"₹{min(prices)}-₹{max(prices)}" if prices else 'N/A',
        'avg_price': avg_price,
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
        'persona_tags': get_persona_tags(cluster, avg_price),
        'archetype': format_design_archetype(cluster),
        'sample_products': [{'product_id': p.get('product_id'), 'title': p.get('title')[:60] if p.get('title') else 'N/A'} for p in cluster['products'][:3]]
    }

    scored_clusters.append(cluster_data)

# Sort by score
scored_clusters.sort(key=lambda x: x['score']['total'], reverse=True)

# Limit to top N for console
top_clusters = scored_clusters[:args['top']]

# Write JSON (all clusters, not just top)
json_output = {
    'timestamp': datetime.now().isoformat(),
    'total_products': len(products),
    'total_clusters': len(scored_clusters),
    'top_trends': scored_clusters  # All clusters, ranked
}

json_file = OUTPUT_DIR / 'trends.json'
with open(json_file, 'w') as f:
    json.dump(json_output, f, indent=2)

print(f"\n✅ Analyzed {len(scored_clusters)} design clusters")
print(f"📈 Top {len(top_clusters)} trends:\n")

# Print console output
for i, cluster in enumerate(top_clusters, 1):
    print(f"{i}. {cluster['archetype']}")
    print(f"   Score: {cluster['score']['total']}/25 ({cluster['decision']})")
    print(f"   Products: {cluster['product_count']} | Keywords: {cluster['keyword_count']} | Avg Rating: {cluster['avg_rating']}")
    print(f"   Sources: {', '.join([f'{s}({c})' for s, c in cluster['sources'].items()])}")
    if cluster['avg_price'] > 0:
        print(f"   Price: ₹{int(cluster['avg_price'])}")
    print()

# Generate HTML
def generate_html(clusters_data):
    """Generate compelling B2B trends HTML report"""

    decision_colors = {
        'Send Now': '#10b981',
        'Send as Backup': '#2563eb',
        'Needs More Evidence': '#f59e0b',
        'Do Not Send': '#dc2626'
    }

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ladies Nighty B2B Design Trends</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        :root {{
            --color-send-now: #10b981;
            --color-backup: #2563eb;
            --color-evidence: #f59e0b;
            --color-do-not: #dc2626;
            --color-bg: #f9fafb;
            --color-card: #ffffff;
            --color-text: #1f2937;
            --color-text-light: #6b7280;
            --color-border: #e5e7eb;
            --color-mass: #6366f1;
            --color-mid: #8b5cf6;
            --color-premium: #ec4899;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: var(--color-bg);
            color: var(--color-text);
            line-height: 1.6;
            padding: 20px;
        }}

        .container {{
            max-width: 1200px;
            margin: 0 auto;
        }}

        /* ─── HEADER ─── */
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }}

        .header h1 {{
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }}

        .header p {{
            font-size: 14px;
            opacity: 0.9;
            margin-bottom: 16px;
        }}

        .header-stats {{
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
            margin-top: 20px;
        }}

        .stat-chip {{
            background: rgba(255,255,255,0.2);
            padding: 8px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
        }}

        .platform-badges {{
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-top: 12px;
        }}

        .platform-badge {{
            background: rgba(255,255,255,0.15);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }}

        /* ─── DECISION LEGEND ─── */
        .legend {{
            background: var(--color-card);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid var(--color-text);
        }}

        .legend h2 {{
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        .legend-items {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }}

        .legend-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }}

        .legend-badge {{
            width: 20px;
            height: 20px;
            border-radius: 4px;
        }}

        /* ─── CARDS ─── */
        .trend-card {{
            background: var(--color-card);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border-top: 4px solid;
            page-break-inside: avoid;
        }}

        .trend-card.send-now {{ border-top-color: var(--color-send-now); }}
        .trend-card.backup {{ border-top-color: var(--color-backup); }}
        .trend-card.evidence {{ border-top-color: var(--color-evidence); }}
        .trend-card.do-not {{ border-top-color: var(--color-do-not); }}

        .card-header {{
            display: grid;
            grid-template-columns: 1fr auto auto;
            gap: 16px;
            align-items: start;
            margin-bottom: 16px;
        }}

        .card-title {{
            font-size: 16px;
            font-weight: 700;
        }}

        .card-rank {{
            font-size: 12px;
            color: var(--color-text-light);
            margin-bottom: 4px;
        }}

        .decision-badge {{
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            color: white;
        }}

        .score-display {{
            text-align: center;
        }}

        .score-number {{
            font-size: 32px;
            font-weight: 700;
            line-height: 1;
        }}

        .score-max {{
            font-size: 12px;
            color: var(--color-text-light);
        }}

        /* ─── CARD GRID ─── */
        .card-body {{
            display: grid;
            grid-template-columns: 150px 1fr 1fr;
            gap: 24px;
            margin-bottom: 16px;
        }}

        .photos {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(45px, 1fr));
            gap: 6px;
        }}

        .photo-thumb {{
            width: 100%;
            aspect-ratio: 3/4;
            border-radius: 6px;
            overflow: hidden;
            background: var(--color-bg);
            border: 1px solid var(--color-border);
        }}

        .photo-thumb img {{
            width: 100%;
            height: 100%;
            object-fit: cover;
        }}

        .photo-thumb a {{
            display: block;
            width: 100%;
            height: 100%;
        }}

        /* ─── SIGNAL SECTION ─── */
        .market-signal {{
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 13px;
        }}

        .signal-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}

        .signal-label {{
            color: var(--color-text-light);
            font-weight: 600;
        }}

        .signal-value {{
            font-weight: 700;
        }}

        /* ─── SCORE BARS ─── */
        .score-bars {{
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 12px;
        }}

        .score-bar-row {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .score-label {{
            width: 80px;
            color: var(--color-text-light);
            font-weight: 600;
        }}

        .score-bar {{
            flex: 1;
            height: 6px;
            background: var(--color-border);
            border-radius: 3px;
            overflow: hidden;
        }}

        .score-bar-fill {{
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 3px;
        }}

        .score-number-small {{
            width: 35px;
            text-align: right;
            font-weight: 700;
        }}

        /* ─── TAGS ─── */
        .persona-tags {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }}

        .tag {{
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: var(--color-bg);
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--color-border);
        }}

        .tag.mass {{ background: #eef2ff; border-color: var(--color-mass); color: var(--color-mass); }}
        .tag.mid {{ background: #faf5ff; border-color: var(--color-mid); color: var(--color-mid); }}
        .tag.premium {{ background: #fce7f3; border-color: var(--color-premium); color: var(--color-premium); }}
        .tag.trousseau {{ background: #fdf2f8; border-color: #d946ef; color: #d946ef; }}
        .tag.nursing {{ background: #f0fdf4; border-color: #22c55e; color: #22c55e; }}
        .tag.sleeve34 {{ background: #f5f3ff; border-color: #a78bfa; color: #a78bfa; }}

        .warning-banner {{
            background: #fef3c7;
            border-left: 4px solid var(--color-evidence);
            padding: 12px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 12px;
        }}

        /* ─── FOOTER ─── */
        .footer {{
            text-align: center;
            padding: 24px;
            color: var(--color-text-light);
            font-size: 12px;
            margin-top: 40px;
            border-top: 1px solid var(--color-border);
        }}

        .print-button {{
            display: inline-block;
            padding: 10px 20px;
            background: var(--color-send-now);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 20px;
        }}

        .print-button:hover {{
            opacity: 0.9;
        }}

        /* ─── RESPONSIVE ─── */
        @media (max-width: 768px) {{
            .card-body {{
                grid-template-columns: 1fr;
            }}

            .card-header {{
                grid-template-columns: 1fr;
            }}

            body {{
                padding: 12px;
            }}

            .header {{
                padding: 24px;
            }}

            .header h1 {{
                font-size: 20px;
            }}

            .trend-card {{
                padding: 16px;
            }}
        }}

        /* ─── PRINT ─── */
        @media print {{
            body {{
                padding: 0;
                background: white;
            }}

            .print-button {{
                display: none;
            }}

            .container {{
                max-width: 100%;
            }}

            .trend-card {{
                page-break-inside: avoid;
                margin-bottom: 12px;
            }}

            .header {{
                background: white;
                color: var(--color-text);
                border: 2px solid var(--color-border);
                padding: 20px;
            }}

            .header h1 {{
                color: var(--color-text);
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <button class="print-button" onclick="window.print()">🖨️ Print Report</button>

        <!-- HEADER -->
        <div class="header">
            <h1>Ladies Nighty Design Trends — B2B Wholesale Report</h1>
            <p>Tamil Nadu Market Analysis · {json_output['timestamp']}</p>
            <div class="header-stats">
                <span class="stat-chip">📊 {len(scored_clusters)} clusters analyzed</span>
                <span class="stat-chip">✨ {sum(1 for c in scored_clusters if c['decision'] == 'Send Now')} Send Now</span>
                <span class="stat-chip">📦 {sum(1 for c in scored_clusters if c['decision'] == 'Send as Backup')} Send as Backup</span>
                <span class="stat-chip">🔍 {len(products)} products</span>
            </div>
            <div class="platform-badges">
                <span style="font-size:11px; color:#fff; opacity:0.8; margin-top:8px">Platforms: </span>
                <span class="platform-badge">Amazon</span>
                <span class="platform-badge">Myntra</span>
                <span class="platform-badge">Flipkart</span>
                <span class="platform-badge">Ajio</span>
                <span class="platform-badge">Meesho</span>
                <span class="platform-badge">Clovia</span>
                <span class="platform-badge">Tata CLiQ</span>
                <span class="platform-badge">Shyaway</span>
            </div>
        </div>

        <!-- LEGEND -->
        <div class="legend">
            <h2>How to Read This Report</h2>
            <div class="legend-items">
                <div class="legend-item">
                    <div class="legend-badge" style="background: var(--color-send-now)"></div>
                    <span><strong>Send Now (≥20):</strong> Strong evidence, proven demand</span>
                </div>
                <div class="legend-item">
                    <div class="legend-badge" style="background: var(--color-backup)"></div>
                    <span><strong>Send as Backup (≥15):</strong> Good fit, acceptable signals</span>
                </div>
                <div class="legend-item">
                    <div class="legend-badge" style="background: var(--color-evidence)"></div>
                    <span><strong>Needs Evidence (10–14):</strong> Promising but risky</span>
                </div>
                <div class="legend-item">
                    <div class="legend-badge" style="background: var(--color-do-not)"></div>
                    <span><strong>Do Not Send (&lt;10):</strong> Poor fit or weak signals</span>
                </div>
            </div>
        </div>

        <!-- TRENDS -->
"""

    for rank, cluster in enumerate(clusters_data, 1):
        score = cluster['score']['total']
        decision = cluster['decision']

        # Determine card class
        if decision == 'Send Now':
            card_class = 'send-now'
            color = decision_colors['Send Now']
        elif decision == 'Send as Backup':
            card_class = 'backup'
            color = decision_colors['Send as Backup']
        elif decision == 'Needs More Evidence':
            card_class = 'evidence'
            color = decision_colors['Needs More Evidence']
        else:
            card_class = 'do-not'
            color = decision_colors['Do Not Send']

        # Build tags HTML
        tags_html = ''
        for emoji, label, tag_class in cluster['persona_tags']:
            tags_html += f'<span class="tag {tag_class}">{emoji} {label}</span>'

        # Build score bars
        score_bars_html = ''
        dimensions = [
            ('A. Evidence', 'evidence_strength'),
            ('B. Trend Signal', 'trend_signal'),
            ('C. TN B2B Fit', 'tn_b2b_fit'),
            ('D. Simplicity', 'production_simplicity'),
            ('E. Margin', 'margin_possibility')
        ]

        for label, key in dimensions:
            score_val = cluster['score'][key]
            pct = (score_val / 5) * 100
            score_bars_html += f'''
            <div class="score-bar-row">
                <span class="score-label">{label}</span>
                <div class="score-bar">
                    <div class="score-bar-fill" style="width: {pct}%"></div>
                </div>
                <span class="score-number-small">{score_val}/5</span>
            </div>
            '''

        # Build photos
        photos_html = ''
        for product in cluster['sample_products']:
            if product.get('product_id'):
                # Construct image URL from product data
                photos_html += f'''
                <div class="photo-thumb">
                    <a href="#" target="_blank" rel="noopener">
                        <img src="" alt="{product['title']}" onerror="this.parentElement.style.display='none'">
                    </a>
                </div>
                '''

        # Warning banner if capped
        warning_html = ''
        if cluster['score']['capped']:
            warning_html = '<div class="warning-banner">⚠️ Score capped due to weak evidence — collect more data before ordering in volume</div>'

        html += f'''
        <div class="trend-card {card_class}">
            {warning_html}

            <div class="card-header">
                <div>
                    <div class="card-rank">#{rank}</div>
                    <div class="card-title">{cluster['archetype']}</div>
                </div>
                <div style="text-align: right;">
                    <span class="decision-badge" style="background: {color}">{decision}</span>
                </div>
                <div class="score-display">
                    <div class="score-number" style="color: {color}">{score}</div>
                    <div class="score-max">/ 25</div>
                </div>
            </div>

            <div class="card-body">
                <div class="photos">
                    {photos_html}
                </div>

                <div class="market-signal">
                    <div class="signal-row">
                        <span class="signal-label">Products:</span>
                        <span class="signal-value">{cluster['product_count']}</span>
                    </div>
                    <div class="signal-row">
                        <span class="signal-label">Avg Rating:</span>
                        <span class="signal-value">{'⭐' * int(cluster['avg_rating'])} {cluster['avg_rating']}</span>
                    </div>
                    <div class="signal-row">
                        <span class="signal-label">Price Range:</span>
                        <span class="signal-value">{cluster['price_range']}</span>
                    </div>
                    <div class="signal-row">
                        <span class="signal-label">Avg Price:</span>
                        <span class="signal-value">₹{int(cluster['avg_price'])}</span>
                    </div>
                    <div class="signal-row">
                        <span class="signal-label">Sources:</span>
                        <span class="signal-value">{len(cluster['sources'])} platforms</span>
                    </div>
                </div>

                <div>
                    <div class="score-bars">
                        {score_bars_html}
                    </div>
                </div>
            </div>

            <div class="persona-tags">
                {tags_html}
            </div>
        </div>
        '''

    html += '''
        <div class="footer">
            <p>This report is generated from {total_products} products across 8 e-commerce platforms.<br>
            Scores are based on market evidence, customer sentiment, production feasibility, and TN wholesale market fit.<br>
            <strong>Last updated:</strong> {timestamp}</p>
        </div>
    </div>
</body>
</html>
'''.format(
        total_products=len(products),
        timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    )

    return html

# Write HTML
html_content = generate_html(scored_clusters)
html_file = OUTPUT_DIR / 'trends.html'
with open(html_file, 'w') as f:
    f.write(html_content)

print(f"📊 Full results:")
print(f"   JSON: {json_file}")
print(f"   HTML: {html_file}")
