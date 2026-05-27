import { useCallback } from "react";
import { useDialog } from "../../providers/dialog";
import { DialogSearchList } from "../dialog-search-list";
import { type ProviderIdType } from "../../lib/app-schema";
import { PROVIDERS } from "../../lib/providers";

type Props = {
  onSelectProvider: (provider: ProviderIdType) => void;
};

export function ProviderDialogContent({ onSelectProvider }: Props) {
  const dialog = useDialog();

  const handleSelect = useCallback((item: (typeof PROVIDERS)[number]) => {
    onSelectProvider(item.id);
    dialog.close();
  }, [dialog, onSelectProvider]);

  return (
    <DialogSearchList
      items={PROVIDERS}
      onSelect={handleSelect}
      filterFn={(item, query) =>
        item.label.toLowerCase().includes(query.toLowerCase())
        || item.description.toLowerCase().includes(query.toLowerCase())
      }
      renderItem={(item, isSelected) => (
        <text selectable={false} fg={isSelected ? "black" : "white"}>
          {item.label}
        </text>
      )}
      getKey={(item) => item.id}
      placeholder="Search providers"
      emptyText="No matching providers"
    />
  );
}
