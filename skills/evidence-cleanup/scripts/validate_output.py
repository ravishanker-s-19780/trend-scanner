#!/usr/bin/env python3

import json
import sys
from pathlib import Path

REQUIRED_FIELDS = [
    'product_id', 'source', 'keyword', 'keyword_matches', 'title', 'title_truncated',
    'url', 'price', 'price_numeric', 'price_confidence', 'rating', 'rating_numeric',
    'review_count', 'review_count_numeric', 'image',
    'neck_type', 'design_pattern', 'front_top_treatment', 'front_bottom_style',
    'primary_color', 'secondary_color', 'sleeve_length', 'cloth_texture',
    'texture_resolved', 'confidence', 'features_reliable', 'notes'
]

ENUM_FIELDS = {
    'source': ['amazon', 'indiamart', 'meesho', 'myntra'],
    'price_confidence': ['exact', 'approx', None],
    'neck_type': ['round', 'v-neck', 'square', 'boat', 'other'],
    'design_pattern': ['floral', 'geometric', 'plain', 'striped', 'checkered', 'abstract', 'other'],
    'front_top_treatment': ['embroidery', 'print', 'plain', 'lace', 'other'],
    'front_bottom_style': ['umbrella', 'straight', 'open-type', 'a-line', 'other'],
    'sleeve_length': ['half', 'three-quarter', 'full', 'sleeveless'],
    'cloth_texture': ['cotton', 'satin', 'silk-like', 'polyester-look', 'unsure'],
    'confidence': ['high', 'medium', 'low'],
    'title_truncated': [True, False],
    'texture_resolved': [True, False],
    'features_reliable': [True, False]
}

def validate_record(record, index):
    errors = []

    # Check all required fields present
    for field in REQUIRED_FIELDS:
        if field not in record:
            errors.append(f"Missing required field: {field}")

    # Check enum values
    for field, allowed_values in ENUM_FIELDS.items():
        if field in record:
            value = record[field]
            if value not in allowed_values:
                errors.append(f"Invalid enum value for {field}: {value} (allowed: {allowed_values})")

    # Check field types
    if 'product_id' in record and not isinstance(record['product_id'], str):
        errors.append(f"product_id must be string, got {type(record['product_id']).__name__}")

    if 'keyword_matches' in record:
        if not isinstance(record['keyword_matches'], list):
            errors.append(f"keyword_matches must be array, got {type(record['keyword_matches']).__name__}")
        elif not all(isinstance(k, str) for k in record['keyword_matches']):
            errors.append(f"keyword_matches must contain only strings")

    if 'price_numeric' in record:
        val = record['price_numeric']
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"price_numeric must be number or null, got {type(val).__name__}")

    if 'rating_numeric' in record:
        val = record['rating_numeric']
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"rating_numeric must be number or null, got {type(val).__name__}")

    if 'review_count_numeric' in record:
        val = record['review_count_numeric']
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"review_count_numeric must be number or null, got {type(val).__name__}")

    if 'notes' in record:
        val = record['notes']
        if val is not None and not isinstance(val, str):
            errors.append(f"notes must be string or null, got {type(val).__name__}")

    # Check consistency rules
    if record.get('price_confidence') == 'approx' and '(approx' not in record.get('price', ''):
        errors.append(f"price_confidence is 'approx' but price does not contain '(approx'")

    if record.get('title_truncated') and not record.get('title', '').endswith(('...', '…')):
        errors.append(f"title_truncated is true but title does not end with ... or …")

    if record.get('cloth_texture') == 'unsure' and record.get('texture_resolved'):
        errors.append(f"cloth_texture is 'unsure' but texture_resolved is true")

    if record.get('confidence') == 'low' and record.get('features_reliable'):
        errors.append(f"confidence is 'low' but features_reliable is true")

    return errors

def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_output.py <json_file>")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    if not filepath.exists():
        print(f"Error: File not found: {filepath}")
        sys.exit(1)

    try:
        with open(filepath) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON: {e}")
        sys.exit(1)

    if not isinstance(data, list):
        print("Error: Root must be an array")
        sys.exit(1)

    print(f"Validating {len(data)} records from {filepath.name}")

    total_errors = 0
    valid_count = 0

    for i, record in enumerate(data):
        errors = validate_record(record, i)
        if errors:
            total_errors += len(errors)
            print(f"\nRecord {i}:")
            for error in errors:
                print(f"  - {error}")
        else:
            valid_count += 1

    print(f"\n{valid_count}/{len(data)} records valid")

    if total_errors == 0:
        print("✓ All records passed validation")
        sys.exit(0)
    else:
        print(f"✗ {total_errors} validation errors found")
        sys.exit(1)

if __name__ == '__main__':
    main()
