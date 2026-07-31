import urlData from "@/app/data/url.json";

export const API_BASE_URL = String(urlData[0]?.base_url ?? "").trim();

export const TOKEN_KEY = "kd_token";
export const USER_KEY = "kd_user";
