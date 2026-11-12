import { spawn } from "child_process";

/** One item as printed by `deadbolt ls`: id, label, and what tells it apart. */
export interface DeadboltItem {
  id: string;
  label: string;
  extra?: string;
}

export type DeadboltErrorKind = "locked" | "daemon" | "not-found" | "cli";

export class DeadboltError extends Error {
  kind: DeadboltErrorKind;
  exitCode: number;

  constructor(kind: DeadboltErrorKind, message: string, exitCode: number) {
    super(message);
    this.name = "DeadboltError";
    this.kind = kind;
    this.exitCode = exitCode;
  }
}

/** Raycast gives commands a narrow PATH; build one that finds Homebrew installs. */
function env(): NodeJS.ProcessEnv {
  const path = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/bin",
    "/usr/bin",
    process.env.PATH ?? "",
  ]
    .filter(Boolean)
    .join(":");
  return { ...process.env, PATH: path };
}

export type DeadboltBinary = string;

function run(bin: DeadboltBinary, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: env() });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      reject(
        code === "ENOENT"
          ? new DeadboltError(
              "cli",
              `Could not run ${bin}. Set the binary path in the extension preferences.`,
              -1,
            )
          : new DeadboltError("cli", err.message, -1),
      );
    });
    child.on("close", (code) => {
      const out = stdout.join("");
      const errOut = stderr.join("").trim();
      if (code === 0) {
        resolve(out);
        return;
      }
      if (code === 3) {
        reject(
          new DeadboltError(
            "locked",
            "Deadbolt is locked. Open Deadbolt to unlock it.",
            3,
          ),
        );
      } else if (code === 4) {
        reject(
          new DeadboltError(
            "daemon",
            errOut || "The Deadbolt daemon refused this request.",
            4,
          ),
        );
      } else if (code === 1 && errOut.length > 0) {
        reject(new DeadboltError("not-found", errOut, 1));
      } else {
        reject(
          new DeadboltError(
            "cli",
            errOut || `deadbolt ${args[0]} failed with exit code ${code}`,
            code ?? -1,
          ),
        );
      }
    });
  });
}

function parseItems(output: string): DeadboltItem[] {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [id, label, extra] = line.split("\t");
      return { id, label, extra: extra?.length ? extra : undefined };
    });
}

export function listItems(
  bin: DeadboltBinary,
  type?: "login",
): Promise<DeadboltItem[]> {
  return run(bin, type ? ["ls", "--type", type] : ["ls"]).then(parseItems);
}

/** Short ids of the items of one type, from `ls --type`. */
function idsOfType(bin: DeadboltBinary, type: string): Promise<Set<string>> {
  return run(bin, ["ls", "--type", type]).then(
    (out) => new Set(parseItems(out).map((item) => item.id)),
  );
}

/** Short ids of login items. */
export function loginIds(bin: DeadboltBinary): Promise<Set<string>> {
  return idsOfType(bin, "login");
}

/** Short ids of secure-note items. */
export function noteIds(bin: DeadboltBinary): Promise<Set<string>> {
  return idsOfType(bin, "note");
}

/** Keys that `show` prints as metadata, not copyable fields. */
const META_KEYS = new Set(["type", "label", "id", "favorite", "tags"]);

/** Field names of one item, read from `show` (secrets stay masked there). */
export function fieldNames(bin: DeadboltBinary, id: string): Promise<string[]> {
  return show(bin, id).then((out) =>
    out
      .split("\n")
      .map((line) => /^(\S+)\s{2,}\S/.exec(line)?.[1])
      .filter((key): key is string => !!key && !META_KEYS.has(key)),
  );
}

/** Short ids of starred items, from `ls --favorites`. */
export function favoriteIds(bin: DeadboltBinary): Promise<Set<string>> {
  return run(bin, ["ls", "--favorites"]).then(
    (out) => new Set(parseItems(out).map((item) => item.id)),
  );
}

/** Star or unstar an item. */
export function setFavorite(
  bin: DeadboltBinary,
  id: string,
  favorite: boolean,
): Promise<void> {
  return run(bin, ["set", id, favorite ? "--favorite" : "--no-favorite"]).then(
    () => undefined,
  );
}

/** Raw value of the item's default field, or of a named field. */
export function get(
  bin: DeadboltBinary,
  id: string,
  field?: string,
): Promise<string> {
  const args = ["get", id];
  if (field) args.push("-f", field);
  return run(bin, args).then((out) => out.replace(/\n$/, ""));
}

/** Current one-time code from the item's otp field. */
export function code(bin: DeadboltBinary, id: string): Promise<string> {
  return run(bin, ["code", id]).then((out) => out.replace(/\n$/, ""));
}

/** Fields of one item, secrets masked by Deadbolt itself. */
export function show(bin: DeadboltBinary, id: string): Promise<string> {
  return run(bin, ["show", id]);
}

export function lock(bin: DeadboltBinary): Promise<void> {
  return run(bin, ["lock"]).then(() => undefined);
}

/** Bring the Deadbolt app forward (also where the user unlocks). */
export function openApp(bin: DeadboltBinary): Promise<void> {
  return run(bin, ["app"]).then(() => undefined);
}
