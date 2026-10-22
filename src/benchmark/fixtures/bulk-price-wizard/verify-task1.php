<?php
require __DIR__ . '/bootstrap.php';

$repo = $argv[1] ?? null;
if (!$repo) {
    fwrite(STDERR, "usage: verify-task1.php <repo-path>\n");
    exit(1);
}
require $repo . '/includes/Data/MoneyUtil.php';

use BW\WCBPW\Data\MoneyUtil;

$cases = [
    [12.47, 12.45],
    [12.48, 12.50],
    [12.52, 12.50],
];

$fail = false;
foreach ($cases as [$input, $expected]) {
    $actual = MoneyUtil::round_by_preset($input, 'nearest_005');
    if (abs($actual - $expected) > 0.001) {
        fwrite(STDERR, "FAIL: round_by_preset($input, 'nearest_005') = $actual, expected $expected\n");
        $fail = true;
    }
}

exit($fail ? 1 : 0);
