# GitHub Actions Workflows

This directory contains CI/CD pipelines for the trend-scanner project.

## skill-validation.yml

**Purpose:** Automatically validate and evaluate skill files whenever code is pushed to GitHub.

**Triggers:**
- On push to `main` or `develop` branches (when `skills/` directory changes)
- On pull requests to `main` or `develop` (when `skills/` directory changes)

**What it does:**

### 1. Validate Skills Job
Runs on every push and pull request:
- ✅ JSON syntax validation (using `jq` and `python3 -m json.tool`)
- ✅ Skill-specific field validation (using `scripts/validate_output.py`)
- ✅ Enum value compliance checking
- ✅ Required field presence verification
- 📝 Detects documentation changes

**Exit behavior:**
- Passes if all JSON files are syntactically valid and skill validation passes
- Fails if any JSON is malformed or skill fields are invalid
- Reports detailed error messages

### 2. Evaluate Skills Job
Runs after validation passes (only on push events):
- 📊 Detects which skill files changed since last commit
- Runs evaluation on changed files
- Reports evaluation summary

**Note:** This job is skipped on pull requests and when no skill files changed.

### 3. Branch Protection Check
Runs on pull requests after validation:
- Provides clear status that validation passed
- Useful for branch protection rule integration (optional)

---

## Local vs. GitHub CI

**Local Hooks** (`.git/hooks/`):
- Run **before** committing (pre-commit)
- Run **after** committing (post-commit)
- Provide immediate feedback while you work
- Prevent invalid commits from entering the repository

**GitHub Actions** (this workflow):
- Run on **every push** to GitHub (even old commits)
- Run on **pull requests** from collaborators
- Visible to the entire team on GitHub
- Block merges if validation fails (with branch protection rules)
- Act as a safety net for any commits that slipped past local hooks

**Together:**
1. Local hooks catch issues before they're committed
2. GitHub Actions verify them again on push
3. Team gets visibility via GitHub's UI
4. Branch protection prevents invalid code from reaching `main`

---

## Example Outputs

### Successful Validation ✅
```
✓ All JSON files are valid
✓ All skill validations passed
✓ All skill evaluation checks passed

Ready to merge!
```

### Failed Validation ❌
```
✗ Invalid JSON syntax in skills/garment-features/evals/output.json

Error: parse error: ... (jq error)

❌ Skill validation failed

Please fix the errors above and try again:
  • Ensure all JSON files are valid
  • Verify enum fields match allowed values
  • Check that all required fields are present
```

---

## Interpreting Results on GitHub

### Pull Request Checks
When you open a PR:
1. GitHub triggers the workflow
2. Both `validate-skills` and `branch-protection` jobs run
3. Status appears in the PR timeline (red ❌ or green ✅)
4. Click "Details" to see the full log

### Push Status
When you push to main/develop:
1. `validate-skills` runs immediately
2. If validation passes, `evaluate-skills` runs
3. Check the "Actions" tab on GitHub to see results

---

## Integration with Branch Protection (Optional)

To require passing validations before merging to `main`:

1. Go to repo settings → Branches
2. Add branch protection rule for `main`
3. Require status checks:
   - `Skill Validation & Evaluation / validate-skills` ✅
4. Save

Now any PR with failing validation cannot be merged.

---

## Troubleshooting

**Workflow not triggering:**
- Ensure `.github/workflows/skill-validation.yml` is committed to `main`
- Check that your push touches `skills/` directory
- Verify the branch is `main` or `develop` (other branches need to be added to the `on.push.branches` list)

**Validation fails but local hooks passed:**
- Rare edge case: GitHub's Python or jq version differs slightly
- Check the GitHub Actions log for the exact error
- Local validation is stricter; GitHub is a backup

**Need to disable the workflow:**
- Go to Actions tab → click the workflow → click "Disable workflow"
- To re-enable: click "Enable workflow"
- Or just delete this file and push the change

---

## Extending the Workflow

To add more checks:

1. Edit `.github/workflows/skill-validation.yml`
2. Add new steps to the `validate-skills` job, or
3. Create a new job if the check is independent
4. Commit and push (the workflow updates immediately)

Example: Adding a linting check for Markdown files:
```yaml
- name: Lint Markdown
  run: |
    markdown_files=$(find skills/ -name "*.md")
    # Add your linter command here
```

---

## Related Files

- **Local hooks:** [`.git/hooks/pre-commit`](../../.git/hooks/pre-commit), [`.git/hooks/post-commit`](../../.git/hooks/post-commit)
- **Hook documentation:** [`HOOKS.md`](../../HOOKS.md)
- **Skill validator:** [`skills/garment-features/scripts/validate_output.py`](../../skills/garment-features/scripts/validate_output.py)
- **Project guide:** [`CLAUDE.md`](../../CLAUDE.md)
