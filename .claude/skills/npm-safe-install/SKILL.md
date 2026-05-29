---
name: npm-safe-install
description: >
  Install npm dependencies in SimpleTravelBlog safely. Enforces exact pins,
  no lifecycle scripts, and a BLOCKING 14-day publish-age check against the
  npm registry to mitigate fresh supply-chain compromises. TRIGGER when adding
  or updating any npm dependency, or before the first install of the pinned
  stack.
disable-model-invocation: false
---

# Safe npm install

Adapted from OptrixFromScratch's `npm-update`. Two non-negotiable rules and one
blocking check.

## Rules
1. **Flags**: every install/update uses `--save-exact --ignore-scripts`.
   A PreToolUse hook (`.claude/settings.json`) blocks any `npm install/ci/update/i`
   that omits `--ignore-scripts`.
2. **Exact pins only**: no `^`, `~`, or `*` in any `package.json`. If you find a
   range, pin it to the exact installed version.

## Blocking check — 14-day publish age

Before installing any `pkg@ver`, verify the target version was published **≥ 14
days ago**. This is the primary defense against a compromised release that
hasn't been caught yet.

No `jq` / `node -e` / `python -c` on this machine. Parse the registry JSON with
`curl` + `grep`/`sed`.

```bash
# Usage: check_age <pkg> <version>
# Exits 0 if the version is >= 14 days old, 1 otherwise (or unknown).
check_age() {
  pkg="$1"; ver="$2"
  # Pull the version's publish timestamp out of the registry "time" map.
  ts=$(curl -fsSL "https://registry.npmjs.org/${pkg}" \
    | grep -oE "\"${ver//./\\.}\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" \
    | head -1 \
    | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/')
  if [ -z "$ts" ]; then
    echo "UNKNOWN ${pkg}@${ver} (version not found in registry time map)"; return 1
  fi
  pub=$(date -u -d "$ts" +%s 2>/dev/null) || pub=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${ts%%.*}" +%s)
  now=$(date -u +%s)
  age_days=$(( (now - pub) / 86400 ))
  if [ "$age_days" -ge 14 ]; then
    echo "OK    ${pkg}@${ver} published ${age_days}d ago"; return 0
  else
    echo "TOO_NEW ${pkg}@${ver} published ${age_days}d ago (< 14d)"; return 1
  fi
}
```

### Decision procedure
1. `check_age pkg ver`.
2. **OK** → install it.
3. **TOO_NEW** → fall back to the newest version in the **same major** that is
   ≥ 14 days old. List versions and their timestamps from the same registry
   document (the `time` map holds every version) and pick the newest passing one.
4. If no version in that major passes → **escalate to the user** (skip vs.
   accept the risk). Do not silently install.

### Canonical install
```bash
npm install <pkg>@<exact-version> --save-exact --ignore-scripts
```

Install in small batches, re-run the suite, commit. The pins captured in
`docs/stack.md` were snapshotted on 2026-05-27 — re-run this check for every
version if the plan has sat idle.
