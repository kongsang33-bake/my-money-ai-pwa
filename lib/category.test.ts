import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  avatarPaletteVars, categories, categoryColor, categoryColorVar, categoryColorVars,
  categoryIconMap, categoryTint, inferredRecurringIcon, nameColor, nameInitial,
  recurringIconMap, recurringIconOptions, recurringServiceIconKeywords,
  walletIconMap, walletIconOptions,
} from "./category.ts";
import { CATEGORIES } from "./taxonomy.ts";

describe("categoryColorVar", () => {
  it("returns the slot a known category is assigned", () => {
    assert.equal(categoryColorVar("อาหาร"), "--cat-food");
    assert.equal(categoryColorVar("เดินทาง"), "--cat-travel");
  });

  it("falls back to --cat-other for anything unmapped", () => {
    // Includes categories the app knows but deliberately leaves off the
    // 7-slot palette (รายได้ carries the income color instead), and anything
    // the AI invents that is not in CATEGORIES at all.
    assert.equal(categoryColorVar("รายได้"), "--cat-other");
    assert.equal(categoryColorVar("อื่น ๆ"), "--cat-other");
    assert.equal(categoryColorVar("หมวดที่ไม่มีจริง"), "--cat-other");
    assert.equal(categoryColorVar(""), "--cat-other");
  });

  it("gives every palette category its own slot", () => {
    const slots = Object.values(categoryColorVars);
    assert.equal(new Set(slots).size, slots.length, "two categories sharing a slot would be indistinguishable");
  });

  it("only assigns slots to categories the app actually offers", () => {
    for (const category of Object.keys(categoryColorVars)) {
      assert.ok((CATEGORIES as readonly string[]).includes(category), `${category} is not in CATEGORIES`);
    }
  });
});

describe("categoryColor / categoryTint", () => {
  it("wraps the slot in var() so the value follows the theme", () => {
    // Never a literal color: the whole point is that :root and
    // :root[data-theme="dark"] redefine --cat-* per theme.
    assert.equal(categoryColor("อาหาร"), "var(--cat-food)");
    assert.ok(!/#[0-9a-f]{3}/i.test(categoryColor("อาหาร")));
  });

  it("builds a color-mix tint at the given alpha", () => {
    assert.equal(categoryTint("อาหาร", 12), "color-mix(in srgb, var(--cat-food) 12%, transparent)");
  });

  it("tints an unknown category against the fallback slot", () => {
    assert.equal(categoryTint("ไม่รู้จัก", 20), "color-mix(in srgb, var(--cat-other) 20%, transparent)");
  });
});

describe("nameColor", () => {
  it("is stable for the same name", () => {
    assert.equal(nameColor("เอก"), nameColor("เอก"));
  });

  it("ignores surrounding whitespace", () => {
    // Otherwise the same debtor typed with a trailing space would get a
    // different avatar color from one screen to the next.
    assert.equal(nameColor(" เอก "), nameColor("เอก"));
  });

  it("always lands inside the palette", () => {
    for (const name of ["เอก", "บี", "Somchai", "x", "ก", "1234567890", "  "]) {
      assert.ok(avatarPaletteVars.includes(nameColor(name).slice(4, -1)), `${name} produced ${nameColor(name)}`);
    }
  });

  it("does spread names across more than one slot", () => {
    const seen = new Set(["เอก", "บี", "ซี", "ดี", "อี", "เอฟ", "จี", "เอช"].map(nameColor));
    assert.ok(seen.size > 1, "every name hashing to one color would defeat the point");
  });
});

describe("nameInitial", () => {
  it("uppercases a latin initial", () => {
    assert.equal(nameInitial("anna"), "A");
  });

  it("takes the first character of a Thai name as-is", () => {
    assert.equal(nameInitial("เอก"), "เ");
  });

  it("trims first, so a leading space does not become the initial", () => {
    assert.equal(nameInitial("  anna"), "A");
  });

  it("falls back to ? rather than rendering an empty avatar", () => {
    assert.equal(nameInitial(""), "?");
    assert.equal(nameInitial("   "), "?");
  });
});

describe("inferredRecurringIcon", () => {
  it("matches a known service", () => {
    assert.equal(inferredRecurringIcon("Netflix"), "tv");
    assert.equal(inferredRecurringIcon("Spotify"), "music");
    assert.equal(inferredRecurringIcon("TikTok"), "monitor-play");
  });

  it("is case- and whitespace-insensitive", () => {
    assert.equal(inferredRecurringIcon("  NETFLIX  "), "tv");
    assert.equal(inferredRecurringIcon("claude"), "bot");
    assert.equal(inferredRecurringIcon("CLAUDE Pro"), "bot");
  });

  it("matches on a substring, not the whole name", () => {
    assert.equal(inferredRecurringIcon("ค่า Netflix รายเดือน"), "tv");
  });

  it("prefers the more specific group when two could match", () => {
    // Group order is the tie-break (see the comment on
    // recurringServiceIconKeywords). "YouTube Music" contains both "youtube"
    // and "youtube music"; the music group is listed first so the specific
    // one wins, while plain "YouTube" still falls through to video.
    assert.equal(inferredRecurringIcon("YouTube Music"), "music");
    assert.equal(inferredRecurringIcon("YouTube"), "monitor-play");
    assert.equal(inferredRecurringIcon("Prime Video"), "tv");
  });

  it("falls back to receipt for anything unrecognised", () => {
    assert.equal(inferredRecurringIcon("ค่าเน็ตบ้าน"), "receipt");
    assert.equal(inferredRecurringIcon(""), "receipt");
  });

  it("only ever names an icon the picker actually offers", () => {
    // A keyword pointing at a key that is not in recurringIconOptions would
    // render nothing at all, silently.
    const offered = new Set(recurringIconOptions.map((option) => option.key));
    assert.ok(offered.has("receipt"), "the fallback key must exist");
    for (const { key } of recurringServiceIconKeywords) {
      assert.ok(offered.has(key), `keyword group points at unknown icon "${key}"`);
    }
  });

  it("has no keyword term that an earlier group already swallows", () => {
    // Catches the defect this suite was written after: a term sitting in a
    // later group that an earlier group's shorter term always matches first
    // is dead configuration, and reads as the icon picker ignoring you.
    for (let index = 0; index < recurringServiceIconKeywords.length; index += 1) {
      for (const term of recurringServiceIconKeywords[index].terms) {
        assert.equal(
          inferredRecurringIcon(term),
          recurringServiceIconKeywords[index].key,
          `"${term}" never reaches its own group`,
        );
      }
    }
  });
});

describe("icon lookup tables", () => {
  it("indexes every wallet icon option by its key", () => {
    assert.deepEqual(Object.keys(walletIconMap).sort(), walletIconOptions.map((option) => option.key).sort());
  });

  it("indexes every recurring icon option by its key", () => {
    assert.deepEqual(Object.keys(recurringIconMap).sort(), recurringIconOptions.map((option) => option.key).sort());
  });

  it("has no duplicate keys, which would hide an option", () => {
    assert.equal(new Set(walletIconOptions.map((option) => option.key)).size, walletIconOptions.length);
    assert.equal(new Set(recurringIconOptions.map((option) => option.key)).size, recurringIconOptions.length);
  });

  it("labels every option", () => {
    for (const option of [...walletIconOptions, ...recurringIconOptions]) {
      assert.ok(option.label.trim(), `no label for ${option.key}`);
      assert.ok(option.Icon, `no icon component for ${option.key}`);
    }
  });

  it("gives every icon-mapped category a real category name", () => {
    for (const category of Object.keys(categoryIconMap)) {
      assert.ok((CATEGORIES as readonly string[]).includes(category), `${category} is not in CATEGORIES`);
    }
  });

  it("re-exports CATEGORIES as a mutable list without changing it", () => {
    assert.deepEqual(categories, [...CATEGORIES]);
  });
});
