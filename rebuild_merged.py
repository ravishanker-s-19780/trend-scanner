#!/usr/bin/env python3
"""
Rebuild merged data by properly joining original + image_features
"""
import json
import os
import re
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path('/Users/ravi-19780/git/trend-scanner')
CLEAN_DIR = PROJECT_ROOT / 'evidence' / 'clean'
ORIGINAL_DIR = PROJECT_ROOT / 'evidence' / 'original'
IMAGE_FEATURES_DIR = PROJECT_ROOT / 'evidence' / 'image_features'
OUTPUT_FILE = CLEAN_DIR / '_merged.json'

def get_size_count(size_chart):
    """Extract number of sizes from size_chart"""
    if not size_chart:
        return 0
    if isinstance(size_chart, dict):
        # Two formats: {"available_sizes": [...]} or {"rows": [...]}
        available = size_chart.get('available_sizes', [])
        if available:
            return len(available)
        rows = size_chart.get('rows', [])
        if rows:
            return len(rows)
    return 0

def has_plus_sizes(size_chart):
    """Check if size_chart contains plus sizes (XXL, XXXL, 3XL, 4XL, 5XL)"""
    plus_size_keywords = ['XXL', 'XXXL', '3XL', '4XL', '5XL', '2XL', '2xl', 'xxl']
    if not size_chart:
        return False
    if isinstance(size_chart, dict):
        available = size_chart.get('available_sizes', [])
        if available:
            return any(s in plus_size_keywords for s in available)
        rows = size_chart.get('rows', [])
        if rows:
            return any(r.get('size', '') in plus_size_keywords for r in rows)
    return False

def extract_fabric_from_title(title):
    """Extract fabric from product title, ordered by specificity (silk beats cotton)."""
    if not title:
        return None
    t = title.lower()
    if re.search(r'\bsilk\b', t):
        return 'silk'
    if re.search(r'\bsatin\b', t):
        return 'satin'
    if re.search(r'\brayon\b|\bmodal\b', t):
        return 'rayon'
    if re.search(r'\bpolyester\b|\bpoly\b', t):
        return 'polyester'
    if re.search(r'\bcotton\b', t):
        return 'cotton'
    return None

def resolve_fabric(fabric_type, cloth_texture, title=None):
    """Priority: fabric_type (PDP) > title_extracted > cloth_texture (vision) > None"""
    if fabric_type:
        return fabric_type
    title_fabric = extract_fabric_from_title(title)
    if title_fabric:
        return title_fabric
    if cloth_texture:
        return cloth_texture
    return None

def normalize_rating(rating):
    """Convert string/float rating to numeric"""
    if not rating:
        return None
    if isinstance(rating, (int, float)):
        return float(rating) if rating else None
    if isinstance(rating, str):
        try:
            return float(rating)
        except:
            return None
    return None

# Collect all clean data from all platforms
merged_data = {}
platform_counts = defaultdict(int)
total_records = 0
skipped_incomplete = 0

platforms = ['amazon', 'myntra', 'flipkart', 'ajio', 'meesho', 'clovia', 'tatacliq', 'shyaway']

for platform in platforms:
    platform_original = {}
    platform_image_features = {}

    # Load original data
    original_file = ORIGINAL_DIR / f'{platform}.json'
    if original_file.exists():
        try:
            with open(original_file, 'r') as f:
                original_records = json.load(f)
                platform_original = {r.get('product_id'): r for r in original_records if r.get('product_id')}
                print(f'✓ {platform} original: {len(platform_original)} records')
        except Exception as e:
            print(f'✗ Error loading {platform} original: {e}')

    # Load image_features data
    image_features_dir = IMAGE_FEATURES_DIR / platform
    if image_features_dir.exists():
        for json_file in image_features_dir.glob('*.json'):
            try:
                with open(json_file, 'r') as f:
                    image_records = json.load(f)
                    for r in image_records:
                        if r.get('product_id'):
                            platform_image_features[r['product_id']] = r
            except Exception as e:
                print(f'✗ Error loading {json_file}: {e}')

        if platform_image_features:
            print(f'✓ {platform} image_features: {len(platform_image_features)} records')

    # Merge: for each product, combine data from both sources
    all_product_ids = set(platform_original.keys()) | set(platform_image_features.keys())

    for product_id in all_product_ids:
        orig = platform_original.get(product_id, {})
        img = platform_image_features.get(product_id, {})

        # Determine which source has more authority
        if orig and img:
            # Merge both: start with image_features (has visual features), add original enrichment
            merged = dict(img)
            merged['fabric_type'] = orig.get('fabric_type')
            merged['nursing_label'] = orig.get('nursing_label')
            merged['size_chart'] = orig.get('size_chart')
        elif orig:
            # Only in original — include but mark as low confidence (no visual features)
            merged = dict(orig)
            merged['source'] = orig.get('platform', 'unknown').replace('www.', '').split('/')[0]
            merged['features_reliable'] = False  # No garment visual features
            merged['neck_type'] = None
            merged['design_pattern'] = None
            merged['sleeve_length'] = None
            merged['cloth_texture'] = None
        else:
            # Only in image_features — use as-is
            merged = dict(img)

        # Normalize ratings
        if merged.get('rating') and not merged.get('rating_numeric'):
            merged['rating_numeric'] = normalize_rating(merged['rating'])

        # Add derived fields
        merged['size_count'] = get_size_count(merged.get('size_chart'))
        merged['has_plus_sizes'] = has_plus_sizes(merged.get('size_chart'))
        merged['fabric_resolved'] = resolve_fabric(
            merged.get('fabric_type'),
            merged.get('cloth_texture'),
            merged.get('title') or merged.get('product_title')
        )

        # Skip incomplete records (missing critical fields)
        if not merged.get('product_id') or not merged.get('source'):
            skipped_incomplete += 1
            continue

        # Normalize platform name
        source = merged.get('source', 'unknown').lower()
        for platform_name in platforms:
            if platform_name in source:
                merged['source'] = platform_name
                break

        merged_data[product_id] = merged
        platform_counts[platform] += 1
        total_records += 1

# Convert to list and write output
merged_list = list(merged_data.values())

# Deduplicate by product_id (keep first occurrence)
seen = set()
deduped = []
for record in merged_list:
    pid = record.get('product_id')
    if pid not in seen:
        seen.add(pid)
        deduped.append(record)

# Write merged file
try:
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(deduped, f, indent=2)
    print(f"\n✅ Rebuilt {OUTPUT_FILE}")
    print(f"📊 Total unique products: {len(deduped)}")
    for platform in platforms:
        count = platform_counts[platform]
        if count > 0:
            print(f"   {platform}: {count}")
except Exception as e:
    print(f"❌ Error writing {OUTPUT_FILE}: {e}")

# Also write platform-specific clean files
print(f"\n📝 Writing platform-specific clean files...")
for platform in platforms:
    platform_records = [r for r in deduped if r.get('source') == platform]
    if platform_records:
        platform_clean_dir = CLEAN_DIR / platform
        platform_clean_dir.mkdir(parents=True, exist_ok=True)
        platform_clean_file = platform_clean_dir / 'ladies-nighty.json'
        try:
            with open(platform_clean_file, 'w') as f:
                json.dump(platform_records, f, indent=2)
            print(f"   ✓ {platform}: {len(platform_records)} records")
        except Exception as e:
            print(f"   ✗ {platform}: {e}")

# Analyze enrichment coverage
fabric_populated = sum(1 for r in deduped if r.get('fabric_type'))
nursing_populated = sum(1 for r in deduped if r.get('nursing_label') and r['nursing_label'] != 'None')
size_populated = sum(1 for r in deduped if r.get('size_chart'))
plus_sizes = sum(1 for r in deduped if r.get('has_plus_sizes'))

print(f"\n📈 Enrichment Coverage:")
print(f"   Records with fabric_type: {fabric_populated} ({fabric_populated*100//len(deduped)}%)")
print(f"   Records with nursing_label: {nursing_populated} ({nursing_populated*100//len(deduped)}%)")
print(f"   Records with size_chart: {size_populated} ({size_populated*100//len(deduped)}%)")
print(f"   Records with plus sizes (XXL+): {plus_sizes}")

# Clustering analysis
keyed_records = sum(1 for r in deduped if (r.get('design_pattern') and r.get('neck_type') and
                                           r.get('sleeve_length') and r.get('front_top_treatment')))
reliable_records = sum(1 for r in deduped if r.get('features_reliable'))
print(f"\n📊 Scoring Analysis:")
print(f"   Fully-keyed records (for clustering): {keyed_records}")
print(f"   Records with features_reliable=true: {reliable_records}")
