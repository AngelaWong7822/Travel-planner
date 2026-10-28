/* 雲端同步設定 — Supabase Project URL 同 anon（publishable）key
 * 兩樣都係設計俾瀏覽器用嘅公開值；資料靠 supabase/schema.sql 入面嘅 RLS 保護。
 * 留空 = 唔開雲端同步，app 照舊只用本機資料。 */
const CLOUD_CONFIG = {
    url: '',
    anonKey: '',
};
