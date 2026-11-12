/**
 * Local check of the CLI wrapper against a real `deadbolt` install.
 * Run: bun scripts/smoke.ts
 * Prints lengths and masked output only, never secret values.
 */
import { DeadboltError, code, get, listItems, show } from "../src/deadbolt";

const bin = process.argv[2] ?? "deadbolt";

async function main() {
  console.log(`bin: ${bin}`);

  const items = await listItems(bin);
  console.log(`ls: ${items.length} items; first 3: ${items.slice(0, 3).map((i) => i.label).join(", ")}`);

  const item = items[0];
  if (!item) {
    console.log("no items; stopping after ls");
    return;
  }

  // Fields and secrets only exist on typed items; use a login for those checks.
  const logins = await listItems(bin, "login");
  const login = logins[0];
  if (!login) {
    console.log("no logins; stopping after ls");
    return;
  }
  console.log(`login: id=${login.id} label=${login.label}`);
  console.log(`item: id=${item.id} label=${item.label}${item.extra ? ` extra=${item.extra}` : ""}`);

  const password = await get(bin, login.id);
  console.log(`get (default field): ok, value length ${password.length}`);

  const username = await get(bin, login.id, "username");
  console.log(`get -f username: ${username ? `ok, length ${username.length}` : "empty"}`);

  try {
    const otp = await code(bin, login.id);
    console.log(`code: ok, length ${otp.length}`);
  } catch (err) {
    console.log(`code: expected failure (${err instanceof Error ? err.message : err})`);
  }

  const fields = await show(bin, login.id);
  console.log(`show:\n${fields}`);

  try {
    await get(bin, "zzzzzz");
    console.log("get zzzzzz: unexpectedly succeeded");
  } catch (err) {
    if (err instanceof DeadboltError) {
      console.log(`get zzzzzz: DeadboltError kind=${err.kind} exit=${err.exitCode}`);
    } else {
      console.log(`get zzzzzz: unexpected error ${err}`);
    }
  }

  console.log("smoke passed");
}

main().catch((err) => {
  if (err instanceof DeadboltError && err.kind === "locked") {
    console.log("store is locked; unlock deadbolt first, then run the smoke test again");
    process.exit(2);
  }
  console.error(`smoke failed: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
