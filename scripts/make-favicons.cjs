/*
 * Regenerate the docs favicon set from the icon artwork (Zotero "tag" icon, AGPL-3.0; see NOTICE). Needs Playwright. Run from the repo root:
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
const GLYPH = `<path d="M6.086 1L14.586 9.5L9.5 14.586L1 6.086V1H6.086ZM6.5 0H0.5C0.367392 0 0.240215 0.0526784 0.146447 0.146447C0.0526784 0.240215 0 0.367392 0 0.5L0 6.5L9.146 15.646C9.23976 15.7397 9.36692 15.7924 9.4995 15.7924C9.63208 15.7924 9.75924 15.7397 9.853 15.646L15.646 9.853C15.7397 9.75924 15.7924 9.63208 15.7924 9.4995C15.7924 9.36692 15.7397 9.23976 15.646 9.146L6.5 0ZM4 2.75C3.75277 2.75 3.5111 2.82331 3.30554 2.96066C3.09998 3.09801 2.93976 3.29324 2.84515 3.52165C2.75054 3.75005 2.72579 4.00139 2.77402 4.24386C2.82225 4.48634 2.9413 4.70907 3.11612 4.88388C3.29093 5.0587 3.51366 5.17775 3.75614 5.22598C3.99861 5.27421 4.24995 5.24946 4.47835 5.15485C4.70676 5.06024 4.90199 4.90002 5.03934 4.69446C5.17669 4.4889 5.25 4.24723 5.25 4C5.25 3.66848 5.1183 3.35054 4.88388 3.11612C4.64946 2.8817 4.33152 2.75 4 2.75Z"/>`;

// A tile: rounded or full-bleed square in the brand blue, white glyph scaled to `scale`
const tile = ({ radius, scale, size = 24 }) => {
	const offset = (24 - 24 * scale) / 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">`
		+ `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4F7CFF"/><stop offset="1" stop-color="#7A3CF0"/></linearGradient></defs><rect width="24" height="24" rx="${radius}" fill="url(#g)"/>`
		+ `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="#FFFFFF"><g transform="scale(1.5)">${GLYPH}</g></g></svg>\n`;
};

const write = (name, data) => fs.writeFileSync(path.join(out, name), data);

(async () => {
	write('favicon.svg', tile({ radius: 5, scale: 0.65 }));
	// Single-colour mask for Safari pinned tabs
	write('safari-pinned-tab.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#000">${GLYPH}</svg>\n`);

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
