import { getPreferenceValues, popToRoot, showHUD, Toast } from "@raycast/api";
import { DeadboltError, lock } from "./deadbolt";

interface Preferences {
  deadboltPath?: string;
}

export default async function Command() {
  const bin =
    getPreferenceValues<Preferences>().deadboltPath?.trim() || "deadbolt";

  try {
    await lock(bin);
    await showHUD("Deadbolt locked");
  } catch (err) {
    if (err instanceof DeadboltError && err.kind === "locked") {
      await showHUD("Deadbolt already locked");
    } else {
      const toast = new Toast({
        style: Toast.Style.Failure,
        title: err instanceof Error ? err.message : String(err),
      });
      await toast.show();
    }
  } finally {
    await popToRoot();
  }
}
