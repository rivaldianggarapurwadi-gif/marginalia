# Marginalia

A desktop-first study workspace for PDFs. Open a lecture deck or paper, highlight it, attach notes to exact passages or regions, and let each page's margin grow to fit what you write. The original PDF is never modified; annotations live in a separate layer.

## Features
- Highlight text in four colours; attach a Note, Question or Key concept to any selection
- Area tool for notes on diagrams, plus a pen and eraser
- Per-page margins you can fold, resize, or write in directly; pages extend downward when notes overflow
- Leader lines link every note to its anchor
- Search and filter all annotations across files, then jump back to the source
- Undo/redo, "Original only" view, copy notes as Markdown
- Local-first: PDFs and notes are stored in the browser (IndexedDB)

## Run locally
```bash
npm start
```
Then open http://localhost:3000.

## Deploy
Deployed on Railway with `npm start` (no dependencies). Railway sets `PORT` automatically.
