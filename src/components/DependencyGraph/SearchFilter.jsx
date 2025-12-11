import React from "react";
import graphStyles from "./graphStyles.module.css";

/**
 * SearchFilter component provides a filterable dropdown selector for package search.
 * Features:
 * - Real-time filtering as the user types
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Selected package remains visible in the input field
 * - Mouse and keyboard interaction support
 */
export default function SearchFilter({
  searchTerm,
  onSearchChange,
  filteredNodes,
  onSelectNode,
  onFocus,
  onBlur,
  highlightedIndex,
  onHighlightedIndexChange,
  showDropdown,
  onShowDropdownChange,
}) {
  const handleKeyDown = (e) => {
    if (!showDropdown || filteredNodes.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        onHighlightedIndexChange((prev) =>
          prev < filteredNodes.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        onHighlightedIndexChange((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          onSelectNode(filteredNodes[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onShowDropdownChange(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className={graphStyles.searchContainer}>
      <div className={graphStyles.searchInputWrapper}>
        {/* Search input with placeholder and keyboard/mouse event handlers */}
        <input
          type="text"
          className={graphStyles.searchInput}
          placeholder="Search for package..."
          value={searchTerm}
          onChange={(e) => {
            onSearchChange(e.target.value);
            onShowDropdownChange(true);
            onHighlightedIndexChange(-1);
          }}
          onFocus={onFocus}
          onBlur={() => setTimeout(() => onShowDropdownChange(false), 200)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Dropdown list with filtered results */}
      {showDropdown && filteredNodes.length > 0 && (
        <ul className={graphStyles.searchDropdown}>
          {filteredNodes.slice(0, 10).map((nodeName, index) => (
            <li
              key={nodeName}
              className={`${graphStyles.searchDropdownItem} ${
                index === highlightedIndex ? graphStyles.searchDropdownItemHighlighted : ""
              }`}
              onClick={() => onSelectNode(nodeName)}
              onMouseEnter={() => onHighlightedIndexChange(index)}
              onMouseLeave={() => onHighlightedIndexChange(-1)}
            >
              {nodeName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
