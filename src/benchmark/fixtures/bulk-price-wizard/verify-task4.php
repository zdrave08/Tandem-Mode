<?php
require __DIR__ . '/bootstrap.php';

$repo = $argv[1] ?? null;
if (!$repo) {
    fwrite(STDERR, "usage: verify-task4.php <repo-path>\n");
    exit(1);
}
require $repo . '/includes/Data/OperationDTO.php';
require $repo . '/includes/Data/OperationValidator.php';

use BW\WCBPW\Data\OperationValidator;

$op = [
    'type' => 'percent_decrease',
    'amount' => 100,
    'price_type' => 'regular',
    'rounding' => [],
    'guards' => [],
];

$result = OperationValidator::validate($op);

if ($result === true) {
    fwrite(STDERR, "FAIL: a 100% price decrease was incorrectly accepted as valid.\n");
    exit(1);
}
if (!($result instanceof WP_Error) || !$result->has_errors()) {
    fwrite(STDERR, "FAIL: unexpected validator result.\n");
    exit(1);
}
exit(0);
