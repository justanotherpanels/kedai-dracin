<?php
declare(strict_types=1);

const DOOD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const STREAM_SECRET = 'doodplayer-change-me-in-production';
const STREAM_TTL = 7200;

$api = $_GET['api'] ?? '';

if ($api === 'resolve') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    try {
        $inputUrl = trim((string) ($_GET['url'] ?? ''));
        $resolved = resolveDoodStream($inputUrl);
        $ticket = createStreamTicket($resolved['direct'], $resolved['referer']);
        echo json_encode([
            'ok' => true,
            'fileCode' => $resolved['fileCode'],
            'poster' => $resolved['poster'],
            'title' => $resolved['title'],
            'type' => 'video/mp4',
            'src' => streamUrl($ticket),
        ], JSON_UNESCAPED_SLASHES);
    } catch (Throwable $e) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_SLASHES);
    }
    exit;
}

if ($api === 'stream') {
    proxyStream((string) ($_GET['t'] ?? ''));
    exit;
}

$inputUrl = trim((string) ($_GET['url'] ?? $_POST['url'] ?? ''));
$error = null;
$fileCode = null;

if ($inputUrl !== '') {
    $fileCode = extractDoodFileCode($inputUrl);
    if ($fileCode === null) {
        $error = 'URL Doodstream tidak valid. Contoh: https://dsvplay.com/e/u72giyvexbn7';
    }
}

/* ───────────────── helpers ───────────────── */

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
    $host = strtolower($parts['host']);
    $doodHosts = [
        'doodstream.com', 'dood.stream', 'dood.so', 'dood.la', 'dood.ws',
        'dood.wf', 'dood.cx', 'dood.sh', 'dood.pm', 'dood.li', 'dood.yt',
        'dood.watch', 'dood.to', 'doods.pro', 'ds2play.com', 'ds2video.com',
        'dsvplay.com', 'dooood.com', 'doodcdn.com', 'd000d.com', 'dood.video',
    ];
    $isDood = false;
    foreach ($doodHosts as $allowed) {
        if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
            $isDood = true;
            break;
        }
    }
    if (!$isDood && !preg_match('/dood|ds2play|ds2video|dsvplay/i', $host)) {
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
    if ($sourceUrl) {
        $normalized = preg_match('#^https?://#i', $sourceUrl) ? $sourceUrl : 'https://' . $sourceUrl;
        $parsed = parse_url($normalized);
        if (!empty($parsed['host']) && !preg_match('/^[a-zA-Z0-9]{8,20}$/', $sourceUrl)) {
            $host = strtolower($parsed['host']);
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
        $cmd = escapeshellarg($bin) . ' --version';
        $out = [];
        $code = 1;
        @exec($cmd, $out, $code);
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
    // curl CLI bypasses Cloudflare TLS fingerprint yang sering memblokir PHP cURL
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
        '--max-redirs', '8',
        '--connect-timeout', '15',
        '--max-time', (string) ($opts['timeout'] ?? 45),
        '-A', escapeshellarg(DOOD_UA),
        '-o', escapeshellarg($bodyFile),
        '-w', escapeshellarg('%{http_code}\n%{url_effective}\n%{content_type}'),
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
    if (!empty($opts['range'])) {
        $args[] = '-r';
        $args[] = escapeshellarg($opts['range']);
    }

    $headers = $opts['headers'] ?? [];
    foreach ($headers as $k => $v) {
        $line = is_int($k) ? $v : ($k . ': ' . $v);
        $args[] = '-H';
        $args[] = escapeshellarg($line);
    }

    $args[] = escapeshellarg($url);
    $cmd = implode(' ', $args) . ' 2>&1';
    $meta = [];
    $code = 1;
    exec($cmd, $meta, $code);

    $body = is_file($bodyFile) ? (string) file_get_contents($bodyFile) : '';
    @unlink($bodyFile);

    if ($code !== 0 && $body === '') {
        throw new RuntimeException('curl CLI gagal: ' . implode("\n", $meta));
    }

    $status = isset($meta[0]) ? (int) $meta[0] : 0;
    $finalUrl = $meta[1] ?? $url;
    $contentType = $meta[2] ?? '';

    return [
        'body' => $body,
        'status' => $status,
        'url' => $finalUrl,
        'headers' => [],
        'content_type' => $contentType,
    ];
}

function httpRequestPhp(string $url, array $opts = []): array
{
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('cURL tidak tersedia');
    }

    $headers = $opts['headers'] ?? [];
    $headerLines = [];
    foreach ($headers as $k => $v) {
        $headerLines[] = is_int($k) ? $v : ($k . ': ' . $v);
    }

    $responseHeaders = [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 8,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => $opts['timeout'] ?? 30,
        CURLOPT_USERAGENT => DOOD_UA,
        CURLOPT_HTTPHEADER => $headerLines,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
            $len = strlen($line);
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
            return $len;
        },
    ]);

    if (!empty($opts['referer'])) {
        curl_setopt($ch, CURLOPT_REFERER, $opts['referer']);
    }
    if (!empty($opts['cookieFile'])) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $opts['cookieFile']);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $opts['cookieFile']);
    }
    if (!empty($opts['range'])) {
        curl_setopt($ch, CURLOPT_RANGE, $opts['range']);
    }

    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Request gagal: ' . $err);
    }

    $info = [
        'body' => $body,
        'status' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE),
        'url' => (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL),
        'headers' => $responseHeaders,
        'content_type' => (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE),
    ];
    curl_close($ch);
    return $info;
}

function resolveDoodStream(string $inputUrl): array
{
    $fileCode = extractDoodFileCode($inputUrl);
    if ($fileCode === null) {
        throw new InvalidArgumentException('URL / file code Doodstream tidak valid');
    }

    $origin = doodOrigin($inputUrl);
    $embedUrl = $origin . '/e/' . rawurlencode($fileCode);
    $cookieFile = tempnam(sys_get_temp_dir(), 'doodck');

    try {
        $page = httpRequest($embedUrl, [
            'referer' => $origin . '/',
            'cookieFile' => $cookieFile,
            'headers' => ['Accept: text/html'],
        ]);
        $html = $page['body'];
        $finalUrl = $page['url'];
        $finalParts = parse_url($finalUrl);
        $playOrigin = (!empty($finalParts['scheme']) && !empty($finalParts['host']))
            ? ($finalParts['scheme'] . '://' . $finalParts['host'])
            : $origin;

        if (!preg_match('#(/pass_md5/[a-zA-Z0-9_./-]+)#', $html, $pm)) {
            if (preg_match('#Just a moment|cf-turnstile|challenge-platform#i', $html)) {
                throw new RuntimeException('Cloudflare memblokir resolve. Pastikan curl.exe tersedia di PATH (Windows).');
            }
            throw new RuntimeException('pass_md5 tidak ditemukan di halaman embed (HTTP ' . $page['status'] . ')');
        }
        $passPath = $pm[1];

        $token = null;
        if (preg_match('#/pass_md5/[^\'"\s]+/([a-zA-Z0-9]+)#', $passPath, $tm)) {
            $token = $tm[1];
        } elseif (preg_match('#[?&]token=([a-zA-Z0-9]+)#', $html, $tm)) {
            $token = $tm[1];
        }
        if (!$token) {
            throw new RuntimeException('Token playback tidak ditemukan');
        }

        $poster = null;
        if (preg_match('#(?:og:image|twitter:image)["\'\s]+content=["\']([^"\']+)#i', $html, $im)) {
            $poster = $im[1];
        } elseif (preg_match('#content=["\'](https://[^"\']+(?:snaps|splash)[^"\']+)["\']#i', $html, $im)) {
            $poster = $im[1];
        }

        $title = 'Doodstream';
        if (preg_match('#<title>(.*?)</title>#is', $html, $tm)) {
            $title = html_entity_decode(trim(preg_replace('/\s*-\s*DoodStream.*$/i', '', $tm[1])), ENT_QUOTES, 'UTF-8');
        }

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
            throw new RuntimeException('Respons pass_md5 invalid (rate-limit / token habis). Coba lagi.');
        }

        $rand = '';
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for ($i = 0; $i < 10; $i++) {
            $rand .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $expiry = (string) (int) round(microtime(true) * 1000);
        $direct = $cdnPrefix . $rand . '?token=' . rawurlencode($token) . '&expiry=' . $expiry;

        return [
            'fileCode' => $fileCode,
            'direct' => $direct,
            'referer' => $playOrigin . '/',
            'poster' => $poster,
            'title' => $title,
        ];
    } finally {
        if (is_file($cookieFile)) {
            @unlink($cookieFile);
        }
    }
}

function createStreamTicket(string $direct, string $referer): string
{
    $payload = [
        'u' => $direct,
        'r' => $referer,
        'e' => time() + STREAM_TTL,
    ];
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $b64 = rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
    $sig = hash_hmac('sha256', $b64, STREAM_SECRET);
    return $b64 . '.' . $sig;
}

function parseStreamTicket(string $ticket): array
{
    $parts = explode('.', $ticket, 2);
    if (count($parts) !== 2) {
        throw new InvalidArgumentException('Ticket stream invalid');
    }
    [$b64, $sig] = $parts;
    $expect = hash_hmac('sha256', $b64, STREAM_SECRET);
    if (!hash_equals($expect, $sig)) {
        throw new InvalidArgumentException('Signature stream invalid');
    }
    $pad = strlen($b64) % 4;
    if ($pad) {
        $b64 .= str_repeat('=', 4 - $pad);
    }
    $json = base64_decode(strtr($b64, '-_', '+/'), true);
    $data = json_decode((string) $json, true);
    if (!is_array($data) || empty($data['u']) || empty($data['r']) || empty($data['e'])) {
        throw new InvalidArgumentException('Payload stream invalid');
    }
    if ((int) $data['e'] < time()) {
        throw new RuntimeException('Ticket stream expired — refresh halaman');
    }
    return $data;
}

function streamUrl(string $ticket): string
{
    $script = $_SERVER['SCRIPT_NAME'] ?? '/index.php';
    return $script . '?api=stream&t=' . rawurlencode($ticket);
}

function proxyStream(string $ticket): void
{
    try {
        $data = parseStreamTicket($ticket);
    } catch (Throwable $e) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo $e->getMessage();
        return;
    }

    $direct = $data['u'];
    $referer = $data['r'];
    $rangeHeader = $_SERVER['HTTP_RANGE'] ?? null;

    $ch = curl_init($direct);
    if ($ch === false) {
        http_response_code(500);
        echo 'cURL error';
        return;
    }

    $reqHeaders = [
        'User-Agent: ' . DOOD_UA,
        'Accept: */*',
        'Connection: close',
    ];
    if ($rangeHeader) {
        $reqHeaders[] = 'Range: ' . $rangeHeader;
    }

    $statusLine = null;
    $forwardHeaders = [];
    $headersSent = false;

    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_REFERER => $referer,
        CURLOPT_USERAGENT => DOOD_UA,
        CURLOPT_HTTPHEADER => $reqHeaders,
        CURLOPT_HEADERFUNCTION => static function ($ch, string $header) use (&$statusLine, &$forwardHeaders, &$headersSent): int {
            $len = strlen($header);
            if (preg_match('#^HTTP/\d#i', $header)) {
                $statusLine = trim($header);
                return $len;
            }
            $parts = explode(':', $header, 2);
            if (count($parts) === 2) {
                $name = strtolower(trim($parts[0]));
                $value = trim($parts[1]);
                if (in_array($name, [
                    'content-type', 'content-length', 'content-range',
                    'accept-ranges', 'etag', 'last-modified', 'cache-control',
                ], true)) {
                    $forwardHeaders[$name] = $value;
                }
            }
            return $len;
        },
        CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$statusLine, &$forwardHeaders, &$headersSent): int {
            if (!$headersSent) {
                $code = 200;
                if ($statusLine && preg_match('#\s(\d{3})\s#', $statusLine, $m)) {
                    $code = (int) $m[1];
                }
                http_response_code($code);
                foreach ($forwardHeaders as $name => $value) {
                    header($name . ': ' . $value);
                }
                header('Access-Control-Allow-Origin: *');
                header('Accept-Ranges: bytes');
                if (!isset($forwardHeaders['content-type'])) {
                    header('Content-Type: video/mp4');
                }
                $headersSent = true;
            }
            echo $chunk;
            if (function_exists('fastcgi_finish_request') === false) {
                flush();
            }
            return strlen($chunk);
        },
    ]);

    $ok = curl_exec($ch);
    if ($ok === false && !$headersSent) {
        http_response_code(502);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Gagal proxy stream: ' . curl_error($ch);
    }
    curl_close($ch);
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>DoodPlayer — Video.js</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video-js.min.css" rel="stylesheet">
  <style>
    :root {
      --bg-0: #0a0c10;
      --ink: #f2f4f8;
      --muted: #8b93a7;
      --accent: #3dffa8;
      --accent-dim: rgba(61, 255, 168, 0.14);
      --danger: #ff6b7a;
      --glass: rgba(18, 22, 31, 0.72);
      --ring: rgba(61, 255, 168, 0.35);
      --font-display: "Syne", sans-serif;
      --font-body: "DM Sans", sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; background: var(--bg-0); color: var(--ink); font-family: var(--font-body); }
    body {
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(61, 255, 168, 0.12), transparent 55%),
        radial-gradient(ellipse 60% 40% at 100% 80%, rgba(80, 120, 255, 0.08), transparent 50%),
        linear-gradient(180deg, #0d1018 0%, var(--bg-0) 40%, #080a0e 100%);
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.25rem 1rem 2rem;
      overflow-x: hidden;
    }
    .brand {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: clamp(1.75rem, 5vw, 2.35rem);
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 0.35rem;
      animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .brand span { color: var(--accent); }
    .tagline {
      color: var(--muted);
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      text-align: center;
      max-width: 24rem;
      animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
    }
    .shell {
      width: min(100%, 420px);
      display: flex;
      flex-direction: column;
      gap: 1rem;
      animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.14s both;
    }
    .url-form { display: flex; flex-direction: column; gap: 0.65rem; }
    .url-form label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .row { display: flex; gap: 0.5rem; }
    .url-form input {
      flex: 1;
      min-width: 0;
      background: var(--glass);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0.85rem 1rem;
      color: var(--ink);
      font: inherit;
      font-size: 0.9rem;
      outline: none;
      backdrop-filter: blur(12px);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .url-form input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--ring);
    }
    .url-form button {
      flex-shrink: 0;
      background: var(--accent);
      color: #06140e;
      border: none;
      border-radius: 12px;
      padding: 0 1.15rem;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      transition: transform 0.15s, filter 0.15s;
    }
    .url-form button:hover { filter: brightness(1.08); }
    .url-form button:active { transform: scale(0.97); }
    .url-form button:disabled { opacity: 0.55; cursor: wait; }
    .error {
      color: var(--danger);
      font-size: 0.85rem;
      background: rgba(255, 107, 122, 0.1);
      border: 1px solid rgba(255, 107, 122, 0.25);
      border-radius: 10px;
      padding: 0.7rem 0.85rem;
    }
    .player {
      position: relative;
      align-self: center;
      height: min(78dvh, 720px);
      width: calc(min(78dvh, 720px) * 0.5625);
      max-width: 100%;
      background: #000;
      overflow: hidden;
      animation: rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    .player-stage {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: #000;
    }
    #player-wrap {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .player-stage .video-js,
    .player-stage .video-js.vjs-fill {
      position: absolute !important;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      background: #000;
      font-family: var(--font-body);
    }
    .player-stage .video-js .vjs-tech {
      object-fit: contain;
      width: 100% !important;
      height: 100% !important;
      background: #000;
    }
    .player-stage .vjs-poster {
      background-size: contain;
      background-color: #000;
    }
    .player-stage .vjs-big-play-button {
      background: var(--accent-dim) !important;
      border: 1px solid rgba(61, 255, 168, 0.4) !important;
      border-radius: 50%;
      width: 4rem;
      height: 4rem;
      line-height: 4rem;
      margin-left: -2rem;
      margin-top: -2rem;
      color: var(--accent) !important;
      font-size: 2rem;
    }
    .player-stage .vjs-control-bar {
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));
      height: 3.2rem;
    }
    .player-stage .vjs-play-progress,
    .player-stage .vjs-volume-level {
      background: var(--accent);
    }
    .empty-state, .loading-state {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 2rem;
      text-align: center;
      background:
        linear-gradient(160deg, rgba(61, 255, 168, 0.06), transparent 40%),
        #0c0e14;
      z-index: 4;
    }
    .empty-state[hidden], .loading-state[hidden], #player-wrap[hidden] { display: none !important; }
    .play-glyph, .spinner {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--accent-dim);
      border: 1px solid rgba(61, 255, 168, 0.35);
      display: grid;
      place-items: center;
    }
    .play-glyph { animation: pulse 2.4s ease-in-out infinite; }
    .play-glyph svg { width: 28px; height: 28px; margin-left: 3px; fill: var(--accent); }
    .spinner {
      border-top-color: var(--accent);
      animation: spin 0.8s linear infinite;
      background: transparent;
    }
    .empty-state h2, .loading-state h2 {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .empty-state p, .loading-state p {
      color: var(--muted);
      font-size: 0.88rem;
      line-height: 1.45;
      max-width: 16rem;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .meta code {
      font-family: ui-monospace, monospace;
      font-size: 0.78rem;
      color: var(--accent);
      background: var(--accent-dim);
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      max-width: 55%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toolbar { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
    .toolbar button {
      appearance: none;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--ink);
      border-radius: 10px;
      padding: 0.45rem 0.75rem;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
    }
    .hint {
      font-size: 0.78rem;
      color: var(--muted);
      text-align: center;
      line-height: 1.4;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(61, 255, 168, 0.35); }
      50% { box-shadow: 0 0 0 14px rgba(61, 255, 168, 0); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 420px) {
      .player {
        width: 100%;
        height: calc(100vw * 16 / 9);
        max-height: 78dvh;
      }
      body { padding: 0.85rem 0.65rem 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="brand">Dood<span>Player</span></div>
  <p class="tagline">Player vertikal Video.js untuk URL Doodstream.</p>

  <div class="shell">
    <form class="url-form" id="play-form" method="get" action="">
      <label for="url">URL Doodstream</label>
      <div class="row">
        <input
          type="text"
          id="url"
          name="url"
          placeholder="https://dsvplay.com/e/u72giyvexbn7"
          value="<?= htmlspecialchars($inputUrl, ENT_QUOTES, 'UTF-8') ?>"
          autocomplete="off"
          spellcheck="false"
          required
        >
        <button type="submit" id="play-btn">Play</button>
      </div>
    </form>

    <div class="error" id="error-box" <?= $error ? '' : 'hidden' ?>><?= $error ? htmlspecialchars($error, ENT_QUOTES, 'UTF-8') : '' ?></div>

    <div class="player" id="player-box">
      <div class="player-stage">
        <div class="empty-state" id="empty-state" <?= $fileCode ? 'hidden' : '' ?>>
          <div class="play-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <h2>Siap diputar</h2>
          <p>Tempel link Doodstream, lalu Play.</p>
        </div>

        <div class="loading-state" id="loading-state" hidden>
          <div class="spinner" aria-hidden="true"></div>
          <h2>Mengambil stream…</h2>
          <p>Menyiapkan Video.js.</p>
        </div>

        <div id="player-wrap" hidden>
          <video
            id="player"
            class="video-js vjs-big-play-centered"
            controls
            playsinline
            preload="auto"
          ></video>
        </div>
      </div>
    </div>

    <div class="meta" id="meta-row" <?= $fileCode ? '' : 'hidden' ?>>
      <code id="file-code"><?= $fileCode ? htmlspecialchars($fileCode, ENT_QUOTES, 'UTF-8') : '' ?></code>
      <div class="toolbar">
        <button type="button" id="reload-btn">Reload stream</button>
        <button type="button" id="fs-btn">Fullscreen</button>
      </div>
    </div>

    <p class="hint">Video.js + proxy MP4 (CDN Doodstream butuh Referer). HLS otomatis jika source .m3u8.</p>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/video.js@8.21.0/dist/video.min.js"></script>
  <script>
    (function () {
      const form = document.getElementById('play-form');
      const urlInput = document.getElementById('url');
      const playBtn = document.getElementById('play-btn');
      const errorBox = document.getElementById('error-box');
      const emptyState = document.getElementById('empty-state');
      const loadingState = document.getElementById('loading-state');
      const playerWrap = document.getElementById('player-wrap');
      const metaRow = document.getElementById('meta-row');
      const fileCodeEl = document.getElementById('file-code');
      const playerBox = document.getElementById('player-box');
      const initialUrl = <?= json_encode($inputUrl, JSON_UNESCAPED_SLASHES) ?>;
      const hasValidCode = <?= json_encode((bool) $fileCode) ?>;

      let player = null;

      function showError(msg) {
        errorBox.hidden = !msg;
        errorBox.textContent = msg || '';
      }

      function setUi(mode) {
        emptyState.hidden = mode !== 'empty';
        loadingState.hidden = mode !== 'loading';
        playerWrap.hidden = mode !== 'player';
      }

      function ensurePlayer() {
        if (player) return player;
        player = videojs('player', {
          controls: true,
          fluid: false,
          fill: true,
          preload: 'auto',
          playsinline: true,
          html5: {
            vhs: { overrideNative: true },
            nativeAudioTracks: false,
            nativeVideoTracks: false,
          },
        });
        return player;
      }

      function fitPlayer(p) {
        const w = playerBox.clientWidth || 360;
        const h = playerBox.clientHeight || 640;
        p.dimensions(w, h);
        p.trigger('resize');
      }

      async function loadStream(url) {
        showError('');
        setUi('loading');
        playBtn.disabled = true;
        metaRow.hidden = false;

        try {
          const endpoint = new URL(window.location.href);
          endpoint.search = '';
          endpoint.searchParams.set('api', 'resolve');
          endpoint.searchParams.set('url', url);

          const res = await fetch(endpoint.toString(), { credentials: 'same-origin' });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Gagal resolve');

          fileCodeEl.textContent = data.fileCode || '';
          setUi('player');

          const p = ensurePlayer();
          fitPlayer(p);
          p.poster(data.poster || '');
          p.src({ src: data.src, type: data.type || 'video/mp4' });
          await p.ready();
          fitPlayer(p);
          requestAnimationFrame(function () { fitPlayer(p); });
          try { await p.play(); } catch (_) { /* autoplay blocked */ }
        } catch (err) {
          setUi('empty');
          showError(err.message || String(err));
        } finally {
          playBtn.disabled = false;
        }
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) return;
        const next = new URL(window.location.href);
        next.searchParams.set('url', url);
        history.replaceState(null, '', next.toString());
        loadStream(url);
      });

      document.getElementById('reload-btn').addEventListener('click', function () {
        const url = urlInput.value.trim();
        if (url) loadStream(url);
      });

      document.getElementById('fs-btn').addEventListener('click', function () {
        if (player && !player.isDisposed()) {
          if (player.isFullscreen()) player.exitFullscreen();
          else player.requestFullscreen();
          return;
        }
        if (!document.fullscreenElement) playerBox.requestFullscreen?.();
        else document.exitFullscreen?.();
      });

      if (hasValidCode && initialUrl) {
        loadStream(initialUrl);
      }
    })();
  </script>
</body>
</html>
