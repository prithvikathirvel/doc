// One-shot brand asset generator. Renders the SVG sources to the PNG sizes the
// web app and search engines expect, and packs a multi-size favicon.ico.
//   cd brand && npm install && npm run build:icons
// Requires: @resvg/resvg-js, png-to-ico
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const r = (p) => join(dir, p);

const FONT_FILES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];
const fontConfig = {
  loadSystemFonts: false,
  defaultFontFamily: "DejaVu Sans",
  fontFiles: FONT_FILES,
};

function render(svgFile, width, outFile) {
  const svg = readFileSync(svgFile);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: fontConfig });
  const png = resvg.render().asPng();
  writeFileSync(outFile, png);
  console.log("rendered", outFile, `(${width}px, ${png.length} bytes)`);
}

const ICON_SIZES = [512, 192, 180, 48, 32, 16];
for (const size of ICON_SIZES) {
  render(r("icon.svg"), size, r(`icon-${size}.png`));
}

const ico = await pngToIco([
  readFileSync(r("icon-48.png")),
  readFileSync(r("icon-32.png")),
  readFileSync(r("icon-16.png")),
]);
writeFileSync(r("favicon.ico"), ico);
console.log("rendered favicon.ico", `(${ico.length} bytes)`);

render(r("og-image.svg"), 1200, r("og-image.png"));
for (const [src, w, out] of [
  [r("logo.svg"), 1024, r("logo-1024.png")],
  [r("logo.svg"), 512, r("logo-512.png")],
]) {
  render(src, w, out);
}
console.log("done");
