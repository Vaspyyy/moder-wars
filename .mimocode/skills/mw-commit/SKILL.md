---
name: mw-commit
description: Use when committing changes to the Modern Wars project. Automates version bumping, linting, committing, and pushing. Activates on: "commit", "push", "bump version", "deploy", or after making code changes to src/main.js, src/renderer.js, index.html, workers/*.js.
---

# Modern Wars Commit Workflow

## Overview

Automates the mandatory commit workflow for the Modern Wars project. Every code change must follow this sequence to ensure version consistency and code quality.

**Core principle:** Never commit without bumping version and running biome check.

## The Checklist

When committing changes to Modern Wars, execute ALL steps in order:

### Step 1: Run Biome Linter

```bash
biome check .
```

- Must show "Checked N files" with 0 errors, 0 warnings
- If errors: fix them before proceeding
- If formatting issues: run `biome check --write --unsafe .`

### Step 2: Bump Patch Version

Bump version in BOTH files (must stay in sync):

**File 1: `index.html` (line 6)**
```html
<!-- Find and increment: MW-V0.26.X → MW-V0.26.X+1 -->
<title>MW-V0.26.X</title>
```

**File 2: `workers/service-worker.js` (line 4)**
```javascript
// Find and increment: mw-v0.26.X → mw-v0.26.X+1
const CACHE_VERSION = "mw-v0.26.X";
```

**Rules:**
- PATCH ONLY: 0.26.10 → 0.26.11 (never 0.27.0 for bug fixes/features)
- Both files MUST have matching versions
- Use `edit` tool to change both files

### Step 3: Stage Changes

```bash
git add <changed-files>
```

- Stage specific files, not `git add -A`
- Include: source files, index.html, service-worker.js, asset files if changed

### Step 4: Commit with Conventional Format

```bash
git commit -m "<type>: <description>"
```

**Types:**
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code restructuring without behavior change
- `chore:` — version bumps, config changes

**Description rules:**
- Lowercase, no period at end
- Max 72 characters
- Describe what changed, not what you did

### Step 5: Push to Remote

```bash
git push
```

- Always push after committing
- Remote is `origin/main`

## Quick Reference

| Step | Command | Success Criteria |
|------|---------|------------------|
| 1. Lint | `biome check .` | 0 errors, 0 warnings |
| 2. Version | Edit 2 files | Versions match and increment |
| 3. Stage | `git add <files>` | Files staged |
| 4. Commit | `git commit -m "<msg>"` | Commit created |
| 5. Push | `git push` | Pushed to origin/main |

## Common Failures

| Issue | Cause | Fix |
|-------|-------|-----|
| Version mismatch | Forgot to update one file | Check both files |
| Biome errors | Unfixed lint issues | Run `biome check --write --unsafe .` |
| Push rejected | Remote has new commits | Pull first, then push |
| Wrong version bump | Used minor instead of patch | Always 0.26.X → 0.26.X+1 |

## When to Apply

**ALWAYS when:**
- Making any code change to Modern Wars
- User says "commit", "push", "deploy", "bump version"
- After implementing a feature or fix
- Before moving to a new task

**This skill overrides:**
- Default commit behavior
- Skipping version bumps
- Partial workflows (commit without push, etc.)

## Integration with Other Skills

- **compose:verify** — Run biome check as verification before claiming completion
- **compose:merge** — This skill handles the push; merge skill handles PR creation
- **compose:tdd** — Run tests (if they exist) before this workflow

## Project Context

- **Repository:** `/home/ransom/Projekte/modern-wars`
- **Remote:** `https://github.com/Vaspyyy/moder-wars.git`
- **GitHub Pages:** `https://vaspyyy.github.io/moder-wars/`
- **Linter:** Biome v2.x (config in `biome.json`)
- **No build step:** Files served directly as static ES modules
- **No test suite:** Manual browser verification only
