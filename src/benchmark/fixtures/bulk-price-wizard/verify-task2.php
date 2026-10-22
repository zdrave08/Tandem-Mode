<?php
require __DIR__ . '/bootstrap.php';

$repo = $argv[1] ?? null;
if (!$repo) {
    fwrite(STDERR, "usage: verify-task2.php <repo-path>\n");
    exit(1);
}
require $repo . '/includes/Data/MoneyUtil.php';
require $repo . '/includes/Data/OperationDTO.php';
require $repo . '/includes/Engine/PriceEngine.php';

use BW\WCBPW\Engine\PriceEngine;

$before = ['regular' => 100.0, 'sale' => null, 'price' => 100.0];
$op = [
    'type' => 'percent_decrease',
    'amount' => 10,
    'price_type' => 'regular',
    'guards' => [],
    'rounding' => ['enabled' => false],
];

$result = PriceEngine::calculate_new_prices($before, $op);
$expected = 90.0;

if ($result['regular'] === null || abs($result['regular'] - $expected) > 0.01) {
    fwrite(STDERR, "FAIL: percent_decrease(100, 10%) = " . var_export($result['regular'], true) . ", expected $expected\n");
    exit(1);
}
exit(0);
