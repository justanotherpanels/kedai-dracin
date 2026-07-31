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

export type CoinPayload = {
  coin: number;
  history: CoinHistory[];
  packages?: CoinPackage[];
};

export type CoinPurchasePayload = {
  transaction_id: number;
  coin: number;
  amount: number;
  status: string;
  payment_url?: string | null;
  reference?: string;
  /** Optional PG extras (backend may send these) */
  qr_url?: string | null;
  qr_image?: string | null;
  qr_content?: string | null;
  payment_code?: string | null;
  va_number?: string | null;
  method?: string | null;
  expired_at?: string | null;
};

export type CoinCancelPayload = {
  transaction_id: number;
  status: string;
};

export type PaymentPayload = {
  payment_id: number;
  status: string;
  payment_url?: string | null;
  reference?: string;
  paid_at?: string | null;
  coin_balance?: number;
  amount?: number;
  coin?: number;
  method?: string | null;
  qr_url?: string | null;
  qr_image?: string | null;
  qr_content?: string | null;
  payment_code?: string | null;
  va_number?: string | null;
  expired_at?: string | null;
  transaction_id?: number;
};

export type LikePayload = {
  id?: number;
  id_drama: number;
  likes_count: number;
};
