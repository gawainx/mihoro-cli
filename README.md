# mihoro-cli

Standalone CLI for importing Clash Party config, running `mihomo`, and controlling proxy nodes from the terminal.

## Install

Build and install the CLI globally:

```bash
pnpm run install:global
```

This runs `scripts/build-install.sh`, which installs dependencies, builds `dist/`, packs the project, installs the tarball globally, and verifies `mihoro-cli --help`.

## Quick Start

```bash
mihoro-cli import clash-party <clash-party-data-dir>
mihoro-cli service start
mihoro-cli proxy enable
mihoro-cli service status
```

Use `--overwrite` when importing into an existing mihoro data directory:

```bash
mihoro-cli import clash-party <clash-party-data-dir> --overwrite
```

## Commands

```bash
mihoro-cli sub list
mihoro-cli sub add <name> <url>
mihoro-cli sub use <name-or-id>
mihoro-cli sub remove <name-or-id>

mihoro-cli service install
mihoro-cli service start
mihoro-cli service stop
mihoro-cli service status
mihoro-cli service logs

mihoro-cli proxy enable
mihoro-cli proxy disable
mihoro-cli tun enable
mihoro-cli tun disable

mihoro-cli node list
mihoro-cli group list
mihoro-cli group use <group> <node>
```

## Data

Default data directory:

```text
~/.config/mihoro
```

Override it per command:

```bash
MIHORO_HOME=/path/to/data mihoro-cli service status
```

mihoro-cli keeps its own `subscriptions.yaml`, `profiles/`, `mihomo.yaml`, `runtime/`, `logs/`, and `core/`. It does not modify the Clash Party data directory during import.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run dev --help
```
