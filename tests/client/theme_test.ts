import { assertEquals } from "@std/assert";
import { readTheme, saveTheme } from "../../src/client/ui/theme.js";
import { parseTheme, THEME_KEY } from "../../src/shared/theme.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

Deno.test("a stored theme keeps known names and falls back per field on anything else", () => {
  assertEquals(parseTheme({ accent: "olive", mode: "light" }), {
    accent: "olive",
    mode: "light",
  });
  assertEquals(parseTheme({ accent: "sand", mode: "dark" }), {
    accent: "bronze",
    mode: "dark",
  });
  assertEquals(parseTheme({ accent: "ink", mode: "sepia" }), {
    accent: "ink",
    mode: "device",
  });
  for (const junk of [null, 3, "olive", [], { accent: ["olive"] }]) {
    assertEquals(parseTheme(junk), { accent: "bronze", mode: "device" });
  }
});

Deno.test("the theme round-trips through storage, and unreadable or blocked storage reads as the default", () => {
  const storage = memoryStorage();
  assertEquals(readTheme(storage), { accent: "bronze", mode: "device" });
  saveTheme({ accent: "olive", mode: "light" }, storage);
  assertEquals(readTheme(storage), { accent: "olive", mode: "light" });

  assertEquals(readTheme(memoryStorage({ [THEME_KEY]: "{not json" })), {
    accent: "bronze",
    mode: "device",
  });
  const blocked = {
    getItem(): string | null {
      throw new DOMException("denied", "SecurityError");
    },
    setItem(): void {
      throw new DOMException("denied", "SecurityError");
    },
  };
  assertEquals(readTheme(blocked), { accent: "bronze", mode: "device" });
  saveTheme({ accent: "ink", mode: "dark" }, blocked);
});
