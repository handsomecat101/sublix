//! Cache TTL trong bộ nhớ — chống gọi lại API nguồn quá dày (docs/V0.15_PLAN.md §3).
//!
//! TTL theo khuyến nghị của báo cáo nghiên cứu:
//! - [`TTL_HOT`] — Bilibili đang hot / bảng xếp hạng: **30 phút**
//! - [`TTL_HOT_WORDS`] — Douyin hot word: **15 phút**
//! - [`TTL_SEARCH`] — kết quả tìm theo từ khoá: **5 phút**
//!
//! Thiết kế:
//! - `Mutex<HashMap>` (không cần `RwLock`: thao tác rất ngắn, không giữ khoá khi gọi mạng).
//! - **Thời gian truyền vào** ([`TtlCache::get_at`] / [`TtlCache::insert_at`]) ⇒ test được
//!   bằng thời gian giả, không phải `sleep`.
//! - Khoá bị poison (panic ở thread khác) vẫn dùng tiếp được — `into_inner()` thay vì
//!   `unwrap()`, đúng quy tắc "không `unwrap()` ngoài test".
//! - Mục hết hạn bị **xoá luôn khi đọc** (không tích rác vô hạn).

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Bilibili đang hot / bảng xếp hạng — dữ liệu đổi chậm.
pub const TTL_HOT: Duration = Duration::from_secs(30 * 60);
/// Douyin hot word.
pub const TTL_HOT_WORDS: Duration = Duration::from_secs(15 * 60);
/// Kết quả tìm kiếm theo từ khoá.
pub const TTL_SEARCH: Duration = Duration::from_secs(5 * 60);

struct Slot<V> {
    stored_at: Instant,
    value: V,
}

/// Cache TTL dùng chung cho mọi nguồn Khám phá.
pub struct TtlCache<K, V> {
    ttl: Duration,
    slots: Mutex<HashMap<K, Slot<V>>>,
}

impl<K, V> TtlCache<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    /// Cache với TTL cố định cho mọi mục.
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            slots: Mutex::new(HashMap::new()),
        }
    }

    /// TTL đang dùng.
    pub fn ttl(&self) -> Duration {
        self.ttl
    }

    /// Đọc theo đồng hồ thật.
    pub fn get(&self, key: &K) -> Option<V> {
        self.get_at(key, Instant::now())
    }

    /// Đọc theo mốc thời gian cho trước (test dùng thời gian giả).
    ///
    /// Mục quá `ttl` bị xoá và trả `None`; `now` trước `stored_at` (đồng hồ lùi) vẫn coi
    /// là còn hạn.
    pub fn get_at(&self, key: &K, now: Instant) -> Option<V> {
        let mut slots = self.lock();
        match slots.get(key) {
            Some(slot) if now.saturating_duration_since(slot.stored_at) < self.ttl => {
                Some(slot.value.clone())
            }
            Some(_) => {
                slots.remove(key);
                None
            }
            None => None,
        }
    }

    /// Ghi theo đồng hồ thật.
    pub fn insert(&self, key: K, value: V) {
        self.insert_at(key, value, Instant::now());
    }

    /// Ghi theo mốc thời gian cho trước — ghi đè mục cũ và **làm mới** mốc hết hạn.
    pub fn insert_at(&self, key: K, value: V, now: Instant) {
        let mut slots = self.lock();
        slots.insert(
            key,
            Slot {
                stored_at: now,
                value,
            },
        );
    }

    /// Số mục đang giữ (kể cả mục đã hết hạn nhưng chưa bị đọc lại).
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    /// Cache rỗng?
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Xoá một mục; trả `true` nếu có.
    pub fn remove(&self, key: &K) -> bool {
        self.lock().remove(key).is_some()
    }

    /// Xoá toàn bộ (dùng khi người dùng bấm "Tải lại").
    pub fn clear(&self) {
        self.lock().clear();
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<K, Slot<V>>> {
        self.slots.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
#[path = "cache_tests.rs"]
mod cache_tests;
