import React from "react";

interface StateProps {
  onRetry?: () => void;
  onOpenSettings?: () => void;
  errorMessage?: string;
}

export const MissingAIState: React.FC<StateProps> = ({ onOpenSettings }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
      gap: "16px",
      maxWidth: "500px",
      margin: "auto",
    }}
  >
    <div style={{ fontSize: "32px" }}>🔑</div>
    <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
      Chưa cấu hình nhà cung cấp AI viết kịch bản
    </h3>
    <p style={{ fontSize: "13px", color: "var(--t3)", lineHeight: 1.5, margin: 0 }}>
      Xưởng AI cần một mô hình LLM thông minh (MiniMax-M3 hoặc Ollama 27B) để phân tích cốt truyện và viết lời bình.
    </p>
    <button
      type="button"
      className="lab-btn-primary"
      onClick={onOpenSettings}
    >
      ⚙ Mở Cài đặt › Dịch thuật
    </button>
  </div>
);

export const LabErrorState: React.FC<StateProps> = ({ onRetry, errorMessage }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
      gap: "16px",
      maxWidth: "520px",
      margin: "auto",
    }}
  >
    <div style={{ fontSize: "32px", color: "var(--dang)" }}>⚠</div>
    <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "var(--dang-txt)" }}>
      Quá trình xử lý bị gián đoạn
    </h3>
    <p style={{ fontSize: "13px", color: "var(--t3)", margin: 0 }}>
      {errorMessage || "Đã xảy ra lỗi khi gọi dịch vụ AI. Các phân đoạn đã xử lý vẫn được lưu an toàn."}
    </p>
    {onRetry && (
      <button type="button" className="lab-btn-primary" onClick={onRetry}>
        ↻ Thử lại từ giai đoạn dở dang
      </button>
    )}
  </div>
);
