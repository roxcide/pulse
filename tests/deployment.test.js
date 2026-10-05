// @vitest-environment node
import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { runDeployment, schemaCheck } from "../scripts/deployment-plan.mjs";

it("applies and verifies migrations before publishing, and never publishes on failure", () => {
  const calls = [];
  runDeployment((command) => calls.push(command));
  expect(calls.map((command) => command.slice(0, 3))).toEqual([
    ["d1", "migrations", "apply"],
    ["d1", "execute", "DB"],
    ["deploy"],
  ]);
  for (const failAt of [0, 1]) {
    const attempted = [];
    expect(() =>
      runDeployment((command) => {
        attempted.push(command);
        if (attempted.length === failAt + 1) throw new Error("D1 failed");
      }),
    ).toThrow("D1 failed");
    expect(attempted.some((command) => command[0] === "deploy")).toBe(false);
  }
  const dry = [];
  runDeployment((command) => dry.push(command), true);
  expect(dry).toEqual([["deploy", "--dry-run"]]);
});

it("detects an old schema and migrates existing accounts without losing their data", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      readFileSync(
        new URL("../migrations/0001_auth.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare(
      "INSERT INTO users(id,email,display_name,email_verified,created_at) VALUES(?,?,?,?,?)",
    ).run("existing", "existing@example.com", "Existing", 1, 10);
    db.prepare("INSERT INTO fitness_state VALUES(?,?,?)").run(
      "existing",
      "profile",
      '{"name":"Existing","goal":3,"rest":90}',
    );
    expect(() => db.prepare(schemaCheck)).toThrow();
    db.exec(
      readFileSync(
        new URL("../migrations/0002_admin.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(db.prepare(schemaCheck).all()).toEqual([]);
    expect(
      db.prepare("SELECT id,email_verified,blocked,revision FROM users").get(),
    ).toEqual({ id: "existing", email_verified: 1, blocked: 0, revision: 0 });
    expect(db.prepare("SELECT value FROM fitness_state").get().value).toBe(
      '{"name":"Existing","goal":3,"rest":90}',
    );
    db.exec("DROP TABLE admin_audit");
    expect(() => db.prepare(schemaCheck)).toThrow();
  } finally {
    db.close();
  }
});
