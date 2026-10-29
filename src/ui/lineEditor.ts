/**
 * Text editing for the prompt box, as pure functions: given the current text, the cursor and a key,
 * return the next state or an action for the caller. Kept free of Ink so it can be checked alone.
 */

export interface Editor {
  value: string;
  /** Index into `value` where the next character goes (0 to value.length). */
  cursor: number;
}

export interface EditKey {
  leftArrow?: boolean;
  rightArrow?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  backspace?: boolean;
  delete?: boolean;
  tab?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export type EditResult =
  | { type: "edit"; editor: Editor }
  | { type: "submit" }
  | { type: "exit" }
  | { type: "history"; direction: "prev" | "next" }
  | { type: "complete" }
  | { type: "none" };

const edit = (value: string, cursor: number): EditResult => ({ type: "edit", editor: { value, cursor } });

function lineStart(value: string, cursor: number): number {
  return value.lastIndexOf("\n", cursor - 1) + 1;
}

function lineEnd(value: string, cursor: number): number {
  const i = value.indexOf("\n", cursor);
  return i === -1 ? value.length : i;
}

function wordLeft(value: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && /\s/.test(value[i - 1] as string)) i--;
  while (i > 0 && !/\s/.test(value[i - 1] as string)) i--;
  return i;
}

function wordRight(value: string, cursor: number): number {
  let i = cursor;
  while (i < value.length && /\s/.test(value[i] as string)) i++;
  while (i < value.length && !/\s/.test(value[i] as string)) i++;
  return i;
}

/** Pasted or typed text: unify line endings, drop other control characters, expand tabs. */
export function normalizeInput(text: string): string {
  return text
    .replace(/\r\n|\r/g, "\n")
    .replace(/\t/g, "  ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");
}

/** Moves the cursor one line up or down, keeping the column where it can. `null` when there is no such line. */
export function moveVertical(value: string, cursor: number, direction: "up" | "down"): number | null {
  const start = lineStart(value, cursor);
  const column = cursor - start;
  if (direction === "up") {
    if (start === 0) return null;
    const prevEnd = start - 1;
    const prevStart = lineStart(value, prevEnd);
    return Math.min(prevStart + column, prevEnd);
  }
  const end = lineEnd(value, cursor);
  if (end >= value.length) return null;
  const nextStart = end + 1;
  const nextEnd = lineEnd(value, nextStart);
  return Math.min(nextStart + column, nextEnd);
}

export function applyKey(editor: Editor, input: string, key: EditKey): EditResult {
  const { value, cursor } = editor;

  if (key.ctrl) {
    switch (input) {
      case "c":
        return value === "" ? { type: "exit" } : edit("", 0);
      case "d":
        if (value === "") return { type: "exit" };
        return cursor < value.length ? edit(value.slice(0, cursor) + value.slice(cursor + 1), cursor) : { type: "none" };
      case "a":
        return edit(value, lineStart(value, cursor));
      case "e":
        return edit(value, lineEnd(value, cursor));
      case "u": {
        const start = lineStart(value, cursor);
        return edit(value.slice(0, start) + value.slice(cursor), start);
      }
      case "k":
        return edit(value.slice(0, cursor) + value.slice(lineEnd(value, cursor)), cursor);
      case "w": {
        const start = wordLeft(value, cursor);
        return edit(value.slice(0, start) + value.slice(cursor), start);
      }
      default:
        return key.leftArrow ? edit(value, wordLeft(value, cursor)) : key.rightArrow ? edit(value, wordRight(value, cursor)) : { type: "none" };
    }
  }

  if (key.return) {
    // Alt+Enter, or a trailing backslash then Enter, adds a line instead of sending.
    if (key.meta) return edit(value.slice(0, cursor) + "\n" + value.slice(cursor), cursor + 1);
    if (value[cursor - 1] === "\\") return edit(value.slice(0, cursor - 1) + "\n" + value.slice(cursor), cursor);
    return value.trim() === "" ? { type: "none" } : { type: "submit" };
  }

  if (key.tab) return { type: "complete" };
  if (key.escape) return { type: "none" };

  if (key.leftArrow) return edit(value, key.meta ? wordLeft(value, cursor) : Math.max(0, cursor - 1));
  if (key.rightArrow) return edit(value, key.meta ? wordRight(value, cursor) : Math.min(value.length, cursor + 1));

  if (key.upArrow || key.downArrow) {
    const moved = moveVertical(value, cursor, key.upArrow ? "up" : "down");
    if (moved !== null) return edit(value, moved);
    return { type: "history", direction: key.upArrow ? "prev" : "next" };
  }

  // Terminals send DEL for Backspace, which Ink reports as `delete`; treat both as "delete left".
  if (key.backspace || key.delete) {
    return cursor > 0 ? edit(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1) : { type: "none" };
  }

  if (key.meta) return { type: "none" };

  const text = normalizeInput(input);
  if (text === "") return { type: "none" };
  return edit(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
}

export interface Row {
  text: string;
  /** Column of the cursor on this row, or `null` when the cursor is on another row. */
  cursorColumn: number | null;
  /** True for the first row of a logical line (it gets the prompt symbol). */
  first: boolean;
}

/**
 * Splits the text into screen rows that fit `width` columns, breaking at spaces where possible, and
 * says which row holds the cursor. Wrapping is done here (not left to Ink) because Ink does not
 * recompute a box's height when its text changes while typing, so wrapped text spilled over the border.
 * One column is kept free so the cursor cell never pushes a full row over the width.
 */
export function layoutRows(value: string, cursor: number, width: number): Row[] {
  const limit = Math.max(8, width - 1);
  const rows: Row[] = [];
  let lineOffset = 0;
  for (const line of value.split("\n")) {
    let pos = 0;
    do {
      let end = Math.min(pos + limit, line.length);
      if (end < line.length) {
        const space = line.lastIndexOf(" ", end);
        if (space > pos) end = space + 1;
      }
      const absStart = lineOffset + pos;
      const absEnd = lineOffset + end;
      const lastRowOfLine = end >= line.length;
      const hasCursor = cursor >= absStart && (cursor < absEnd || (lastRowOfLine && cursor === absEnd));
      rows.push({ text: line.slice(pos, end), cursorColumn: hasCursor ? cursor - absStart : null, first: pos === 0 });
      pos = end;
    } while (pos < line.length);
    lineOffset += line.length + 1;
  }
  return rows;
}

/** Slash commands offered while the text starts with `/`. */
export const SLASH_COMMANDS = [
  "/plan",
  "/model",
  "/thinking",
  "/effort",
  "/status",
  "/diff",
  "/usage",
  "/budget",
  "/new",
  "/save-profile",
  "/profile",
  "/compact",
  "/fork",
  "/resume",
  "/paste",
  "/clear",
  "/help",
  "/exit",
];

/** Commands matching what has been typed so far (only while it is a single word starting with `/`). */
export function matchCommands(value: string): string[] {
  if (!value.startsWith("/") || /\s/.test(value)) return [];
  return SLASH_COMMANDS.filter((c) => c.startsWith(value) && c !== value);
}

/** Tab: complete to the first match, with a trailing space when the command takes an argument. */
export function completeCommand(editor: Editor): Editor {
  const [first] = matchCommands(editor.value);
  if (!first) return editor;
  const takesArgument = ["/plan", "/model", "/thinking", "/effort", "/budget", "/save-profile", "/profile", "/resume", "/diff", "/paste"].includes(first);
  const value = takesArgument ? `${first} ` : first;
  return { value, cursor: value.length };
}
