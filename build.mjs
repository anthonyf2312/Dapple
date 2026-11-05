// Builds every Dapple theme from src/tokens.css and src/theme.css.
//
//   node build.mjs
//
// Output is plain CSS with no runtime dependencies. Each file embeds its wallpapers, so a theme
// works in Equicord, Vencord and BetterDiscord with no hosting and no extra CSP rules.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(fileURLToPath(import.meta.url));
const AUTHOR = 'anthonyf2312';
const SOURCE = 'https://github.com/anthonyf2312/Dapple';
const THEME_VERSION = '1.2.0';
const WALLPAPER_WIDTH = 2560; // the glass hides most of it, so anything larger is wasted bytes
const WEBP_QUALITY = 80;
// The Equicord Theme Library refuses a file containing any of these, even by chance inside base64.
const REJECTED_TEXT = ['JFIF', 'Photoshop', 'PNG', 'GIF8', 'PDF-'];
const CACHE = join(ROOT, '.cache', 'wallpapers');
const FONT = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap';

const VERSIONS = [
  { id: 'glass', file: 'Dapple', name: 'Dapple', description: 'What if Apple designed Discord? Discord, in a new light. A Liquid Glass theme.' },
  { id: 'light', file: 'Dapple-Light', name: 'Dapple Light', description: 'What if Apple designed Discord? Discord, in a new light. A Liquid Glass theme.' },
  { id: 'dark', file: 'Dapple-Dark', name: 'Dapple Dark', description: 'What if Apple designed Discord? Discord, in a new light. A Liquid Glass theme.' },
];

// Arcella Alps is built into every version. Each flavour is a small add-on that swaps the wallpaper.
const DEFAULT_WALLPAPER = 'Arcella Alps';
const FLAVOURS = [
  { name: 'Chaos Ridge' }, { name: 'Difflugia Divide' }, { name: 'Pelomyxa Pass' },
  { name: 'Proteus Valley' }, { name: 'Vannella Hills' },
];
// Keeps the collection's own file names, so an image can be dropped straight in from the download.
const darkImage = name => `${name.replaceAll(' ', '+')}+Dark+Mac`;
const lightImage = name => `${name.replaceAll(' ', '+')}+Light+Mac`;

const DARK_ROOT = 'html.theme-dark, html.theme-darker, html.theme-midnight';
const LIGHT_ROOT = 'html.theme-light';

// These names also appear inside longer ones (sidebar_ contains bar_), so they need the longer
// match. Checked against every class in Discord's CSS. Everything else is safe with the short one.
const SHARED_NAMES = new Set(['active', 'bar', 'focused', 'form', 'layer', 'layerContainer', 'name', 'title']);

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const commentsIn = css => (css.match(/\/\*[\s\S]*?\*\//g) ?? []).join('\n');

function parseBlocks(css) {
  const blocks = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    let depth = 1, j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    blocks.push({ prelude: css.slice(i, open).trim(), body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return blocks;
}

// tokens.css addresses versions with data attributes so the preview can switch them live.
// Here each theme keeps only its own rules, rewritten onto Discord's root element.
function tokensFor(version) {
  const mapSelector = raw => {
    const s = raw.trim();
    if (s === ':root') return s;
    if (version === 'glass') {
      if (s === '[data-version="glass"][data-appearance="dark"]') return DARK_ROOT;
      if (s === '[data-version="glass"][data-appearance="light"]') return LIGHT_ROOT;
      return null;
    }
    return s === `[data-version="${version}"]` ? ':root' : null;
  };
  // Comments stay, so the built themes are as readable as the source.
  const render = blocks => blocks.map(({ prelude, body }) => {
    const notes = commentsIn(prelude);
    const head = stripComments(prelude).trim();
    if (head.startsWith('@')) {
      const inner = render(parseBlocks(body));
      return inner ? `${notes}\n${head} {\n${inner}\n}`.trim() : '';
    }
    const selectors = [...new Set(head.split(',').map(mapSelector).filter(Boolean))];
    return selectors.length ? `${notes}\n${selectors.join(', ')} {\n${body.replace(/^\s*\n/, '').trimEnd()}\n}`.trim() : '';
  }).filter(Boolean).join('\n\n');
  return render(parseBlocks(readFileSync(join(ROOT, 'src/tokens.css'), 'utf8')));
}

// Discord's class names end in a random hash that changes with its updates, so a class like
// .message in the source becomes a match on the start of the name. A class with a hyphen is
// one of Discord's fixed names, like .app-focused, and stays as written.
const matchName = name => SHARED_NAMES.has(name)
  ? `:is([class^="${name}_"], [class*=" ${name}_"])`
  : `[class*="${name}_"]`;
const expandSelectors = code => code.replace(/[^{}]+(?=\{)/g, selector =>
  selector.replace(/\.([a-zA-Z][a-zA-Z0-9]*)(?![\w-])/g, (_, name) => matchName(name)));
// Odd entries are comments, which pass through untouched.
const expandTheme = css => css.split(/(\/\*[\s\S]*?\*\/)/).map((part, i) => i % 2 ? part : expandSelectors(part)).join('');

// Every --dp- value the themes define should be read somewhere.
function warnUnusedTokens(css) {
  const defined = new Set([...stripComments(css).matchAll(/(--dp-[\w-]+)\s*:/g)].map(m => m[1]));
  const unused = [...defined].filter(token => !css.includes(`var(${token}`));
  if (unused.length) console.warn(`Unused tokens: ${unused.join(' ')}`);
}

// No Blur is the Reduce Transparency setting, minus clearing the wallpaper, so the two can't drift.
function solidSurfaces() {
  const tokens = parseBlocks(stripComments(readFileSync(join(ROOT, 'src/tokens.css'), 'utf8')));
  const media = tokens.find(block => block.prelude.startsWith('@media (prefers-reduced-transparency'));
  return parseBlocks(media.body).map(block => block.body).join('\n')
    .split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('--dp-wallpaper:')).join('\n');
}

// Refraction with no JavaScript: an SVG displacement map used by backdrop-filter. Discord's CSP
// allows data: images, and this was confirmed rendering inside the real client.
// `bottom: false` leaves only the top rim, for controls that grow, like the message box.
function lens({ height, rim, scale, bottom = true }) {
  const width = 4000;
  const rimBottom = bottom ? `<feFlood flood-color='rgb(128,0,0)' x='0' y='${height - rim}' width='${width}' height='${rim}' result='b'/>` : '';
  const mergeBottom = bottom ? `<feMergeNode in='b'/>` : '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg'><filter id='l' x='0' y='0' width='${width}' height='${height}' filterUnits='userSpaceOnUse' primitiveUnits='userSpaceOnUse' color-interpolation-filters='sRGB'><feFlood flood-color='rgb(128,128,0)' x='0' y='0' width='${width}' height='${height}' result='n'/><feFlood flood-color='rgb(128,255,0)' x='0' y='0' width='${width}' height='${rim}' result='t'/>${rimBottom}<feMerge result='m0'><feMergeNode in='n'/><feMergeNode in='t'/>${mergeBottom}</feMerge><feGaussianBlur in='m0' stdDeviation='${rim / 2}' result='m'/><feDisplacementMap in='SourceGraphic' in2='m' scale='${scale}' xChannelSelector='R' yChannelSelector='G'/></filter></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#l")`;
}

const findRejected = text => REJECTED_TEXT.find(marker => text.includes(marker));

async function wallpaper(source) {
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, `${source.replace(/[^\w-]/g, '_')}.webp`);
  const encode = quality => sharp(join(ROOT, 'assets', `${source}.png`))
    .resize({ width: WALLPAPER_WIDTH, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(cached);
  const base64 = () => readFileSync(cached).toString('base64');

  if (!existsSync(cached)) await encode(WEBP_QUALITY);
  // One notch of quality rewrites the bytes with no visible change, which clears a chance match.
  for (let quality = WEBP_QUALITY - 1; findRejected(base64()); quality--) {
    if (quality < WEBP_QUALITY - 5) throw new Error(`${source}: no encoding free of rejected text`);
    await encode(quality);
  }
  return `url("data:image/webp;base64,${base64()}")`;
}

// CSS can't sample what's behind glass, but the build can. Each wallpaper is blurred the way the
// glass will blur it and measured, so it gets only as much clamping as its brightest (or darkest)
// band needs. Calm wallpapers stay open, and bright ones are held back just enough to stay legible.
async function clampFor(source) {
  const { data } = await sharp(join(ROOT, 'assets', `${source}.png`))
    .resize({ width: 480 })
    .blur(8)
    .modulate({ saturation: 1.7 }) // the glass saturates before it clamps, so measure what it will see
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sorted = [...data].sort((a, b) => a - b);
  const percentile = p => sorted[Math.floor(sorted.length * p)];
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;

  // Dark glass: the brightest band, dimmed then tinted, must land at or below `ceiling`.
  const bright = percentile(0.995); // close to the true peak: a label can land right on the brightest band
  const dim = (ceiling, tint) => clamp((ceiling - tint * 14) / (bright * (1 - tint)), 0.3, 0.92);
  // Light glass: the darkest band, compressed then lifted, must land at or above `floor`.
  const dark = percentile(0.05) / 255;
  const lift = (floor, tint) => {
    const needed = (floor / 255 - tint) / (1 - tint) / LIFT_BRIGHTNESS;
    return dark >= 0.5 ? 0.9 : clamp((needed - 0.5) / (dark - 0.5), 0.22, 0.9);
  };
  return {
    '--dp-dim-panel': dim(92, 0.22),
    '--dp-dim-content': dim(64, 0.36),
    '--dp-lift-panel': lift(184, 0.42),
    '--dp-lift-content': lift(212, 0.52),
  };
}

const LIFT_BRIGHTNESS = 1.16; // keep in step with brightness() in the Liquid Glass light filters
const declarations = values => Object.entries(values).map(([k, v]) => `${k}: ${v};`).join('\n');

const header = (name, description) => `/**
 * @name ${name}
 * @description ${description}
 * @author ${AUTHOR}
 * @version ${THEME_VERSION}
 * @website ${SOURCE}
 * @source ${SOURCE}
 */
`;

const kb = text => `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`;

function writeTheme(path, css) {
  const found = findRejected(css);
  if (found) throw new Error(`${path} contains "${found}", so the Equicord Theme Library would refuse it`);
  writeFileSync(path, css);
}

async function main() {
  rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
  mkdirSync(join(ROOT, 'dist', 'flavours'), { recursive: true });

  const theme = expandTheme(readFileSync(join(ROOT, 'src/theme.css'), 'utf8'));
  const defaultDark = await wallpaper(darkImage(DEFAULT_WALLPAPER));
  const defaultLight = await wallpaper(lightImage(DEFAULT_WALLPAPER));
  // The dark wallpaper sets the dimming and the light wallpaper sets the lift.
  const clampPair = async name => {
    const d = await clampFor(darkImage(name));
    const l = await clampFor(lightImage(name));
    return { '--dp-dim-panel': d['--dp-dim-panel'], '--dp-dim-content': d['--dp-dim-content'], '--dp-lift-panel': l['--dp-lift-panel'], '--dp-lift-content': l['--dp-lift-content'] };
  };
  const previewClamps = { [DEFAULT_WALLPAPER]: await clampPair(DEFAULT_WALLPAPER) };
  // Image data goes last, so the settings are the first thing anyone sees in a theme file.
  const generated = `/* --------------------------------------------------------------------------
   Generated by build.mjs: the glass lenses, wallpapers and wallpaper measurements.
   There is nothing to edit below this line.
   -------------------------------------------------------------------------- */

:root {
--dp-lens-composer: ${lens({ height: 400, rim: 10, scale: 22, bottom: false })};
--dp-lens-tool: ${lens({ height: 40, rim: 8, scale: 16 })};
--dp-wallpaper-dark: ${defaultDark};
--dp-wallpaper-light: ${defaultLight};
${declarations(previewClamps[DEFAULT_WALLPAPER])}
}`;

  for (const v of VERSIONS) {
    const styles = [tokensFor(v.id), theme].join('\n\n');
    warnUnusedTokens(styles);
    const css = [header(v.name, v.description), `@import url("${FONT}");`, styles, generated].join('\n\n');
    writeTheme(join(ROOT, 'dist', `${v.file}.theme.css`), css);
    console.log(`${v.file}.theme.css`.padEnd(44), kb(css));
  }

  for (const f of FLAVOURS) {
    const dark = await wallpaper(darkImage(f.name));
    const light = await wallpaper(lightImage(f.name));
    const clamps = await clampPair(f.name);
    previewClamps[f.name] = clamps;
    const css = `${header(`Dapple Flavour: ${f.name}`, `Turn this on alongside Dapple, Dapple Light or Dapple Dark to swap the wallpaper to ${f.name}.`)}
/* html:root outranks the version's :root, whichever theme file loads first. */
html:root {
--dp-wallpaper-dark: ${dark};
--dp-wallpaper-light: ${light};
${declarations(clamps)}
}
`;
    const file = `Dapple-Flavour-${f.name.replace(/\s+/g, '')}.theme.css`;
    writeTheme(join(ROOT, 'dist', 'flavours', file), css);
    console.log(`flavours/${file}`.padEnd(44), kb(css));
  }

  const noBlur = `${header('Dapple Flavour: No Blur', 'Turn this on alongside Dapple, Dapple Light or Dapple Dark for solid panels instead of glass. Easier on older PCs and easier to read.')}
/* html:root:root outranks the glass settings in every version. */
html:root:root {
${solidSurfaces()}
}
`;
  writeTheme(join(ROOT, 'dist', 'flavours', 'Dapple-Flavour-NoBlur.theme.css'), noBlur);
  console.log('flavours/Dapple-Flavour-NoBlur.theme.css'.padEnd(44), kb(noBlur));

  // The preview reads the same numbers, so its wallpaper picker matches the real theme.
  writeFileSync(join(ROOT, 'design', 'clamps.js'), `window.DAPPLE_CLAMPS = ${JSON.stringify(previewClamps, null, 2)};\n`);
  for (const [name, clamps] of Object.entries(previewClamps)) console.log(name.padEnd(18), JSON.stringify(clamps));
}

await main();
