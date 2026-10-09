import assert from "node:assert/strict";
import test from "node:test";
import { strokePolylines, summarizePostContent } from "../lib/postContent.ts";

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
  assert.deepEqual(summarizePostContent({ edit_data_json: "{nope", content_source_json: 5 }), { texts: [], strokes: [], source: null });
});

test("polylines fit inside the box with padding", () => {
  const [line] = strokePolylines([{ color: "#fff", points: [{ x: 10, y: 10 }, { x: 110, y: 60 }] }], 160, 8);
  const pts = line.points.split(" ").map(p => p.split(",").map(Number));
  for (const [x, y] of pts) assert.ok(x >= 8 && x <= 152 && y >= 8 && y <= 152);
  assert.deepEqual(strokePolylines([]), []);
});
