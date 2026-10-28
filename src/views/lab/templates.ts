//! TSK-LAB-U1A — Định nghĩa các mẫu video trong Xưởng AI (UI_REDESIGN_PLAN §4.14).

export interface LabTemplate {
  id: string;
  icon: string;
  title: string;
  oneLine: string;
  outputSummary: string;
  inputRequired: string;
  processingNote: string;
  enabled: boolean;
  tag?: string;
  stepsCount: number;
}

export const LAB_TEMPLATES: LabTemplate[] = [
  {
    id: "recap-game",
    icon: "🎮",
    title: "Recap cốt truyện game",
    oneLine: "Tóm tắt mạch truyện, boss then chốt và giữ thoại gốc đắt giá",
    outputSummary: "Video ngang 5 / 10 / 15 / 20 phút",
    inputRequired: "Gameplay có cốt truyện, hoặc dự án Studio đã nhận dạng",
    processingNote: "Nhận dạng offline trên máy, AI viết lời theo Cài đặt › Dịch thuật",
    enabled: true,
    stepsCount: 3,
  },
  {
    id: "reel-highlight",
    icon: "⚡",
    title: "Reel highlight",
    oneLine: "Trích xuất 3–6 clip dọc 9:16 các pha hành động kịch tính",
    outputSummary: "3–6 clip dọc 9:16 (30–60 giây)",
    inputRequired: "Gameplay hành động, giao tranh, đánh boss",
    processingNote: "Tự động phát hiện chuyển cảnh cutscene & lọc khoảng lặng",
    enabled: true,
    tag: "Khung mẫu",
    stepsCount: 3,
  },
  {
    id: "top-10",
    icon: "🏆",
    title: "Top 10 khoảnh khắc",
    oneLine: "Bảng xếp hạng pha xử lý đỉnh cao kèm thẻ đồ họa số đếm",
    outputSummary: "Video ngang 8–12 phút kèm thẻ đếm ngược",
    inputRequired: "Nhiều clip ngắn highlight",
    processingNote: "Dựng đồ họa động qua hệ thống mẫu",
    enabled: false,
    tag: "Sắp có",
    stepsCount: 3,
  },
  {
    id: "character-lore",
    icon: "📜",
    title: "Lore nhân vật & Thế giới",
    oneLine: "Phân tích chiều sâu nhân vật, bối cảnh và bí mật ẩn giấu",
    outputSummary: "Video tài liệu chiều sâu 10–15 phút",
    inputRequired: "Cutscene đối thoại & ghi chép lore trong game",
    processingNote: "AI tra cứu bối cảnh lore chuyên sâu",
    enabled: false,
    tag: "Sắp có",
    stepsCount: 3,
  },
  {
    id: "game-compare",
    icon: "⚔",
    title: "So sánh đồ họa / Chi tiết",
    oneLine: "Chia đôi màn hình so sánh giữa các phiên bản hoặc lối chơi",
    outputSummary: "Video so sánh song song 5–8 phút",
    inputRequired: "2 luồng video cùng phân cảnh",
    processingNote: "Tự động căn đồng bộ timeline hai góc quay",
    enabled: false,
    tag: "Sắp có",
    stepsCount: 2,
  },
];
