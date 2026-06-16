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

```bash
pnpm run dev sub add <name> <url>
pnpm run dev sub list
pnpm run dev sub use <name-or-id>
pnpm run dev sub remove <name-or-id>

pnpm run dev service install
pnpm run dev service start
pnpm run dev service stop
pnpm run dev service status
pnpm run dev service logs

pnpm run dev proxy enable
pnpm run dev proxy disable

pnpm run dev tun enable
pnpm run dev tun disable

pnpm run dev node list
pnpm run dev group list
pnpm run dev group use <group> <node>
```

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
