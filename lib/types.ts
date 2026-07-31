export type ApiSuccess<T> = {
  status: "success";
  data: T;
  message?: string | null;
  meta?: PaginationMeta;
};

export type ApiError = {
  status: "error";
  message: string;
  code?: string;
  data?: Record<string, unknown>;
};

export type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type User = {
  id: number;
  name: string;
  email: string;
  coin: number;
};

export type AuthPayload = {
  token: string;
  token_type: string;
  user: User;
};

export type DramaProvider = {
  id: number;
  name: string;
  slug?: string;
  dramas_count?: number;
};

export type Drama = {
  id: number;
  title: string;
  slug?: string;
  banner_url: string;
  description?: string;
  total_episodes: number;
  likes_count?: number;
  plays_count?: number;
  provider?: DramaProvider;
  is_saved?: boolean;
  is_liked?: boolean;
};

export type SliderItem = {
  id: number;
  id_drama: number;
  drama: Drama | null;
};

export type Episode = {
  episode: number;
  name: string;
  type: string;
  is_locked: boolean;
  coin_cost: number;
};

export type EpisodeListPayload = {
  drama: Drama;
  episodes: Episode[];
};

export type PlayPayload = {
  drama: string;
  drama_id?: number;
  slug?: string;
  episode: number;
  episode_name: string;
  type: string;
  resolution: string;
  stream_url: string;
  coin_charged: number;
  coin_balance: number;
  subtitles: unknown[];
};

export type CoinHistory = {
  id: number;
  type: string;
  amount: number;
  price?: number;
  status: string;
  created_at: string;
};

export type CoinPackage = {
  id: number;
  name?: string;
  coin: number;
  price?: number;
  amount?: number;
  label?: string;
};

/** Channel aktif dari payment gateway (`GET /coin` / `GET /payment/channels`). */
export type PaymentChannel = {
  code: string;
  name: string;
  payment_type?: string | null;
  icon_url?: string | null;
  fee_customer?: number | { flat?: number; percent?: number } | null;
  fee_merchant?: number | { flat?: number; percent?: number } | null;
};

export type CoinPayload = {
  coin: number;
  history: CoinHistory[];
  packages?: CoinPackage[];
  payment_channels?: PaymentChannel[];
};

export type PaymentChannelsPayload = {
  channels: PaymentChannel[];
};

/** Field bersama hasil POST /coin dan POST /payment (§4.2 / §6.2). */
export type PaymentGatewayFields = {
  method?: string | null;
  payment_type?: string | null;
  payment_url?: string | null;
  qr_string?: string | null;
  qr_content?: string | null;
  qr_url?: string | null;
  qr_image?: string | null;
  va_number?: string | null;
  payment_code?: string | null;
  reference?: string;
  gateway_reference?: string | null;
  expired_at?: string | null;
};

export type CoinPurchasePayload = PaymentGatewayFields & {
  transaction_id: number;
  coin: number;
  amount: number;
  status: string;
};

export type CoinCancelPayload = {
  transaction_id: number;
  status: string;
};

export type PaymentPayload = PaymentGatewayFields & {
  payment_id: number;
  status: string;
  paid_at?: string | null;
  coin_balance?: number;
  amount?: number;
  coin?: number;
  transaction_id?: number;
};

export type LikePayload = {
  id?: number;
  id_drama: number;
  likes_count: number;
};
