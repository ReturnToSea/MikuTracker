import { characterName, worldName } from "@miku/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAddCharacter, useSearch } from "../api/hooks";
import type { CharacterView } from "../api/types";
import { alreadyAdded } from "../lib/characters";
import { Avatar } from "./Avatar";

// The + at the end of the character tabs: opens a box to search for a name on this world, then
// add it. Closing the box forgets what was in it.
export function AddCharacter({ world, characters }: { world: number; characters: CharacterView[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  return (
    <div className="add" ref={box}>
      <button type="button" className="add-tab" aria-expanded={open} aria-label="Add a character" title="Add a character" onClick={() => setOpen(!open)}>
        +
      </button>
      {open && <AddBox world={world} characters={characters} inside={box} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AddBox({ world, characters, inside, onClose }: { world: number; characters: CharacterView[]; inside: React.RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const search = useSearch();
  const add = useAddCharacter(world);

  // Escape, or a click outside (the + itself counts as inside), closes it. (Listening again after
  // each change of the box is cheap and keeps onClose current.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => !inside.current!.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const name = characterName.safeParse(typed);
    setProblem(name.success ? null : name.error.issues[0]!.message);
    add.reset();
    if (name.success) search.mutate({ world, name: name.data });
  }

  const found = search.data;
  return (
    <div className="popover" role="dialog" aria-label="Add a character">
      <h3>Add a character on {worldName(world)}</h3>
      <form className="search" onSubmit={onSearch}>
        <input autoFocus aria-label="Character name" placeholder="Character name" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="btn" type="submit" disabled={search.isPending}>
          {search.isPending ? "Searching…" : "Search"}
        </button>
      </form>
      {problem && <p className="error" role="alert">{problem}</p>}
      {search.isError && <p className="error" role="alert">{search.error.message}</p>}
      {found && (
        <div className="result">
          {/* A stand-in picture: the page never loads Nexon's images; the server saves the avatar once added. */}
          <Avatar src={null} size={40} name={found.name} />
          <div className="grow">
            <b>{found.name}</b>
            <small>
              Lv. {found.level} · {found.job} · {worldName(found.worldId)}
            </small>
          </div>
          <button type="button" className="btn" disabled={alreadyAdded(characters, found.name) || add.isPending} onClick={() => add.mutate(found.name, { onSuccess: onClose })}>
            {alreadyAdded(characters, found.name) ? "Added" : add.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      {add.isError && <p className="error" role="alert">{add.error.message}</p>}
    </div>
  );
}
