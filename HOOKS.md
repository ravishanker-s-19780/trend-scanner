# Git Hooks

This repository uses **git hooks** to maintain code quality, consistency, and provide immediate evaluation feedback.

**Hooks are tracked in `.githooks/`** and automatically enabled for all collaborators via `git config core.hooksPath`.

## Hook Pipeline

```
git commit
    ↓
[Pre-Commit Hook] ← Validates before committing
    ↓ (if valid)
Commit created
    ↓
[Post-Commit Hook] ← Runs evaluations after commit
    ↓
Feedback displayed
```

---

## Pre-Commit Hook

**Location:** `.githooks/pre-commit` (tracked in repository)

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
chmod -x .githooks/pre-commit
```

### Re-enable
```bash
chmod +x .githooks/pre-commit
```

### Modify Hook
Edit `.githooks/pre-commit` directly in your text editor. Your changes will be automatically committed when you stage them.

---

## Hook Installation for Collaborators

Hooks are **automatically enabled** when you clone and pull from this repository. No manual setup needed!

**How it works:**
- Hooks are tracked in `.githooks/` directory
- Git is configured via `git config core.hooksPath .githooks`
- When you clone: hooks are automatically discovered and enabled
- When you pull: hook updates are automatic

**Verify hooks are active after cloning:**
```bash
git config core.hooksPath
# Should output: .githooks
```

If for some reason the config didn't transfer, run once:
```bash
git config core.hooksPath .githooks
```

---

## Post-Commit Hook

**Location:** `.githooks/post-commit` (tracked in repository)

**What it does:**
1. ✅ Detects changes in `skills/` directory
2. ✅ Runs skill evaluation on modified JSON files
3. ✅ Reports validation results and errors
4. ✅ Shows documentation changes
5. ✅ Provides summary of skill health

**When it runs:** After every successful commit (automatically)

**Only runs if:** `skills/` directory changed in the commit

### Evaluation Feedback

**Example output after committing skill changes:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 POST-COMMIT EVALUATION: Skills directory changed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commit: a4bc4d3
Running evaluations on modified skill files...

  [1] evals.json ... ✓
  [2] output.json ... ✓

📝 Documentation Files Modified:
  • SKILL.md
  • reference.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 EVALUATION SUMMARY
  Total files:   2
  Valid:        2

✓ All skill evaluations passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Error Detection

If validation fails:

```
  [1] evals.json ... ✗

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ VALIDATION ERRORS:
  • evals.json: Invalid value for neck_type: 'invalid'. 
    Allowed: round, v-neck, square, boat, other

⚠️  Commit succeeded but skill files have validation issues.
Consider fixing these before pushing to remote.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### What Gets Evaluated

**JSON Files:**
- Syntax validation
- Skill-specific field checks
- Enum value compliance
- Required field presence

**Markdown Files:**
- Detected and reported
- No validation (informational only)

**Scripts:**
- Detected but not evaluated
- Mention in summary only

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
- Check if git is configured: `git config core.hooksPath`
- Should output: `.githooks`
- If not, run: `git config core.hooksPath .githooks`
- Check if hook is executable: `ls -l .githooks/pre-commit`
- If not: `chmod +x .githooks/pre-commit`

### "Permission denied" Error
```bash
chmod +x .githooks/pre-commit .githooks/post-commit
```

### Hook Interferes with Workflow
Either:
1. Fix the validation issue (recommended)
2. Temporarily disable: `chmod -x .githooks/pre-commit`
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
