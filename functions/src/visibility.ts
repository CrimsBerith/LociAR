/**
 * Block semantics (owner decision, 17 Oct 2026).
 *
 * - An identity block (`user_blocks`, the profile "Block" action) hides attributed content,
 *   comments and profiles, in both directions.
 * - An anonymous mute (`anonymous_blocks`, "hide this author's notes" on an anonymous note) hides
 *   only that author's anonymous notes, and only from the viewer who muted them.
 *
 * Neither kind may change what another surface returns. If an identity block also hid anonymous
 * notes, or a mute also hid a profile, comparing results before and after a block would reveal
 * who wrote an anonymous note.
 */
export type BlockSets = { identity: ReadonlySet<string>; muted: ReadonlySet<string> };

export function postHiddenByBlocks(viewer: string, author: string, anonymous: boolean, blocks: BlockSets): boolean {
  if (author === viewer) return false;
  return anonymous ? blocks.muted.has(author) : blocks.identity.has(author);
}
