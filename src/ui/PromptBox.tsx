import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { applyKey, completeCommand, layoutRows, matchCommands, type Editor } from "./lineEditor.js";

const MAX_WIDTH = 120;
const MAX_SUGGESTIONS = 8;

/** Cuts text to `max` columns with an ellipsis, so a changing line never wraps and changes the box height. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

/** One screen row of the input, with the cursor drawn as an inverted character on its row. */
function InputRow({ text, cursorColumn, prefix }: { text: string; cursorColumn: number | null; prefix: string }) {
  if (cursorColumn === null) {
    return (
      <Text>
        <Text color="cyan" bold>
          {prefix}
        </Text>
        {text}
      </Text>
    );
  }
  const before = text.slice(0, cursorColumn);
  const at = text.slice(cursorColumn, cursorColumn + 1) || " ";
  const after = text.slice(cursorColumn + 1);
  return (
    <Text>
      <Text color="cyan" bold>
        {prefix}
      </Text>
      {before}
      <Text inverse>{at}</Text>
      {after}
    </Text>
  );
}

/**
 * Boxed single/multi-line prompt. Resolves through `onResult` with the text, or `null` on Ctrl+C / Ctrl+D
 * with nothing typed. It owns stdin only while mounted, so no readline interface may exist at the same time.
 */
export function PromptBox({
  history,
  getFooter,
  hint,
  onToggleMode,
  onResult,
}: {
  /** Earlier inputs, oldest first. */
  history: string[];
  /** Read on every render, so it can reflect a mode change made with the Shift+Tab shortcut. */
  getFooter: () => string;
  hint: string;
  /** Shift+Tab: switch between chat and plan mode. */
  onToggleMode: () => void;
  onResult: (line: string | null) => void;
}) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [editor, setEditor] = useState<Editor>({ value: "", cursor: 0 });
  const [done, setDone] = useState(false);
  // Bumped by the mode shortcut so the footer is read again.
  const [, setModeTick] = useState(0);
  // Position while browsing history (history.length = the draft being typed) and that draft.
  const historyIndex = useRef(history.length);
  const draft = useRef("");
  const result = useRef<string | null>(null);

  useEffect(() => {
    if (!done) return;
    // Leave the frame showing what was sent (no cursor, no footer), then release the keyboard.
    exit();
    onResult(result.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useInput((input, key) => {
    if (done) return;
    // Shift+Tab flips the mode; plain Tab is command completion.
    if (key.tab && key.shift) {
      onToggleMode();
      setModeTick((n) => n + 1);
      return;
    }
    const outcome = applyKey(editor, input, key);
    switch (outcome.type) {
      case "edit":
        setEditor(outcome.editor);
        break;
      case "submit":
        result.current = editor.value.trim();
        setDone(true);
        break;
      case "exit":
        result.current = null;
        setDone(true);
        break;
      case "complete":
        setEditor(completeCommand(editor));
        break;
      case "history": {
        if (history.length === 0) break;
        if (historyIndex.current === history.length) draft.current = editor.value;
        const next = historyIndex.current + (outcome.direction === "prev" ? -1 : 1);
        if (next < 0 || next > history.length) break;
        historyIndex.current = next;
        const value = next === history.length ? draft.current : (history[next] as string);
        setEditor({ value, cursor: value.length });
        break;
      }
      default:
        break;
    }
  });

  const width = Math.min(stdout.columns ?? 80, MAX_WIDTH);
  // Border (2) + horizontal padding (2) + the "❯ " prefix (2) leave this many columns for text.
  const rows = layoutRows(editor.value, editor.cursor, width - 6);

  const suggestions = done ? [] : matchCommands(editor.value).slice(0, MAX_SUGGESTIONS);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={done ? "gray" : "cyan"} paddingX={1} width={width}>
        {rows.map((row, i) => (
          <InputRow
            key={i}
            text={row.text}
            prefix={i === 0 ? "❯ " : "  "}
            cursorColumn={done ? null : row.cursorColumn}
          />
        ))}
      </Box>
      {suggestions.length > 0 && (
        <Box paddingX={2}>
          <Text color="cyan">{suggestions.join("  ")}</Text>
        </Box>
      )}
      {!done && (
        <Box flexDirection="column" paddingX={2}>
          <Text dimColor>{clip(getFooter(), width - 4)}</Text>
          <Text dimColor>{hint}</Text>
        </Box>
      )}
    </Box>
  );
}
