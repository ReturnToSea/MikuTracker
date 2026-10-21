import { characterName, worldName } from "@miku/shared";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAddCharacter, useSearch } from "../api/hooks";
import type { CharacterView } from "../api/types";
import { alreadyAdded, levelProgress } from "../lib/characters";
import { fmtInt } from "../lib/format";
import { slideToFit } from "../lib/layout";
import type { SearchResult } from "../api/types";
import { Avatar } from "./Avatar";
import { LegionSource } from "./CharacterSummary";

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
  const popover = useRef<HTMLDivElement>(null);
  const found = search.data;

  // Opens below the + (left edges lined up); near the right edge it slides left to stay inside
  // its section. Measured again when a result makes the box wider. (Set on the element itself:
  // it's measured where it would be without sliding, then slid.)
  useLayoutEffect(() => {
    const box = popover.current!;
    box.style.transform = "";
    const slide = slideToFit(box.getBoundingClientRect(), box.closest(".block")!.getBoundingClientRect());
    box.style.transform = `translateX(-${slide}px)`;
  }, [found]);

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

  // The Legion to show: its own entry if Nexon lists it, otherwise the one already showing on this world.
  const legion = !found ? null : found.legion ? { ...found.legion, from: found.name } : (characters.find((c) => c.legion)?.legion ?? null);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const name = characterName.safeParse(typed);
    setProblem(name.success ? null : name.error.issues[0]!.message);
    add.reset();
    if (name.success) search.mutate({ world, name: name.data });
  }

  return (
    <div className="popover" role="dialog" aria-label="Add a character" ref={popover}>
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
        <div className="found">
          {/* The avatar arrives with the search, from our server: the page never contacts Nexon. */}
          <Avatar src={found.avatar} size={192} name={found.name} />
          <div className="found-details">
            <div className="found-head">
              <div>
                <div className="found-name">{found.name}</div>
                <div className="muted small">
                  {found.job} · {worldName(found.worldId)}
                </div>
              </div>
              <div className="level-box">
                <div className="muted small">Level</div>
                <div className="found-level">{found.level}</div>
              </div>
            </div>
            <FoundProgress found={found} />

            <dl className="found-stats">
              <div>
                <dt>In {worldName(found.worldId)}</dt>
                <dd>#{fmtInt(found.worldRank)}</dd>
              </div>
              <div>
                <dt>Overall</dt>
                <dd>{found.overallRank === null ? "—" : `#${fmtInt(found.overallRank)}`}</dd>
              </div>
              <div>
                <dt>Legion</dt>
                <dd>{legion ? fmtInt(legion.level) : "N/A"}</dd>
                <LegionSource legion={legion} name={found.name} />
              </div>
              <div>
                <dt>Raid power</dt>
                <dd>{legion ? fmtInt(legion.raidPower) : "N/A"}</dd>
              </div>
            </dl>
            <button type="button" className="btn found-add" disabled={alreadyAdded(characters, found.name) || add.isPending} onClick={() => add.mutate(found.name, { onSuccess: onClose })}>
              {alreadyAdded(characters, found.name) ? "Added" : add.isPending ? "Adding…" : `Add ${found.name}`}
            </button>
          </div>
        </div>
      )}
      {add.isError && <p className="error" role="alert">{add.error.message}</p>}
    </div>
  );
}

// The EXP bar, as Home shows it: "52.60% to level 292 · 170T / 324T EXP".
function FoundProgress({ found }: { found: SearchResult }) {
  const progress = levelProgress(found);
  if (!progress) return <div className="muted small">Level 300: the highest level.</div>;
  return (
    <div>
      <div className="expbar" role="progressbar" aria-label={`${found.name}'s EXP into level ${found.level}`} aria-valuenow={Number(progress.percent.toFixed(2))} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="muted small">
        {progress.text} to level {found.level + 1} ·{" "}
        <b className="exp-have">
          {progress.have} / {progress.need} EXP
        </b>
      </div>
    </div>
  );
}
