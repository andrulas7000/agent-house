// Runs before every file tool when a resident has attachments. Reaching a file means opening its
// folder to the agent, so this narrows it back down: its own folders, plus exactly what was attached.
const path = require('node:path');

const refuse = (why) => {
  console.error(why);
  process.exit(2);
};
process.on('uncaughtException', () => refuse('The file guard failed, so the call was refused.'));

let raw = '';
process.stdin.on('data', (d) => { raw += d; }).on('end', () => {
  const { tool_name: tool, tool_input: input, cwd } = JSON.parse(raw);
  const full = (p) => path.resolve(cwd, p).toLowerCase();
  const inside = (p, root) => p === root || p.startsWith(root + path.sep);
  const allowed = [...JSON.parse(process.env.AGENT_HOUSE_ROOTS), ...JSON.parse(process.env.AGENT_HOUSE_FILES)].map(full);

  const glob = tool === 'Glob' ? input.pattern : tool === 'Grep' ? input.glob : null;
  if (glob?.includes('..') || (glob && path.isAbsolute(glob) && !allowed.some((a) => inside(full(glob), a)))) refuse('That search reaches outside what this resident can see.');
  const target = full(input.file_path ?? input.path ?? cwd);
  if (allowed.some((a) => inside(target, a))) process.exit(0);
  refuse('That file was not attached to this conversation.');
});
