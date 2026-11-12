import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  Keyboard,
  List,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useRef } from "react";
import {
  DeadboltError,
  DeadboltItem,
  code,
  favoriteIds,
  fieldNames,
  get,
  listItems,
  lock,
  loginIds,
  noteIds,
  openApp,
  setFavorite,
} from "./deadbolt";

/** Items plus the starred, login, and note ids, fetched together. Ids are
 * plain arrays because useCachedPromise caches data as JSON, and a Set does
 * not survive it. */
interface Vault {
  items: DeadboltItem[];
  favoriteIds: string[];
  loginIds: string[];
  noteIds: string[];
}

async function loadVault(bin: string): Promise<Vault> {
  const [items, favIds, logins, notes] = await Promise.all([
    listItems(bin),
    favoriteIds(bin),
    loginIds(bin),
    noteIds(bin),
  ]);
  return {
    items,
    favoriteIds: [...favIds],
    loginIds: [...logins],
    noteIds: [...notes],
  };
}

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

/** Every field of one item; Enter copies each value to the clipboard. */
function FieldsList({ bin, item }: { bin: string; item: DeadboltItem }) {
  const { isLoading, data, error } = useCachedPromise(fieldNames, [
    bin,
    item.id,
  ]);

  useEffect(() => {
    if (error) void toastError(error);
  }, [error]);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={item.label}
      searchBarPlaceholder="Search fields…"
    >
      <List.EmptyView title="No fields found" icon={Icon.Eye} />
      {(data ?? []).map((field) => (
        <List.Item
          key={field}
          title={field}
          icon={Icon.Text}
          actions={
            <ActionPanel>
              <Action
                title={`Copy ${field}`}
                icon={Icon.CopyClipboard}
                onAction={async () => {
                  try {
                    await copySecret(await get(bin, item.id, field), field);
                  } catch (err) {
                    await toastError(err);
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default function Command() {
  const bin = useBin();
  const { isLoading, data, error, revalidate } = useCachedPromise(
    loadVault,
    [bin],
    {
      keepPreviousData: true,
    },
  );
  const favorites = new Set(data?.favoriteIds ?? []);
  const logins = new Set(data?.loginIds ?? []);
  const notes = new Set(data?.noteIds ?? []);
  const { push } = useNavigation();

  useEffect(() => {
    if (error) void toastError(error);
  }, [error]);

  const locked = error instanceof DeadboltError && error.kind === "locked";

  // When the store is locked, send the user straight to Deadbolt to unlock.
  // Run once per lock episode so unlocking and coming back does not loop.
  const openedOnLock = useRef(false);
  useEffect(() => {
    if (locked && !openedOnLock.current) {
      openedOnLock.current = true;
      void openApp(bin);
    }
    if (!locked) openedOnLock.current = false;
  }, [locked, bin]);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search items…">
      <List.EmptyView
        title={
          locked
            ? "Deadbolt is locked"
            : data?.items.length
              ? undefined
              : "No items found"
        }
        description={
          locked ? "Opening Deadbolt so you can unlock it…" : undefined
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
      {(() => {
        // Hide every item while the store is locked.
        if (locked) return null;
        const starred = (data?.items ?? []).filter((item) =>
          favorites.has(item.id),
        );
        const unstarred = (data?.items ?? []).filter(
          (item) => !favorites.has(item.id),
        );
        const renderItem = (item: DeadboltItem) => {
          const isNote = notes.has(item.id);
          const isLogin = logins.has(item.id);
          const primary = isNote ? "note" : isLogin ? "password" : "value";
          return (
            <List.Item
              key={item.id}
              title={item.label}
              subtitle={item.extra}
              icon={Icon.Key}
              actions={
                <ActionPanel>
                  <Action
                    title="Show Fields"
                    icon={Icon.Eye}
                    onAction={() => push(<FieldsList bin={bin} item={item} />)}
                  />
                  <ActionPanel.Section title="Copy">
                    <Action
                      title={
                        isNote
                          ? "Copy Note"
                          : isLogin
                            ? "Copy Password"
                            : "Copy Value"
                      }
                      icon={Icon.CopyClipboard}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                      onAction={async () => {
                        try {
                          await copySecret(await get(bin, item.id), primary);
                        } catch (err) {
                          await toastError(err);
                        }
                      }}
                    />
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
                      title="Copy Username"
                      icon={Icon.Person}
                      onAction={async () => {
                        try {
                          await Clipboard.copy(
                            await get(bin, item.id, "username"),
                          );
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
                      title={
                        favorites.has(item.id) ? "Unstar Item" : "Star Item"
                      }
                      icon={
                        favorites.has(item.id) ? Icon.StarDisabled : Icon.Star
                      }
                      onAction={async () => {
                        const starred = !favorites.has(item.id);
                        try {
                          await setFavorite(bin, item.id, starred);
                          await showHUD(
                            starred
                              ? `Starred ${item.label}`
                              : `Unstarred ${item.label}`,
                          );
                          await revalidate();
                        } catch (err) {
                          await toastError(err);
                        }
                      }}
                    />
                    <Action
                      title="Open in Deadbolt"
                      icon={Icon.AppWindow}
                      shortcut={Keyboard.Shortcut.Common.OpenWith}
                      onAction={async () => {
                        try {
                          await openApp(bin);
                          await showHUD("Opened Deadbolt");
                        } catch (err) {
                          await toastError(err);
                        }
                      }}
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
          );
        };
        return (
          <>
            {starred.length > 0 && (
              <List.Section title="Starred">
                {starred.map(renderItem)}
              </List.Section>
            )}
            {unstarred.length > 0 && (
              <List.Section
                title={starred.length > 0 ? "All Items" : undefined}
              >
                {unstarred.map(renderItem)}
              </List.Section>
            )}
          </>
        );
      })()}
    </List>
  );
}
