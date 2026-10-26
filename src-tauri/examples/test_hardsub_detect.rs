//! Đo thật dò phụ đề cứng: `cargo run --example test_hardsub_detect -- <video> [bottom|top|any]`.
//! Tự tải model (4 MB) nếu chưa có, in dải + khoảng có chữ + thời gian chạy.

use std::path::Path;
use sublix_lib::hardsub::{band::Region, commands::parse_region, detect, model};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let Some(video) = args.get(1) else {
        eprintln!("Dùng: test_hardsub_detect <video> [bottom|top|any]");
        std::process::exit(1);
    };
    let region: Region = parse_region(args.get(2).map(String::as_str));
    if !model::is_installed() {
        println!("Tải model ({} byte)…", model::BYTES);
        model::download(&mut |p| println!("  {} {}/{}", p.phase, p.bytes_done, p.bytes_total))?;
    }
    let mut last = 101;
    let r = detect::detect(Path::new(video), region, 1.0, &mut |pct, msg| {
        if pct / 20 != last / 20 {
            last = pct;
            println!("[{pct:>3}%] {msg}");
        }
    });
    match r {
        Ok(d) => {
            println!("Khung hình: {}x{}", d.frame_width, d.frame_height);
            println!("Dải: {:?}", d.band);
            println!("Khoảng có chữ: {:?}", d.spans);
            println!("Khung có chữ: {}/{}", d.frames_with_text, d.frames_total);
            println!("Thời gian chạy: {} ms", d.elapsed_ms);
        }
        Err(e) => {
            eprintln!("LỖI {e}");
            std::process::exit(2);
        }
    }
    Ok(())
}
