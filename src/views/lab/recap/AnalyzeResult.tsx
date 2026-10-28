import React from "react";
import type { MockChapter, MockCharacter, MockJunkSegment } from "../labMock";
import { ChapterList } from "./ChapterList";
import { CharacterTable } from "./CharacterTable";
import { JunkList } from "./JunkList";

interface AnalyzeResultProps {
  chapters: MockChapter[];
  characters: MockCharacter[];
  junkSegments: MockJunkSegment[];
  onToggleChapter: (id: number) => void;
  onUpdateChapter: (id: number, title: string, summary: string) => void;
  onUpdateCharacterName: (id: string, name: string) => void;
  onToggleRestoreJunk: (id: number) => void;
}

export const AnalyzeResult: React.FC<AnalyzeResultProps> = ({
  chapters,
  characters,
  junkSegments,
  onToggleChapter,
  onUpdateChapter,
  onUpdateCharacterName,
  onToggleRestoreJunk,
}) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        gap: "24px",
        padding: "24px 32px",
        flex: 1,
        overflowY: "auto",
      }}
    >
      {/* CỘT TRÁI: DANH SÁCH CHƯƠNG MỤC */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ChapterList
          chapters={chapters}
          onToggleChapter={onToggleChapter}
          onUpdateChapter={onUpdateChapter}
        />
      </div>

      {/* CỘT PHẢI: NHÂN VẬT & ĐOẠN ĐÃ LỌC */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          background: "var(--bg-side)",
          border: "1px solid var(--line)",
          borderRadius: "14px",
          padding: "20px",
          height: "fit-content",
        }}
      >
        <CharacterTable
          characters={characters}
          onUpdateName={onUpdateCharacterName}
        />
        <JunkList
          junkSegments={junkSegments}
          onToggleRestore={onToggleRestoreJunk}
        />
      </div>
    </div>
  );
};
