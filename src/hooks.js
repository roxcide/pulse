import { useUserData } from "./state/UserDataProvider";
export function useStoredState(key) {
  const { data, update } = useUserData();
  return [data[key], (value) => update(key, value)];
}
