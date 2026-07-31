# API Website (Next.js) — Dokumentasi

Base URL:

```text
{APP_URL}/api/v2
```

Contoh lokal: `http://127.0.0.1:8000/api/v2`

Format response umum:

```json
{
  "status": "success",
  "data": {},
  "message": null
}
```

Error:

```json
{
  "status": "error",
  "message": "Pesan error",
  "code": "optional_code"
}
```

---

## Autentikasi

Endpoint publik (auth, sebagian drama/dashboard publik) memakai `Accept: application/json`.

Endpoint yang butuh login memakai:

```http
Authorization: Bearer {access_token}
Accept: application/json
```

Token didapat dari login/register (Laravel Sanctum).  
`device_name` default: `website`.

> API Website (`/api/v2`) terpisah dari API Mobile (`/api/v1/mobile`) dan API consumer membership (`/api/v1` + API key).

---

## 1. Auth

### 1.1 Login

`POST /api/v2/auth/login`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| email | string | ya |
| password | string | ya |
| device_name | string | tidak (default: `website`) |

**Response 200**

```json
{
  "status": "success",
  "data": {
    "token": "1|xxxxxxxx",
    "token_type": "Bearer",
    "user": {
      "id": 1,
      "name": "Budi",
      "email": "budi@mail.com",
      "coin": 25
    }
  }
}
```

### 1.2 Register

`POST /api/v2/auth/register`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| name | string | ya |
| email | string | ya |
| password | string | ya |
| password_confirmation | string | ya |

**Response 201** — sama seperti login (langsung dapat token).

### 1.3 Forgot Password

`POST /api/v2/auth/forgot-password`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| email | string | ya |

**Response 200**

```json
{
  "status": "success",
  "message": "Jika email terdaftar, link reset password telah dikirim."
}
```

---

## 2. Dashboard

Endpoint dashboard bisa **publik** (tanpa login). Jika Bearer dikirim, field `is_saved` / `is_liked` diisi sesuai user.

### 2.1 Slider Drama

`GET /api/v2/dashboard/slider`

Dari tabel `sliders` (`id`, `id_drama`).

**Response 200**

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "id_drama": 69,
      "drama": {
        "id": 69,
        "title": "Mendadak Jadi Istri Miliuner",
        "slug": "mendadak-jadi-istri-miliuner",
        "banner_url": "https://ik.imagekit.io/...",
        "total_episodes": 60,
        "likes_count": 120
      }
    }
  ]
}
```

### 2.2 List Drama (Dashboard)

`GET /api/v2/dashboard/drama`

**Query**

| Field | Type | Keterangan |
|---|---|---|
| page | int | default 1 |
| limit | int | default 15, max 50 |
| search | string | opsional |
| provider_id | int | opsional |

**Response 200**

```json
{
  "status": "success",
  "data": [
    {
      "id": 69,
      "title": "Mendadak Jadi Istri Miliuner",
      "slug": "mendadak-jadi-istri-miliuner",
      "banner_url": "https://ik.imagekit.io/...",
      "description": "...",
      "total_episodes": 60,
      "likes_count": 120,
      "provider": {
        "id": 1,
        "name": "Dramabox"
      },
      "is_saved": false,
      "is_liked": false
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 15,
    "total": 75
  }
}
```

---

## 3. Saved Drama

Bearer token wajib.

### 3.1 Add Save

`POST /api/v2/saved-drama`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| id_drama | int | ya |

**Response 200**

```json
{
  "status": "success",
  "message": "Drama disimpan.",
  "data": {
    "id": 10,
    "id_drama": 69
  }
}
```

### 3.2 Delete Save

`DELETE /api/v2/saved-drama/{id_drama}`

**Response 200**

```json
{
  "status": "success",
  "message": "Drama dihapus dari simpanan."
}
```

### 3.3 List Saved

`GET /api/v2/saved-drama`

---

## 4. Buy Coin

Bearer token wajib.

Pakai tabel `coin_packages` + `coin_transactions` + Payment Gateway yang sama dengan mobile.

### 4.1 My Coin

`GET /api/v2/coin`

Response menyertakan `packages` dan `payment_channels` (channel aktif dari payment gateway, termasuk QRIS & Virtual Account jika aktif di PG). Pakai `payment_channels[].code` sebagai `method` saat top-up.

**Response 200**

```json
{
  "status": "success",
  "data": {
    "coin": 25,
    "history": [
      {
        "id": 3,
        "type": "purchase",
        "amount": 50,
        "price": 10000,
        "status": "success",
        "created_at": "2026-07-24T10:00:00+00:00"
      }
    ],
    "packages": [
      {
        "id": 1,
        "name": "50 Coin",
        "coin": 50,
        "price": 10000
      }
    ],
    "payment_channels": [
      {
        "code": "QRIS",
        "name": "QRIS",
        "payment_type": "EWALLET",
        "icon_url": null,
        "fee_customer": null,
        "fee_merchant": null
      },
      {
        "code": "BNIVA",
        "name": "BNI Virtual Account",
        "payment_type": "VIRTUAL_ACCOUNT",
        "icon_url": null,
        "fee_customer": null,
        "fee_merchant": null
      }
    ]
  }
}
```

### 4.2 Add Coin (buat invoice top-up)

`POST /api/v2/coin`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| package_id | int | ya |
| method | string | ya (kode channel aktif dari PG) |

`method` harus kode channel aktif dari `GET /payment/channels` atau `payment_channels` di `GET /coin`. Metode tidak valid/tidak aktif → `422`.

Tagihan = `coin_packages.price`. Coin masuk = `coin_packages.coin` setelah lunas.

**Response 200**

```json
{
  "status": "success",
  "data": {
    "transaction_id": 101,
    "coin": 50,
    "amount": 10000,
    "status": "pending",
    "method": "QRIS",
    "payment_type": "EWALLET",
    "payment_url": "https://...",
    "qr_string": "00020101021226...",
    "qr_content": "00020101021226...",
    "qr_url": "https://.../qr.png",
    "qr_image": "https://.../qr.png",
    "va_number": null,
    "payment_code": null,
    "reference": "COIN-101",
    "gateway_reference": "T123456"
  }
}
```

Untuk QRIS, frontend pakai salah satu: `payment_url`, `qr_string`/`qr_content` (EMV), atau `qr_url`/`qr_image`.  
Untuk Virtual Account, pakai `va_number` / `payment_code`. Field yang tidak relevan bernilai `null`.

### 4.3 Canceled

`POST /api/v2/coin/{transaction_id}/cancel`

Hanya untuk transaksi berstatus `pending`.

**Response 200**

```json
{
  "status": "success",
  "message": "Transaksi coin dibatalkan.",
  "data": {
    "transaction_id": 101,
    "status": "canceled"
  }
}
```

---

## 5. Account

Bearer token wajib.

### 5.1 Edit Profile

`PUT /api/v2/account`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| name | string | tidak |
| email | string | tidak |
| password | string | tidak |
| password_confirmation | string | wajib jika password diisi |

**Response 200**

```json
{
  "status": "success",
  "message": "Akun diperbarui.",
  "data": {
    "id": 1,
    "name": "Budi Update",
    "email": "budi@mail.com",
    "coin": 25
  }
}
```

### 5.2 Delete Account

`DELETE /api/v2/account`

**Body (JSON, opsional)**

| Field | Type | Keterangan |
|---|---|---|
| password | string | konfirmasi password |

**Response 200**

```json
{
  "status": "success",
  "message": "Akun berhasil dihapus."
}
```

---

## 6. Payment Gateway

Bearer token wajib.

Integrasi dengan gateway yang sudah ada (`PG_BASE_URL`, `PG_API_KEY`, `PG_KODE_API`).

Channel (QRIS, Virtual Account, e-wallet, dll.) tidak di-hardcode — diambil dari PG. Hanya channel yang **aktif** yang dikembalikan.

### 6.1 Channel pembayaran aktif

`GET /api/v2/payment/channels`

**Response 200**

```json
{
  "status": "success",
  "data": {
    "channels": [
      {
        "code": "QRIS",
        "name": "QRIS",
        "payment_type": "EWALLET",
        "icon_url": null,
        "fee_customer": null,
        "fee_merchant": null
      },
      {
        "code": "BNIVA",
        "name": "BNI Virtual Account",
        "payment_type": "VIRTUAL_ACCOUNT",
        "icon_url": null,
        "fee_customer": null,
        "fee_merchant": null
      }
    ]
  }
}
```

Pakai `channels[].code` sebagai `method` di `POST /coin`.

### 6.2 Add (ambil info pembayaran)

`POST /api/v2/payment`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| type | string | ya (`coin`) |
| reference_id | int | ya (id transaksi coin) |
| method | string | tidak |

**Response 200**

```json
{
  "status": "success",
  "data": {
    "payment_id": 55,
    "status": "pending",
    "method": "BNIVA",
    "payment_type": "VIRTUAL_ACCOUNT",
    "payment_url": null,
    "qr_string": null,
    "qr_content": null,
    "qr_url": null,
    "qr_image": null,
    "va_number": "8808123456789012",
    "payment_code": "8808123456789012",
    "reference": "COIN-55",
    "gateway_reference": "T123456"
  }
}
```

### 6.3 Update (sinkron status)

`POST /api/v2/payment/{payment_id}/update`

**Response 200**

```json
{
  "status": "success",
  "data": {
    "payment_id": 55,
    "status": "success",
    "paid_at": "2026-07-24T11:00:00+00:00",
    "coin_balance": 75
  }
}
```

Status: `pending`, `success`, `failed`, `canceled`.

Webhook PG yang sama: `POST /webhook/payment` (prefix merchant `COIN-{id}`).

---

## 7. Play Drama

### 7.1 List Drama

`GET /api/v2/play/drama`

Query sama dashboard (`page`, `limit`, `search`, `provider_id`).  
Publik; Bearer opsional untuk `is_saved` / `is_liked`.

### 7.2 List Episode

`GET /api/v2/play/drama/{id_drama}/episode`

Bearer **disarankan** (untuk status unlock). Publik tetap boleh lihat daftar.

**Response 200**

```json
{
  "status": "success",
  "data": {
    "drama": {
      "id": 69,
      "title": "Mendadak Jadi Istri Miliuner",
      "slug": "mendadak-jadi-istri-miliuner",
      "banner_url": "https://...",
      "total_episodes": 60,
      "likes_count": 120,
      "is_liked": false
    },
    "episodes": [
      {
        "episode": 1,
        "name": "Episode 1",
        "type": "Free",
        "is_locked": false,
        "coin_cost": 0
      },
      {
        "episode": 21,
        "name": "Episode 21",
        "type": "VIP",
        "is_locked": true,
        "coin_cost": 5
      }
    ]
  }
}
```

### 7.3 Trending Drama

`GET /api/v2/play/trending`

Urutan berdasarkan aktivitas play / unlock terbaru (fallback: likes + total episode).

**Query**

| Field | Type | Keterangan |
|---|---|---|
| limit | int | default 10, max 30 |

**Response 200**

```json
{
  "status": "success",
  "data": [
    {
      "id": 69,
      "title": "Mendadak Jadi Istri Miliuner",
      "slug": "mendadak-jadi-istri-miliuner",
      "banner_url": "https://...",
      "total_episodes": 60,
      "likes_count": 120,
      "plays_count": 540,
      "provider": {
        "id": 1,
        "name": "Dramabox",
        "slug": "dramabox"
      }
    }
  ]
}
```

---

## 8. Free Play (aturan coin)

Aturan bisnis (sama mobile):

| Episode | Akses | Biaya | Login |
|---|---|---|---|
| 1 – 20 | Free play | 0 coin | Tidak wajib |
| 21+ | Berbayar (VIP) | **5 coin / episode** | **Wajib** |

Config: `MOBILE_FREE_EPISODES`, `MOBILE_COIN_PER_EPISODE` (atau alias `WEBSITE_*` jika nanti dipisah).

### 8.1 Play / Unlock Episode

`POST /api/v2/play/drama/{id_drama}/episode/{episode_number}`

Bearer **opsional** untuk episode Free; **wajib** untuk episode VIP.

**Body (JSON, opsional)**

| Field | Type | Keterangan |
|---|---|---|
| resolution | string | default `auto` |

**Logic**

1. Episode `<= 20` (Free) → boleh play **tanpa login**, beri `stream_url`, coin tidak berkurang. `coin_balance` = `0` jika guest.
2. Episode `> 20` (VIP) **tanpa Bearer** → `401` `login_required`.
3. Episode `> 20` (VIP) **dengan Bearer**:
   - sudah di-unlock → `stream_url` tanpa potong coin lagi.
   - belum → cek saldo `>= 5`, potong **5 coin**, catat unlock, beri `stream_url`.
4. Coin tidak cukup → `403` `insufficient_coin`.

**`stream_url` website** = URL mentah dari `video_dramas.url` (tanpa token/proxy membership).

**Response 200**

```json
{
  "status": "success",
  "data": {
    "drama": "Mendadak Jadi Istri Miliuner",
    "drama_id": 69,
    "slug": "mendadak-jadi-istri-miliuner",
    "episode": 21,
    "episode_name": "Episode 21",
    "type": "VIP",
    "resolution": "auto",
    "stream_url": "https://vz-xxxxx.b-cdn.net/xxxx/playlist.m3u8",
    "coin_charged": 5,
    "coin_balance": 20,
    "subtitles": []
  }
}
```

**Response 401 (VIP tanpa login)**

```json
{
  "status": "error",
  "message": "Episode VIP memerlukan login.",
  "code": "login_required"
}
```

**Response 403**

```json
{
  "status": "error",
  "message": "Coin tidak cukup. Dibutuhkan 5 coin.",
  "code": "insufficient_coin",
  "data": {
    "required": 5,
    "balance": 2
  }
}
```

---

## 9. Drama

Endpoint katalog untuk halaman browse Next.js. Publik; Bearer opsional.

### 9.1 List Drama

`GET /api/v2/drama`

**Query**

| Field | Type | Keterangan |
|---|---|---|
| page | int | default 1 |
| limit | int | default 15, max 50 |
| search | string | opsional |
| provider_id | int | opsional |
| sort | string | `latest` (default), `likes`, `title` |

Publik (tanpa login). Bearer opsional untuk `is_saved` / `is_liked`.

### 9.2 Detail Drama

`GET /api/v2/drama/{id}`

`{id}` bisa **numeric id** atau **slug**. Publik (tanpa login). Bearer opsional untuk `is_saved` / `is_liked`.

**Response 200**

```json
{
  "status": "success",
  "data": {
    "id": 69,
    "title": "Mendadak Jadi Istri Miliuner",
    "slug": "mendadak-jadi-istri-miliuner",
    "banner_url": "https://...",
    "description": "...",
    "total_episodes": 60,
    "likes_count": 120,
    "provider": {
      "id": 1,
      "name": "Dramabox",
      "slug": "dramabox"
    },
    "is_saved": false,
    "is_liked": false,
    "episodes": [
      {
        "episode": 1,
        "name": "Episode 1",
        "type": "Free",
        "is_locked": false,
        "coin_cost": 0
      }
    ]
  }
}
```

> Field `slug` selalu dikembalikan pada objek drama (list, detail, trending, dashboard, play episode).

### 9.3 List Provider

`GET /api/v2/provider`

**Query:** `page`, `limit`

**Response 200**

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "Dramabox",
      "slug": "dramabox",
      "dramas_count": 40
    }
  ],
  "meta": {
    "current_page": 1,
    "last_page": 1,
    "per_page": 15,
    "total": 8
  }
}
```

### 9.4 Detail Provider

`GET /api/v2/provider/{id}`

### 9.5 List Drama Like Terbanyak

`GET /api/v2/drama/most-liked`

**Query**

| Field | Type | Keterangan |
|---|---|---|
| page | int | default 1 |
| limit | int | default 15, max 50 |
| provider_id | int | opsional |

Urut `likes_count` DESC.

**Response 200** — struktur item sama list drama + `likes_count`.

---

## 10. Like Drama

Bearer token wajib.

### 10.1 Like

`POST /api/v2/like-drama`

**Body (JSON)**

| Field | Type | Wajib |
|---|---|---|
| id_drama | int | ya |

**Response 200**

```json
{
  "status": "success",
  "message": "Drama di-like.",
  "data": {
    "id": 5,
    "id_drama": 69,
    "likes_count": 121
  }
}
```

### 10.2 Unlike

`DELETE /api/v2/like-drama/{id_drama}`

**Response 200**

```json
{
  "status": "success",
  "message": "Like dibatalkan.",
  "data": {
    "id_drama": 69,
    "likes_count": 120
  }
}
```

### 10.3 List Liked

`GET /api/v2/like-drama`

---

## Ringkasan Endpoint

| Group | Method | Path | Auth |
|---|---|---|---|
| Auth | POST | `/auth/login` | publik |
| Auth | POST | `/auth/register` | publik |
| Auth | POST | `/auth/forgot-password` | publik |
| Dashboard | GET | `/dashboard/slider` | publik* |
| Dashboard | GET | `/dashboard/drama` | publik* |
| Saved | GET | `/saved-drama` | Bearer |
| Saved | POST | `/saved-drama` | Bearer |
| Saved | DELETE | `/saved-drama/{id_drama}` | Bearer |
| Coin | GET | `/coin` | Bearer |
| Coin | POST | `/coin` | Bearer |
| Coin | POST | `/coin/{id}/cancel` | Bearer |
| Account | PUT | `/account` | Bearer |
| Account | DELETE | `/account` | Bearer |
| Payment | GET | `/payment/channels` | Bearer |
| Payment | POST | `/payment` | Bearer |
| Payment | POST | `/payment/{id}/update` | Bearer |
| Play | GET | `/play/drama` | publik* |
| Play | GET | `/play/drama/{id}/episode` | publik* |
| Play | GET | `/play/trending` | publik |
| Free Play | POST | `/play/drama/{id}/episode/{episode_number}` | Free: publik; VIP: Bearer |
| Drama | GET | `/drama` | publik* |
| Drama | GET | `/drama/{id}` | publik* (id atau slug) |
| Drama | GET | `/drama/most-liked` | publik* |
| Provider | GET | `/provider` | publik |
| Provider | GET | `/provider/{id}` | publik |
| Like | GET | `/like-drama` | Bearer |
| Like | POST | `/like-drama` | Bearer |
| Like | DELETE | `/like-drama/{id_drama}` | Bearer |

\* Bearer opsional untuk personalisasi (`is_saved`, `is_liked`).

---

## Database

| Tabel | Fungsi | Status |
|---|---|---|
| `sliders` | slider dashboard | sudah ada |
| `saved_dramas` | simpan drama | sudah ada (mobile) |
| `coin_packages` | harga paket coin | sudah ada |
| `coin_transactions` | top-up / ad reward | sudah ada |
| `episode_unlocks` | unlock episode berbayar | sudah ada |
| `users.coin` | saldo coin | sudah ada |
| `drama_likes` | like drama (`id_user`, `id_drama`) | sudah ada |
| `personal_access_tokens` | Sanctum | sudah ada |

---

## Catatan implementasi

- Prefix website: **`/api/v2`** (Next.js front). Jangan campur dengan `/api/v1/mobile`.
- Auth Bearer Sanctum; bisa reuse user yang sama dengan mobile.
- Coin, PG, unlock episode, slider, saved drama: **reuse** service/tabel mobile yang sudah ada.
- `stream_url` website = **URL mentah** `video_dramas.url` (sama kebijakan mobile, beda dari API membership tokenized).
- Field `slug` selalu ada di objek drama (list/detail/trending/dashboard/play episode) dan di response play (`slug`, `drama_id`).
- Free play: **20 episode gratis** (boleh tanpa login), lanjut **5 coin / episode** (VIP wajib login).
- Fitur baru khusus website: **trending**, **most-liked**, **like/unlike**.
- Status dokumen: **implemented** — endpoint `/api/v2` di `routes/api.php` (auth Sanctum, optional auth untuk katalog publik + free play).
