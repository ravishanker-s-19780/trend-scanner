#!/usr/bin/env python3
"""
Fix fabric_resolved data by extracting from product titles
when image features classification is clearly wrong
"""
import json
import re

def extract_fabric_from_title(title):
    """Extract actual fabric from product title"""
    if not title:
        return None

    title_lower = title.lower()

    # Order matters - check specific fabrics first
    if re.search(r'\b100%\s*silk\b|\bpure silk\b|\bsilk\s+\w+\b', title_lower):
        return 'silk'
    if re.search(r'\bsilk\b', title_lower):
        return 'silk'
    if re.search(r'\bsatin\b', title_lower):
        return 'satin'
    if re.search(r'\brayon\b|\bmodal\b', title_lower):
        return 'rayon'
    if re.search(r'\bpolyester\b|\bpoly\b', title_lower):
        return 'polyester'
    if re.search(r'\b100%\s*cotton\b|\bpure cotton\b', title_lower):
        return 'cotton'
    if re.search(r'\bcotton\b', title_lower):
        return 'cotton'

    return None

def should_override(current_fabric, title_extracted):
    """Determine if we should override current fabric with title extraction"""
    # If title clearly says silk/satin but resolved is cotton, override it
    if current_fabric and current_fabric.lower() == 'cotton':
        if title_extracted and title_extracted.lower() in ['silk', 'satin']:
            return True
    return False

# Load merged data
with open('/Users/ravi-19780/git/trend-scanner/evidence/clean/_merged.json') as f:
    products = json.load(f)

fixed_count = 0
mismatches = []

for product in products:
    if not product or not isinstance(product, dict):
        continue

    current_fabric = product.get('fabric_resolved', '')
    if current_fabric:
        current_fabric = current_fabric.lower()
    title = product.get('title', '')

    # Extract fabric from title
    title_fabric = extract_fabric_from_title(title)

    # Check if we should override
    if should_override(current_fabric, title_fabric):
        old_fabric = product['fabric_resolved']
        product['fabric_resolved'] = title_fabric
        fixed_count += 1
        mismatches.append({
            'product_id': product['product_id'],
            'title': title[:60],
            'old': old_fabric,
            'new': title_fabric
        })

print("=" * 100)
print("FABRIC DATA FIX REPORT")
print("=" * 100)
print(f"\n✅ Fixed: {fixed_count} products")
print(f"\nChanges made:")

fabric_changes = {}
for m in mismatches:
    key = f"{m['old']} → {m['new']}"
    fabric_changes[key] = fabric_changes.get(key, 0) + 1

for change, count in sorted(fabric_changes.items(), key=lambda x: x[1], reverse=True):
    print(f"   • {change}: {count}")

print(f"\nExamples:")
for m in mismatches[:10]:
    print(f"   {m['product_id']}: {m['title']} ({m['old']} → {m['new']})")

# Write fixed data
with open('/Users/ravi-19780/git/trend-scanner/evidence/clean/_merged.json', 'w') as f:
    json.dump(products, f, indent=2)

print(f"\n✅ Updated _merged.json")

# Regenerate trends.json to reflect the correct fabrics
print("\n" + "=" * 100)
print("REGENERATING TRENDS WITH CORRECTED FABRIC DATA")
print("=" * 100)

# Run the analyze_trends script to regenerate trends
import subprocess
result = subprocess.run(
    ['python3', '/Users/ravi-19780/git/trend-scanner/analyze_trends.py'],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    print("✅ Trends regenerated successfully")
    print(result.stdout)
else:
    print("⚠️ Error regenerating trends:")
    print(result.stderr)

print("\n" + "=" * 100)
print("DONE - Fabric data corrected and trends regenerated")
print("=" * 100)
