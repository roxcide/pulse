import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) {
  console.error("Supported option: --dry-run");
  process.exit(1);
}

function run(command) {
  const result = spawnSync(process.execPath, [wrangler, ...command], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

// Deploy provisions or reconnects the named D1 database before migrations run.
run(["deploy", ...args]);
if (!args.includes("--dry-run")) {
  run(["d1", "migrations", "apply", "DB", "--remote"]);
  console.log("PULSE: Worker published and D1 migrations applied.");
}
