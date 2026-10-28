//! TSK-LAB-U1A — Dữ liệu giả định game "Vương Miện Tro Tàn" (UI_REDESIGN_PLAN §4.14).

import type { RecapItem } from "./labModel";

export interface MockVideoSource {
  id: string;
  name: string;
  durationSec: number;
  sizeMb: number;
  fps: number;
  resolution: string;
  hasSubtitles: boolean;
  studioProjectName?: string;
  path?: string;
}

export interface MockChapter {
  id: number;
  sourceIdx: number;
  title: string;
  summary: string;
  timeRange: string;
  durationSec: number;
  cutscenesCount: number;
  linesCount: number;
  included: boolean;
}

export interface MockCharacter {
  id: string;
  name: string;
  role: string;
  linesCount: number;
  avatarColor: string;
  mergedNotice?: string;
}

export interface MockJunkSegment {
  id: number;
  type: string;
  sourceName: string;
  timeRange: string;
  reason: string;
  restored: boolean;
}

export interface MockDraft {
  id: string;
  templateId: string;
  title: string;
  gameName: string;
  step: "source" | "analyze" | "narration" | "draft";
  status: "idle" | "running" | "completed" | "error";
  progressPct?: number;
  targetDurationSec: number;
  originalRatio: number;
  voiceId: string;
  updatedAt: string;
  openedInStudio?: boolean;
}

export const MOCK_VIDEO_SOURCES: MockVideoSource[] = [
  {
    id: "v1",
    name: "VuongMienTroTan_Tap01.mp4",
    durationSec: 4530, // 1h 15m 30s
    sizeMb: 4200,
    fps: 60,
    resolution: "1920x1080",
    hasSubtitles: true,
    studioProjectName: "Vương Miện Tro Tàn P1",
  },
  {
    id: "v2",
    name: "VuongMienTroTan_Tap02.mp4",
    durationSec: 5050, // 1h 24m 10s
    sizeMb: 4800,
    fps: 60,
    resolution: "1920x1080",
    hasSubtitles: false,
  },
  {
    id: "v3",
    name: "VuongMienTroTan_Tap03_FinalBoss.mp4",
    durationSec: 2720, // 45m 20s
    sizeMb: 2600,
    fps: 60,
    resolution: "1920x1080",
    hasSubtitles: false,
  },
];

export const MOCK_CHAPTERS: MockChapter[] = [
  {
    id: 1,
    sourceIdx: 0,
    title: "Chương 1: Lâu Đài Đổ Nát & Tỉnh Giấc",
    summary: "Kael thức tỉnh giữa đống hoang tàn, phát hiện phong thư cổ ghi dấu vị trí thanh kiếm Huyết Nguyệt.",
    timeRange: "P1 00:00:15 → 00:18:30",
    durationSec: 1095,
    cutscenesCount: 4,
    linesCount: 38,
    included: true,
  },
  {
    id: 2,
    sourceIdx: 0,
    title: "Chương 2: Lời Nguyền Của Nữ Hoàng Tro",
    summary: "Gặp gỡ Pháp sư Elora trong khu rừng phong ấn; đối mặt với bầy quái vật canh gác cổ thụ.",
    timeRange: "P1 00:18:30 → 00:48:00",
    durationSec: 1770,
    cutscenesCount: 6,
    linesCount: 52,
    included: true,
  },
  {
    id: 3,
    sourceIdx: 1,
    title: "Chương 3: Cuộc Phản Bội Dưới Hầm Mộ",
    summary: "Đại Tướng Quân Varek bất ngờ quay lưng khi cả đội tìm thấy phong ấn thứ hai của vương miện.",
    timeRange: "P2 00:05:20 → 00:32:15",
    durationSec: 1615,
    cutscenesCount: 5,
    linesCount: 46,
    included: true,
  },
  {
    id: 4,
    sourceIdx: 1,
    title: "Chương 4: Trận Chiến Cổng Vực Thẳm",
    summary: "Trận phục kích đẫm máu ở thung lũng xương; Elora liều mình mở cánh cổng dịch chuyển cứu cả đoàn.",
    timeRange: "P2 00:32:15 → 01:10:00",
    durationSec: 2265,
    cutscenesCount: 7,
    linesCount: 64,
    included: true,
  },
  {
    id: 5,
    sourceIdx: 2,
    title: "Chương 5: Sự Thật Về Ngọn Lửa Vĩnh Cửu",
    summary: "Khám phá bức phù điêu hé lộ Nữ Hoàng Tro thực chất chính là người bảo hộ cuối cùng bị biến chất.",
    timeRange: "P3 00:02:10 → 00:22:45",
    durationSec: 1235,
    cutscenesCount: 4,
    linesCount: 31,
    included: true,
  },
  {
    id: 6,
    sourceIdx: 2,
    title: "Chương 6: Trận Quyết Đấu Trên Điện Thờ",
    summary: "Trận chiến đỉnh cao giữa Kael và Nữ Hoàng Moria; sự hy sinh cao cả để khép lại lời nguyền ngàn năm.",
    timeRange: "P3 00:22:45 → 00:44:10",
    durationSec: 1285,
    cutscenesCount: 8,
    linesCount: 59,
    included: true,
  },
];

export const MOCK_CHARACTERS: MockCharacter[] = [
  { id: "c1", name: "Kael (Kẻ Vô Danh)", role: "Nhân vật chính · Hiệp sĩ cô độc", linesCount: 112, avatarColor: "var(--ac)" },
  { id: "c2", name: "Elora", role: "Pháp sư Cổ thụ · Đồng minh", linesCount: 84, avatarColor: "#7dd3fc" },
  { id: "c3", name: "Nữ Hoàng Tro Moria", role: "Trùm cuối · Người giữ ngọn lửa", linesCount: 65, avatarColor: "var(--dang-txt)", mergedNotice: "✓ đã gộp 'Moriah' ×12" },
  { id: "c4", name: "Tướng Quân Varek", role: "Chiến binh phản bội", linesCount: 48, avatarColor: "#c4b5fd" },
  { id: "c5", name: "Sứ Giả Vực Thẳm", role: "Boss gác cổng hầm ngục", linesCount: 19, avatarColor: "var(--ok-txt)" },
];

export const MOCK_JUNK_SEGMENTS: MockJunkSegment[] = [
  { id: 1, type: "Intro Streamer", sourceName: "VuongMienTroTan_Tap01.mp4", timeRange: "00:00:00 - 00:01:14", reason: "Chào hỏi kênh, donate", restored: false },
  { id: 2, type: "Loading Màn Hình", sourceName: "VuongMienTroTan_Tap01.mp4", timeRange: "00:24:10 - 00:25:05", reason: "Màn hình đen loading không tiếng", restored: false },
  { id: 3, type: "Quảng Cáo Sponsor", sourceName: "VuongMienTroTan_Tap02.mp4", timeRange: "00:15:30 - 00:17:10", reason: "Từ khoá quảng cáo VPN, shop game", restored: false },
  { id: 4, type: "Kho Đồ AFK", sourceName: "VuongMienTroTan_Tap02.mp4", timeRange: "00:45:00 - 00:47:20", reason: "Hình tĩnh, mở túi đồ suy nghĩ", restored: false },
];

export const MOCK_RECAP_ITEMS: RecapItem[] = [
  // Đoạn 1: Mở đầu lời bình (Hook)
  {
    id: 1,
    sourceIdx: 0,
    start: 15.2,
    end: 28.5,
    picture: "Kael mở mắt giữa tàn tích đổ nát đầy tàn tro bay lơ lửng",
    narration: "Một người thức giấc sau ngàn năm phong ấn, trong tay chỉ còn mảnh vỡ của một vương miện đẫm máu.",
    keepOriginal: false,
    ttsSecs: 7.2,
  },
  {
    id: 2,
    sourceIdx: 0,
    start: 29.0,
    end: 42.0,
    picture: "Anh bước qua xác những cỗ máy chiến tranh cổ đại",
    narration: "Thế giới bên ngoài đã không còn như trước, vương triều huy hoàng giờ đây chỉ là bãi nghĩa địa chìm trong bóng đêm.",
    keepOriginal: false,
    ttsSecs: 8.4,
  },
  // Đoạn 3: Giữ thoại gốc 1
  {
    id: 3,
    sourceIdx: 0,
    start: 43.5,
    end: 49.0,
    picture: "Kael rút thanh kiếm gỉ sét, cất giọng lạnh lùng",
    narration: "Bóng tối này... đã cướp đi tất cả của ta.",
    keepOriginal: true,
  },
  // Đoạn 4: Lời bình nối
  {
    id: 4,
    sourceIdx: 0,
    start: 50.0,
    end: 65.0,
    picture: "Elora xuất hiện sau rèm cây phát quang kỳ bí",
    narration: "Lần theo bức thư cổ, Kael tiến vào rừng phong ấn và bắt gặp Elora, người canh giữ những bí mật chưa từng được chép vào sử sách.",
    keepOriginal: false,
    ttsSecs: 10.1,
  },
  // Đoạn 5: Thoại gốc Elora
  {
    id: 5,
    sourceIdx: 0,
    start: 66.0,
    end: 71.5,
    picture: "Elora giơ cao quyền trượng cảnh báo",
    narration: "Ngươi không nên đánh thức ngọn lửa ấy, chàng trai trẻ.",
    keepOriginal: true,
  },
  // Đoạn 6: Lời bình
  {
    id: 6,
    sourceIdx: 0,
    start: 72.0,
    end: 88.0,
    picture: "Cả hai vượt qua cây cầu dây đứt gãy dẫn tới hầm mộ ngầm",
    narration: "Bỏ ngoài tai mọi lời cảnh báo, chàng hiệp sĩ quyết định đồng hành cùng nàng tiến sâu vào trái tim của vương quốc cổ.",
    keepOriginal: false,
    ttsSecs: 9.3,
  },
  // Đoạn 7: Chuyển sang Video P2 (Có câu nối lời bình)
  {
    id: 7,
    sourceIdx: 1,
    start: 20.0,
    end: 38.0,
    picture: "Không gian chuyển dịch sang hầm mộ sâu dưới lòng đất",
    narration: "Bước sang hầm ngục cấm địa, họ hội quân cùng Đại Tướng Quân Varek, người từng là biểu tượng bất khả chiến bại của hoàng gia.",
    keepOriginal: false,
    ttsSecs: 10.5,
  },
  // Đoạn 8: Lời bình kịch tính
  {
    id: 8,
    sourceIdx: 1,
    start: 39.0,
    end: 54.0,
    picture: "Varek rút kiếm đâm lén từ phía sau một người lính",
    narration: "Thế nhưng ngay khi phong ấn thứ hai vừa vỡ tan, bản chất thật của viên tướng quân mới chính thức lộ diện.",
    keepOriginal: false,
    ttsSecs: 8.8,
  },
  // Đoạn 9: Thoại gốc Varek
  {
    id: 9,
    sourceIdx: 1,
    start: 55.0,
    end: 61.2,
    picture: "Khuôn mặt Varek biến dạng trong nụ cười nham hiểm",
    narration: "Chỉ kẻ sở hữu tro tàn mới xứng đáng làm vua!",
    keepOriginal: true,
  },
  // Đoạn 10: Lời bình phản công
  {
    id: 10,
    sourceIdx: 1,
    start: 62.0,
    end: 79.0,
    picture: "Kael lao vào đỡ đòn kiếm rực lửa của Varek",
    narration: "Một trận chiến tay đôi nổ ra nghẹt thở trong không gian sụp đổ của hầm ngục, buộc Kael phải dốc toàn lực đối đầu.",
    keepOriginal: false,
    ttsSecs: 9.0,
  },
  // Đoạn 11: Thoại gốc Kael
  {
    id: 11,
    sourceIdx: 1,
    start: 80.0,
    end: 85.5,
    picture: "Kael tung cú chém quyết định hất văng kiếm đối thủ",
    narration: "Ngươi đã đánh mất danh dự của một hiệp sĩ!",
    keepOriginal: true,
  },
  // Đoạn 12: Chuyển sang Video P3
  {
    id: 12,
    sourceIdx: 2,
    start: 10.0,
    end: 28.0,
    picture: "Cổng đền thờ đỉnh núi lộ diện trong bão tuyết tro tàn",
    narration: "Tiến lên đền thờ trung tâm, câu trả lời cuối cùng về sự sụp đổ của toàn bộ đế chế dần được phơi bày trước mắt.",
    keepOriginal: false,
    ttsSecs: 9.5,
  },
  // Đoạn 13: Lời bình cao trào
  {
    id: 13,
    sourceIdx: 2,
    start: 29.0,
    end: 45.0,
    picture: "Nữ Hoàng Moria giáng trần trong đôi cánh lửa đen khổng lồ",
    narration: "Nữ Hoàng Tro không phải kẻ phá hủy, mà chính là người đã hy sinh thân xác để giam giữ lời nguyền hủy diệt suốt một thiên niên kỷ.",
    keepOriginal: false,
    ttsSecs: 10.2,
  },
  // Đoạn 14: Thoại gốc Moria
  {
    id: 14,
    sourceIdx: 2,
    start: 46.0,
    end: 52.0,
    picture: "Giọt nước mắt rực lửa lăn dài trên má nữ hoàng",
    narration: "Hãy giải thoát cho ta... và kết thúc chuỗi bi kịch này.",
    keepOriginal: true,
  },
  // Đoạn 15: Kết thúc lời bình
  {
    id: 15,
    sourceIdx: 2,
    start: 53.0,
    end: 72.0,
    picture: "Thanh kiếm cắm xuống điện thờ, ngọn lửa tàn lụi nhường chỗ cho bình minh",
    narration: "Một nhát kiếm khép lại quá khứ đen tối, để lại trên vùng đất hoang tàn mầm sống đầu tiên của một kỷ nguyên mới.",
    keepOriginal: false,
    ttsSecs: 11.0,
  },
];

export const MOCK_RECENT_DRAFTS: MockDraft[] = [
  {
    id: "draft-crown-1",
    templateId: "recap-game",
    title: "Vương Miện Tro Tàn — Bản dựng chuẩn 10 phút",
    gameName: "Vương Miện Tro Tàn",
    step: "narration",
    status: "idle",
    targetDurationSec: 600,
    originalRatio: 0.3,
    voiceId: "vi-VN-Nam-Hoang",
    updatedAt: "Hôm nay, 22:30",
  },
  {
    id: "draft-elden-2",
    templateId: "reel-highlight",
    title: "Elden Ring — Malenia No Hit Highlight",
    gameName: "Elden Ring",
    step: "analyze",
    status: "running",
    progressPct: 68,
    targetDurationSec: 60,
    originalRatio: 0.2,
    voiceId: "vi-VN-Nu-Lan",
    updatedAt: "Hôm qua, 18:15",
  },
  {
    id: "draft-wukong-3",
    templateId: "recap-game",
    title: "Black Myth Wukong — Hồi 1 & Hồi 2",
    gameName: "Black Myth: Wukong",
    step: "draft",
    status: "completed",
    targetDurationSec: 900,
    originalRatio: 0.35,
    voiceId: "vi-VN-Nam-Tuan",
    updatedAt: "26/10/2026",
    openedInStudio: true,
  },
];
