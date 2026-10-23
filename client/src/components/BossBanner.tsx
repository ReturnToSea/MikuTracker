import type { BossInfo } from "../api/types";

// A boss's banner from the game (its name and face), at its real size or twice that with sharp
// pixel edges (`big`, in the planning menu). Without the picture in the data folder, its name.
export function BossBanner({ info, big = false }: { info: BossInfo; big?: boolean }) {
  if (!info.art) return <span className={`boss-name${big ? " big" : ""}`}>{info.name}</span>;
  return <img className={`boss-banner${big ? " big" : ""}`} src={info.art} alt={info.name} width={big ? 270 : 135} height={big ? 60 : 30} />;
}
