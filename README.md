# mihoro-cli

Standalone CLI for importing Clash Party config, running `mihomo`, and controlling proxy nodes from the terminal.

## Requirements

- Node.js 20 or newer.
- macOS or Linux.
- Optional system `mihomo` executable in `PATH`. If it is missing, mihoro-cli downloads a managed mihomo binary for the current platform on first start.

## Install

Install directly from Git:

```bash
npm install -g git+https://github.com/gawainx/mihoro-cli.git
mihoro-cli --help
```

Install through Git SSH:

```bash
npm install -g git+ssh://git@github.com/gawainx/mihoro-cli.git
mihoro-cli --help
```

Install a specific branch or commit:

```bash
npm install -g git+https://github.com/gawainx/mihoro-cli.git#master
npm install -g git+https://github.com/gawainx/mihoro-cli.git#<commit>
npm install -g git+ssh://git@github.com/gawainx/mihoro-cli.git#master
npm install -g git+ssh://git@github.com/gawainx/mihoro-cli.git#<commit>
```

For local development, build and install the current checkout:

```bash
pnpm run install:global
```

## Quick Start

```bash
# Import profiles and controlled mihomo settings from an existing Clash Party data directory,
# then generate the mihomo runtime config.
mihoro-cli import clash-party <clash-party-data-dir>

# Or add a remote mihomo subscription directly.
mihoro-cli sub add <name> <url>

# Enable the operating system manual proxy in rules mode.
# This saves the routing mode, regenerates runtime config, starts or restarts mihomo,
# verifies the mixed-port listener, and updates OS HTTP, HTTPS, and SOCKS proxy settings.
mihoro-cli proxy enable

# Show service state, proxy mode, selected nodes, and listening ports.
mihoro-cli info

# Test a URL through the mihoro/mihomo proxy path without changing service or proxy settings.
mihoro-cli test https://example.com

# Print whether the mihomo core process is currently running.
mihoro-cli service status
```

Use `--overwrite` when importing into an existing mihoro data directory:

```bash
# Re-import Clash Party data after backing up existing mihoro files that would be replaced.
mihoro-cli import clash-party <clash-party-data-dir> --overwrite
```

## Commands

Info command:

```bash
# Show current service state, active subscription, proxy mode, system proxy target,
# mixed-port, TUN state/options, and running proxy group selections when mihomo is available.
mihoro-cli info
```

Diagnostic command:

```bash
# Test a URL through mihoro's configured mihomo mixed-port proxy.
# The command prints each diagnostic step and does not start, restart, or reconfigure mihomo.
mihoro-cli test <url>
```

Subscription commands:

```bash
# Show all saved subscriptions. The current subscription is marked with `*`.
mihoro-cli sub list

# Add or replace a remote subscription by display name and URL, then regenerate the runtime config.
# The saved id is generated from the display name.
mihoro-cli sub add <name> <url>

# Select a subscription by name or id, regenerate the runtime config,
# and restart mihomo when the managed service is already running.
mihoro-cli sub use <name-or-id>

# Remove a subscription by name or internal id.
mihoro-cli sub remove <name-or-id>
```

Service commands:

```bash
# Install an autostart service for the current user.
# On Linux this creates a systemd user service; on macOS this creates a LaunchAgent.
mihoro-cli service install

# Start the mihomo core process in the background.
# Startup generates runtime/config.yaml, prepares GeoData database files,
# launches mihomo with the runtime directory and Unix API socket, then reapplies saved group defaults.
mihoro-cli service start

# Stop the running mihomo core process.
mihoro-cli service stop

# Show the mihomo process status and related runtime information.
mihoro-cli service status

```

System proxy and TUN commands:

```bash
# Start or restart mihomo, wait for its mixed-port, then enable OS manual HTTP, HTTPS, and SOCKS proxy settings.
# The proxy host comes from mihoro config, and the port comes from controlled mihomo mixed-port.
# The default routing mode is rules.
mihoro-cli proxy enable

# Enable the OS manual proxy and set mihomo routing mode to rules, global, or direct.
mihoro-cli proxy enable --kind <rules|global|direct>

# Disable the OS manual proxy settings managed by mihoro-cli.
mihoro-cli proxy disable

# Enable TUN mode in the generated mihomo runtime config.
# This also keeps DNS enabled in the controlled config.
mihoro-cli tun enable

# Disable TUN mode in the generated mihomo runtime config.
mihoro-cli tun disable
```

GeoData commands:

```bash
# Download missing db-mode GeoData database files required by mihomo.
mihoro-cli geo prepare

# Ask the running mihomo process to update GeoData databases through its API.
mihoro-cli geo update

# Enable or disable mihomo GeoData automatic updates in the generated runtime config.
mihoro-cli geo auto <on|off>

# Set the mihomo GeoData automatic update interval, in hours.
mihoro-cli geo interval <hours>

# Show the configured GeoData update URLs from controlled mihomo config.
mihoro-cli geo urls
```

Node and group commands:

```bash
# List available proxy nodes reported by the running mihomo API.
# Output columns include the mihoro node hash, original node name, node type, and selectable proxy groups.
# Listing nodes refreshes the node hash index for the current subscription.
mihoro-cli node list

# Switch a proxy group to a specific node hash from the node command, then remember that default selection.
# The --group option is required so mihoro-cli does not guess which proxy group should change.
mihoro-cli node use <node-hash> --group <group>

# List proxy groups, their current selected node, and available node choices.
mihoro-cli group list

# Switch a proxy group to a specific node hash, then remember that default selection.
mihoro-cli group use <group> <node-hash>
```

Node hashes are stable per subscription and stored in the mihoro data directory. Saved group defaults are reapplied after `service start` so the preferred node selection survives restarts.

## Data

Default data directory:

```text
~/.config/mihoro
```

Override it per command:

```bash
# Run a command with an alternate mihoro data directory for this invocation only.
MIHORO_HOME=/path/to/data mihoro-cli service status
```

mihoro-cli keeps its own files under the data directory:

- `subscriptions.yaml`: saved subscription metadata and current subscription id.
- `profiles/`: copied or downloaded mihomo profile YAML files.
- `mihomo.yaml`: mihoro-controlled mihomo settings such as `mixed-port`, routing mode, TUN, DNS, and GeoData URLs.
- `runtime/config.yaml`: generated mihomo config built by merging the current profile with `mihomo.yaml`.
- `runtime/mihomo.sock` and `runtime/mihomo.pid`: API socket and pid file for the managed mihomo process.
- `node-indexes.json`: per-subscription node hash index and saved group selections.
- `core/`: managed mihomo binary when no system `mihomo` executable is available.
- `logs/`: optional CLI log directory.

Importing from Clash Party reads `profile.yaml`, `profiles/`, and optional `mihomo.yaml` from the source data directory. It does not modify the Clash Party data directory. With `--overwrite`, existing mihoro target files are backed up under `backups/clash-party-import-<timestamp>/` before replacement.

## Development

```bash
# Install project dependencies.
pnpm install

# Type-check the TypeScript source without writing build output.
pnpm run typecheck

# Compile TypeScript into dist/ and prepare the executable bin file.
pnpm run build

# Create the npm tarball under releases/ without writing package artifacts to the project root.
pnpm run pack:release

# Run the CLI directly from TypeScript during development and print help.
pnpm run dev --help
```
