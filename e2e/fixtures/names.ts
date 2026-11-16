// Names are unique per test so that the two projects (and repeated runs against a warm emulator)
// never collide on the song identity (title + artist).
let counter = 0;

export function uniqueTag(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Letters only so that the title/artist heuristics never mistake the tag for a key or number. */
export function lettersTag(): string {
  return uniqueTag()
    .replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)]!)
    .toUpperCase();
}
