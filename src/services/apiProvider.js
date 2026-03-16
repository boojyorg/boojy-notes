import { isElectron, isCapacitor } from "../utils/platform";
import capacitorAPI from "./nativeAPI";

export function getAPI() {
  if (isElectron) return window.electronAPI;
  if (isCapacitor) return capacitorAPI;
  return null;
}
