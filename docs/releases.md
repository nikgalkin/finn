# Release Pipeline

Finn uses three GitHub Actions workflows:

* [`ci.yml`](../.github/workflows/ci.yml) validates pull requests and pushes to `master`. It contains checks only, so pull requests do not display skipped release jobs.
* [`auto-release.yml`](../.github/workflows/auto-release.yml) starts after a successful CI run on `master`, calculates the version, and creates the automatic tag.
* [`release.yml`](../.github/workflows/release.yml) builds platform binaries and publishes the GitHub release. It can be called by the auto-release workflow or triggered by a manually pushed `v*` tag.

## Pull requests

Pull requests run validation only. They never create tags or releases.

The frontend job:

1. Installs dependencies with `npm ci`.
2. Runs Oxlint.
3. Runs the frontend tests.
4. Builds the production frontend.
5. Uploads `frontend/dist` as a short-lived workflow artifact.

The backend job downloads that exact frontend artifact so the embedded assets used by Go match the validated build. It then runs:

```shell
go test ./...
go vet ./...
```

It also tests the release-version calculation rules. A failed check stops the pipeline before any tag can be created.

## Automatic releases from `master`

A push to `master` runs the same frontend and backend checks. After they pass, the auto-release workflow selects a version, creates a lightweight Git tag, and calls the release workflow directly.

The release workflow is called directly because tags created with the workflow's `GITHUB_TOKEN` do not start another workflow run.

### Version selection

Versions use stable semantic tags in the form `vMAJOR.MINOR.PATCH`. Pre-release suffixes are not part of the automatic version calculation.

The first matching rule wins:

| Priority | Source | Example from `v1.8.0` | Result |
| --- | --- | --- | --- |
| 1 | Source branch named `feat-vX.Y.Z` | `feat-v1.8.1` | `v1.8.1` |
| 2 | `#major` in the latest commit message | `release #major` | `v2.0.0` |
| 3 | `#minor` in the latest commit message | `release #minor` | `v1.9.0` |
| 4 | `#bugfix` in the latest commit message | `release #bugfix` | `v1.8.1` |
| 5 | No recognized marker | `update dashboard` | `v1.9.0` |

Branch versions take priority over all message markers. For example, merging `feat-v1.8.1` with `#major` in the commit message still produces `v1.8.1`.

If a commit message contains several markers, the bump priority is major, then minor, then bugfix. Markers are lowercase and case-sensitive.

For a PR merge, the auto-release workflow obtains the source branch from the pull request associated with the new `master` commit. A direct push to `master` has no source PR, so its version is selected only from the commit message.

The version named by a branch must be newer than the latest stable release tag. Auto-release also refuses to overwrite a tag that already points to another commit.

### Tag and retry behavior

Before calculating a version, auto-release checks whether the current commit already has a stable version tag:

* If it does, the existing tag is reused.
* If it does not, auto-release calculates and pushes a new tag.

This makes re-running the pipeline safe: a retry does not increment the version again merely because a workflow was restarted.

## Release build

The release workflow checks out the selected tag and performs these steps:

1. Builds `frontend/dist` once with Node.js 24.
2. Uploads the frontend build as a shared workflow artifact.
3. Starts the platform build matrix.
4. Each matrix job downloads the shared frontend artifact and embeds it without running npm again.
5. The finished binaries are uploaded as workflow artifacts.
6. A single publish job downloads all binaries, generates release notes, and creates or updates the GitHub release.

The current build matrix produces:

| Platform | Architecture | Release asset |
| --- | --- | --- |
| Windows | AMD64 | `finn-windows-amd64.exe` |
| Linux | AMD64 | `finn-linux-amd64` |
| macOS | ARM64 | `finn-darwin-arm64` |

Release notes are generated once and passed to the publishing action as the complete release body. Re-running publication replaces the generated body instead of appending another `What's Changed` or `Full Changelog` section.

## Manual release tags

A stable tag can still be created manually when automatic version selection is not appropriate:

```shell
git tag v1.8.1
git push origin v1.8.1
```

Any pushed tag matching `v*` starts the release workflow. The tag should point to a commit that already passed CI because a manual tag bypasses the automatic `master` checks and version-selection job.

## Local version checks

The version calculator can be exercised without creating a tag:

```shell
./bin/next-version.sh "release #bugfix" v1.8.0
./bin/next-version.sh "release #major" v1.8.0 feat-v1.8.1
```

These commands print `v1.8.1` in both examples. They do not modify the repository.

[Back to the README](../README.md)
