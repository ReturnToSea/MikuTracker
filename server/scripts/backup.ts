// npm run backup: back up the real database now (the always-on app also does it daily).
import { backupPlace, makeBackup } from "../src/backups";

const place = backupPlace();
const made = await makeBackup(place, new Date());
console.log(made ? `Backed up the database: ${place.folder}/${made.name}` : "No database yet: nothing to back up");
