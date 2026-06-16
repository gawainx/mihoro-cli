import { chmod } from 'node:fs/promises'

/**
 * Marks the compiled CLI entrypoint executable for local tarballs and direct dist usage.
 *
 * @returns Nothing after permissions are updated.
 */
async function main() {
  await chmod(new URL('../dist/index.js', import.meta.url), 0o755)
}

await main()
