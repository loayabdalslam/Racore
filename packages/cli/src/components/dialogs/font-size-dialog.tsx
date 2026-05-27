import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import { FONT_SIZES, useTheme, type FontSize } from "../../providers/theme";

export function FontSizeDialogContent() {
  const dialog = useDialog();
  const { fontSize, setFontSize } = useTheme();

  const handleSelect = useCallback((nextFontSize: FontSize) => {
    setFontSize(nextFontSize);
    dialog.close();
  }, [dialog, setFontSize]);

  return (
    <DialogSearchList
      items={[...FONT_SIZES]}
      onSelect={handleSelect}
      filterFn={(item, query) => item.toLowerCase().includes(query.toLowerCase())}
      renderItem={(item, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {item === fontSize ? "* " : "  "}
          {item}
        </text>
      )}
      getKey={(item) => item}
      placeholder="Search font sizes"
      emptyText="No matching font sizes"
    />
  );
}
