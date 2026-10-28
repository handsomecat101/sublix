import React from "react";
import type { MockCharacter } from "../labMock";

interface CharacterTableProps {
  characters: MockCharacter[];
  onUpdateName: (id: string, name: string) => void;
}

export const CharacterTable: React.FC<CharacterTableProps> = ({
  characters,
  onUpdateName,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 800, margin: 0, color: "var(--t1)" }}>
          Nhân vật xuất hiện ({characters.length})
        </h3>
        <span style={{ fontSize: "11px", color: "var(--t4)" }}>Sửa tên để đồng bộ toàn bộ lời bình</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {characters.map((char) => (
          <div
            key={char.id}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 60px",
              gap: 10,
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: "8px",
              background: "var(--bg-card)",
              border: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.4)",
                color: char.avatarColor,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                fontSize: "12px",
                border: `1.5px solid ${char.avatarColor}`,
              }}
            >
              {char.name.charAt(0)}
            </div>

            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <input
                type="text"
                value={char.name}
                onChange={(e) => onUpdateName(char.id, e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--t1)",
                  fontSize: "13px",
                  fontWeight: 700,
                  outline: "none",
                  padding: 0,
                }}
              />
              <span style={{ fontSize: "11px", color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {char.role} {char.mergedNotice ? `· ${char.mergedNotice}` : ""}
              </span>
            </div>

            <span style={{ fontSize: "11px", color: "var(--t4)", textAlign: "right" }}>
              {char.linesCount} câu
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
