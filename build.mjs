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
const THEME_VERSION = '1.0.0';
const WALLPAPER_WIDTH = 2560; // the glass hides most of it, so anything larger is wasted bytes
const CACHE = join(ROOT, '.cache', 'wallpapers');
const FONT = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap';

const VERSIONS = [
  { id: 'glass', file: 'Dapple', name: 'Dapple', description: 'Discord, in a new light. What if Apple designed Discord? Liquid Glass that follows your light or dark appearance.' },
  { id: 'light', file: 'Dapple-Light', name: 'Dapple Light', description: 'Discord, in a new light. What if Apple designed Discord? Liquid Glass, but lighter.' },
  { id: 'dark', file: 'Dapple-Dark', name: 'Dapple Dark', description: 'Discord, in a new light. What if Apple designed Discord? Liquid Glass, but darker.' },
];

// Blue is built into every version. Each flavour is a small add-on that swaps the wallpaper.
const FLAVOURS = [
  { name: 'Skyblue' }, { name: 'Green' }, { name: 'Yellow' }, { name: 'Orange' },
  { name: 'Red' }, { name: 'Purple' }, { name: 'Silver' },
  { name: 'Golden Gate', source: 'GoldenGate_Mac+2' },
];

const DARK_ROOT = 'html.theme-dark, html.theme-darker, html.theme-midnight';
const LIGHT_ROOT = 'html.theme-light';
const THEME_ROOTS = ['.theme-dark', '.theme-light', '.theme-darker', '.theme-midnight', '.visual-refresh'];
// Discord declares tokens on these classes, and its lazy stylesheets can load after a theme,
// so plain :root loses. Repeating the class outranks both without using !important.
const ALL_ROOTS = [':root:root:root', ...THEME_ROOTS.map(c => c.repeat(3))].join(', ');

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

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
  const render = blocks => blocks.map(({ prelude, body }) => {
    if (prelude.startsWith('@')) {
      const inner = render(parseBlocks(body));
      return inner ? `${prelude} {\n${inner}\n}` : '';
    }
    const selectors = [...new Set(prelude.split(',').map(mapSelector).filter(Boolean))];
    return selectors.length ? `${selectors.join(', ')} {\n${body.trim()}\n}` : '';
  }).filter(Boolean).join('\n');
  return render(parseBlocks(stripComments(readFileSync(join(ROOT, 'src/tokens.css'), 'utf8'))));
}

// `~name` matches one exact class stem, whatever hash Discord gives it this week.
// A plain [class*="bar_"] would also hit sidebar_ and toolbar_.
const expandTheme = css => stripComments(css)
  .replace(/~([a-zA-Z][a-zA-Z0-9-]*)/g, ':is([class^="$1_"], [class*=" $1_"])')
  .replaceAll('%ALL%', ALL_ROOTS);

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

async function wallpaper(source) {
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, `${source.replace(/[^\w-]/g, '_')}.webp`);
  if (!existsSync(cached)) {
    await sharp(join(ROOT, 'assets', `${source}.png`))
      .resize({ width: WALLPAPER_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(cached);
  }
  return `url("data:image/webp;base64,${readFileSync(cached).toString('base64')}")`;
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
  const bright = percentile(0.995); // close to the true peak: a label can land right on the crest of a wave
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
 * @source ${SOURCE}
 */
`;

const kb = text => `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`;

async function main() {
  rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
  mkdirSync(join(ROOT, 'dist', 'flavours'), { recursive: true });

  const theme = expandTheme(readFileSync(join(ROOT, 'src/theme.css'), 'utf8'));
  const blueDark = await wallpaper('Blue_Dark');
  const blueLight = await wallpaper('Blue_Light');
  // The dark wallpaper sets the dimming and the light wallpaper sets the lift.
  const clampPair = async (dark, light) => {
    const d = await clampFor(dark);
    const l = await clampFor(light);
    return { '--dp-dim-panel': d['--dp-dim-panel'], '--dp-dim-content': d['--dp-dim-content'], '--dp-lift-panel': l['--dp-lift-panel'], '--dp-lift-content': l['--dp-lift-content'] };
  };
  const previewClamps = { Blue: await clampPair('Blue_Dark', 'Blue_Light') };
  const lenses = `:root {
--dp-lens-composer: ${lens({ height: 400, rim: 10, scale: 22, bottom: false })};
--dp-lens-tool: ${lens({ height: 40, rim: 8, scale: 16 })};
--dp-wallpaper-dark: ${blueDark};
--dp-wallpaper-light: ${blueLight};
${declarations(previewClamps.Blue)}
}`;
  const follow = {
    glass: `${DARK_ROOT} { --dp-wallpaper: var(--dp-wallpaper-dark); }\n${LIGHT_ROOT} { --dp-wallpaper: var(--dp-wallpaper-light); }`,
    light: ':root { --dp-wallpaper: var(--dp-wallpaper-light); }',
    dark: ':root { --dp-wallpaper: var(--dp-wallpaper-dark); }',
  };

  for (const v of VERSIONS) {
    const css = [header(v.name, v.description), `@import url("${FONT}");`, lenses, tokensFor(v.id), follow[v.id], theme].join('\n\n');
    writeFileSync(join(ROOT, 'dist', `${v.file}.theme.css`), css);
    console.log(`${v.file}.theme.css`.padEnd(44), kb(css));
  }

  for (const f of FLAVOURS) {
    const dark = await wallpaper(f.source ?? `${f.name}_Dark`);
    const light = f.source ? dark : await wallpaper(`${f.name}_Light`);
    const clamps = await clampPair(f.source ?? `${f.name}_Dark`, f.source ?? `${f.name}_Light`);
    previewClamps[f.source ? 'GoldenGate' : f.name] = clamps;
    const css = `${header(`Dapple Flavour: ${f.name}`, `Turn this on alongside Dapple, Dapple Light or Dapple Dark to swap the wallpaper to ${f.name}.`)}
/* html:root outranks the version's :root, whichever theme file loads first. */
html:root {
--dp-wallpaper-dark: ${dark};
--dp-wallpaper-light: ${light};
${declarations(clamps)}
}
`;
    const file = `Dapple-Flavour-${f.name.replace(/\s+/g, '')}.theme.css`;
    writeFileSync(join(ROOT, 'dist', 'flavours', file), css);
    console.log(`flavours/${file}`.padEnd(44), kb(css));
  }

  // The preview reads the same numbers, so its wallpaper picker matches the real theme.
  writeFileSync(join(ROOT, 'design', 'clamps.js'), `window.DAPPLE_CLAMPS = ${JSON.stringify(previewClamps, null, 2)};\n`);
  console.log('clamps', JSON.stringify(previewClamps.Blue));
}

await main();
