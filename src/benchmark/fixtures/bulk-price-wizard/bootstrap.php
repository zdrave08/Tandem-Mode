<?php
/**
 * Minimalni WP/WC stub da se čiste PHP klase iz plugina mogu require-ovati
 * i testirati izolovano, bez punog WordPress bootstrap-a. Namerno živi VAN
 * target repo-a — agent koji se benchmarkuje ne sme da vidi verify logiku.
 */

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

if (!defined('BW_BPW_SLUG')) {
    define('BW_BPW_SLUG', 'bulk-price-wizard');
}

if (!function_exists('__')) {
    function __(string $text, ?string $domain = null): string
    {
        return $text;
    }
}

if (!function_exists('esc_html')) {
    function esc_html(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES);
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        /** @var array<string, string[]> */
        private array $errors = [];

        public function add(string $code, string $message): void
        {
            $this->errors[$code][] = $message;
        }

        public function has_errors(): bool
        {
            return count($this->errors) > 0;
        }
    }
}
