// A character's avatar (saved by the server), or a blank box without one (before the first download, or a
// character added by hand: Nexon has no picture of it).
export function Avatar({ src, size, name }: { src: string | null; size: number; name: string }) {
  if (src) return <img className="avatar" src={src} width={size} height={size} alt={`${name}'s avatar`} />;
  return <span className="avatar avatar-blank" style={{ width: size, height: size }} role="img" aria-label={`${name} (no picture)`} />;
}
