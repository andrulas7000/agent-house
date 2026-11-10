// Runs before every web call on the reporter's trips. Only the listed outlets can be read or searched,
// so an outlet nobody vetted can't get in. Exit 2 blocks the call. Any other failure must block it too.
const refuse = (why) => {
  console.error(why);
  process.exit(2);
};
process.on('uncaughtException', () => refuse('The news guard failed, so the call was refused.'));

let raw = '';
process.stdin.on('data', (d) => { raw += d; }).on('end', () => {
  const { tool_name: tool, tool_input: input } = JSON.parse(raw);
  const sources = JSON.parse(process.env.AGENT_HOUSE_NEWS_SOURCES);
  const listed = (host) => sources.some((d) => host === d || host.endsWith(`.${d}`));
  if (tool === 'WebFetch' && listed(new URL(input.url).hostname.toLowerCase())) process.exit(0);
  if (tool === 'WebSearch' && input.allowed_domains?.length && input.allowed_domains.every((d) => listed(String(d).toLowerCase()))) process.exit(0);
  refuse('Only the listed news outlets are allowed. Set allowed_domains on every search and fetch only those outlets.');
});
