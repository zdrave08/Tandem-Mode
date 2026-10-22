import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "bulk-price-wizard"
);

export interface BenchmarkTask {
  id: string;
  description: string;
  expectedFiles: string[];
  /** Uvodi poznat bag u čist baseline pre nego što agent počne. */
  injectBug: (repoPath: string) => Promise<void>;
  /** Apsolutna putanja do verify PHP skripte — VAN target repoa. */
  verifyScript: string;
}

async function replaceInFile(filePath: string, from: string, to: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  if (!content.includes(from)) {
    throw new Error(`Bug injection anchor not found in ${filePath}: ${JSON.stringify(from)}`);
  }
  await writeFile(filePath, content.replace(from, to), "utf8");
}

export const benchmarkTasks: BenchmarkTask[] = [
  {
    id: "money-rounding",
    description:
      "Users report the 'Round to nearest 0.05' rounding preset is broken — it's rounding to the nearest 50 cents instead of 5 cents. Find and fix the bug in includes/Data/MoneyUtil.php.",
    expectedFiles: ["includes/Data/MoneyUtil.php"],
    async injectBug(repoPath) {
      await replaceInFile(
        path.join(repoPath, "includes/Data/MoneyUtil.php"),
        "'nearest_005' => round($price / 0.05) * 0.05,",
        "'nearest_005' => round($price / 0.5) * 0.5,"
      );
    },
    verifyScript: path.join(FIXTURES_DIR, "verify-task1.php"),
  },
  {
    id: "percent-decrease",
    description:
      "Bulk 'decrease by percentage' operations are producing wildly wrong results (way too low, sometimes negative) instead of a normal percentage decrease. Find and fix the pricing bug in includes/Engine/PriceEngine.php.",
    expectedFiles: ["includes/Engine/PriceEngine.php"],
    async injectBug(repoPath) {
      await replaceInFile(
        path.join(repoPath, "includes/Engine/PriceEngine.php"),
        "'percent_decrease' => $current * (1.0 - $amount / 100.0),",
        "'percent_decrease' => $current * (1.0 - $amount),"
      );
    },
    verifyScript: path.join(FIXTURES_DIR, "verify-task2.php"),
  },
  {
    id: "min-price-guard",
    description:
      "The minimum-price safety guard isn't preventing computed prices from going below the configured minimum — store managers are seeing prices below their configured floor after a bulk update. Find and fix the guard bug in includes/Engine/PriceEngine.php.",
    expectedFiles: ["includes/Engine/PriceEngine.php"],
    async injectBug(repoPath) {
      await replaceInFile(
        path.join(repoPath, "includes/Engine/PriceEngine.php"),
        "if ($min !== null && $price < (float) $min) {",
        "if ($min !== null && $price > (float) $min) {"
      );
    },
    verifyScript: path.join(FIXTURES_DIR, "verify-task3.php"),
  },
  {
    id: "validator-percent-cap",
    description:
      "Submitting a 100% price decrease operation is incorrectly accepted as valid by the operation validator, even though that would zero out or invalidate the price (it should be rejected — only decreases strictly less than 100% are valid). Find and fix the validation bug in includes/Data/OperationValidator.php.",
    expectedFiles: ["includes/Data/OperationValidator.php"],
    async injectBug(repoPath) {
      await replaceInFile(
        path.join(repoPath, "includes/Data/OperationValidator.php"),
        "if (($op['type'] ?? '') === 'percent_decrease' && (float) $amount >= 100) {",
        "if (($op['type'] ?? '') === 'percent_decrease' && (float) $amount > 100) {"
      );
    },
    verifyScript: path.join(FIXTURES_DIR, "verify-task4.php"),
  },
];
