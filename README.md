# mihoro-cli

Standalone CLI for importing Clash Party config, running `mihomo`, and controlling proxy nodes from the terminal.

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
# Import profiles and controlled mihomo settings from an existing Clash Party data directory.
mihoro-cli import clash-party <clash-party-data-dir>

# Enable the operating system manual proxy in rules mode.
# This starts mihomo when needed, or restarts it when already running so runtime config changes apply.
mihoro-cli proxy enable

# Show service state, proxy mode, selected nodes, and listening ports.
mihoro-cli info

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
# mixed-port, TUN state, and running proxy group selections when mihomo is available.
mihoro-cli info
```

Subscription commands:

```bash
# Show all saved subscriptions. The current subscription is marked with `*`.
mihoro-cli sub list

# Add a subscription by display name and remote URL, then regenerate the runtime config.
mihoro-cli sub add <name> <url>

# Select a subscription by name or internal id, then regenerate the runtime config.
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
mihoro-cli service start

# Stop the running mihomo core process.
mihoro-cli service stop

# Show the mihomo process status and related runtime information.
mihoro-cli service status

```

System proxy and TUN commands:

```bash
# Start or restart mihomo, wait for its mixed-port, then enable OS manual HTTP, HTTPS, and SOCKS proxy settings.
# The proxy host comes from mihoro config, and the port comes from mihomo mixed-port.
# The default routing mode is rules.
mihoro-cli proxy enable

# Enable the OS manual proxy and set mihomo routing mode to rules, global, or direct.
mihoro-cli proxy enable --kind <rules|global|direct>

# Disable the OS manual proxy settings managed by mihoro-cli.
mihoro-cli proxy disable

# Enable TUN mode in the generated mihomo runtime config.
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
mihoro-cli node list

# List proxy groups, their current selected node, and available node choices.
mihoro-cli group list

# Switch a proxy group to a specific node, then remember that default selection.
mihoro-cli group use <group> <node>
```

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

mihoro-cli keeps its own `subscriptions.yaml`, `profiles/`, `mihomo.yaml`, `runtime/`, optional CLI `logs/`, and `core/`. It does not modify the Clash Party data directory during import.

## Development

```bash
# Install project dependencies.
pnpm install

# Type-check the TypeScript source without writing build output.
pnpm run typecheck

# Compile TypeScript into dist/ and prepare the executable bin file.
pnpm run build

# Run the CLI directly from TypeScript during development and print help.
pnpm run dev --help
```
