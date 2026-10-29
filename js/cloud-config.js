/* 雲端同步設定 — 同 PM tracker 共用「PM Management」Supabase project
 * URL 同 publishable key 都係設計俾瀏覽器用嘅公開值；資料靠 supabase/schema.sql 入面嘅 RLS 保護。
 * 留空 = 唔開雲端同步，app 照舊只用本機資料。 */
const CLOUD_CONFIG = {
    url: 'https://xruwmsixukxteeundvbg.supabase.co',
    anonKey: 'sb_publishable_shIK8o0ygBLOUYDwUolknw_Vg_Iz0zh',
};
