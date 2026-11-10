// Runs before every Google Calendar write. The server lists the exact calls it wants in a file,
// and anything else is refused. Exit 2 blocks the call. Any other failure must block it too.
const { readFileSync } = require('node:fs');

const refuse = (why) => {
  console.error(why);
  process.exit(2);
};
process.on('uncaughtException', () => refuse('The calendar guard failed, so the call was refused.'));

const canon = (args) => JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)));
let raw = '';
process.stdin.on('data', (d) => { raw += d; }).on('end', () => {
  const { tool_name: tool, tool_input: input } = JSON.parse(raw);
  const planned = JSON.parse(readFileSync(process.env.AGENT_HOUSE_PLANNED, 'utf8'));
  if (planned.some((call) => tool.endsWith(`__${call.tool}`) && canon(call.args) === canon(input))) process.exit(0);
  refuse('That is not one of the planned calendar changes.');
});
