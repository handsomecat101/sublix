//! Overlay window management — Win32 API helpers for always-on-top + click-through.
//!
//! M4 scope: basic overlay with drag region (full click-through deferred to M5).

#[cfg(windows)]
pub mod window;

#[cfg(windows)]
pub use window::*;
