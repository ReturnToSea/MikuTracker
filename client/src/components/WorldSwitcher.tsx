import { WORLDS } from "@miku/shared";

export function WorldSwitcher({ world, onChange }: { world: number; onChange: (world: number) => void }) {
  return (
    <div className="segmented" role="group" aria-label="World">
      {WORLDS.map((w) => (
        <button key={w.id} type="button" aria-pressed={w.id === world} onClick={() => onChange(w.id)}>
          {w.name}
        </button>
      ))}
    </div>
  );
}
