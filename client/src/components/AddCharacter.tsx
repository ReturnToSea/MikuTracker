import { byHandWorld, characterName, CLASSES, levelInput, MAX_LEVEL, worldName } from "@miku/shared";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAddCharacter, useSearch } from "../api/hooks";
import type { CharacterView } from "../api/types";
import { alreadyAdded, classMatches, exactClass, levelProgress } from "../lib/characters";
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
      {open && (byHandWorld(world) ? <ByHandBox world={world} characters={characters} inside={box} onClose={() => setOpen(false)} /> : <AddBox world={world} characters={characters} inside={box} onClose={() => setOpen(false)} />)}
    </div>
  );
}

type Inside = React.RefObject<HTMLDivElement | null>;

// The box below the +: opens with left edges lined up; near the right edge it slides left to stay
// inside its section, measured again when `grows` changes (a result making it wider). (Set on the
// element itself: it's measured where it would be without sliding, then slid.) Escape, or a click
// outside (the + itself counts as inside), closes it. (Listening again after each change of the box is
// cheap and keeps onClose current.)
function usePopover(popover: React.RefObject<HTMLDivElement | null>, inside: Inside, onClose: () => void, grows: unknown) {
  useLayoutEffect(() => {
    const box = popover.current!;
    box.style.transform = "";
    const slide = slideToFit(box.getBoundingClientRect(), box.closest(".block")!.getBoundingClientRect());
    box.style.transform = `translateX(-${slide}px)`;
  }, [popover, grows]);
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
}

function AddBox({ world, characters, inside, onClose }: { world: number; characters: CharacterView[]; inside: Inside; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const search = useSearch();
  const add = useAddCharacter(world);
  const popover = useRef<HTMLDivElement>(null);
  const found = search.data;
  usePopover(popover, inside, onClose, found);

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

// Adding on a world added by hand (Challenger): its name, class and level as typed. The class from the
// list (typing filters it), and it can't be changed later, so the box says so.
function ByHandBox({ world, characters, inside, onClose }: { world: number; characters: CharacterView[]; inside: Inside; onClose: () => void }) {
  const [name, setName] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const add = useAddCharacter(world);
  const popover = useRef<HTMLDivElement>(null);
  usePopover(popover, inside, onClose, null);
  const shown = characterName.safeParse(name);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    add.reset();
    const n = characterName.safeParse(name);
    const l = levelInput.safeParse(Number(level));
    const wrong = !n.success
      ? n.error.issues[0]!.message
      : alreadyAdded(characters, n.data)
        ? `${n.data} is already added on ${worldName(world)}.`
        : job === null
          ? "Pick a class from the list"
          : !l.success || level.trim() === ""
            ? `Levels are 1 to ${MAX_LEVEL}`
            : null;
    setProblem(wrong);
    if (!wrong) add.mutate({ name: n.data!, job: job!, level: l.data! }, { onSuccess: onClose });
  }

  return (
    <div className="popover by-hand" role="dialog" aria-label="Add a character" ref={popover}>
      <h3>Add a character on {worldName(world)}</h3>
      <form onSubmit={onAdd}>
        <label className="by-hand-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="by-hand-field">
          <span id="class-label">Class</span>
          <ClassPicker picked={job} onPick={setJob} />
        </div>
        <label className="by-hand-field by-hand-level">
          <span>Level</span>
          <input inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>
        <p className="muted small">
          Challenger characters aren't on Nexon's rankings, so they're added by hand. <b>The class can't be changed later.</b>
        </p>
        {problem && <p className="error" role="alert">{problem}</p>}
        {add.isError && <p className="error" role="alert">{add.error.message}</p>}
        <div className="by-hand-buttons">
          <button className="btn quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={add.isPending}>
            {add.isPending ? "Adding…" : shown.success ? `Add ${shown.data}` : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}

// The class box: type to filter the list (and sort it: names starting with what's typed first), or
// open it with ▾ and scroll. A class is picked by clicking it, with ↑ ↓ and Enter, or by typing its whole name.
function ClassPicker({ picked, onPick }: { picked: string | null; onPick: (job: string | null) => void }) {
  const [typed, setTyped] = useState(picked ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // every class (after a pick, or ▾), or those matching what's typed
  const [all, setAll] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const matches = classMatches(all ? "" : typed, CLASSES);
  // Keeps the highlighted class in view while moving through the list with the keys. (A block, returning
  // nothing: Chrome's scrollIntoView now returns a promise, which React would take as a clean-up and call.)
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (job: string) => {
    onPick(job);
    setTyped(job);
    setOpen(false);
    // (the list then shows every class: the keys go on from the one picked)
    setAll(true);
    setActive(classMatches("", CLASSES).indexOf(job));
  };
  // (the full list's place of the class picked, or its first)
  const pickedAt = () => Math.max(0, classMatches("", CLASSES).indexOf(picked ?? ""));
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // a closed list just opens, on the class highlighted
      if (!open) return setOpen(true);
      setActive((a) => Math.max(0, Math.min(matches.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    }
  }
  return (
    <div className="class-picker">
      <input
        role="combobox"
        aria-labelledby="class-label"
        aria-expanded={open}
        aria-controls="class-list"
        aria-autocomplete="list"
        placeholder="Type or pick a class"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          onPick(exactClass(e.target.value, CLASSES));
          setAll(false);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />
      <button
        type="button"
        className="class-caret"
        aria-label="Show every class"
        tabIndex={-1}
        onClick={() => {
          setAll(true);
          setActive(pickedAt());
          setOpen(!open);
        }}
      >
        ▾
      </button>
      {open && (
        <ul className="class-list" id="class-list" role="listbox" aria-labelledby="class-label" ref={list}>
          {matches.map((job, i) => (
            <li key={job} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(job)}>
              {job}
            </li>
          ))}
          {matches.length === 0 && <li className="muted small">No class has "{typed.trim()}" in its name</li>}
          {matches.length > 0 && matches.length < CLASSES.length && (
            <li className="muted small" aria-hidden="true">
              {matches.length} of {CLASSES.length} classes
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// The EXP bar, as Home shows it: "52.60% to level 292 · 170T / 324T EXP".
function FoundProgress({ found }: { found: SearchResult }) {
  const progress = levelProgress(found);
  if (!progress) return <div className="muted small">Level {MAX_LEVEL}: the highest level.</div>;
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
