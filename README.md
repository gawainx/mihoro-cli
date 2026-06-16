# mihoro-cli

Standalone command line tool for running and controlling `mihomo`.

mihoro-cli follows the Clash Party runtime model: it keeps its own profile state, generates a runtime mihomo config before startup, launches mihomo with a Unix socket controller, then uses the mihomo REST API for node and proxy-group operations.

## Install

Build the package:

```bash
pnpm install
pnpm run build
pnpm pack
```

Install the generated package globally:

```bash
pnpm add -g ./mihoro-cli-0.1.0.tgz
mihoro-cli --help
```

For local verification without global install:

```bash
./dist/index.js --help
./dist/index.js service status
```

## First Run

Add a subscription:

```bash
mihoro-cli sub add <name> <url>
```

Start mihomo:

```bash
mihoro-cli service start
```

Check runtime status:

```bash
mihoro-cli service status
```

Enable system proxy when needed:

```bash
mihoro-cli proxy enable
```

## Subscriptions

```bash
mihoro-cli sub list
mihoro-cli sub add <name> <url>
mihoro-cli sub use <name-or-id>
mihoro-cli sub remove <name-or-id>
```

Subscription profiles are downloaded as YAML files and saved under the mihoro data directory.

## Service

```bash
mihoro-cli service install
mihoro-cli service start
mihoro-cli service stop
mihoro-cli service status
mihoro-cli service logs
```

`service install` should be run from the installed `mihoro-cli` command, not from `pnpm run dev`, so the generated systemd unit or LaunchAgent points at the packaged CLI entrypoint.

## Proxy And TUN

```bash
mihoro-cli proxy enable
mihoro-cli proxy disable

mihoro-cli tun enable
mihoro-cli tun disable
```

Linux system proxy uses GNOME `gsettings` manual proxy settings. macOS system proxy uses `networksetup` across available network services.

TUN changes are written to mihoro's controlled mihomo config. Enabling TUN also enables mihomo DNS in the generated runtime config.

## Nodes And Groups

```bash
mihoro-cli node list
mihoro-cli group list
mihoro-cli group use <group> <node>
```

Node and proxy-group commands require a running mihomo process. `group use` calls the mihomo API and saves the selected group-to-node preference locally.

## Data Directory

Default data directory:

```text
~/.config/mihoro
```

Override it with:

```bash
MIHORO_HOME=/path/to/data mihoro-cli service status
```

Directory layout:

```text
config.yaml
subscriptions.yaml
mihomo.yaml
profiles/
runtime/
logs/
core/
```

Runtime details:

```text
runtime/config.yaml
runtime/mihomo.sock
runtime/mihomo.pid
```

Core startup model:

```bash
mihomo -d <runtime-dir> -ext-ctl-unix <socket-path>
```

## Mihomo Core

mihoro-cli first looks for `mihomo` in `PATH`.

If no system binary is available, it downloads the latest MetaCubeX mihomo release into the mihoro data directory and uses that managed binary.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run build
pnpm run dev --help
```

Run a development command:

```bash
pnpm run dev service status
```
