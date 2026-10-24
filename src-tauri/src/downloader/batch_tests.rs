//! Unit test cho `downloader::batch` (tách riêng để batch.rs < 300 dòng).

use super::*;

#[test]
fn split_urls_filters_and_dedupes() {
    let text = "https://www.youtube.com/watch?v=aaa\n\n  https://youtu.be/bbb  \
                https://www.youtube.com/watch?v=aaa\r\nkhông-phải-link --exec=calc \
                ftp://x.com/a \"https://www.bilibili.com/video/BV1xx411c7mD/\" \
                https://www.bilibili.com/video/BV1xx411c7mD\thttp://localhost/x";
    let parsed = split_urls(text);
    assert_eq!(
        parsed.urls,
        vec![
            "https://www.youtube.com/watch?v=aaa",
            "https://youtu.be/bbb",
            "https://www.bilibili.com/video/BV1xx411c7mD/",
        ]
    );
    assert_eq!(parsed.duplicates, 2);
    // "không-phải-link", "--exec=calc", "ftp://…", "http://localhost/x"
    assert_eq!(parsed.invalid, 4);
}

#[test]
fn split_urls_empty_input() {
    let parsed = split_urls("  \n\t ");
    assert!(parsed.urls.is_empty());
    assert_eq!((parsed.invalid, parsed.duplicates), (0, 0));
}

const FIXTURE: &str = r#"{
    "_type": "playlist", "id": "PLx", "title": "Danh sách thử",
    "playlist_count": 3,
    "entries": [
        {"_type": "url", "ie_key": "Youtube", "id": "aaa", "url": "https://www.youtube.com/watch?v=aaa", "title": "Video một", "duration": 61.0},
        {"_type": "url", "ie_key": "Youtube", "id": "bbb", "url": "bbb", "title": "Video hai", "duration": null},
        {"_type": "url", "ie_key": "YoutubeTab", "id": "UCx", "url": "https://www.youtube.com/channel/UCx/videos", "title": "Tab"}
    ]
}"#;

#[test]
fn parse_flat_playlist_fixture() {
    let json: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture JSON");
    let exp = parse_flat_playlist(&json, MAX_PLAYLIST_ITEMS);
    assert!(exp.is_playlist);
    assert_eq!(exp.title.as_deref(), Some("Danh sách thử"));
    assert_eq!(exp.total, 3);
    assert!(!exp.truncated);
    assert_eq!(exp.entries.len(), 2, "tab kênh lồng nhau phải bị bỏ");
    assert_eq!(exp.entries[0].title, "Video một");
    assert_eq!(exp.entries[0].duration, Some(61.0));
    // `url` chỉ là ID → dựng lại link watch từ ie_key Youtube.
    assert_eq!(exp.entries[1].url, "https://www.youtube.com/watch?v=bbb");
    assert_eq!(exp.entries[1].duration, None);
}

#[test]
fn parse_flat_playlist_truncates() {
    let entries: Vec<serde_json::Value> = (0..5)
        .map(|i| serde_json::json!({"url": format!("https://www.youtube.com/watch?v=v{i}"), "title": format!("T{i}")}))
        .collect();
    let json = serde_json::json!({"_type": "playlist", "playlist_count": 9, "entries": entries});
    let exp = parse_flat_playlist(&json, 3);
    assert_eq!(exp.entries.len(), 3);
    assert_eq!(exp.total, 9);
    assert!(exp.truncated);
}

#[test]
fn parse_flat_playlist_single_video() {
    let json = serde_json::json!({"_type": "video", "id": "aaa", "title": "Một video",
        "webpage_url": "https://www.youtube.com/watch?v=aaa", "duration": 12.5});
    let exp = parse_flat_playlist(&json, MAX_PLAYLIST_ITEMS);
    assert!(!exp.is_playlist);
    assert_eq!(exp.entries.len(), 1);
    assert_eq!(exp.entries[0].url, "https://www.youtube.com/watch?v=aaa");
}

fn args_of(cmd: &Command) -> Vec<String> {
    cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect()
}

fn audio_req(format: &str) -> super::super::DownloadRequest {
    super::super::DownloadRequest {
        id: "t".into(),
        url: "https://www.youtube.com/watch?v=aaa".into(),
        format: format.into(),
        browser_cookies: None,
        cookies_file: None,
        extract_subtitles: false,
        subtitle_langs: None,
        reup: Default::default(),
    }
}

#[test]
fn audio_mode_args_mp3_m4a() {
    for (format, codec) in [("audio-mp3", "mp3"), ("audio-m4a", "m4a")] {
        let fa = super::super::build_format_args(format);
        assert_eq!(fa, vec!["-x", "--audio-format", codec, "--audio-quality", "0"]);

        let dir = std::env::temp_dir();
        let cmd = super::super::build_download_command(
            std::path::Path::new("yt-dlp"), &dir, &audio_req(format), None, None, None,
        );
        let args = args_of(&cmd);
        assert!(args.contains(&"-x".to_string()));
        assert!(args.windows(2).any(|w| w[0] == "--audio-format" && w[1] == codec));
        assert!(args.contains(&"--no-playlist".to_string()), "tải từng mục vẫn --no-playlist");
        assert!(!args.contains(&"--merge-output-format".to_string()), "audio không merge mp4");
        assert_eq!(args.last().map(String::as_str), Some("https://www.youtube.com/watch?v=aaa"));
    }
    // Chế độ video mặc định giữ nguyên merge mp4.
    let cmd = super::super::build_download_command(
        std::path::Path::new("yt-dlp"), &std::env::temp_dir(), &audio_req("max"), None, None, None,
    );
    assert!(args_of(&cmd).contains(&"--merge-output-format".to_string()));
}

#[test]
fn expand_command_args() {
    let cmd = build_expand_command(
        std::path::Path::new("yt-dlp"),
        "https://www.youtube.com/playlist?list=PLx",
        Some("edge"),
        None,
    );
    let args = args_of(&cmd);
    assert!(args.contains(&"--flat-playlist".to_string()));
    assert!(args.contains(&"-J".to_string()));
    assert!(args.windows(2).any(|w| w[0] == "-I" && w[1] == "1:201"));
    assert!(args.windows(2).any(|w| w[0] == "--cookies-from-browser" && w[1] == "edge"));
    let dash = args.iter().position(|a| a == "--").expect("có --");
    assert_eq!(args.len(), dash + 2, "-- chỉ theo sau bởi URL");
}

// ---- Test chạy thật (mạng + yt-dlp), mặc định bỏ qua: ----
// $env:SUBLIX_LIVE_PLAYLIST_URL="…"; cargo test --lib live_ -- --ignored --nocapture

#[test]
#[ignore]
fn live_expand_playlist() {
    let Ok(url) = std::env::var("SUBLIX_LIVE_PLAYLIST_URL") else { return };
    let bin = super::super::find_ytdlp(None).expect("yt-dlp");
    let exp = expand_with(&bin, &url, None).expect("expand playlist");
    println!("LIVE playlist '{:?}': {} mục (total={}, truncated={})",
        exp.title, exp.entries.len(), exp.total, exp.truncated);
    for e in exp.entries.iter().take(2) {
        println!("  - {} | {:?}s | {}", e.title, e.duration, e.url);
    }
    assert!(exp.is_playlist && !exp.entries.is_empty());
}

#[test]
#[ignore]
fn live_download_mp3() {
    let (Ok(url), Ok(out)) = (
        std::env::var("SUBLIX_LIVE_AUDIO_URL"),
        std::env::var("SUBLIX_LIVE_OUT_DIR"),
    ) else { return };
    let dir = std::path::PathBuf::from(out);
    std::fs::create_dir_all(&dir).expect("out dir");
    let bin = super::super::find_ytdlp(None).expect("yt-dlp");
    let js = super::super::find_js_runtime().ok().flatten()
        .map(|(r, p)| format!("{}:{}", r, p.display()));
    let mut req = audio_req("audio-mp3");
    req.url = url;
    let mut cmd = super::super::build_download_command(&bin, &dir, &req, None, None, js.as_deref());
    let output = cmd.output().expect("run yt-dlp");
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let mp3: Vec<_> = std::fs::read_dir(&dir).expect("read dir").flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "mp3"))
        .collect();
    println!("LIVE mp3 files: {mp3:?}");
    assert!(!mp3.is_empty());
}
