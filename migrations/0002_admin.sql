ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1));
ALTER TABLE users ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit(created_at);

-- Every change invalidates snapshots already open in the admin editor.
CREATE TRIGGER fitness_revision_insert AFTER INSERT ON fitness_state BEGIN
  UPDATE users SET revision = revision + 1 WHERE id = NEW.user_id;
END;
CREATE TRIGGER fitness_revision_update AFTER UPDATE ON fitness_state BEGIN
  UPDATE users SET revision = revision + 1 WHERE id = NEW.user_id;
END;
CREATE TRIGGER fitness_revision_delete AFTER DELETE ON fitness_state BEGIN
  UPDATE users SET revision = revision + 1 WHERE id = OLD.user_id;
END;
CREATE TRIGGER account_revision_update
AFTER UPDATE OF email, display_name, password_hash, email_verified, blocked ON users BEGIN
  UPDATE users SET revision = revision + 1 WHERE id = NEW.id;
END;
