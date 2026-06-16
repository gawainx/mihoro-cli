# mihoro-cli

Standalone CLI for importing Clash Party config, running `mihomo`, and controlling proxy nodes from the terminal.

## Install

Install directly from Git:

```bash
npm install -g git+https://github.com/<owner>/mihoro-cli.git
mihoro-cli --help
```

Install a specific branch or commit:

```bash
npm install -g git+https://github.com/<owner>/mihoro-cli.git#master
npm install -g git+https://github.com/<owner>/mihoro-cli.git#<commit>
```

For local development, build and install the current checkout:

```bash
pnpm run install:global
```

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
