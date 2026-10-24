//! Unit test cho `downloader::reup` + tác động lên `get_platform` /
//! `build_download_command` (tách riêng để các module sản phẩm gọn).

use super::*;

fn args_of(cmd: &Command) -> Vec<String> {
    cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect()
}

fn req_with(reup: reup::ReupOptions) -> DownloadRequest {
    DownloadRequest {
        id: "t".into(),
        url: "https://www.instagram.com/reel/Chunk8-jurw/".into(),
        format: "1080p".into(),
        browser_cookies: None,
        cookies_file: None,
        extract_subtitles: false,
        subtitle_langs: None,
        reup: Some(reup),
    }
}

// ---- get_platform: 8 host mới + chống giả mạo ----

#[test]
fn get_platform_new_hosts() {
    let cases = [
        ("https://www.instagram.com/reel/abc/", "instagram"),
        ("https://m.facebook.com/watch/?v=1", "facebook"),
        ("https://www.twitch.tv/xqc/videos/1", "twitch"),
        ("https://kick.com/xqc/videos/01a0251f", "kick"),
        ("https://www.dailymotion.com/video/x89eyek", "dailymotion"),
        ("https://www.vk.com/video205387401_165548505", "vk"),
        ("https://vkvideo.ru/video-1_2", "vk"),
        ("https://www.pinterest.com/pin/664281013778109217/", "pinterest"),
        ("https://pin.it/abc123", "pinterest"),
        ("https://www.snapchat.com/spotlight/W7_EDlXWTBi", "snapchat"),
    ];
    for (url, expect) in cases {
        assert_eq!(get_platform(url), expect, "url={url}");
    }
}

#[test]
fn get_platform_rejects_spoofed_hosts() {
    // Chống giả mạo: host kết thúc bằng tên miền nhưng KHÔNG phải subdomain thật.
    for url in [
        "https://evil-instagram.com.scam.io/reel/x",
        "https://notfacebook.com.evil.io/x",
        "https://fake-kick.com.evil.io/x",
        "https://pinterest.com.attacker.net/pin/1",
        "https://xsnapchat.com.evil.io/x",
    ] {
        assert_eq!(get_platform(url), "generic_video", "phải từ chối {url}");
    }
}

#[test]
fn get_platform_keeps_existing_behaviour() {
    assert_eq!(get_platform("https://youtu.be/aaa"), "youtube");
    assert_eq!(get_platform("https://www.tiktok.com/@x/video/1"), "tiktok");
    assert_eq!(get_platform("https://www.bilibili.com/video/BV1"), "bilibili");
    // v.qq.com là host riêng (không phải qq.com chung).
    assert_eq!(get_platform("https://v.qq.com/x/cover/abc.html"), "vqq");
    // Kuaishou/Migu vẫn được nhận diện (để hiện đúng tên) nhưng phải bị chặn sớm.
    for u in ["https://www.kuaishou.com/short-video/x", "https://www.migu.cn/video/1"] {
        assert!(reup::unsupported_platform_message(get_platform(u)).is_some(), "phải chặn {u}");
    }
}

// ---- Nền tảng yt-dlp chưa hỗ trợ (kuaishou/migu) ----

#[test]
fn unsupported_platforms_message() {
    for p in ["kuaishou", "migu"] {
        let msg = reup::unsupported_platform_message(p).expect("phải có thông báo");
        assert!(msg.contains("chưa hỗ trợ"), "{msg}");
        assert!(!msg.contains("cập nhật yt-dlp"), "không được gợi ý cập nhật: {msg}");
    }
    assert!(reup::unsupported_platform_message("youtube").is_none());
    assert!(reup::unsupported_platform_message("instagram").is_none());
}

// ---- Cắt đoạn ----

#[test]
fn normalize_timecode_variants() {
    assert_eq!(reup::normalize_timecode("00:00:05").as_deref(), Some("00:00:05"));
    assert_eq!(reup::normalize_timecode("1:2:3").as_deref(), Some("01:02:03"));
    assert_eq!(reup::normalize_timecode("5:30").as_deref(), Some("00:05:30"));
    assert_eq!(reup::normalize_timecode("90").as_deref(), Some("00:01:30"));
    assert_eq!(reup::normalize_timecode(""), None);
    assert_eq!(reup::normalize_timecode("abc"), None);
    assert_eq!(reup::normalize_timecode("00:70:00"), None, "phút >= 60 là sai");
    assert_eq!(reup::normalize_timecode("1:2:3:4"), None);
}

#[test]
fn section_arg_builds_and_validates() {
    let none = reup::ReupOptions::default();
    assert_eq!(reup::section_arg(&none).unwrap(), None, "rỗng → tải cả video");

    let both = reup::ReupOptions {
        section_start: Some("00:00:05".into()),
        section_end: Some("00:00:15".into()),
        ..Default::default()
    };
    assert_eq!(reup::section_arg(&both).unwrap().as_deref(), Some("*00:00:05-00:00:15"));

    let only_start = reup::ReupOptions {
        section_start: Some("00:00:05".into()),
        ..Default::default()
    };
    assert_eq!(reup::section_arg(&only_start).unwrap().as_deref(), Some("*00:00:05-"));

    let bad = reup::ReupOptions {
        section_start: Some("sai".into()),
        ..Default::default()
    };
    assert!(reup::section_arg(&bad).is_err());
}

// ---- build_download_command: cờ reup ----

#[test]
fn build_args_for_reup_options() {
    let dir = std::env::temp_dir();
    let reup_opts = reup::ReupOptions {
        write_info: true,
        archive: true,
        thumbnail: true,
        section_start: Some("00:00:05".into()),
        section_end: Some("00:00:15".into()),
    };
    let cmd = build_download_command(
        Path::new("yt-dlp"),
        &dir,
        &req_with(reup_opts),
        None,
        None,
        None,
    );
    let args = args_of(&cmd);
    assert!(args.contains(&"--write-info-json".to_string()));
    assert!(args.contains(&"--write-thumbnail".to_string()));
    assert!(args.windows(2).any(|w| w[0] == "--convert-thumbnails" && w[1] == "jpg"));
    let ar = args.iter().position(|a| a == "--download-archive").expect("có archive");
    assert!(args[ar + 1].ends_with("download_archive.txt"), "archive={}", args[ar + 1]);
    assert!(args.windows(2).any(|w| w[0] == "--download-sections" && w[1] == "*00:00:05-00:00:15"));
    assert!(args.contains(&"--force-keyframes-at-cuts".to_string()));
    // Vẫn giữ bất biến: `--` chỉ đứng trước URL (không tham số lạ phía sau).
    let dash = args.iter().position(|a| a == "--").expect("có --");
    assert_eq!(args.len(), dash + 2);
}

#[test]
fn build_args_default_reup_is_untouched() {
    let dir = std::env::temp_dir();
    let cmd = build_download_command(
        Path::new("yt-dlp"),
        &dir,
        &req_with(reup::ReupOptions::default()),
        None,
        None,
        None,
    );
    let args = args_of(&cmd);
    for flag in ["--write-info-json", "--write-thumbnail", "--download-archive", "--download-sections"] {
        assert!(!args.contains(&flag.to_string()), "mặc định không được thêm {flag}");
    }
}

// ---- Nội dung .info.txt ----

#[test]
fn build_info_txt_has_core_lines() {
    let json = serde_json::json!({
        "title": "Tiêu đề thử",
        "uploader": "Kênh thử",
        "webpage_url": "https://example.com/v/1",
        "upload_date": "20261024",
        "tags": ["reup", "video hay"],
        "view_count": 12345,
        "duration": 65.0,
        "description": "Mô tả nhiều dòng\nđể viết lại caption."
    });
    let txt = reup::build_info_txt(&json);
    let lines: Vec<&str> = txt.lines().collect();
    assert!(lines[0].starts_with("Tiêu đề: Tiêu đề thử"));
    assert!(lines[1].starts_with("Kênh: Kênh thử"));
    assert!(lines[2].starts_with("Link gốc: https://example.com/v/1"));
    assert!(lines[3].starts_with("Ngày đăng: 2026-10-24"));
    assert!(lines[4].contains("#reup") && lines[4].contains("#video_hay"), "line5={}", lines[4]);
    assert!(txt.contains("Mô tả:"));
}

#[test]
fn finalize_info_txt_writes_bom_and_removes_json() {
    let dir = std::env::temp_dir().join(format!("sublix_reup_{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("mkdir");
    let media = dir.join("Video thử [abc].mp4");
    let json_path = reup::info_json_path(&media);
    std::fs::write(
        &json_path,
        r#"{"title":"T","uploader":"U","webpage_url":"https://x/y","upload_date":"20260101"}"#,
    )
    .expect("write json");

    let out = reup::finalize_info_txt(&media).expect("finalize").expect("có txt");
    assert!(out.to_string_lossy().ends_with(".info.txt"), "out={}", out.display());
    let bytes = std::fs::read(&out).expect("read txt");
    assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF], "phải có BOM UTF-8");
    assert!(!json_path.exists(), ".info.json phải bị xóa");
    let _ = std::fs::remove_dir_all(&dir);

    // Không có .info.json → Ok(None), không lỗi.
    let missing = reup::finalize_info_txt(&dir.join("nope.mp4")).expect("ok");
    assert!(missing.is_none());
}

// ---- Test chạy THẬT (mạng + yt-dlp), mặc định bỏ qua: ----
// $env:SUBLIX_LIVE_REUP_URL="…"; $env:SUBLIX_LIVE_REUP_OUT_DIR="…";
// [$env:SUBLIX_LIVE_REUP_SECTION_START="00:00:05"; $env:SUBLIX_LIVE_REUP_SECTION_END="00:00:15";
//  $env:SUBLIX_LIVE_REUP_EXPECT_SECS="10"]
// cargo test --lib live_reup -- --ignored --nocapture
#[test]
#[ignore]
fn live_reup_download_and_archive() {
    let (Ok(url), Ok(out)) = (
        std::env::var("SUBLIX_LIVE_REUP_URL"),
        std::env::var("SUBLIX_LIVE_REUP_OUT_DIR"),
    ) else {
        return;
    };
    let dir = std::path::PathBuf::from(out);
    std::fs::create_dir_all(&dir).expect("out dir");
    let bin = find_ytdlp(None).expect("yt-dlp");

    let env_nonempty = |k: &str| std::env::var(k).ok().filter(|s| !s.trim().is_empty());
    let opts = reup::ReupOptions {
        write_info: true,
        archive: true,
        thumbnail: true,
        section_start: env_nonempty("SUBLIX_LIVE_REUP_SECTION_START"),
        section_end: env_nonempty("SUBLIX_LIVE_REUP_SECTION_END"),
    };
    let mut req = req_with(opts);
    req.url = url.clone();

    // Lần 1: tải thật với ĐÚNG lệnh app sinh ra (build_download_command).
    let out1 = build_download_command(&bin, &dir, &req, None, None, None)
        .output()
        .expect("run yt-dlp");
    assert!(
        out1.status.success(),
        "lần 1 thất bại: {}",
        String::from_utf8_lossy(&out1.stderr)
    );

    // .info.txt (BOM) phải được tạo từ finalize_info_txt trên file .info.json.
    let media: Vec<_> = std::fs::read_dir(&dir)
        .expect("read dir")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "mp4" || x == "webm" || x == "mkv"))
        .collect();
    assert_eq!(media.len(), 1, "phải có đúng 1 file media: {media:?}");
    let media = &media[0];
    let finalized = reup::finalize_info_txt(media).expect("finalize");
    assert!(finalized.is_some(), "phải tạo .info.txt");

    // Lần 2: archive phải bỏ qua, KHÔNG tải lại.
    let out2 = build_download_command(&bin, &dir, &req, None, None, None)
        .output()
        .expect("run yt-dlp lần 2");
    let stdout2 = String::from_utf8_lossy(&out2.stdout);
    assert!(
        stdout2.contains("has already been recorded in the archive"),
        "lần 2 phải bị archive bỏ qua, stdout:\n{stdout2}"
    );

    // Liệt kê file & in 5 dòng đầu .info.txt.
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("read dir")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    println!("LIVE files: {names:?}");
    let info_txt = reup::info_txt_path(media);
    let head: String = std::fs::read_to_string(&info_txt)
        .expect("đọc .info.txt")
        .lines()
        .take(5)
        .collect::<Vec<_>>()
        .join("\n");
    println!("LIVE .info.txt (5 dòng đầu):\n{head}");
    assert!(names.iter().any(|n| n.ends_with(".jpg")), "phải có thumbnail .jpg");
    assert!(names.iter().any(|n| n.ends_with(".info.txt")), "phải có .info.txt");

    // Cắt đoạn: đo duration bằng ffprobe nếu có mong đợi.
    if let Some(expect) = std::env::var("SUBLIX_LIVE_REUP_EXPECT_SECS")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
    {
        let duration = std::process::Command::new("ffprobe")
            .args(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"])
            .arg(media)
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        println!("LIVE duration của bản cắt: {duration}s");
        let secs: f64 = duration.parse().unwrap_or(0.0);
        assert!(
            (secs - expect).abs() <= 2.0,
            "mong đợi ~{expect}s (±2s), đo được {secs}s"
        );
    }
}
