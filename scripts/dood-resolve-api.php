<?php
/**
 * Doodstream resolve API for shared hosting (bukan VPS).
 *
 * Upload file ini ke hosting yang sama dengan API (contoh agendracin.web.id),
 * lalu di Vercel set:
 *   DOOD_RESOLVER_URL=https://agendracin.web.id/dood-resolve-api.php
 *
 * Test:
 *   https://domain-anda/dood-resolve-api.php?url=https://dsvplay.com/e/FILECODE
 *
 * Response JSON (dipakai Next.js /api/dood/resolve):
 *   { ok, fileCode, direct, referer, poster, title }
 */
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, ngrok-skip-browser-warning');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const DOOD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DOOD_BOOTSTRAP = [
    'https://playmogo.com',
    'https://dsvplay.com',
    'https://doodstream.com',
    'https://dood.li',
    'https://dooood.com',
];

try {
    $inputUrl = trim((string) ($_GET['url'] ?? ''));
    if ($inputUrl === '') {
        throw new InvalidArgumentException('Parameter url wajib');
    }
    $resolved = resolveDoodStreamApi($inputUrl);
    echo json_encode(['ok' => true] + $resolved, JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_SLASHES);
}

function extractDoodFileCode(string $url): ?string
{
    $url = trim($url);
    if ($url === '') {
        return null;
    }
    if (preg_match('/^[a-zA-Z0-9]{8,20}$/', $url)) {
        return $url;
    }
    if (!preg_match('#^https?://#i', $url)) {
        $url = 'https://' . $url;
    }
    $parts = parse_url($url);
    if ($parts === false || empty($parts['host'])) {
        return null;
    }
    $host = strtolower((string) $parts['host']);
    if (!preg_match('/dood|ds2play|ds2video|dsvplay|playmogo|d0000?d/i', $host)) {
        return null;
    }
    $path = $parts['path'] ?? '';
    if (preg_match('#/(?:e|d|play|f)/([a-zA-Z0-9]+)#', $path, $m)) {
        return $m[1];
    }
    if (preg_match('#/([a-zA-Z0-9]{8,20})/?$#', $path, $m)) {
        return $m[1];
    }
    return null;
}

function doodOrigin(?string $sourceUrl = null): string
{
    $host = 'dsvplay.com';
    if ($sourceUrl && !preg_match('/^[a-zA-Z0-9]{8,20}$/', trim($sourceUrl))) {
        $normalized = preg_match('#^https?://#i', $sourceUrl) ? $sourceUrl : 'https://' . $sourceUrl;
        $parsed = parse_url($normalized);
        if (!empty($parsed['host'])) {
            $host = strtolower((string) $parsed['host']);
        }
    }
    return 'https://' . $host;
}

function findCurlBinary(): ?string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached === '' ? null : $cached;
    }
    $candidates = [];
    if (PHP_OS_FAMILY === 'Windows') {
        $candidates[] = 'C:\\Windows\\System32\\curl.exe';
        $candidates[] = 'curl.exe';
    }
    $candidates[] = 'curl';
    foreach ($candidates as $bin) {
        if ($bin !== 'curl' && $bin !== 'curl.exe' && !is_file($bin)) {
            continue;
        }
        $out = [];
        $code = 1;
        @exec(escapeshellarg($bin) . ' --version', $out, $code);
        if ($code === 0) {
            $cached = $bin;
            return $bin;
        }
    }
    $cached = '';
    return null;
}

function httpRequest(string $url, array $opts = []): array
{
    $bin = findCurlBinary();
    if ($bin !== null) {
        return httpRequestCli($bin, $url, $opts);
    }
    return httpRequestPhp($url, $opts);
}

function httpRequestCli(string $bin, string $url, array $opts = []): array
{
    $bodyFile = tempnam(sys_get_temp_dir(), 'doodb');
    $args = [
        escapeshellarg($bin),
        '-sL',
        '--compressed',
        '--http1.1',
        '--max-redirs', '8',
        '--connect-timeout', '15',
        '--max-time', (string) ($opts['timeout'] ?? 45),
        '-A', escapeshellarg(DOOD_UA),
        '-o', escapeshellarg($bodyFile),
        '-w', escapeshellarg("%{http_code}\n%{url_effective}"),
    ];
    if (!empty($opts['referer'])) {
        $args[] = '-e';
        $args[] = escapeshellarg($opts['referer']);
    }
    if (!empty($opts['cookieFile'])) {
        $args[] = '-c';
        $args[] = escapeshellarg($opts['cookieFile']);
        $args[] = '-b';
        $args[] = escapeshellarg($opts['cookieFile']);
    }
    foreach (($opts['headers'] ?? []) as $k => $v) {
        $line = is_int($k) ? $v : ($k . ': ' . $v);
        $args[] = '-H';
        $args[] = escapeshellarg($line);
    }
    $args[] = escapeshellarg($url);
    $meta = [];
    $code = 1;
    exec(implode(' ', $args) . ' 2>&1', $meta, $code);
    $body = is_file($bodyFile) ? (string) file_get_contents($bodyFile) : '';
    @unlink($bodyFile);
    if ($code !== 0 && $body === '') {
        throw new RuntimeException('curl CLI gagal: ' . implode("\n", $meta));
    }
    return [
        'body' => $body,
        'status' => isset($meta[0]) ? (int) $meta[0] : 0,
        'url' => $meta[1] ?? $url,
    ];
}

function httpRequestPhp(string $url, array $opts = []): array
{
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('cURL PHP tidak tersedia');
    }
    $headerLines = [];
    foreach (($opts['headers'] ?? []) as $k => $v) {
        $headerLines[] = is_int($k) ? $v : ($k . ': ' . $v);
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => $opts['timeout'] ?? 30,
        CURLOPT_USERAGENT => DOOD_UA,
        CURLOPT_HTTPHEADER => $headerLines,
        CURLOPT_ENCODING => '',
    ]);
    if (!empty($opts['referer'])) {
        curl_setopt($ch, CURLOPT_REFERER, $opts['referer']);
    }
    if (!empty($opts['cookieFile'])) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $opts['cookieFile']);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $opts['cookieFile']);
    }
    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Request gagal: ' . $err);
    }
    $info = [
        'body' => (string) $body,
        'status' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE),
        'url' => (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL),
    ];
    curl_close($ch);
    return $info;
}

function uniqueOrigins(string $inputUrl): array
{
    $primary = doodOrigin($inputUrl);
    $ordered = array_merge([$primary], DOOD_BOOTSTRAP);
    $seen = [];
    $out = [];
    foreach ($ordered as $origin) {
        $key = strtolower(rtrim($origin, '/'));
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = rtrim($origin, '/');
    }
    return $out;
}

function resolveDoodStreamApi(string $inputUrl): array
{
    $fileCode = extractDoodFileCode($inputUrl);
    if ($fileCode === null) {
        throw new InvalidArgumentException('URL / file code Doodstream tidak valid');
    }

    $cookieFile = tempnam(sys_get_temp_dir(), 'doodck');
    $lastError = null;

    try {
        foreach (uniqueOrigins($inputUrl) as $origin) {
            try {
                $embedUrl = $origin . '/e/' . rawurlencode($fileCode);
                $page = httpRequest($embedUrl, [
                    'referer' => $origin . '/',
                    'cookieFile' => $cookieFile,
                    'headers' => ['Accept: text/html'],
                ]);
                $html = str_replace('\\/', '/', $page['body']);

                if (!preg_match('#(/pass_md5/[a-zA-Z0-9_./-]+)#', $html, $pm)) {
                    if (preg_match('#Just a moment|cf-turnstile|challenge-platform#i', $html)) {
                        $lastError = new RuntimeException(
                            'Cloudflare memblokir IP hosting ini. Pakai resolver Impit di PC: npm run dood-resolver + cloudflared tunnel, lalu set DOOD_RESOLVER_URL di Vercel.',
                        );
                    } else {
                        $lastError = new RuntimeException('pass_md5 tidak ditemukan (HTTP ' . $page['status'] . ') @ ' . $origin);
                    }
                    continue;
                }
                $passPath = $pm[1];
                $token = null;
                if (preg_match('#/pass_md5/[^\'"\s]+/([a-zA-Z0-9]+)#', $passPath, $tm)) {
                    $token = $tm[1];
                } elseif (preg_match('#[?&]token=([a-zA-Z0-9]+)#', $html, $tm)) {
                    $token = $tm[1];
                }
                if (!$token) {
                    $lastError = new RuntimeException('Token playback tidak ditemukan');
                    continue;
                }

                $finalParts = parse_url($page['url']);
                $playOrigin = (!empty($finalParts['scheme']) && !empty($finalParts['host']))
                    ? ($finalParts['scheme'] . '://' . $finalParts['host'])
                    : $origin;

                $pass = httpRequest($playOrigin . $passPath, [
                    'referer' => $playOrigin . '/e/' . $fileCode,
                    'cookieFile' => $cookieFile,
                    'headers' => [
                        'X-Requested-With: XMLHttpRequest',
                        'Accept: */*',
                    ],
                ]);
                $cdnPrefix = trim($pass['body']);
                if ($cdnPrefix === '' || stripos($cdnPrefix, 'http') !== 0) {
                    $lastError = new RuntimeException('Respons pass_md5 invalid');
                    continue;
                }

                $rand = '';
                $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                for ($i = 0; $i < 10; $i++) {
                    $rand .= $alphabet[random_int(0, strlen($alphabet) - 1)];
                }
                $direct = $cdnPrefix . $rand . '?token=' . rawurlencode($token) . '&expiry=' . (string) (int) round(microtime(true) * 1000);

                $poster = null;
                if (preg_match('#(?:og:image|twitter:image)["\'\s]+content=["\']([^"\']+)#i', $html, $im)) {
                    $poster = $im[1];
                }

                $title = 'Doodstream';
                if (preg_match('#<title>(.*?)</title>#is', $html, $tm)) {
                    $title = html_entity_decode(trim(preg_replace('/\s*-\s*DoodStream.*$/i', '', $tm[1])), ENT_QUOTES, 'UTF-8');
                }

                return [
                    'fileCode' => $fileCode,
                    'direct' => $direct,
                    'referer' => $playOrigin . '/',
                    'poster' => $poster,
                    'title' => $title,
                ];
            } catch (Throwable $e) {
                $lastError = $e;
            }
        }
        throw $lastError ?? new RuntimeException('Gagal resolve Doodstream');
    } finally {
        if (is_file($cookieFile)) {
            @unlink($cookieFile);
        }
    }
}
