import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import { Mode, type ModeType } from "../../lib/app-schema";

const AVAILABLE_MODES: ModeType[] = [Mode.BUILD, Mode.PLAN, Mode.ULTRA];

type AgentsDialogContentProps = {
  currentMode: ModeType;
  onSelectMode: (mode: ModeType) => void;
};

export function getModeLabel(mode: ModeType) {
  if (mode === Mode.PLAN) return "Plan";
  if (mode === Mode.ULTRA) return "Ultra";
  return "Normal";
}

export const AgentsDialogContent = ({
  currentMode,
  onSelectMode,
}: AgentsDialogContentProps) => {
  const dialog = useDialog();

  const handleSelect = useCallback((nextMode: ModeType) => {
    onSelectMode(nextMode);
    dialog.close();
  }, [dialog, onSelectMode]);

  return (
    <DialogSearchList
      items={AVAILABLE_MODES}
      onSelect={handleSelect}
      filterFn={(item, query) => getModeLabel(item).toLowerCase().includes(query.toLowerCase())}
      renderItem={(item, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {item === currentMode ? "* " : "  "}
          {getModeLabel(item)}
        </text>
      )}
      getKey={(item) => item}
      placeholder="Search modes"
      emptyText="No matching modes"
    />
  );
};
