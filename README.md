# Marginalia

A desktop-first study workspace for PDFs. Open a lecture deck or paper, highlight it, attach notes to exact passages or regions, and let each page's margin grow to fit what you write. The original PDF is never modified; annotations live in a separate layer.

## Features
- Highlight text in four colours; attach a Note, Question or Key concept to any selection
- Area tool for notes on diagrams, plus a pen and eraser
- Sticky notes placed right on the page: drag to move, resize, recolor, minimize, or send any margin note to the page and back
- Sticky format panel (Aa): size presets S–XL plus free corner resize, four shapes (folded, square, rounded, circle) and text size from 9 to 32 pt
- Per-page margins you can fold, resize, or write in directly; pages extend downward when notes overflow
- Leader lines link every note to its anchor
- Search and filter all annotations across files, then jump back to the source
- Find in document (⌘F, ⌘G / ⇧⌘G for next / previous) with every match highlighted on the page
- Undo/redo, "Original only" view, copy notes as Markdown
- Local-first: PDFs and notes are stored in the browser (IndexedDB)

## Run locally
```bash
npm start
```
Then open http://localhost:3000.

## Deploy
Deployed on Railway with `npm start` (no dependencies). Railway sets `PORT` automatically.

## Android tablet (and phones)
Marginalia installs as an offline app (PWA) from any HTTPS address. The GitHub Pages workflow publishes it to `https://<user>.github.io/marginalia/` on every push to `main`.

1. One-time setup: on GitHub open **Settings → Pages** and set **Source** to **GitHub Actions**, then re-run the *Deploy to GitHub Pages* workflow (Actions tab).
2. On the tablet, open the Pages URL in Chrome, tap **⋮ → Add to Home screen → Install**.
3. Launch Marginalia from the home screen. It opens full screen and works with no connection; PDFs and notes stay on the tablet.

Notes are stored per device, so a PDF annotated on the Mac does not appear on the tablet. Use *Copy notes* or the PDF export to move work across.

To run it from the tablet itself instead, install [Termux](https://f-droid.org/packages/com.termux/), then `pkg install nodejs git`, clone the repo, `npm start`, and open http://localhost:3000 in Chrome.

## Mac app
The `desktop/` folder wraps the same page in Electron so it runs as a normal Mac app, fully offline (pdf.js and jsPDF are bundled in `vendor/`). Notes are stored in `~/Library/Application Support/Marginalia`.

```bash
cd desktop
npm install
npm start          # run without packaging
npm run dist       # build desktop/dist/mac-arm64/Marginalia.app
```
The build is unsigned. To install it locally, ad-hoc sign it and copy it to Applications:
```bash
codesign --force --deep -s - dist/mac-arm64/Marginalia.app
ditto dist/mac-arm64/Marginalia.app /Applications/Marginalia.app
```
