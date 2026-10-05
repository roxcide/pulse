import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runDeployment } from "./deployment-plan.mjs";

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
  if (result.status !== 0) {
    if (command[0] === "d1")
      console.error(
        "PULSE: Database preparation failed. Worker was NOT published. Check D1 permissions, the DB binding and migration logs. For an existing site, keep its current database; do not create a replacement.",
      );
    process.exit(result.status || 1);
  }
}

// Existing Workers keep serving their current version if schema preparation fails.
runDeployment(run, args.includes("--dry-run"));
if (!args.includes("--dry-run")) {
  console.log("PULSE: Worker published and D1 migrations applied.");
}
