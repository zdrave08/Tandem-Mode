<?php
require __DIR__ . '/bootstrap.php';

$repo = $argv[1] ?? null;
if (!$repo) {
    fwrite(STDERR, "usage: verify-task3.php <repo-path>\n");
    exit(1);
}
require $repo . '/includes/Data/MoneyUtil.php';
require $repo . '/includes/Data/OperationDTO.php';
require $repo . '/includes/Engine/PriceEngine.php';

use BW\WCBPW\Engine\PriceEngine;

$before = ['regular' => 100.0, 'sale' => null, 'price' => 100.0];
$op = [
    'type' => 'percent_decrease',
    'amount' => 90, // would push 100 -> 10, well below the guard
    'price_type' => 'regular',
    'guards' => ['min_price' => 50.0],
    'rounding' => ['enabled' => false],
];

$result = PriceEngine::calculate_new_prices($before, $op);

if ($result['regular'] === null || $result['regular'] < 50.0 - 0.001) {
    fwrite(STDERR, "FAIL: min_price guard not enforced, got " . var_export($result['regular'], true) . "\n");
    exit(1);
}
exit(0);
