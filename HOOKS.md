# Git Hooks

This repository uses **git hooks** to maintain code quality and consistency.

## Pre-Commit Hook

**Location:** `.git/hooks/pre-commit`

**What it does:**
1. ✅ Validates JSON files in `skills/` directory
2. ✅ Auto-formats JSON using `jq` (or Python fallback)
3. ✅ Runs skill-specific validation using `validate_output.py`
4. ✅ Prevents commits if validation fails

**When it runs:** Before every commit (automatically)

### Validation Checks

#### JSON Syntax
- Ensures all JSON files are valid
- Uses `jq` for formatting (if available)
- Falls back to Python `json.tool` for basic validation

#### Skill Validation
- Runs `skills/garment-features/scripts/validate_output.py` 
- Checks for:
  - All required fields present
  - Enum values match allowed list
  - JSON compliance
  - Confidence levels appropriate

### Example Output

**✓ Successful commit:**
```
🔍 Running pre-commit hooks...
📋 Validating JSON files...
  Checking: skills/garment-features/evals/evals.json
    ✓ Formatted with jq
    ✓ Skill validation passed
📝 Markdown files modified: documentation updated

✓ All pre-commit checks passed
```

**✗ Failed validation:**
```
🔍 Running pre-commit hooks...
📋 Validating JSON files...
  Checking: skills/garment-features/evals/output.json
    ✗ Invalid JSON syntax

✗ Pre-commit validation failed

Fix the errors above and try committing again.
Or use: git commit --no-verify (not recommended)
```

---

## Bypassing Hooks (Not Recommended)

If you need to commit without running hooks:

```bash
git commit --no-verify
```

**⚠️ Warning:** This bypasses quality checks and should only be used in exceptional cases.

---

## Disabling/Modifying Hooks

### Temporarily Disable
```bash
chmod -x .git/hooks/pre-commit
```

### Re-enable
```bash
chmod +x .git/hooks/pre-commit
```

### Modify Hook
Edit `.git/hooks/pre-commit` directly in your text editor.

---

## Hook Installation for Collaborators

When cloning this repo, hooks are **not** automatically installed (git limitation). 

**To install hooks after cloning:**
```bash
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/post-commit  # if you add other hooks
```

Or use this one-liner:
```bash
find .git/hooks -type f -exec chmod +x {} \;
```

---

## Dependencies

### Required
- `bash` (Unix shell)
- `git` (obviously)
- `python3` (for JSON validation)

### Optional (Recommended)
- `jq` (for pretty JSON formatting)
  - Install: `brew install jq` (macOS) or `apt-get install jq` (Linux)
  - Without it, only syntax validation runs; formatting requires `jq`

---

## Extending Hooks

To add more validation or checks:

1. Edit `.git/hooks/pre-commit`
2. Add your validation logic
3. Exit with code `1` if validation fails
4. Exit with code `0` if all checks pass

Example addition:
```bash
# Check for console.log statements (JavaScript)
if git diff --cached --name-only | grep -E '\.(js|ts)$' > /dev/null; then
    if git diff --cached | grep 'console\.log' > /dev/null; then
        echo "❌ Remove console.log statements before committing"
        exit 1
    fi
fi
```

---

## Troubleshooting

### Hook Not Running
- Check if hook is executable: `ls -l .git/hooks/pre-commit`
- If not: `chmod +x .git/hooks/pre-commit`

### "Permission denied" Error
```bash
chmod +x .git/hooks/pre-commit
```

### Hook Interferes with Workflow
Either:
1. Fix the validation issue (recommended)
2. Temporarily disable: `chmod -x .git/hooks/pre-commit`
3. Bypass for single commit: `git commit --no-verify`

### `jq` Not Found
The hook uses `jq` if available. Without it, JSON validation still works but formatting won't run automatically.
- Install: `brew install jq` (macOS) / `apt-get install jq` (Linux)
- Or modify hook to use Python JSON formatter instead

---

## For Maintainers

When updating validation logic:
1. Update the validation script: `skills/garment-features/scripts/validate_output.py`
2. Update the hook to call the new validation
3. Document the changes here
4. Commit both the hook and this documentation

---

## References

- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [Pre-commit Framework](https://pre-commit.com/) (alternative to bash hooks)
