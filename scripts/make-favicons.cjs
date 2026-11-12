/*
 * Regenerate the docs favicon set from the icon artwork (Zotero "magic-wand" icon, AGPL-3.0; see NOTICE). Needs Playwright. Run from the repo root:
 *   node scripts/make-favicons.cjs
 * Writes docs/favicon.svg, favicon.ico, PNGs, apple-touch-icon.png, android-chrome and
 * maskable icons, mstile, safari-pinned-tab.svg, site.webmanifest and browserconfig.xml.
 */
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { chromium } = require('playwright');

const out = path.join(__dirname, '..', 'docs');
const BLUE = '#5B5CF0';
const GLYPH = `<path fill-rule="evenodd" d="M9.9999 0L9.4999 1.5L7.99991 2V2.5L9.4999 3L9.9999 4.5H10.4999L10.9999 3L12.4999 2.5V2L10.9999 1.5L10.4999 0H9.9999ZM17.4999 7.5L16.9999 9L15.4999 9.5V10L16.9999 10.5L17.4999 12H17.9999L18.4999 10.5L19.9999 10V9.5L18.4999 9L17.9999 7.5H17.4999ZM16.9999 1.5L17.4999 0H17.9999L18.4999 1.5L19.9999 2V2.5L18.4999 3L17.9999 4.5H17.4999L16.9999 3L15.4999 2.5V2L16.9999 1.5ZM13.9999 4.76777L11.3838 7.38388L12.616 8.61612L15.2321 6L13.9999 4.76777ZM1.76767 17L4.38379 14.3839L5.61602 15.6161L2.99991 18.2322L1.76767 17ZM0.883789 16.1161L13.116 3.88388C13.6042 3.39573 14.3956 3.39573 14.8838 3.88388L16.116 5.11612C16.6042 5.60427 16.6042 6.39573 16.116 6.88388L3.88379 19.1161C3.39563 19.6043 2.60418 19.6043 2.11602 19.1161L0.883789 17.8839C0.395634 17.3957 0.395634 16.6043 0.883789 16.1161Z"/>`;

// A tile: rounded or full-bleed square in the brand blue, white glyph scaled to `scale`
const tile = ({ radius, scale, size = 24 }) => {
	const offset = (24 - 24 * scale) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">`
		+ `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F7CFF"/><stop offset="1" stop-color="#7A3CF0"/></linearGradient></defs><rect width="24" height="24" rx="${radius}" fill="url(#g)"/>`
		+ `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="#FFFFFF"><g transform="scale(1.2)">${GLYPH}</g></g></svg>\n`;
};

const write = (name, data) => fs.writeFileSync(path.join(out, name), data);

(async () => {
	write('favicon.svg', tile({ radius: 5, scale: 0.65 }));
	// Single-colour mask for Safari pinned tabs
	write('safari-pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="#000">${GLYPH}</svg>\n`);

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
})().catch(e => {
	console.error(e);
	process.exitCode = 1;
});
