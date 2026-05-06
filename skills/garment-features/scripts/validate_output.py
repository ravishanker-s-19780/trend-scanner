#!/usr/bin/env python3
"""
Validation utility for garment-features skill output.

Validates that extracted features conform to the skill's specification:
- All required fields present
- Enum fields use allowed values
- JSON structure is valid
- Confidence levels are appropriate
"""

import json
import sys
from typing import Dict, List, Tuple

# Allowed enum values per field
ALLOWED_ENUMS = {
    "neck_type": ["round", "v-neck", "square", "boat", "other"],
    "design_pattern": ["floral", "geometric", "plain", "striped", "checkered", "abstract", "other"],
    "front_top_treatment": ["embroidery", "print", "plain", "lace", "other"],
    "front_bottom_style": ["umbrella", "straight", "open-type", "a-line", "other"],
    "sleeve_length": ["half", "three-quarter", "full", "sleeveless"],
    "cloth_texture": ["cotton", "satin", "silk-like", "polyester-look", "unsure"],
    "confidence": ["high", "medium", "low"],
}

REQUIRED_FIELDS = [
    "neck_type",
    "design_pattern",
    "front_top_treatment",
    "front_bottom_style",
    "primary_color",
    "secondary_color",
    "sleeve_length",
    "cloth_texture",
    "confidence",
    "notes",
]


def validate_features(features: Dict) -> Tuple[bool, List[str]]:
    """
    Validate a single feature extraction output.

    Args:
        features: Dictionary of extracted features

    Returns:
        (is_valid, list_of_errors)
    """
    errors = []

    # Check all required fields present
    for field in REQUIRED_FIELDS:
        if field not in features:
            errors.append(f"Missing required field: {field}")

    # Validate enum fields
    for field, allowed_values in ALLOWED_ENUMS.items():
        if field in features:
            value = features[field]
            if value not in allowed_values:
                errors.append(
                    f"Invalid value for {field}: '{value}'. "
                    f"Allowed: {', '.join(allowed_values)}"
                )

    # Validate text fields (should not be empty unless null)
    for field in ["primary_color", "secondary_color", "notes"]:
        if field in features:
            value = features[field]
            if isinstance(value, str) and value.strip() == "":
                errors.append(f"Field {field} is empty string (should be null or have content)")

    # Special validation: secondary_color for plain garments
    if features.get("design_pattern") == "plain" and features.get("secondary_color") != "none":
        errors.append(
            f"Plain garment should have secondary_color='none', got '{features.get('secondary_color')}'"
        )

    # Special validation: confidence and notes relationship
    if features.get("confidence") in ["medium", "low"] and features.get("notes") is None:
        errors.append(
            f"Confidence is '{features.get('confidence')}' but notes is null. "
            "Should document why confidence is not high."
        )

    return len(errors) == 0, errors


def validate_batch(features_list: List[Dict]) -> Dict:
    """
    Validate a batch of feature extractions.

    Args:
        features_list: List of feature dictionaries

    Returns:
        Summary report
    """
    total = len(features_list)
    valid = 0
    errors_by_index = {}
    confidence_distribution = {"high": 0, "medium": 0, "low": 0}

    for idx, features in enumerate(features_list):
        is_valid, errors = validate_features(features)
        if is_valid:
            valid += 1
        else:
            errors_by_index[idx] = errors

        # Track confidence distribution
        conf = features.get("confidence")
        if conf in confidence_distribution:
            confidence_distribution[conf] += 1

    return {
        "total": total,
        "valid": valid,
        "invalid": total - valid,
        "pass_rate": valid / total if total > 0 else 0,
        "errors_by_index": errors_by_index,
        "confidence_distribution": confidence_distribution,
    }


def main():
    """CLI interface for validation."""
    if len(sys.argv) < 2:
        print("Usage: python validate_output.py <json_file> [--batch]")
        print("\nValidates garment-features skill output JSON files.")
        print("\nOptions:")
        print("  --batch    Treat input as array of feature objects (default: single object)")
        sys.exit(1)

    json_file = sys.argv[1]
    is_batch = "--batch" in sys.argv

    try:
        with open(json_file, 'r') as f:
            data = json.load(f)

        if is_batch:
            if not isinstance(data, list):
                print("Error: --batch flag specified but input is not an array")
                sys.exit(1)
            report = validate_batch(data)
            print(json.dumps(report, indent=2))
            sys.exit(0 if report["invalid"] == 0 else 1)
        else:
            if isinstance(data, list):
                print("Input is an array. Use --batch flag to validate batch.")
                sys.exit(1)
            is_valid, errors = validate_features(data)
            if is_valid:
                print("✓ Valid output")
                sys.exit(0)
            else:
                print("✗ Invalid output:")
                for error in errors:
                    print(f"  - {error}")
                sys.exit(1)

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON - {e}")
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: File not found - {json_file}")
        sys.exit(1)


if __name__ == "__main__":
    main()
