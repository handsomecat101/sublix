import React, { useEffect } from "react";
import "./ChangelogModal.css";

interface ChangelogModalProps {
  currentVersion: string;
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: string;
  onThemeChange?: (theme: string) => void;
}

interface VersionEntry {
  version: string;
  date: string;
  title: string;
  isCurrent?: boolean;
  highlights: {
    category: string;
    icon: string;
    items: string[];
  }[];
}

const CHANGELOG_DATA: VersionEntry[] = [
  {
    version: "v0.11.3",
    date: "09/10/2026",
    title: "Sublix Studio: Timeline Zoom Đúng Chuẩn Premiere (full video fit + tick tự co giãn)",
    isCurrent: true,
    highlights: [
      {
        category: "Sửa Lỗi Quan Trọng",
        icon: "🎚",
        items: [
          "PO phàn nàn: 'timeline zoom max 300s quá vớ vẩn, mốc 5s cố định không hiểu'. Sai chuẩn Premiere/DaVinci.",
          "Fix: Đổi semantic zoomLevel từ 'số giây hiển thị' (5-300s) sang '% viewport' (100% = full video fit, 1000% = zoom 10×, max 10000% = zoom 100×).",
          "Mốc tick tự co giãn theo pxPerSec qua hàm chooseTickInterval: 1s/5s/15s/30s/1min/5min/30min/1h/2h tùy theo zoom. Không còn cứng 5s.",
          "Ví dụ Kenji 38:24: zoom 100% → tick mỗi 5 phút (0:00, 5:00, 10:00, ..., 35:00); zoom 5000% → tick mỗi 5 giây.",
          "Nút bấm: −/⟲/+ với step ×0.67/reset 100%/×1.5. Slider 100%→10000% step 50. Hiển thị '{N}% viewport'.",
        ],
      },
    ],
  },
  {
    version: "v0.11.2",
    date: "09/10/2026",
    title: "Sublix Studio: Timeline Zoom In/Out + Reset",
    isCurrent: true,
    highlights: [
      {
        category: "Tính Năng Mới",
        icon: "🔍",
        items: [
          "PO yêu cầu: 'zoom ra timeline đi, hiện tại ko có zoom gần zoom xa'.",
          "Trước: chỉ có slider zoom (10-120s), không có nút bấm +/−.",
          "Sau: 3 nút bấm thật trong thanh timeline controls: − (zoom out 1.5×) / ⟲ (reset về 30s mặc định) / + (zoom in 1.5×). Mỗi lần bấm scale timeline 1.5×.",
          "Mở rộng range slider 5s → 300s (trước 10s → 120s) — hỗ trợ video dài hơn Kenji 38min mà vẫn zoom được.",
          "Hiển thị rõ '{N}s hiển thị' với minWidth 56px, không bị tràn.",
        ],
      },
    ],
  },
  {
    version: "v0.11.1",
    date: "09/10/2026",
    title: "Sublix Studio: Thả Video Vào App Phải THẤY HÌNH (ROUND-4 R4-01)",
    isCurrent: true,
    highlights: [
      {
        category: "Sửa Lỗi Quan Trọng",
        icon: "🎬",
        items: [
          "Bug cũ: Thả video (đặc biệt VP9/AV1/HEVC hoặc H.264 high profile) vào Sublix Studio → WebView2 báo 'codec không được hỗ trợ' → tưởng app hỏng.",
          "Fix: Khi <video>.onError → tự gọi ffmpeg chuyển tạm sang H.264 baseline + AAC + faststart (cache trong %TEMP%\\sublix_preview\\) rồi phát bản tạm. Người dùng không cần biết.",
          "Nếu ffmpeg cũng fail → fallback Cinema Visualizer (giữ nguyên behavior cũ).",
          "UX: Toast 'Đang chuyển tạm video sang H.264…' + 'Đã chuyển tạm xong, đang phát bản preview…' để báo tiến trình.",
          "Đã verify: <video> có videoWidth > 0, videoHeight > 0, currentTime > 0 sau khi thả file (bằng chứng THẤY HÌNH, không phải chữ lỗi).",
        ],
      },
    ],
  },
  {
    version: "v0.10.0",
    date: "07/10/2026",
    title: "Phase V2: Phân Vai AI Chuẩn Xác (Sherpa-ONNX) + UI Detect Nhân Vật & Clip Mẫu",
    isCurrent: false,
    highlights: [
      {
        category: "Phân Vai AI Offline (SOTA)",
        icon: "🎭",
        items: [
          "Tích hợp mô hình nhận diện giọng nói pyannote-segmentation-3.0 + wespeaker offline qua sidecar sherpa-onnx (không tốn GPU/VRAM).",
          "Phân vai câu thoại dựa trên phân tích âm sắc thực tế thay vì đoán mò bằng dấu câu — triệt tiêu tình trạng cùng 1 nhân vật bị nhảy giọng.",
          "Tự động trích xuất clip âm thanh gốc (2-8s) của từng nhân vật trong video để người dùng nghe kiểm tra.",
        ],
      },
      {
        category: "Giao Diện Studio Lồng Tiếng Mới",
        icon: "🎛",
        items: [
          "Nút '🔊 Nghe giọng gốc' trên từng thẻ nhân vật để nghe lại đoạn thoại gốc của diễn viên trước khi lồng.",
          "Tính năng '🔗 Gộp vào vai...' cho phép gộp 2 nhân vật làm 1 trực tiếp trên giao diện chỉ với 1 click.",
          "Hiển thị số lượng câu thoại và huy hiệu phân vai (🟢 Sherpa AI / 🟡 Heuristic).",
        ],
      },
      {
        category: "Hotfix Phim Dài",
        icon: "⚡",
        items: [
          "Xóa bỏ hoàn toàn giới hạn 32KB dòng lệnh trên Windows khi lồng tiếng phim dài (400+ câu thoại) bằng cơ chế hòa âm phân tầng (chunked amix).",
        ],
      },
    ],
  },
  {
    version: "v0.9.10",
    date: "07/10/2026",
    title: "Lồng Tiếng: Dùng Gender Thật + Filter Noise Speaker",
    isCurrent: false,
    highlights: [
      {
        category: "Sửa Lỗi Quan Trọng",
        icon: "🐛",
        items: [
          "Bug cũ: test_dubbing_srt.rs ép 6 voice khác nhau theo `idx % 2` (male/female xen kẽ) — sai logic, lãng phí voice khi video chỉ 1 narrator, có thể gán nam vào speaker nữ.",
          "Fix: lưu `gender` vào DubbingSpeaker struct (từ LLM response); ép voice dựa trên `spk.gender` thật; nếu chỉ 1 speaker non-noise → chỉ assign 1 voice.",
          "Filter noise: speaker có <3 segments hoặc <3% tổng → gộp vào main speaker (giọng đồng nhất).",
          "Backward compat: `#[serde(default)]` cho gender → project cũ vẫn load được.",
        ],
      },
    ],
  },
  {
    version: "v0.9.9",
    date: "07/10/2026",
    title: "Chọn Model → Danh Sách Giọng Nam/Nữ + Mẫu Nghe Thử + Khớp Voice Đa Vai",
    isCurrent: false,
    highlights: [
      {
        category: "Tính Năng Mới",
        icon: "🎛",
        items: [
          "Bấm ▸ cạnh mỗi model để xem danh sách giọng NAM/NỮ của model đó — hiện cả TRƯỚC khi tải model.",
          "Kokoro-Vietnamese: 7 giọng Nam + 7 giọng Nữ; thêm card 'Edge Neural (có sẵn — cần mạng)' với 8 giọng đọc sẵn; model clone ghi rõ cần clip giọng mẫu 5–10 giây cho mỗi vai.",
          "🎧 Tạo mẫu nghe thử 14 giọng Kokoro trong 1 lần (~1 phút, có tiến trình) → nghe lại TỨC THÌ từ cache, không tổng hợp lại.",
          "Khớp voice đa vai: tự gán giọng KHÁC NHAU xen kẽ Nam/Nữ cho từng vai (pool 7 nam + 7 nữ); nhãn giọng ghi rõ '♂ Nam — Tuấn Ngọc (Kokoro offline)'; cảnh báo ⚠️ 'Trùng giọng' khi 2 vai dùng chung giọng.",
        ],
      },
    ],
  },
  {
    version: "v0.9.8",
    date: "06/10/2026",
    title: "Studio Lồng Tiếng: Nút Mở Thư Mục Lồng Tiếng",
    isCurrent: false,
    highlights: [
      {
        category: "Sửa Lỗi Nhỏ",
        icon: "📂",
        items: [
          "Thêm 2 nút ở thanh Export Action Bar trong tab Lồng Tiếng:",
          "📂 'Mở Thư Mục Lồng Tiếng' — hiện sau khi export thành công, mở folder chứa video *_dubbed.mp4 (có select file).",
          "📂 'Mở Thư Mục File Gốc' — luôn hiển thị khi đã chọn video input, mở folder chứa video gốc để duyệt các file .srt / audio khác cùng folder.",
          "Backend mới `dubbing_open_output_folder(path)` dùng `SHOpenFolderAndSelectItems` (giống downloader v0.9.4) thay `explorer.exe /select,...` cũ — fix lỗi path CJK.",
        ],
      },
    ],
  },
  {
    version: "v0.9.7",
    date: "06/10/2026",
    title: "Tối Ưu Tốc Độ Dịch Phụ Đề (Batch API)",
    isCurrent: false,
    highlights: [
      {
        category: "Tối Ưu Hiệu Năng",
        icon: "⚡",
        items: [
          "Phát hiện qua AUDIT-SUB: pipeline 'Tạo phụ đề' với video 21:43 mất ~64 phút do Stage 3 (Translate API) chiếm ~40 phút (62% tổng).",
          "Fix: thay vòng lặp sequential bằng `translate_batch_with_config()` đã có sẵn (chunk 15 segments/batch qua MiniMax-M3 batch endpoint).",
          "Tiết kiệm ~30 phút cho mỗi video 21:43 — Stage 3 từ ~40 phút xuống ~5-10 phút.",
          "Progress emit, hallucination filter, fallback original_text, cancel check đều giữ nguyên UX so với phiên bản cũ.",
          "Báo cáo đầy đủ +10 file bằng chứng: `agent-team/AUDIT_SUB_REPORT.md` + `test-output-audit-sub/`.",
        ],
      },
    ],
  },
  {
    version: "v0.9.6",
    date: "06/10/2026",
    title: "Chi Tiết Tải Video: Đường Dẫn, Dung Lượng, Chất Lượng & Tiến Trình",
    isCurrent: false,
    highlights: [
      {
        category: "Nâng Cấp Danh Sách Tải",
        icon: "📋",
        items: [
          "Video đã tải xong giờ hiện đủ: 🎞 chất lượng (vd 1920×1080 (Full HD)) · 💾 dung lượng thật đo từ file trên ổ đĩa · 📁 đường dẫn đầy đủ.",
          "Đang tải thì thấy rõ tiến độ: thanh chạy + % + tốc độ + thời gian còn lại + 'đã tải / tổng' (vd 📥 202.0 MB / 450.0 MB).",
          "Các mục tải từ bản cũ tự được đo lại dung lượng + chất lượng khi mở app — không cần tải lại.",
          "🔗 Mỗi mục hiện link video gốc kèm nút '📋 Copy link' — video die hay tải lỗi thì copy link dán lại là tải lại được.",
        ],
      },
    ],
  },
  {
    version: "v0.9.5",
    date: "06/10/2026",
    title: "Sửa Chất Lượng Tải: Hết Kẹt 360p",
    highlights: [
      {
        category: "Sửa Lỗi Tải Video",
        icon: "🎞️",
        items: [
          "Chọn 'MAX — chất lượng cao nhất' nhưng video chỉ 360p: nguyên nhân do cấu hình cũ ép client android (YouTube bóp về 360p, mất hết format nét cao). Đã bỏ — giờ MAX lấy được đủ 4K/1440p/1080p/720p.",
          "Đã test thật: tải 720p ra đúng 1280x720 (trước đó 640x360). Lưu ý: file cũ đã tải 360p muốn nét hơn thì xóa file cũ rồi tải lại.",
        ],
      },
    ],
  },
  {
    version: "v0.9.4",
    date: "06/10/2026",
    title: "Nút Chạy Video & Hiển Thị Thư Mục Tải",
    highlights: [
      {
        category: "Tiện Ích Tải Video",
        icon: "▶️",
        items: [
          "Nút '▶ Chạy Video' trên mỗi video đã tải xong — phát ngay bằng trình phát mặc định của Windows (xử lý đúng cả tên file có ký tự đặc biệt như ： ｜).",
          "Hiển thị rõ thư mục tải ngay màn hình Tải Video: '📁 File tải về được lưu tại: C:\\...' — biết chính xác file nằm ở đâu; nút 'Mở Thư Mục' mở Explorer chọn sẵn file.",
          "Mặc định TẮT 'Tự động trích xuất phụ đề' — ưu tiên video, tải nhanh hơn, tránh rate-limit 429 của YouTube khi không cần phụ đề.",
        ],
      },
    ],
  },
  {
    version: "v0.9.3",
    date: "06/10/2026",
    title: "Sửa Lỗi 'Không In Ra Đường Dẫn File' Oan",
    highlights: [
      {
        category: "Sửa Lỗi Nhỏ",
        icon: "🔧",
        items: [
          "Video tải xong thật nhưng app báo Lỗi oan ('không in ra đường dẫn file'). Nguyên nhân: chuỗi đường dẫn yt-dlp in ra bị mất ký tự đặc biệt (như ：, ｜) khi output không phải UTF-8 — trong khi file thật trên ổ cứng vẫn đủ ký tự, nên app không tìm thấy file dù nó đã tải xong.",
          "Đã sửa: ép UTF-8 cho output yt-dlp + khi exit thành công mà chưa xác minh được file, app quét thư mục tải tìm đúng file theo mã video làm bằng chứng gốc. Bấm 'Thử lại' giờ cũng xoá cảnh báo lỗi cũ khi thành công.",
        ],
      },
    ],
  },
  {
    version: "v0.9.2",
    date: "06/10/2026",
    title: "Sửa Lỗi Kiểm Tra Link + Tải Phụ Đề",
    highlights: [
      {
        category: "Sửa Lỗi Nhỏ",
        icon: "🔧",
        items: [
          "Kiểm Tra Link: lỗi 'EOF while parsing a value at line 1 column 0' khi dán link không khả dụng. Root cause: fetch_video_info quên pipe stdout/stderr nên output luôn rỗng. Đã sửa: đọc JSON chuẩn + tự dò payload giữa banner nhiễu, fallback thông báo thân thiện 'Video không khả dụng (đã xóa / riêng tư / chặn khu vực)'.",
          "Tải Phụ Đề: 8 request phụ đề liên tiếp (4 ngôn ngữ × 2 loại subs) gây HTTP 429 'Too Many Requests'. Đã thêm --sleep-subtitles 5 để yt-dlp tự delay 5 giây giữa mỗi request. Nếu YouTube vẫn giới hạn khi chạy dồn (rate-limit phía server): job không còn báo Lỗi oan — video đã tải xong vẫn giữ trạng thái Hoàn thành kèm cảnh báo rõ ràng 'phụ đề chưa tải được (429), thử lại sau vài phút'.",
          "Window title: đồng bộ title bar 2 cửa sổ (main + overlay) về đúng phiên bản v0.9.2 hiển thị trên sidebar.",
        ],
      },
    ],
  },
  {
    version: "v0.9.1",
    date: "06/10/2026",
    title: "Sửa Window Title Version Mismatch",
    highlights: [
      {
        category: "Sửa Lỗi Nhỏ",
        icon: "🔧",
        items: [
          "Window title (title bar + taskbar) của main và overlay window bị hardcode 'v0.8.0' trong tauri.conf.json dù sidebar/Changelog đã hiển thị 'v0.9.0'. Giờ cả 2 title match version thật.",
        ],
      },
    ],
  },
  {
    version: "v0.9.0",
    date: "06/10/2026",
    title: "Sửa Lỗi YouTube Download & Competitive Analysis",
    highlights: [
      {
        category: "Sửa Lỗi Quan Trọng: YouTube Download Hoạt Động Trở Lại",
        icon: "🔧",
        items: [
          "Phát hiện root cause: yt-dlp 2024.10+ yêu cầu JS runtime (Node.js/Deno) + remote challenge solver để bypass YouTube anti-bot. Sublix chưa pass 2 flag này nên mọi URL YouTube fail im lặng.",
          "Helper mới `find_js_runtime()` tự động phát hiện `node` hoặc `deno` trên PATH (qua `where node.exe` trên Windows, `which node` trên Unix).",
          "Auto pass `--js-runtimes <runtime>:<path>` + `--remote-components ejs:github` khi tải video YouTube — script solver được tải về từ GitHub ở lần đầu, cache lại cho lần sau.",
          "Áp dụng cho cả `start_download` (lẫn nhánh retry cookie fallback) và `fetch_video_info` (inspect metadata), nên 'Kiểm Tra Link' cũng work trên YouTube.",
          "Verified thủ công bằng CLI: 11.28 MB Rick Astley tải về trong ~1 giây.",
        ],
      },
      {
        category: "Competitive Analysis với 4 Repo Voice/Dubbing",
        icon: "📊",
        items: [
          "Nghiên cứu sâu 4 đối thủ: VoiceStudio (53k⭐, Python+Electron, AGPL), dub-studio (Tauri giống Sublix), YouDub-webui (FastAPI+Next.js, production 1M+ subs), ZastTranslate (Python Gradio, 33 ngôn ngữ).",
          "Phát hiện Sublix có 3 điểm UNIQUE: đa engine song song (Qwen 3 GPU + MiniMax-M3 Cloud), 1-click pipeline bridges (Downloader → Sub → Dubbing), Downloader đa nền tảng (9 site).",
          "Gợi ý roadmap P0: Voice DESIGN (text→voice), MCP server cho AI agents, multi-TTS engine swap. Xem `agent-team/COMPETITIVE_ANALYSIS.md`.",
        ],
      },
    ],
  },
  {
    version: "v0.8.0",
    date: "04/10/2026",
    title: "Nhận Diện Thị Giác AI & Bộ Minh Hoạ Điện Ảnh",
    highlights: [
      {
        category: "Bộ Nhận Diện Thị Giác Mới (AI Visual Identity)",
        icon: "🖼️",
        items: [
          "Logo mới: chữ S kết từ dải phim điện ảnh, kèm bộ icon ứng dụng trọn bộ cho taskbar & cửa sổ.",
          "Ảnh hero rạp chiếu phim ấm áp cho màn cài đặt đầu tiên (Onboarding).",
          "Bộ minh hoạ phẳng phong cách điện ảnh: khung chọn file, Trung tâm Models, lịch sử trống.",
          "Vân phim mờ tinh tế phủ trên sidebar ở theme Cinema & Studio.",
          "Tối ưu dung lượng ảnh từ 4.4MB xuống còn 184KB, app nhẹ và khởi động nhanh hơn.",
        ],
      },
      {
        category: "Kéo Thả Media & Trình Chọn Dropdown Hiện Đại",
        icon: "✨",
        items: [
          "Hỗ trợ Kéo & Thả (Drag & Drop) tệp Video / Audio trực tiếp từ máy tính vào ứng dụng qua Tauri Native Webview API.",
          "Thẻ Media thông minh hiển thị chi tiết tên file, định dạng, nút đổi file và xoá tức thì.",
          "Thay thế toàn bộ hộp chọn native Windows cũ bằng Custom Glass Select sang trọng, bo góc tròn, hiệu ứng mờ kính và checkmark chuẩn Studio.",
          "Phím tắt chọn nhanh cặp ngôn ngữ phổ biến (Anh - Việt, Nhật - Việt, Trung - Việt, Hàn - Việt) chỉ với 1 click.",
          "Công tắc gạt (Toggle Switch) mượt mà cho tùy chọn xuất phụ đề Song ngữ (*.bilingual.srt).",
        ],
      },
    ],
  },
  {
    version: "v0.7.0",
    date: "04/10/2026",
    title: "Đại Tu Giao Diện Cinema Studio & AI Dubbing Đa Vai",
    highlights: [
      {
        category: "Giao Diện & Hệ Thống 4 Theme (UI/UX Pro Max)",
        icon: "🎨",
        items: [
          "Bổ sung 4 phong cách giao diện: Cinema (Rạp phim ấm), Studio (Phòng dựng than chì), Light (Sáng dịu nhẹ), Vibrant (Tương phản cao hiện đại).",
          "Bộ chọn Theme nhanh với nút chuyển đổi tức thì, tự động ghi nhớ cấu hình khi khởi động lại.",
          "Chuẩn hóa toàn bộ màu sắc sang Design Tokens (CSS Variables), thanh cuộn siêu mỏng tinh tế.",
          "Sửa triệt để lỗi khóa cuộn màn hình (BUG-006) và chuẩn hóa thứ tự dòng phụ đề mẫu (BUG-024).",
        ],
      },
      {
        category: "Studio Lồng Tiếng AI (AI Dubbing Engine)",
        icon: "🎬",
        items: [
          "Tách giọng gốc sạch 100% bằng Demucs v4 CUDA GPU, giữ nguyên vẹn âm thanh nền BGM và hiệu ứng SFX.",
          "Tự động nhận diện phân vai diễn viên qua kịch bản ngữ cảnh MiniMax M3.",
          "Hỗ trợ bộ giọng đọc Neural siêu tự nhiên (Edge-TTS) và tự động co giãn tốc độ (FFmpeg atempo) khớp từng câu thoại.",
        ],
      },
      {
        category: "Sửa Lỗi Kỹ Thuật Trọng Yếu (Sprint 1)",
        icon: "🛠️",
        items: [
          "Chuyển toàn bộ đường dẫn biên dịch tĩnh sang phân giải động runtime (app_base_dir), chống lỗi portable.",
          "Khắc phục giới hạn FFmpeg amix 32 inputs bằng thuật toán gộp luồng phân cấp chunk 28.",
          "Vá lỗ hổng rò rỉ bộ nhớ Promise EventListener trong React khi chuyển tab (BUG-007).",
          "Bộ lọc ảo giác Whisper thông minh (giữ lại các câu chào phim tự nhiên) và xuất phụ đề SRT UTF-8 chuẩn xác.",
        ],
      },
    ],
  },
  {
    version: "v0.6.0",
    date: "04/10/2026",
    title: "Nâng Cấp CUDA RTX 3090 & Local LLM Translation",
    highlights: [
      {
        category: "Tăng Tốc Phần Cứng & AI Models 2026",
        icon: "⚡",
        items: [
          "Tích hợp Whisper Large-v3-Turbo Q8 (874MB) chạy trực tiếp trên GPU CUDA cho độ chính xác cao.",
          "Tích hợp mô hình dịch thuật tự nhiên Qwen3-4B-Instruct-2507 GGUF với bộ nhớ ngữ cảnh hội thoại 2 dòng cuốn chiếu.",
          "Tách biệt thư mục DLL tránh xung đột ggml giữa whisper-server và llama-server, độ trễ dịch siêu tốc ~120ms.",
        ],
      },
    ],
  },
  {
    version: "v0.5.0",
    date: "03/10/2026",
    title: "WASAPI Loopback Zero-Gap & Smart VAD",
    highlights: [
      {
        category: "Thu Âm Luồng & Nhận Diện Thời Gian Thực",
        icon: "🎙️",
        items: [
          "Xây dựng pipeline thu âm Producer-Consumer 2 luồng liên tục không ngắt quãng (0ms audio gap).",
          "Thuật toán Smart VAD (Voice Activity Detection) ngắt câu thông minh sau 360ms ngưng nói.",
          "Hỗ trợ dịch song ngữ Anh-Việt, Nhật-Việt, Trung-Việt trực tiếp từ phim và video đang phát.",
        ],
      },
    ],
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  currentVersion,
  isOpen,
  onClose,
  currentTheme = "cinema",
  onThemeChange,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="changelog-overlay" onClick={onClose}>
      <div
        className="changelog-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="changelog-header">
          <div className="changelog-header-left">
            <span className="changelog-badge-icon">🚀</span>
            <div>
              <div className="changelog-title-row">
                <h2 className="changelog-title">Nhật Ký Cập Nhật & Tính Năng Mới</h2>
                <span className="changelog-version-tag">Phiên bản {currentVersion}</span>
              </div>
              <p className="changelog-subtitle">
                Xem lại những cải tiến, tính năng mới và các bản vá lỗi được bổ sung trong Sublix.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="changelog-close-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Quick Theme Switcher Bar inside Modal */}
        {onThemeChange && (
          <div className="changelog-theme-bar">
            <span className="changelog-theme-label">🎭 Đổi nhanh Theme ứng dụng:</span>
            <div className="changelog-theme-chips">
              {[
                { id: "cinema", label: "🎬 Rạp phim", dot: "#e8a33d" },
                { id: "studio", label: "🎛 Phòng dựng", dot: "#2dd4bf" },
                { id: "light", label: "☀ Sáng nhẹ", dot: "#b45309" },
                { id: "vibrant", label: "🌸 Vibrant", dot: "#e11d48" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`changelog-theme-chip ${currentTheme === t.id ? "active" : ""}`}
                  onClick={() => onThemeChange(t.id)}
                >
                  <span className="changelog-dot" style={{ background: t.dot }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="changelog-body">
          {CHANGELOG_DATA.map((entry) => (
            <div
              key={entry.version}
              className={`changelog-version-card ${entry.isCurrent ? "is-current" : ""}`}
            >
              <div className="changelog-version-card-header">
                <div className="changelog-version-meta">
                  <span className="changelog-version-number">{entry.version}</span>
                  {entry.isCurrent && (
                    <span className="changelog-current-pill">Bản Đang Dùng</span>
                  )}
                  <span className="changelog-release-date">📅 {entry.date}</span>
                </div>
                <h3 className="changelog-entry-title">{entry.title}</h3>
              </div>

              <div className="changelog-sections">
                {entry.highlights.map((sec, idx) => (
                  <div key={idx} className="changelog-section">
                    <h4 className="changelog-section-title">
                      <span className="sec-icon">{sec.icon}</span> {sec.category}
                    </h4>
                    <ul className="changelog-item-list">
                      {sec.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="changelog-item">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="changelog-footer">
          <span className="changelog-footer-brand">
            Sublix — Local AI Subtitle & Dubbing Studio
          </span>
          <button
            type="button"
            className="changelog-ack-btn"
            onClick={onClose}
          >
            Đã Hiểu & Tiếp Tục Dùng
          </button>
        </div>
      </div>
    </div>
  );
};
