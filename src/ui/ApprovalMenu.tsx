import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { t } from "../i18n/index.js";
import { buildApprovalCopy, keyToAction, type ChoiceId } from "./approvalModel.js";

/**
 * Boxed, keyboard-driven approval: arrows + Enter, 1-3, or y/a/n. It owns stdin only while it is
 * mounted, so it must not be shown at the same time as a readline interface.
 */
export function ApprovalMenu({
  toolName,
  args,
  onChoice,
}: {
  toolName: string;
  args: Record<string, unknown>;
  onChoice: (id: ChoiceId) => void;
}) {
  const copy = buildApprovalCopy(toolName, args);
  const ids = copy.options.map((o) => o.id);
  const [index, setIndex] = useState(0);
  // Guards against a second key press resolving the same prompt twice before React unmounts it.
  const [done, setDone] = useState(false);

  useInput((input, key) => {
    if (done) return;
    const action = keyToAction(input, key, index, ids);
    if (!action) return;
    if (action.type === "move") {
      setIndex(action.index);
      return;
    }
    setDone(true);
    onChoice(action.id);
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {copy.title}
      </Text>
      {copy.body.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {copy.body.map((line, i) => (
            <Text key={i} {...(line.color ? { color: line.color } : line.dim ? { dimColor: true } : {})}>
              {line.text}
            </Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text bold>{copy.question}</Text>
      </Box>
      {copy.options.map((option, i) => (
        <Text key={option.id} {...(i === index ? { color: "cyan", bold: true } : {})}>
          {i === index ? "❯ " : "  "}
          {i + 1}. {option.label}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>{t("approvalMenuHint")}</Text>
      </Box>
    </Box>
  );
}
