import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  Keyboard,
  List,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  popToRoot,
  showHUD,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import {
  DeadboltError,
  DeadboltItem,
  code,
  get,
  listItems,
  lock,
  openApp,
  show,
} from "./deadbolt";

interface Preferences {
  deadboltPath?: string;
}

function useBin(): string {
  const preferences = getPreferenceValues<Preferences>();
  return preferences.deadboltPath?.trim() || "deadbolt";
}

/** Copy a value and keep it out of clipboard history. */
async function copySecret(value: string, what: string) {
  await Clipboard.copy(value, { concealed: true });
  await showHUD(`Copied ${what}`);
}

async function toastError(err: unknown) {
  const error = err instanceof DeadboltError ? err : new Error(String(err));
  const toast = new Toast({
    style: Toast.Style.Failure,
    title: error.message,
    message:
      error instanceof DeadboltError && error.kind === "cli"
        ? "Check the binary path in preferences."
        : undefined,
  });
  await toast.show();
}

export default function Command() {
  const bin = useBin();
  const { isLoading, data, error, revalidate } = useCachedPromise(
    listItems,
    [bin],
    {
      keepPreviousData: true,
    },
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailText, setDetailText] = useState<string | null>(null);

  useEffect(() => {
    if (error && !detailId) void toastError(error);
  }, [error]);

  async function loadDetail(item: DeadboltItem) {
    setDetailId(item.id);
    setDetailText(null);
    try {
      setDetailText(await show(bin, item.id));
    } catch (err) {
      setDetailText(String(err instanceof Error ? err.message : err));
    }
  }

  const locked = error instanceof DeadboltError && error.kind === "locked";

  if (detailId) {
    return (
      <Detail
        markdown={detailText ? "```\n" + detailText + "\n```" : "Loading…"}
        navigationTitle="Deadbolt"
        actions={
          <ActionPanel>
            <Action
              title="Go Back"
              icon={Icon.ArrowLeft}
              onAction={() => setDetailId(null)}
            />
            <Action
              title="Copy Password"
              icon={Icon.CopyClipboard}
              onAction={async () => {
                try {
                  await copySecret(await get(bin, detailId), "password");
                } catch (err) {
                  await toastError(err);
                }
              }}
            />
          </ActionPanel>
        }
      />
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search items…">
      <List.EmptyView
        title={
          locked
            ? "Deadbolt is locked"
            : data?.length
              ? undefined
              : "No items found"
        }
        description={
          locked ? "Open Deadbolt to unlock it, then search again." : undefined
        }
        icon={Icon.Lock}
        actions={
          locked ? (
            <ActionPanel>
              <Action
                title="Open Deadbolt"
                icon={Icon.AppWindow}
                onAction={async () => await openApp(bin)}
              />
              <Action
                title="Revalidate"
                icon={Icon.ArrowClockwise}
                onAction={() => revalidate()}
              />
              <Action
                title="Extension Preferences"
                icon={Icon.Gear}
                onAction={() => openExtensionPreferences()}
              />
            </ActionPanel>
          ) : undefined
        }
      />
      {(data ?? []).map((item) => (
        <List.Item
          key={item.id}
          title={item.label}
          subtitle={item.extra}
          icon={Icon.Key}
          actions={
            <ActionPanel>
              <ActionPanel.Section title="Copy">
                <Action
                  title="Copy ID"
                  icon={Icon.Hashtag}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                  onAction={async () => {
                    const ref = `deadbolt://${item.id}`;
                    await Clipboard.copy(ref);
                    await showHUD(`Copied ${ref}`);
                  }}
                />
                <Action
                  title="Copy Password"
                  icon={Icon.CopyClipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  onAction={async () => {
                    try {
                      await copySecret(await get(bin, item.id), "password");
                    } catch (err) {
                      await toastError(err);
                    }
                  }}
                />
                <Action
                  title="Copy Username"
                  icon={Icon.Person}
                  onAction={async () => {
                    try {
                      await Clipboard.copy(await get(bin, item.id, "username"));
                      await showHUD("Copied username");
                    } catch (err) {
                      await toastError(err);
                    }
                  }}
                />
                <Action
                  title="Copy URL"
                  icon={Icon.Link}
                  onAction={async () => {
                    try {
                      await Clipboard.copy(await get(bin, item.id, "url"));
                      await showHUD("Copied URL");
                    } catch (err) {
                      await toastError(err);
                    }
                  }}
                />
                <Action
                  title="Copy One-Time Code"
                  icon={Icon.Stopwatch}
                  onAction={async () => {
                    try {
                      await Clipboard.copy(await code(bin, item.id));
                      await showHUD("Copied one-time code");
                    } catch (err) {
                      await toastError(err);
                    }
                  }}
                />
              </ActionPanel.Section>
              <ActionPanel.Section title="Item">
                <Action
                  title="Show Fields"
                  icon={Icon.Eye}
                  onAction={() => loadDetail(item)}
                />
                <Action
                  title="Open Deadbolt"
                  icon={Icon.AppWindow}
                  onAction={async () => await openApp(bin)}
                />
              </ActionPanel.Section>
              <ActionPanel.Section title="Vault">
                <Action
                  title="Lock Deadbolt"
                  icon={Icon.Lock}
                  onAction={async () => {
                    try {
                      await lock(bin);
                      await showHUD("Deadbolt locked");
                      await popToRoot();
                    } catch (err) {
                      await toastError(err);
                    }
                  }}
                />
                <Action
                  title="Reload Items"
                  icon={Icon.ArrowClockwise}
                  onAction={async () => {
                    await revalidate();
                  }}
                />
                <Action
                  title="Extension Preferences"
                  icon={Icon.Gear}
                  onAction={() => openExtensionPreferences()}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
