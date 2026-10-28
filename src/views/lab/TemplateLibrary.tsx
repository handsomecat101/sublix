import React, { useState } from "react";
import { LAB_TEMPLATES } from "./templates";
import { TemplateCard } from "./TemplateCard";
import { DraftList } from "./DraftList";
import { MOCK_RECENT_DRAFTS } from "./labMock";

interface TemplateLibraryProps {
  onSelectTemplate: (templateId: string) => void;
  onOpenDraft: (draftId: string) => void;
}

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  onSelectTemplate,
  onOpenDraft,
}) => {
  const [showBanner, setShowBanner] = useState<boolean>(true);

  return (
    <div className="lab-library-container">
      {/* CỘT TRÁI: DANH SÁCH MẪU */}
      <div className="lab-library-main">
        <div className="lab-title-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="lab-main-title">Xưởng Dựng AI</h1>
            <span className="lab-beta-badge">Thử nghiệm</span>
          </div>
        </div>

        {showBanner && (
          <div className="lab-beta-banner">
            <span>
              ✦ <strong>Quy trình có người duyệt:</strong> AI có thể tóm tắt sai chi tiết cốt truyện — mỗi bước đều dừng lại để bạn duyệt và chỉnh sửa, không có video nào tự ý xuất ra.
            </span>
            <button
              type="button"
              className="lab-banner-close"
              onClick={() => setShowBanner(false)}
              title="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        )}

        <div className="lab-template-grid">
          {LAB_TEMPLATES.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} onSelect={onSelectTemplate} />
          ))}
        </div>
      </div>

      {/* CỘT PHẢI: BẢN NHÁP GẦN ĐÂY */}
      <div className="lab-library-side">
        <h2 className="lab-side-title">Bản nháp gần đây</h2>
        <DraftList drafts={MOCK_RECENT_DRAFTS} onOpenDraft={onOpenDraft} />
      </div>
    </div>
  );
};
