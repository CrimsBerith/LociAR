import assert from "node:assert/strict";
import test from "node:test";
import { giphyPreviewUrl, klipyAppKey, klipyItemsUrl, klipyPreviewFromItems, strokePolylines, summarizePostContent } from "../lib/postContent.ts";

const post = (layers, source) => ({
  edit_data_json: JSON.stringify({ layers }),
  content_source_json: source ? JSON.stringify(source) : null,
});

test("summary separates text layers, strokes and the linked source", () => {
  const s = summarizePostContent(post(
    [{ type: "text", text: "hello" }, { type: "drawing", color: "#ff0000", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    { platform: "youtube", url: "https://youtu.be/abc", preview: { title: "Song", author: "Artist" } },
  ));
  assert.deepEqual(s.texts, ["hello"]);
  assert.equal(s.strokes.length, 1);
  assert.equal(s.strokes[0].color, "#ff0000");
  assert.deepEqual(s.source, { platform: "youtube", url: "https://youtu.be/abc", title: "Song", author: "Artist" });
});

test("summary drops unsafe colours, non-https links and malformed points", () => {
  const s = summarizePostContent(post(
    [{ type: "drawing", color: "red;}</style>", points: [{ x: 1, y: 2 }, { x: "a", y: 1 }, null] }],
    { platform: "x", url: "javascript:alert(1)" },
  ));
  assert.equal(s.strokes[0].color, "#ffffff");
  assert.equal(s.strokes[0].points.length, 1);
  assert.equal(s.source.url, null);
});

test("summary tolerates missing or invalid JSON", () => {
  assert.deepEqual(summarizePostContent({ edit_data_json: "{nope", content_source_json: 5 }), { texts: [], gifs: [], klipyGifs: [], strokes: [], source: null });
});

test("polylines fit inside the box with padding", () => {
  const [line] = strokePolylines([{ color: "#fff", points: [{ x: 10, y: 10 }, { x: 110, y: 60 }] }], 160, 8);
  const pts = line.points.split(" ").map(p => p.split(",").map(Number));
  for (const [x, y] of pts) assert.ok(x >= 8 && x <= 152 && y >= 8 && y <= 152);
  assert.deepEqual(strokePolylines([]), []);
});

test("GIF layers surface a single validated GIPHY id for moderators", () => {
  const s = summarizePostContent(post([{ type: "text", text: "Selam" }, { type: "gif", gifId: "l0MYt5jPR6QX5pnqM" }, { type: "gif", gifId: "second" }]));
  assert.deepEqual(s.texts, ["Selam"]);
  assert.deepEqual(s.gifs, ["l0MYt5jPR6QX5pnqM"]);
  assert.deepEqual(summarizePostContent(post([{ type: "gif", gifId: "../x" }])).gifs, []);
  assert.equal(giphyPreviewUrl("l0MYt5jPR6QX5pnqM"), "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif");
  assert.equal(giphyPreviewUrl("a/b"), null);
});

test("KLIPY GIF layers surface a validated slug; media is looked up in the browser and only from KLIPY hosts", () => {
  const s = summarizePostContent(post([{ type: "text", text: "Selam" }, { type: "gif", provider: "klipy", gifSlug: "happy-cat-f7u--kOKp0sbu4", width: 480, height: 270 }, { type: "gif", gifId: "second" }]));
  assert.deepEqual(s.klipyGifs, ["happy-cat-f7u--kOKp0sbu4"]);
  assert.deepEqual(s.gifs, []);
  for (const gifSlug of ["https://static.klipy.com/x.gif", "a/b", "../x", "a b", "", 5]) {
    assert.deepEqual(summarizePostContent(post([{ type: "gif", provider: "klipy", gifSlug }])).klipyGifs, [], String(gifSlug));
  }
  const key = "emulatorKlipyKey0123456789abcdefABCDEF";
  assert.equal(klipyAppKey(` ${key} `), key);
  for (const bad of [undefined, "", "short", "has/slash0123456789"]) assert.equal(klipyAppKey(bad), null);
  assert.equal(klipyItemsUrl(key, "happy-cat"), `https://api.klipy.com/api/v1/${key}/gifs/items?slugs=happy-cat`);
  assert.equal(klipyItemsUrl(key, "a/b"), null);
  assert.equal(klipyItemsUrl("bad key", "happy-cat"), null);
  const items = (url) => ({ result: true, data: { data: [{ slug: "happy-cat", file: { sm: { gif: { url } } } }] } });
  assert.equal(klipyPreviewFromItems(items("https://static.klipy.com/ii/a/b.gif")), "https://static.klipy.com/ii/a/b.gif");
  assert.equal(klipyPreviewFromItems(items("https://static2.klipy.com/ii/a/b.gif")), "https://static2.klipy.com/ii/a/b.gif");
  for (const bad of ["http://static.klipy.com/a.gif", "https://evil.example/a.gif", "https://static.klipy.com.evil.example/a.gif", "https://user@static.klipy.com/a.gif", "javascript:alert(1)", 5]) {
    assert.equal(klipyPreviewFromItems(items(bad)), null, String(bad));
  }
  assert.equal(klipyPreviewFromItems({ result: true, data: { data: [] } }), null);
  assert.equal(klipyPreviewFromItems(null), null);
});
