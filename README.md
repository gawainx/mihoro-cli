# mihoro-cli

Standalone TypeScript CLI for running mihomo with a Clash Party-style runtime model.

## Runtime model

- Data directory: `~/.config/mihoro` or `MIHORO_HOME`
- Profiles: `profiles/<subscription-id>.yaml`
- Controlled mihomo config: `mihomo.yaml`
- Generated runtime config: `runtime/config.yaml`
- Mihomo API socket: `runtime/mihomo.sock`
- Core startup: `mihomo -d <runtime-dir> -ext-ctl-unix <socket-path>`

## Commands

After installing the package, run the CLI directly:

```bash
mihoro-cli sub add <name> <url>
mihoro-cli sub list
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

## Build and install

Build the distributable CLI:

```bash
pnpm install
pnpm run build
```

Run the compiled program from the repository:

```bash
node dist/index.js --help
./dist/index.js service status
```

Create a package tarball and install it globally:

```bash
pnpm pack
pnpm add -g ./mihoro-cli-0.1.0.tgz
mihoro-cli --help
```

When installing the autostart service, use the installed `mihoro-cli` command instead of `pnpm run dev`, so the generated systemd unit or LaunchAgent points at the packaged CLI entrypoint.

## Notes

- The CLI prefers a system `mihomo` binary from `PATH`.
- If `mihomo` is missing, it downloads the latest MetaCubeX mihomo release into the mihoro data directory.
- Linux system proxy uses GNOME `gsettings` manual proxy settings.
- macOS system proxy uses `networksetup` across available network services.

## Scripts

- `pnpm install`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run dev`
