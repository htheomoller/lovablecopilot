import React from "react";

type Props = {
  options: string[];
  onPick: (value: string) => void;
  disabled?: boolean;
};

export default function QuickChips({ options, onPick, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          disabled={disabled}
          className="px-3 py-1 rounded-full border text-sm hover:bg-muted disabled:opacity-50"
        >
          {o}
        </button>
      ))}
    </div>
  );
}