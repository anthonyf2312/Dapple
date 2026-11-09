// Checks the built themes against the Discord people are running today.
//
//   npm run check                builds, then checks
//   npm run check -- --refresh   downloads Discord's files again instead of reusing the last six hours'
//
// It fails when:
//   - a class name Dapple styles no longer exists, or matches more than its own class
//   - Dapple sets a Discord variable that Discord doesn't have
//   - a shade of blurple is left for Discord to paint
//   - a Dapple value is defined and never used, or used and never defined
//
// Everything it downloads is public: Discord's web page and stylesheets, and a community list of
// Discord's class names. Nothing is sent anywhere.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesIn } from './build.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CACHE = join(ROOT, '.cache', 'discord');
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DISCORD = 'https://discord.com';
// The mirror midnight and system24 check against. The original list was taken down in November 2026.
const CLASS_LISTS = 'https://raw.githubusercontent.com/Vexadros/DiscordClasses/main';
const VERSIONS = ['Dapple', 'Dapple-Light', 'Dapple-Dark'];
const refresh = process.argv.includes('--refresh');

const failures = [];
const notes = [];
const passes = [];
const plural = (count, word) => `${count.toLocaleString('en')} ${word}${count === 1 ? '' : 's'}`;

// --------------------------------------------------------------------------
// Downloads, kept in .cache/discord
// --------------------------------------------------------------------------

async function download(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (dapple-check)' } });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.text();
}

// Discord's stylesheets are named after their contents, so a saved one never goes stale.
// Everything else is reused for six hours, or for as long as the network is down.
async function saved(name, url, maxAge = Infinity) {
  const path = join(CACHE, name);
  const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < maxAge;
  if (fresh && !(refresh && maxAge !== Infinity)) return readFileSync(path, 'utf8');
  try {
    const text = await download(url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return text;
  } catch (error) {
    if (!existsSync(path)) throw error;
    notes.push(`Couldn't refresh ${name} (${error.message}), so an older copy was used.`);
    return readFileSync(path, 'utf8');
  }
}

async function classList(release) {
  const list = JSON.parse(await saved(`${release}classes.json`, `${CLASS_LISTS}/${release}classes.json`, SIX_HOURS));
  const classes = new Set();
  for (const [id, module] of Object.entries(list)) {
    if (id === 'host' || id === 'channel') continue;
    for (const value of Object.values(module)) {
      if (typeof value === 'string') for (const name of value.split(' ')) if (name) classes.add(name);
    }
  }
  return { classes: [...classes], version: list.host?.version?.split(' ')[0] ?? 'unknown' };
}

// Discord links some stylesheets from its page and loads the rest when a screen needs them. The
// names of the later ones are only written inside its main script, in two forms: a run of
// "if this number, return number.hash.css", then a table of number to hash. The numbers are
// shortened where they can be, so 232000 is written 232e3.
function laterStylesheets(script) {
  const named = [...script.matchAll(/\((\d+)===\w+\)return""\+\w+\+"\.([0-9a-f]+)\.css"/g)].map(m => `${m[1]}.${m[2]}.css`);
  const table = script.match(/\(\{((?:[\de]+:"[0-9a-f]+",?)+)\}\)\[\w+\]\+"\.css"/);
  const hashed = table ? [...table[1].matchAll(/"([0-9a-f]+)"/g)].map(m => `${m[1]}.css`) : [];
  return { files: [...new Set([...named, ...hashed])], complete: named.length > 0 && hashed.length > 0 };
}

async function discordStylesheets() {
  const page = await saved('app.html', `${DISCORD}/app`, SIX_HOURS);
  const startup = [...new Set([...page.matchAll(/\/assets\/([\w.-]+\.css)/g)].map(m => m[1]))];
  const script = page.match(/\/assets\/(web\.[0-9a-f]+\.js)/)?.[1];
  const build = page.match(/BUILD_NUMBER":"(\d+)"/)?.[1] ?? 'unknown';

  let later = [];
  let complete = false;
  if (script) {
    // The script is 12 MB, so only its list of stylesheets is kept, and only when all of it was found.
    const listPath = join(CACHE, `later-${script}.json`);
    if (existsSync(listPath)) ({ files: later, complete } = JSON.parse(readFileSync(listPath, 'utf8')));
    else {
      ({ files: later, complete } = laterStylesheets(await download(`${DISCORD}/assets/${script}`)));
      mkdirSync(CACHE, { recursive: true });
      if (complete) writeFileSync(listPath, JSON.stringify({ files: later, complete }));
    }
  }
  later = later.filter(name => !startup.includes(name));
  if (!complete) notes.push(`Discord's list of later-loaded stylesheets couldn't be read in full, so only ${plural(startup.length + later.length, 'stylesheet')} were checked. Discord has probably changed how its script is written, and laterStylesheets() in check.mjs needs updating. Until then the variable and accent checks can miss things.`);

  const queue = [...startup, ...later];
  const text = new Map();
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const css = await saved(join('css', name), `${DISCORD}/assets/${name}`).catch(() => '');
      if (css && !css.trimStart().startsWith('<')) text.set(name, css);
    }
  }));
  const missing = startup.length + later.length - text.size;
  if (missing) notes.push(`${plural(missing, 'Discord stylesheet')} couldn't be downloaded and ${missing === 1 ? 'was' : 'were'} left out.`);
  const sheets = names => names.filter(name => text.has(name)).map(name => ({ name, css: text.get(name) }));
  return { startup: sheets(startup), later: sheets(later), build };
}

// --------------------------------------------------------------------------
// Reading stylesheets
// --------------------------------------------------------------------------

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = css => css.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)/g);
const variablesSet = css => new Set([...declarations(css)].map(match => match[1]).filter(name => name.startsWith('--')));
const isOwn = name => /^--d(?:p|apple)-/.test(name);

// Which variables Discord defines (with every value it gives them), and which ones something reads.
function discordVariables(sheets) {
  const defined = new Map();
  const read = new Set();
  for (const { css } of sheets) {
    for (const [, property, value] of declarations(css)) {
      if (property.startsWith('--')) defined.set(property, [...(defined.get(property) ?? []), value.trim()]);
      for (const use of value.matchAll(/var\((--[\w-]+)/g)) read.add(use[1]);
    }
  }
  return { defined, read };
}

// --------------------------------------------------------------------------
// 1. Class names
// --------------------------------------------------------------------------

// A real class is the name, an underscore and six more characters: container__93e55 on the old
// endings, container_idTHId on the new ones. Anything longer is a different, longer name.
const ownClass = (name, discordClass) => discordClass.length === name.length + 7;

function checkNames(names, stable, canary) {
  const missing = [];
  const leaving = [];
  const greedy = [];
  for (const name of names) {
    const matches = list => list.classes.filter(discordClass => discordClass.startsWith(`${name}_`));
    const inStable = matches(stable);
    const inCanary = matches(canary);
    if (!inStable.some(match => ownClass(name, match))) missing.push(name);
    else if (!inCanary.some(match => ownClass(name, match))) leaving.push(name);
    const extra = [...new Set([...inStable, ...inCanary].filter(match => !ownClass(name, match)))];
    if (extra.length) greedy.push(`.${name} also matches ${extra.join(', ')}`);
  }
  if (missing.length) failures.push(`Names Discord no longer has: ${missing.map(name => `.${name}`).join(', ')}. Find what replaced each one in the live client and update src/theme.css.`);
  if (greedy.length) failures.push(`Names that match more than their own class:\n    ${greedy.join('\n    ')}\n  Tie each one to its parent in src/theme.css, or pick a different hook.`);
  if (leaving.length) notes.push(`Still fine today, but gone from Discord's test release, so about to break: ${leaving.map(name => `.${name}`).join(', ')}.`);
  if (!missing.length && !greedy.length) passes.push(`Names       ${plural(names.length, 'class name')}, all found in Discord ${stable.version} and in its test release ${canary.version}`);
}

// --------------------------------------------------------------------------
// 2. Discord's variables
// --------------------------------------------------------------------------

function checkVariables(mine, discord) {
  const unknown = [...mine].filter(name => !discord.defined.has(name) && !discord.read.has(name));
  const unread = [...mine].filter(name => discord.defined.has(name) && !discord.read.has(name));
  if (unknown.length) failures.push(`Variables Dapple sets that Discord doesn't have: ${unknown.join(', ')}. They do nothing, so remove them or find the new name.`);
  else passes.push(`Variables   ${plural(mine.size, 'Discord variable')} set, and Discord has every one`);
  if (unread.length) notes.push(`${plural(unread.length, 'variable')} Dapple sets ${unread.length === 1 ? 'is' : 'are'} never read by a Discord stylesheet. Discord's code may still read them, so they stay, but they're worth a look on screen:\n    ${unread.join(', ')}`);
}

// --------------------------------------------------------------------------
// 3. The accent
// --------------------------------------------------------------------------

const ACCENT_SOURCE = /^--(?:blurple-\d+|opacity-blurple-\d+|brand-\d+|brand-gradient-blurple(?:-light|-dark)?)-hsl$/;
const BLURPLE = /#5865f2|88,\s*101,\s*242|234\.935 calc\(var\(--saturation-factor, 1\)\*85\.556%\) 64\.706%/i;
// Discord has other named colours that happen to hold the same blue: its illustrations and its
// Nitro tiers. They aren't the accent, so they stay Discord's.
const NOT_THE_ACCENT = /^--(?:illo|premium)-/;

function checkAccent(mine, discord, startup, later) {
  // Discord stores each shade as bare numbers and builds every blurple colour from those.
  const sources = [...discord.defined.keys()].filter(name => ACCENT_SOURCE.test(name));
  const left = sources.filter(name => !mine.has(name));
  // Anything else that spells blurple out for itself, instead of building it from a shade. A
  // --custom- variable belongs to one component, like the sky in a piece of artwork, so it's
  // reported with the one-off rules below. Anything shared is a failure.
  const spelled = [...discord.defined].filter(([name, values]) => !ACCENT_SOURCE.test(name) && !NOT_THE_ACCENT.test(name) && !mine.has(name) && discord.read.has(name) && values.some(value => BLURPLE.test(value))).map(([name]) => name);
  const shared = spelled.filter(name => !name.startsWith('--custom-'));
  if (left.length) failures.push(`Shades of blurple Dapple doesn't replace: ${left.slice(0, 12).join(', ')}${left.length > 12 ? ` and ${left.length - 12} more` : ''}. Add them to the accent shades in build.mjs.`);
  if (shared.length) failures.push(`Discord variables with blurple written straight into them: ${shared.join(', ')}. Set each one from --dp-accent in src/theme.css.`);
  if (!left.length && !shared.length) passes.push(`Accent      ${plural(sources.length, 'shade')} of blurple, all made from the accent instead`);

  const fixed = [...startup, ...later].reduce((count, { css }) => count + [...declarations(css)].filter(([, property, value]) => !property.startsWith('--') && BLURPLE.test(value)).length, 0) + spelled.length - shared.length;
  if (fixed) notes.push(`Discord writes blurple straight into ${plural(fixed, 'one-off place')}, with no shared variable to change. They stay blurple unless a rule in src/theme.css restyles the element itself. In November 2026 they were all in Quests, the Shop, Nitro offers and leaderboards.`);
}

// Discord also ships a second set of colours where every raw shade is hot pink and every finished
// colour is written out in full, so its own developers can spot a colour that skipped the system.
// It only loads when Discord's "CSS debugging" developer option is on, so it's left out here. If
// Discord ever loads it for everyone, colours built from the shades stop reaching the screen, and
// Dapple would have to set each finished colour itself.
function withoutDebugColours(startup, later) {
  const isDebugSheet = ({ css }) => /--blurple-50\s*:\s*hotpink/.test(css);
  if (startup.some(isDebugSheet)) failures.push(`Discord now loads its hot pink debugging colours at startup (${startup.find(isDebugSheet).name}). Colours built from blurple shades no longer reach the screen. See "Discord ships hot pink debugging colors" in design/DESIGN.md.`);
  return [...startup, ...later].filter(sheet => !isDebugSheet(sheet));
}

// --------------------------------------------------------------------------
// 4. Dapple's own values
// --------------------------------------------------------------------------

function checkOwnValues() {
  const problems = [];
  for (const version of VERSIONS) {
    const css = stripComments(readFileSync(join(ROOT, 'dist', `${version}.theme.css`), 'utf8'));
    // The last rule holds the wallpaper and its measurements. Each version carries all of them
    // and reads only the ones its glass needs, so they aren't expected to be used everywhere.
    const authored = css.slice(0, css.lastIndexOf(':root {'));
    const defined = [...variablesSet(css)].filter(isOwn);
    const used = new Set([...css.matchAll(/var\((--d(?:p|apple)-[\w-]+)/g)].map(match => match[1]));
    const needed = new Set([...css.matchAll(/var\((--d(?:p|apple)-[\w-]+)\s*\)/g)].map(match => match[1]));
    const unused = [...variablesSet(authored)].filter(isOwn).filter(name => !used.has(name));
    const undefinedNames = [...needed].filter(name => !defined.includes(name));
    if (unused.length) problems.push(`${version}: defined and never used: ${unused.join(', ')}`);
    if (undefinedNames.length) problems.push(`${version}: used and never defined: ${undefinedNames.join(', ')}`);
  }
  if (problems.length) failures.push(`Dapple's own values:\n    ${problems.join('\n    ')}`);
  else passes.push(`Own values  every Dapple value is both defined and used, in all ${VERSIONS.length} versions`);
}

// --------------------------------------------------------------------------

async function main() {
  const [stable, canary, { startup, later, build }] = await Promise.all([classList('stable'), classList('canary'), discordStylesheets()]);
  const discord = discordVariables(withoutDebugColours(startup, later));
  const built = stripComments(readFileSync(join(ROOT, 'dist', 'Dapple.theme.css'), 'utf8'));
  const mine = new Set([...variablesSet(built)].filter(name => !isOwn(name)));

  checkNames(namesIn(readFileSync(join(ROOT, 'src', 'theme.css'), 'utf8')), stable, canary);
  checkVariables(mine, discord);
  checkAccent(mine, discord, startup, later);
  checkOwnValues();

  console.log(`\nDapple, checked against Discord build ${build} (${plural(startup.length + later.length, 'stylesheet')})\n`);
  for (const line of passes) console.log(`  ok    ${line}`);
  for (const line of failures) console.log(`  FAIL  ${line}`);
  if (notes.length) console.log(`\nWorth knowing, but not failures:\n${notes.map(note => `  - ${note}`).join('\n')}`);
  console.log(failures.length ? `\n${plural(failures.length, 'check')} failed.\n` : '\nEverything passed.\n');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch(error => {
  console.error(`\nCouldn't run the check: ${error.message}\nNothing was checked.\n`);
  process.exitCode = 2;
});
