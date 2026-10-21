// A character's avatar (saved by the server), or a plain stand-in before there is one.
export function Avatar({ src, size, name }: { src: string | null; size: number; name: string }) {
  if (src) return <img className="avatar" src={src} width={size} height={size} alt={`${name}'s avatar`} />;
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${name} (no avatar yet)`}>
      <circle cx="20" cy="16" r="7" fill="currentColor" opacity="0.35" />
      <path d="M8 34c1.5-7 6.5-10 12-10s10.5 3 12 10z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
