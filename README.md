# Onyx Hive

Onyx Hive is a macOS control panel for running and managing Claude Code agents. Each chat runs a headless Claude session in a project folder or worktree, with a built-in terminal, changes panel and task board beside it.

## Install

Download the latest `.dmg` from the [Releases](https://github.com/onyxterminal/onyxterm/releases) page. It is a universal build for Apple Silicon and Intel Macs.

Releases are not notarized yet. On first launch macOS blocks the app; open **System Settings > Privacy & Security** and choose **Open Anyway**, or run:

```sh
xattr -dr com.apple.quarantine "/Applications/Onyx Hive.app"
```

## Development

Requires Node.js, Rust and Xcode command line tools.

```sh
npm install
npm run tauri dev
```

## Release

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then push a matching tag:

```sh
git tag v0.8.2
git push origin v0.8.2
```

The `Release` workflow builds the universal `.dmg` and `.app.tar.gz` and publishes them on the GitHub release `Onyx Hive v0.8.2`.

## License notices

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
