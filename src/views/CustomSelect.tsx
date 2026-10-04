import React, { useState, useRef, useEffect } from "react";
import "./CustomSelect.css";

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  badge?: string;
  sublabel?: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  label?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Chọn một tùy chọn...",
  className = "",
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`}
    >
      {label && <label className="custom-select-label">{label}</label>}

      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="custom-select-selected-content">
          {selectedOption ? (
            <>
              {selectedOption.icon && (
                <span className="custom-select-icon">{selectedOption.icon}</span>
              )}
              <span className="custom-select-title">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="custom-select-badge">{selectedOption.badge}</span>
              )}
              {selectedOption.sublabel && (
                <span className="custom-select-sublabel">{selectedOption.sublabel}</span>
              )}
            </>
          ) : (
            <span className="custom-select-placeholder">{placeholder}</span>
          )}
        </div>

        <svg
          className="custom-select-arrow"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="custom-select-dropdown" role="listbox">
          <div className="custom-select-options-list">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  className={`custom-select-option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="custom-select-option-main">
                    {option.icon && (
                      <span className="custom-select-option-icon">{option.icon}</span>
                    )}
                    <span className="custom-select-option-label">{option.label}</span>
                    {option.badge && (
                      <span className="custom-select-option-badge">{option.badge}</span>
                    )}
                  </div>

                  <div className="custom-select-option-right">
                    {option.sublabel && (
                      <span className="custom-select-option-sublabel">
                        {option.sublabel}
                      </span>
                    )}
                    {isSelected && (
                      <svg
                        className="custom-select-check"
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <path
                          d="M11.6666 3.5L5.24992 9.91667L2.33325 7"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
