/*
 * Regenerate the docs favicon set from the icon artwork (Lucide "tags", ISC). Needs Playwright and Python 3 (ICO packing). Run from the repo root:
 *   node scripts/make-favicons.cjs
 * Writes docs/favicon.svg, favicon.ico, PNGs, apple-touch-icon.png, android-chrome and
 * maskable icons, mstile, safari-pinned-tab.svg, site.webmanifest and browserconfig.xml.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const out = path.join(__dirname, '..', 'docs');
const BLUE = '#5B5CF0';
const GLYPH = `<path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"/><path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/><circle cx="10.5" cy="6.5" r=".5" fill="#fff"/>`;

// A tile: rounded or full-bleed square in the brand blue, white glyph scaled to `scale`
const tile = ({ radius, scale, size = 24 }) => {
	const offset = (24 - 24 * scale) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">`
		+ `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F7CFF"/><stop offset="1" stop-color="#7A3CF0"/></linearGradient></defs><rect width="24" height="24" rx="${radius}" fill="url(#g)"/>`
		+ `<g transform="translate(${offset} ${offset}) scale(${scale})" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g></svg>\n`;
};

const write = (name, data) => fs.writeFileSync(path.join(out, name), data);

(async () => {
	write('favicon.svg', tile({ radius: 5, scale: 0.65 }));
	// Single-colour mask for Safari pinned tabs
	write('safari-pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</svg>\n`);

	// name, pixel size, tile options, transparent corners
	const pngs = [
		['favicon-16x16.png', 16, { radius: 4, scale: 0.75 }, true],
		['favicon-32x32.png', 32, { radius: 5, scale: 0.7 }, true],
		['favicon-48x48.png', 48, { radius: 5, scale: 0.68 }, true],
		['apple-touch-icon.png', 180, { radius: 0, scale: 0.62 }, false],
		['android-chrome-192x192.png', 192, { radius: 5, scale: 0.65 }, true],
		['android-chrome-512x512.png', 512, { radius: 5, scale: 0.65 }, true],
		['maskable-512x512.png', 512, { radius: 0, scale: 0.5 }, false], // glyph inside the 80% safe zone
		['mstile-150x150.png', 150, { radius: 0, scale: 0.6 }, false],
	];
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	for (const [name, size, opts, transparent] of pngs) {
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(`<body style="margin:0;background:transparent">${tile({ ...opts, size })}</body>`);
		await page.screenshot({ path: path.join(out, name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
	}
	await browser.close();

	// favicon.ico: 16, 32 and 48 px PNG images in one container
	const sizes = [16, 32, 48];
	const images = sizes.map(s => fs.readFileSync(path.join(out, `favicon-${s}x${s}.png`)));
	const header = Buffer.alloc(6 + 16 * sizes.length);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(sizes.length, 4);
	let offset = header.length;
	sizes.forEach((s, i) => {
		const e = 6 + 16 * i;
		header.writeUInt8(s, e);
		header.writeUInt8(s, e + 1);
		header.writeUInt8(0, e + 2);
		header.writeUInt8(0, e + 3);
		header.writeUInt16LE(1, e + 4);
		header.writeUInt16LE(32, e + 6);
		header.writeUInt32LE(images[i].length, e + 8);
		header.writeUInt32LE(offset, e + 12);
		offset += images[i].length;
	});
	write('favicon.ico', Buffer.concat([header, ...images]));
	fs.unlinkSync(path.join(out, 'favicon-48x48.png')); // only needed inside the ICO

	write('site.webmanifest', JSON.stringify({
		name: 'Autotag',
		short_name: 'Autotag',
		description: 'Tag your Zotero library with an LLM.',
		start_url: './',
		display: 'standalone',
		theme_color: BLUE,
		background_color: '#ffffff',
		icons: [
			{ src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
			{ src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
			{ src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
			{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }
		]
	}, null, 2) + '\n');
	write('browserconfig.xml', `<?xml version="1.0" encoding="utf-8"?>\n<browserconfig><msapplication><tile><square150x150logo src="mstile-150x150.png"/><TileColor>${BLUE}</TileColor></tile></msapplication></browserconfig>\n`);
	console.log('favicons written to docs/');
})();
