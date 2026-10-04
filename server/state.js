import { fail } from "./security.js";
import { validState } from "../shared/state.js";
export function validateState(data) {
  if (!validState(data) || !Object.keys(data).length)
    fail(400, "invalid_state");
  return Object.entries(data);
}
