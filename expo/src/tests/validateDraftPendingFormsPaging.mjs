import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.join(here, "../modules/questionnaires/DraftPendingFormsScreen.js"),
  "utf8",
);

assert.match(source, /import\s*\{[^}]*FlatList/s);
assert.match(source, /import\s*\{\s*useListPaging\s*\}/);
assert.match(source, /useListPaging\(drafts\)/);
assert.match(source, /data=\{pagedDrafts\}/);
assert.match(source, /onEndReached=\{showMore\}/);
assert.match(source, /`Show more \(\$\{shown\} of \$\{total\}\)`/);

// The complete filtered set remains the source of truth for the count; only
// the paged view is passed to FlatList for incremental mounting.
assert.match(source, /drafts\.length === 1 \? "Showing 1 draft"/);
assert.match(source, /`Showing \$\{drafts\.length\} drafts`/);

// Drafts remain resumable from the Worklist only, after task-candidate
// matching; pagination must not move that correctness filter into rendering.
assert.match(
  source,
  /filterDraftsForTaskCandidates\(siteDrafts, listTaskWorklistCandidates\(\)\)/,
);
assert.match(source, /Continue filling from Worklist only/);

console.log("Validated draft pending forms incremental paging wiring.");
