# ARCHIVE — PROJECT_STATE.md · mục ✅ Hoàn Thành (đã cũ)

> **Nguồn:** `agent-team/PROJECT_STATE.md` — mục `## ✅ Task Hoàn Thành (1 dòng / task)`
> **Ngày chuyển:** 2026-10-25
> **Số mục chuyển:** 59 (giữ 25 mục mới nhất trong file chính)
> **Nội dung:** nguyên văn, không sửa 1 chữ nào. Cần tra cứu lịch sử task cũ → mở file này.

---
| `TSK-UI-REDESIGN-R2-6` | Code lại UI tab Tải video theo thiết kế Opus (PLAN §2.3/§4.4/§6.1): bố cục **1 cột** + ô nhập lớn & nút Tải cạnh bên + chip tuỳ chọn + popover Nâng cao + danh sách kiểu HÀNG + menu ⋯/chuột phải — **chỉ JSX/CSS, giữ nguyên logic** | **CommandCode (Orca worker)** | 2026-10-24 | ✅ `tsc` 0 lỗi + `npm run build` OK (**verify trên bản sao HEAD** + 6 file của tôi vì `SublixStudioView.tsx` đang được worker R2A sửa dở); GUI instance riêng CDP 9226: **picker 184/184 mục** khi dán 2 link + 1 playlist, tải thật "Me at the zoo" → **✓ Xong · 465 KB**, menu ⋯ **đủ 6 mục**, "Mở trong Studio" mở đúng video, **tuỳ chọn reup vẫn tạo `.info.txt` (BOM)**, link Kuaishou → báo lỗi sớm; ảnh `%TEMP%\sublix-verify-dl\*.png`; chưa commit |

| `TSK-BENCH-MINIMAX-FLASH` | Đo MiniMax M3.1 Flash (API) vs dịch local (Ollama qwen2.5:3b) — harness Rust chạy đúng code app; nếu nhanh hơn + chất lượng ≥ local thì thêm nút chọn nhanh trong Settings (KHÔNG đổi model mặc định) | **mcode #2 (Orca worker)** | 🔴 HIGH | ✅ Xong 2026-10-24 | `docs/BENCH_TRANSLATE_2026-10.md` (mới) · `src-tauri/examples/bench_translate.rs` (mới) · `src-tauri/src/translate/server.rs` (profile M3.1-Flash) · `src/views/SettingsView.tsx` (thêm nút ⚡ MiniMax M3.1 Flash) — **chưa commit**; M3.1-Flash (reasoning_effort=low) 26,3s/60 câu, chất lượng 4,72/5 ≥ local 4,27, nhưng M3 hiện tại timeout lô 15 câu |

| `TSK-FEAT-TTS-3ENGINES` | 3 engine giọng Việt mới (VieNeu v3 Turbo thật cho `vietneu:`, ZeroTTS, cloud Google Chirp3 + FPT.AI) + tải model verify byte + chuẩn hóa số `vi_normalize` — chỉ backend/command/wrapper | **Claude Sonnet 5.5 (Orca worker)** | 2026-10-24 | ✅ `cargo test --lib` 113/113, tsc 0, build OK; chạy thật CPU: VieNeu WER 0%, ZeroTTS 0%, Kokoro s3 30%→10%; MP4 VieNeu 2 track audio; **CUDA 3090 chưa test**; UI/Studio (`mapVoiceForEngine`) chờ vòng thiết kế; chưa commit |

| `TSK-UI-REDESIGN-P1` | Thiết kế lại giao diện 6 tab — vòng 1: khảo sát app thật (instance riêng CDP 9225) + kiểm kê control + thiết kế + mockup, KHÔNG sửa code app | **Claude Opus 5.5 (Orca worker)** | 2026-10-24 | ✅ `docs/UI_REDESIGN_PLAN.md` + `docs/ui-mockups/` (3 mockup HTML, 16 ảnh trước/sau/so sánh ~3 MB); panel trái Studio **45 → 20 control** (nội dung 1687 px chỉ thấy 405 px), **18 nhóm trùng lặp** đã xác minh; kế hoạch code vòng 2 (8 bước, ~7 ngày) chờ mcode + CommandCode xong |

| `TSK-FEAT-DL-PLATFORMS-REUP` | Thêm 8 nền tảng tải video (Instagram Reels/Facebook/Twitch/Kick/Dailymotion/VK/Pinterest/Snapchat) + khu "Tùy chọn reup" (info.txt, download-archive, thumbnail, cắt đoạn) + sửa lỗi kuaishou/migu (báo "yt-dlp chưa hỗ trợ" NGAY, không gợi ý cập nhật) | **CommandCode (Orca worker)** | 2026-10-24 | ✅ `cargo test --lib` **77/77 PASS** (+10 test mới), `tsc` 0 lỗi, `npm run build` OK; chạy THẬT (đúng `build_download_command`): IG Reel → `.mp4`+`.jpg`+`.info.txt` (BOM, 5 dòng đầu đúng tiếng Việt), tải lần 2 → **"Đã tải trước đó"** (archive), Pinterest cắt `05-15s` → ffprobe **10.000000s**; chưa commit — chờ PO duyệt |

| `TSK-RES-VI-VOICE` | Nghiên cứu + đo thật model giọng đọc tiếng Việt (≥12 ứng viên; 11 model × 3 câu tạo WAV thật + WER/CER + RTF + nghiêng điệu F0 + DNSMOS) — chỉ nghiên cứu, KHÔNG sửa code app | **mcode #2 (Orca worker)** | 2026-10-24 | ✅ `docs/VI_VOICE_MODELS_2026.md` (3 phần, bảng 20 ứng viên offline + 13 cloud, bảng đo 11 model) + `%TEMP%\sublix-voice-bench\index.html` (30 file nghe thử); **Kokoro hiện tại bỏ rơi ngày tháng (WER S3 30%)**; **VieNeu-TTS v3 Turbo clone đạt WER/CER 0%** và RTF 0.92 (fp32) — ứng viên #1 (Apache-2.0); phát hiện `BUG-H13` Edge-TTS trả 0 byte không retry; F5-TTS loại (WER S3 40%, RTF 43) |

| `TSK-TIMELINE-FIX-DND-RANGE` | Timeline Studio: kéo thả khối (dời/trim/hít/chặn chồng/undo) + vùng In/Out chạy thật trên câu trong vùng + fix Ctrl+click gộp 1 câu + voice giật ở 1.5x + ducking | **Claude Sonnet 5.5 (Orca worker)** | 2026-10-24 | ✅ `BUG-076..081`; `tsc` 0 lỗi, `npm run build` OK; GUI instance riêng CDP 9224: dời/trim/nhóm/hít/Esc/undo đạt, Ctrl+click `[6]`→`[2,6,7]`, voice 1.5x 10→4 lần tua, vùng In/Out: 4 lệnh chỉ đổi câu trong vùng (câu ngoài nguyên vẹn); chưa commit — chờ PO duyệt |

| `TSK-RES-DL-PLATFORMS` | Nghiên cứu mở rộng tab Tải video sang nền tảng khác phục vụ reup + chạy thử yt-dlp thật (chỉ đọc, KHÔNG sửa code) | **CommandCode (Orca worker)** | 2026-10-24 | ✅ `docs/DOWNLOADER_PLATFORM_EXPANSION.md` — chạy thử THẬT 29 nền tảng (yt-dlp 2026.10.21, 11 nền tảng tải được: FB/IG Reel/Twitch/Kick/Dailymotion/VK/Niconico/Pinterest/Snapchat/MangoTV/YouTube); phát hiện **Threads/Kuaishou/Kwai/Migu/Lemon8 không có extractor** (Kuaishou+Migu trong `get_platform` là lỗi): top-8 nền tảng + top-5 tính năng reup (S/M/L) |

| `TSK-TIMELINE-INTEGRATE-MODULES` | Gắn 6 module timeline (timecode, shuttle, markers, trackLock, clipboard, autoFollow) + TimecodeInput vào `SublixStudioView.tsx` | **Mavis/mcode (Orca worker)** | 2026-10-24 | ✅ Gắn đủ 6 tính năng vào `SublixStudioView.tsx` (import 6 module, alias `formatTimecode`, `getEffectiveRate` 1 nguồn tốc độ, guard khoá track ở move/trim/split/delete/edit-text/paste, marker lưu project cache); `node --test` 79/79 PASS, `tsc` 0 lỗi, `npm run build` OK; **GUI instance riêng (CDP 9224): 22/22 PASS** (timecode 20s, Ctrl+C/V dán 2 câu tại 30s, auto-follow lật trang, L L→2x, J lùi, K+L nhích 1 frame 0.04s, M/Shift+M/Ctrl+Shift+M, khoá track chặn kéo + mở khoá kéo được, hồi quy Ctrl+click của Sonnet OK); app PO 9223 không bị đụng |

| `TSK-TIMELINE-MODULES-EASY` | Viết sẵn 6 module timeline kiểu Premiere (timecode, shuttle, markers, trackLock, clipboard, autoFollow) + TimecodeInput.tsx + unit test — file RIÊNG, CHƯA gắn vào SublixStudioView | **Mavis/mcode (Orca worker)** | 2026-10-24 | ✅ `src/lib/timeline/` (6 module TS thuần) + `src/views/studio/TimecodeInput.tsx` + `scripts/timeline-tests/` (**79 test, node --test 79/79 PASS**) + `docs/TIMELINE_INTEGRATION_PLAN.md`; `tsc` 0 lỗi, `npm run build` OK; **chưa gắn vào app** (chờ Sonnet xong `SublixStudioView.*`) |

| `TSK-RES-TIMELINE-GAP` | Nghiên cứu gap timeline Sublix vs Premiere Pro + khảo sát 9 dự án OSS (chỉ đọc, không sửa code) | **Mavis/mcode (Orca worker)** | 2026-10-24 | ✅ `docs/TIMELINE_GAP_ANALYSIS.md` — bảng 43 dòng tính năng (Có/Thiếu/Lỗi + file:dòng) + 9 dự án OSS có license + top-5 khuyến nghị; xác định 5 lỗi gốc gây "In/Out không hoạt động" (lọc vùng chứa-trong `:3052`/`:3206`, TTS nuốt lỗi `:3267`, mất dữ liệu `:2982`/`:3528`) |

| `TSK-FEAT-DL-BATCH-AUDIO` | Tab Tải video: tải nhiều link 1 lần + mở rộng playlist (`--flat-playlist -J`, checkbox, trần 200) + chế độ chỉ tải âm thanh MP3/M4A | **Claude Code (Orca worker)** | 2026-10-24 | ✅ `cargo test --lib` 67/67 (+7), tsc 0, build OK; yt-dlp thật playlist 4/13 mục + 4 file mp3 (ffprobe OK); GUI CDP verify; chưa commit — chờ PO duyệt |

| `TSK-FEAT-AMD-IGPU-PRESET` | Thêm preset thứ 4 "GPU Tích Hợp AMD (Radeon / Ryzen AI)" + lệnh `ollama_models` + dropdown model + fix timeout/thinking Ollama | **Mavis (MiniMax-M3)** | 2026-10-24 | ✅ 3 preset cũ giữ nguyên; preset AMD dịch qua Ollama chạy **iGPU ROCm** (32,8 vs 15,5 tok/s); dịch thử app ✅; `BUG-H10`; v0.11.36 |

| `TSK-SETUP-MACHINE-2026-10-23` | Dựng môi trường máy mới (clone repo → toolchain → build → verify E2E) | **Mavis (MiniMax-M3)** | 2026-10-23 | ✅ `C:\AI Project\Sublix` clone `master`@`e61ba07`; Rust 1.99.1 MSVC + VS BuildTools 2022 + yt-dlp; `cargo test --lib` 60/60; app dev chạy OK; STT whisper 2,6s + dịch Ollama ✅; phát hiện `BUG-H09` |

| `TSK-FIX-KOKORO-EXPORT-074-075` | Sửa "Xuất video mất tiếng Việt" (`vietneu:` → `kokoro:` ở backend) + Kokoro batch mode (12,4s/câu → ~1,2s/câu) | **Mavis (MiniMax-M3)** + Worker agent | 2026-10-23 | ✅ Export thật 78 câu ~2 phút, file có track AI; đối chiếu giọng corr 0,69 vs 0,03; `BUG-074`, `BUG-075`; v0.11.35 |

| `TSK-FIX-VERSION-DRIFT-073` | Đồng bộ version 4 nguồn + 2 tiêu đề cửa sổ native (drift `v0.11.32` còn sót trong `tauri.conf.json`) & tạo lại guard `scripts/check_version.ps1` + npm `verify:version` | **Mavis (MiniMax-M3)** | 2026-10-20 | ✅ 4 nguồn = `0.11.34`; guard PASS exit 0 / negative test `[LECH]` exit 1; `tsc` 0 lỗi; `BUG-073` |

| `TSK-FIX-STUDIO-REPLACE-EXPORT-VLC` | Sửa lỗi không đổi được video trong Studio (dội ngược file cũ) & Xuất Softsub / Multi-track Audio chuẩn VLC | **Antigravity** | 2026-10-13 | ✅ Bỏ deps filePath, tập trung handleLoadNewVideoFile + onClearPendingFile; FFmpeg Softsub & Multi-track VLC; Modal UI cấu hình xuất; v0.11.33 |

| `TSK-SUBS-YOUTUBE-REUSE-2026-10-13` | Studio tận dụng phụ đề YouTube đã tải (checkbox TÍCH SẴN) + marking "YouTube" (badge timeline + chip Downloader + manifest quản lý) | **CommandCode** | 2026-10-13 | ✅ E2E StarCraft: whisper=0 process, 49 câu từ .srt, badge "📥 YouTube (.en)", manifest 2 entry; v0.11.32 |

| `TSK-FIX-SUBS-2026-10-13` | Fix phụ đề Tab Tải Video (bật checkbox mà không ra file): tách sub-pass riêng chống 429 + nút "📝 Tải phụ đề" + chip langs + backfill item cũ | **CommandCode** | 2026-10-13 | ✅ E2E thật: StarCraft ra `en.srt`+`vi.srt` (9:29), video mới tự ra `en.srt`, chip UI đo được; `BUG-061`; v0.11.31 |

| `TSK-STUDIO-PERF-TIMELINE-FIX` | Sửa video nhảy player ngoài (thay bằng 🚀 Xem Trong Studio) & Khắc phục triệt để đơ timeline 323 câu / transcode ngầm 100% CPU | **Antigravity** | 2026-10-12 | ✅ Memoize 323 cards/blocks (`React.memo`), throttle onTimeUpdate 120ms, native video listeners, fix transcode oan |

| `TSK-TTS-STRICT-INDEX-SAMPLE-PREVIEW` | Phân loại độc quyền giọng đọc theo từng Model TTS AI + Nghe thử mẫu giọng tiêu biểu trước khi load chọn (VietNeu, Kokoro 14 giọng sample WAV, Edge-TTS Cloud) | **Antigravity** | 2026-10-11 | ✅ Bỏ nút Tất cả models; dropdown của vai chỉ hiện voice của Model đang chọn; Nút ▶️ Mẫu trên từng card & spec; toggle dừng/phát chuẩn xác |

| `TSK-TRACK-CLEAR-DYNAMIC-RANGE` | Sửa dứt điểm nút xóa track tiếng bảo toàn phụ đề, Hiển thị động 2 track Timeline & Menu chuột phải AI khoanh vùng | **Antigravity** | 2026-10-11 | ✅ `handleClearTrack` chỉ xóa `hasAudio`, bảo toàn 100% phụ đề, Timeline rỗng chỉ hiện Video & Audio gốc, Timeline Context Menu In/Out AI bóc tách + dịch + lồng tiếng độc lập |

| `TSK-TRACK-VOICE-DISTINCT` | Sửa dứt điểm nhầm lẫn giữa Track Phụ Đề & Track Tiếng Lồng, đổi tên vai thành Thuyết minh AI, Audio Wave Blocks | **Antigravity** | 2026-10-11 | ✅ Đổi tên vai "Phụ đề" ➔ "Thuyết minh AI", Cột Tracks: `💬 PHỤ ĐỀ (TEXT)` vs `🎙️ TIẾNG LỒNG: [Tên vai]`, Audio Waveform Texture, Laser head Tiếng lồng |

| `TSK-RESIZABLE-TTS-HUB` | Resizable Panels (kéo co giãn cột trái/phải), TTS Engine Selector, VietNeu/Kokoro/Edge giọng đọc phong phú, Đồng bộ Models Hub | **Antigravity** | 2026-10-11 | ✅ Resizable Splitters kèm localStorage/reset, TTS Model Selector Card (VietNeu, Kokoro 82M, Edge-TTS), 20+ giọng đọc chi tiết, Hub Models TTS table |

| `TSK-PROCESS-POLISH` | Đồng bộ Studio ➔ Tiến trình, Polish Cinema Pro Stepper, Live Elapsed Timer, Metrics Dashboard | **Antigravity** | 2026-10-11 | ✅ Đồng bộ metadata (filename, workflow, steps), loại bỏ hardcode 'Studio Lồng Tiếng' & '0/2 câu thoại', Live timer, Stepper |

| `TSK-TIMELINE-START-ALIGN` | Căn chuẩn gốc Timeline x=0 (xóa offset 40px, Playhead needle & ticks & tracks đồng bộ tại 00:00:00) | **Antigravity** | 2026-10-11 | ✅ Kim tua, ruler tick 00:00, video, sóng âm, phụ đề bắt đầu chuẩn x=0, clip-path cờ khi sát biên, E2E build 100% |

| `TSK-STUDIO-ROUND-15` | Unified Studio: Bridge Downloader thẳng vào Studio, dọn sạch 2 tab nổ, đồng bộ Master Topbar | **Antigravity** | 2026-10-11 | ✅ Nút `🚀 Đưa Vào Studio`, loại bỏ tab popping `file_sub`/`dubbing`, đồng bộ 6 Master tabs, badge v0.11.29, E2E Playwright pass |

| `TSK-STUDIO-ROUNDS-10-14` | Studio Premiere Timeline Resizer, Marquee, VietNeu TTS, Dynamic HUD, Sub-only Flow | **Antigravity** | 2026-10-10 | ✅ Hoàn tất 5 rounds (R10-R14), commit `ac735e5`, push GitHub xanh, build TS 100% |

| `TSK-V2-S4-VERIFY` | Step S4: E2E Verification video đa vai + trích xuất deliverables v2_* & bump v0.10.0 | **Antigravity** | 2026-10-07 | ✅ E2E multi_speaker_scene.mp4 -> v2_multi_speaker_DUBBED.mp4 (375KB, 26s), 2 clips sample audio, test_v2_diarization_e2e pass |

| `TSK-V2-S3-UI` | Step S3: UI Bảng vai diễn: nghe giọng gốc (Base64 data URI), gộp vai, badge AI Sherpa/Heuristic | **Antigravity** | 2026-10-07 | ✅ UI DubbingStudioView đầy đủ nút Nghe giọng gốc, dropdown gộp vai, badge phân vai, đếm câu thoại, npm run build xanh 2.45s |

| `TSK-V2-S2-INTEGRATE` | Step S2: Tích hợp sherpa diarization vào backend analyze_and_create_project + clip audio mẫu | **Antigravity** | 2026-10-07 | ✅ Map segments theo time overlap, trích 2-8s sample audio Data URI per speaker, fallback heuristic an toàn, unit test pass 6.07s |

| `TSK-HOTFIX-32KB` | Hotfix Phim Dài: Fix Windows 32KB CMD limit khi export phim dài (445 segments) bằng chunked amix track | **Antigravity** | 2026-10-07 | ✅ `render_combined_speech_track` hierarchical chunks $\le 28$ inputs, unit test 100 segments pass 0.87s, CMD <300 chars |

| `TSK-V2-S1-DIARIZE` | Step S1: Diarization Sidecar (`sherpa-onnx` pyannote + wespeaker) + CLI test ground truth | **Antigravity** | 2026-10-07 | ✅ `sherpa_diarize.py` tách chuẩn 2 vai `[0, 1, 0, 1, 0]` trên `dialogue_2spk.wav` (100% ground truth), 1 vai trên 1-speaker |

| `TSK-FEAT-KOKORO-OFFLINE` | Feat: dời Model Giọng Nói vào tab "Studio Lồng Tiếng AI" (panel gọn "🎛 Chọn Giọng & Tải Model") + engine **Kokoro-Vietnamese OFFLINE** (sidecar onnxruntime+vig2p, retry-rồi-skip câu lỗi, 14 VoicePreset `kokoro:*`) | **CommandCode** | 2026-10-06 | E2E Kokoro offline → `test_dubbing_input/kokoro_DUBBED_TEST.mp4` (378.671B, 26s); 2 sample mp3; GUI agent-browser xác nhận panel + tab Models đã sạch mục cũ |

| `TSK-FIX-V095-QUALITY` | Fix v0.9.5: chất lượng tải kẹt 360p (bỏ ép player_client android — SABR) | **CommandCode** | 2026-10-06 | PO tự verify: DeepSeek V4.1 → 1920×1080 (309.7MB); CLI 720p → 1280×720 |

| `TSK-FEAT-V096-DETAILS` | Feat v0.9.6: hiển thị chất lượng/dung lượng/đường dẫn + "đã tải/tổng" + link gốc & Copy link + fix 403 (curl_cffi) | **CommandCode** | 2026-10-06 | GUI verify đủ chips+link+copy; backfill mục cũ OK; BBB retry 1280×720; exe v0.9.6 |

| `TSK-FEAT-V094-PLAY-FOLDER` | Feat v0.9.4: nút "▶ Chạy Video" + hiển thị đường dẫn thư mục tải + fix nút "Mở Thư Mục" (SHOpenFolderAndSelectItems) + mặc định tắt sub | **CommandCode** | 2026-10-06 | GUI E2E: VLC mở đúng file + Explorer mở đúng thư mục; exe v0.9.4. Theo yêu cầu trực tiếp của PO |

| `TSK-FIX-V093-FALSEERR` | Fix v0.9.3: lỗi báo oan "không in ra đường dẫn file" (path yt-dlp in ra mất ký tự codepage) | **CommandCode** | 2026-10-06 | Ép UTF-8 output + recovery quét ổ đĩa theo mã video (bằng chứng gốc) + UI xoá cảnh báo cũ khi Thử lại; GUI retry E2E xanh (Hoàn Thành 3→4); exe v0.9.3. Commits `e48712c`+`8162033` |

| `TSK-FIX-V092-EOF-429` | Fix v0.9.2: EOF "Kiểm Tra Link" + HTTP 429 phụ đề (2 bug từ handoff Mavis) | **CommandCode** | 2026-10-06 | Root cause EOF = thiếu pipe stdio từ R2-08.3; fix pipe + parse JSON an toàn + báo lỗi thân thiện; `--sleep-subtitles 5` + giữ ✅ video khi sub 429. Build v0.9.2 xanh, 8/8 test. Commits `54f5ae2`+`6d7bc1b` |

| `TSK-022.1` | Phase 1: Xây dựng Tab Tải Video Đa Nền Tảng (YouTube, TikTok, Douyin, Bilibili) & Cầu nối 1-Click | Antigravity | 2026-10-04 | Kế thừa trọn vẹn hermes-downloader: đa nền tảng, cookies Edge/Chrome/Firefox, sub extract, pause/resume/cancel, 1-click bridge sang File Sub & Studio Dubbing |

| `TSK-023` | Fix Triệt Để 8 Lỗi Nền Móng Phase 0 (BUG-026, 027, 028, 029, 030, 031, 032, 041) | Antigravity | 2026-10-04 | Cây amix ≤28 inputs, normalize=0, generation hủy AtomicU64 + diệt PID tree, không nuốt lỗi dịch, chống rò rỉ listener + race drop file, pass unit test & build release |

| `TSK-FIX-BUG044-058` | Vá 15 lỗi Tab Tải Video (044–058) — shell injection, tab leak, NaN%, disk check, Job Object, etc. | **Mavis (MiniMax-M3)** | 2026-10-04 | Đã fix đủ 15 bugs trong 3 commits (Nhóm 1+2+3); chỉ defer Job Object KILL_ON_JOB_CLOSE — chi tiết tại `BUG-FIX-REPORT-BUG044-058.md` |

| `TSK-FIX-R2-001-009` | Vòng 2 nốt 9 lỗi R2-01..R2-09 (sau CommandCode audit) | **Mavis + alex** | 2026-10-05 | R2-08 (Job Object KILL_ON_JOB_CLOSE + 4 fix nhỏ) do alex làm (d2d3f7c); R2-02..R2-07 + R2-09 do Mavis làm (1e2bd3d); R2-01 gộp vào d2d3f7c do ordering. cargo check + npm run build xanh. Chi tiết: `BUG-FIX-REPORT-VONG2.md` |

| `TSK-RES-001` | Competitive analysis Sublix vs 4 repo voice/dubbing trên GitHub (VoiceStudio 53k⭐, dub-studio, YouDub-webui, ZastTranslate) | **Mavis** | 2026-10-05 | So sánh feature matrix theo 6 nhóm (Voice/TTS, STT/Diarization, Translation, Studio UI, Pipeline, Desktop/Distribution) + phân tích kiến trúc Tauri vs Electron. Roadmap gaps P0-P3. Tài liệu: `COMPETITIVE_ANALYSIS.md` (15KB) |

| `TSK-021` | Benchmark LLM & Bộ chọn Biên kịch 1-Click (Local Qwen 3 GPU vs MiniMax-M3) | Antigravity | 2026-10-04 | Đã tích hợp Batch cho Qwen 3 GPU (~0.1s/câu, 20s/phim), bộ chọn 1-click trực tiếp trong Studio |

| `TSK-020` | Tối ưu hiệu năng Lồng Tiếng AI: Ghép nối câu, Dịch theo cụm (Batching), Chọn phạm vi & Nút Dừng | Antigravity | 2026-10-04 | Đã giảm 90% câu rác, tăng tốc dịch 30x, hỗ trợ test 3 phút trong 20s và nút Dừng lại tức thì |

| `TSK-019` | AI Dubbing Studio: Chọn Ngôn Ngữ Đầu Ra (Target Lang) + Drag-Drop Media + Voice Showcase | Antigravity | 2026-10-04 | Đã hoàn thành chọn target lang (vi/en/ja/zh), gán giọng chuẩn, nghe thử tức thì, build release v0.8.0 |

| `TSK-017` | Fix Đợt 1 Nhóm Lỗi Siêu Nghiêm Trọng từ Audit (BUG-001, 005, 006, 007, 008, 013, 015, 023) | Antigravity | 2026-10-04 | Đã fix runtime paths, amix chunking + script, hallucination filter, listener leak, atomic config, real SRT ts |

| `TSK-016` | Kiểm thử E2E video đa vai từ A-Z, xuất 2 video thành phẩm & fix BUG-006 | Antigravity | 2026-10-04 | Đã tạo clip đối thoại 2 vai, phát hiện và fix BUG-006 (phân vai), xuất video Ducking & Theatrical hoàn hảo |

| `TSK-015` | Soạn thảo Cẩm nang Vận hành Lồng tiếng AI & Củng cố Fallback Voice Engine | Antigravity | 2026-10-04 | Đã tạo `docs/HUONG_DAN_HE_THONG_LONG_TIENG_AI.md`, hoàn thiện tra cứu giọng và fallback `python -m edge_tts` |

| `TSK-014` | Tích hợp Demucs v4 (CUDA) Vocal Isolation & Bộ chuyển chế độ Thuyết minh / Chiếu rạp | Antigravity | 2026-10-04 | Tách sạch 100% vocal gốc, chỉ giữ BGM & SFX, ghép lồng tiếng chuẩn chiếu rạp |

| `TSK-011` | Triển khai Module AI Dubbing Studio (Diarization, TTS, Remux) | Antigravity | 2026-10-04 | Hoàn thành Studio phân vai, nghe thử TTS, biên kịch MiniMax-M3 và xuất video FFmpeg |

| `TSK-010` | Tích hợp Collaborator Kit v1.1 vào Sublix & hệ thống app | Antigravity | 2026-10-04 | Hoàn thành bộ 4 file cốt lõi + quy trình 6 bước + skill `.agents/skills/jimmyvu-agent-collab` |

| `TSK-009` | Cấu hình MiniMax-M3 API (`sk-cp-`) & nút chọn model | Antigravity | 2026-10-04 | Đã cấu hình gateway `api.minimax.io`, cờ `reasoning_split`, test Anh/Nhật/Trung mượt mà |

| `TSK-008` | Soạn thảo Đặc tả Kỹ thuật Lồng Tiếng AI SOTA | Antigravity | 2026-10-04 | Hoàn thành `docs/SPEC_AI_DUBBING_AND_LLM.md` cho reviewer đánh giá |

| `TSK-007` | Tích hợp MiniMax Cloud API & Local Ollama 27B | Antigravity | 2026-10-03 | Hỗ trợ 3 provider dịch thoại linh hoạt, không tốn VRAM |

| `TSK-006` | Thiết kế lại Settings UI dạng Sidebar Navigation | Antigravity | 2026-10-03 | Giao diện hiện đại, dễ thao tác theo yêu cầu anh Tuấn |

| `TSK-005` | Triển khai tính năng Tạo phụ đề hàng loạt cho Tệp | Antigravity | 2026-10-02 | Hỗ trợ kéo thả mp4/mkv/mp3 xuất file srt/vtt/json |

| `TSK-004` | Tối ưu hóa Whisper CUDA & Llama-server VRAM | Antigravity | 2026-10-01 | Tốc độ STT đạt ~0.1s/chunk trên RTX 3090 |

---
