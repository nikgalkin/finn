#!/usr/bin/env bash

set -euo pipefail

COMMIT_MESSAGE="${1:-}"
LATEST_TAG="${2:-}"
SOURCE_BRANCH="${3:-}"

if [ -z "$LATEST_TAG" ]; then
    while IFS= read -r candidate; do
        if [[ "$candidate" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            LATEST_TAG="$candidate"
            break
        fi
    done < <(git tag --list --sort=-version:refname)
fi

LATEST_TAG="${LATEST_TAG:-v0.0.0}"

if [[ ! "$LATEST_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid release tag: $LATEST_TAG" >&2
    exit 1
fi

IFS=. read -r MAJOR MINOR PATCH <<< "${LATEST_TAG#v}"

if [[ "$SOURCE_BRANCH" =~ (^|/)feat-v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    BRANCH_MAJOR="${BASH_REMATCH[2]}"
    BRANCH_MINOR="${BASH_REMATCH[3]}"
    BRANCH_PATCH="${BASH_REMATCH[4]}"

    if (( BRANCH_MAJOR < MAJOR ||
          (BRANCH_MAJOR == MAJOR && BRANCH_MINOR < MINOR) ||
          (BRANCH_MAJOR == MAJOR && BRANCH_MINOR == MINOR && BRANCH_PATCH <= PATCH) )); then
        echo "Branch version v${BRANCH_MAJOR}.${BRANCH_MINOR}.${BRANCH_PATCH} must be newer than $LATEST_TAG" >&2
        exit 1
    fi

    printf 'v%d.%d.%d\n' "$BRANCH_MAJOR" "$BRANCH_MINOR" "$BRANCH_PATCH"
    exit 0
elif [[ "$COMMIT_MESSAGE" == *"#major"* ]]; then
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
elif [[ "$COMMIT_MESSAGE" == *"#minor"* ]]; then
    MINOR=$((MINOR + 1))
    PATCH=0
elif [[ "$COMMIT_MESSAGE" == *"#bugfix"* ]]; then
    PATCH=$((PATCH + 1))
else
    MINOR=$((MINOR + 1))
    PATCH=0
fi

printf 'v%d.%d.%d\n' "$MAJOR" "$MINOR" "$PATCH"
