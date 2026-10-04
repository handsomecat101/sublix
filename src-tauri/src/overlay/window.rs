//! Win32 API helpers for overlay window (click-through, position).

use anyhow::Result;
use tauri::WebviewWindow;
use tracing::info;

#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

/// Make the overlay window click-through at the Win32 level (WS_EX_TRANSPARENT).
///
/// `WS_EX_LAYERED` is REQUIRED for window transparency and must always stay set;
/// removing it turns the transparent overlay into a black rectangle. The style
/// change only takes effect after a frame refresh via `SetWindowPos`.
#[cfg(windows)]
pub fn set_click_through(window: &WebviewWindow, enabled: bool) -> Result<()> {
    let hwnd = window
        .hwnd()
        .map_err(|e| anyhow::anyhow!("Failed to get HWND: {e}"))?
        .0 as isize;
    let hwnd = HWND(hwnd as *mut std::ffi::c_void);

    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let new_style = if enabled {
            ex_style | WS_EX_TRANSPARENT.0 as isize | WS_EX_LAYERED.0 as isize
        } else {
            (ex_style | WS_EX_LAYERED.0 as isize) & !(WS_EX_TRANSPARENT.0 as isize)
        };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
        let _ = SetWindowPos(
            hwnd,
            HWND(std::ptr::null_mut()),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    info!(
        "Overlay click-through: {}",
        if enabled { "enabled" } else { "disabled" }
    );
    Ok(())
}

#[cfg(not(windows))]
pub fn set_click_through(_window: &WebviewWindow, _enabled: bool) -> Result<()> {
    Ok(())
}

/// Position the overlay window at the bottom-center of the primary monitor.
pub fn position_bottom_center(window: &WebviewWindow, monitor_height: u32, monitor_width: u32) -> Result<()> {
    let size = window
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(720, 150));
    let overlay_width = size.width as i32;
    let overlay_height = size.height as i32;
    let margin_bottom = 80;

    let x = (monitor_width as i32 - overlay_width) / 2;
    let y = monitor_height as i32 - overlay_height - margin_bottom;

    window
        .set_position(tauri::PhysicalPosition::new(x.max(0), y.max(0)))
        .map_err(|e| anyhow::anyhow!("Failed to set position: {e}"))?;
    info!("Overlay positioned at ({x}, {y})");
    Ok(())
}
