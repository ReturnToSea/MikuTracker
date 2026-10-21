import { worldName } from "@miku/shared";
import { useCharacters, useDeleteCharacter, useReorderCharacters, useSelectCharacter, useSettings, useUpdateSettings } from "../api/hooks";
import { AddCharacter } from "../components/AddCharacter";
import { CharacterSummary } from "../components/CharacterSummary";
import { CharacterTabs } from "../components/CharacterTabs";
import { RefreshNote } from "../components/RefreshNote";
import { WorldSwitcher } from "../components/WorldSwitcher";

// Home: the world switcher and that world's characters as tabs, with the selected one below.
export function HomePage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const list = useCharacters(world);
  const select = useSelectCharacter(world);
  const reorder = useReorderCharacters(world);
  const remove = useDeleteCharacter(world);

  const characters = list.data?.characters ?? [];
  const selected = list.data && characters.find((c) => c.id === list.data.selectedId);
  const failed = [select, reorder, remove].find((m) => m.isError)?.error;

  return (
    <>
      <h1 className="visually-hidden">Home</h1>
      <section className="block top">
        <div className="page-head">
          <WorldSwitcher world={world} onChange={(w) => saveSettings.mutate({ worldId: w })} />
          <RefreshNote />
        </div>
        <div className="strip-wrap">
          <CharacterTabs characters={characters} selectedId={selected?.id ?? null} onSelect={(id) => select.mutate(id)} onReorder={(ids) => reorder.mutate(ids)} />
          <AddCharacter key={world} world={world} characters={characters} />
        </div>
      </section>
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {list.isError && (
        <p className="error block" role="alert">
          Couldn't load the characters: {list.error.message}
        </p>
      )}
      {list.isPending && <p className="notice muted block">Loading…</p>}
      {characters.length === 0 && list.isSuccess && (
        <section className="block">
          <p className="notice muted">No characters on {worldName(world)} yet. Use + to add one.</p>
        </section>
      )}
      {selected && (
        <CharacterSummary
          c={selected}
          onDelete={() => {
            if (window.confirm(`Delete ${selected.name}? This also deletes all of its saved history.`)) remove.mutate(selected.id);
          }}
        />
      )}
    </>
  );
}
