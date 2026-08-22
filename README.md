# General Topology website

This folder is the canonical source for the hand-authored site published at
`https://zhengchao-wan.com/general-topology/`.

It was absorbed from `ZhengchaoW/general-topology` at commit `6018a29` on
August 12, 2026. That standalone repository retains the earlier Git history;
new site changes belong in this teaching repository.

## Pages

- `index.html` — current Fall 2026 page
- `fall-2025.html` — archived Fall 2025 page
- `styles.css` — shared compact visual style
- `syllabus.tex` and `syllabus.pdf` — temporary Fall 2026 syllabus placeholder
- `coursenotes/` and `syllabus-fall-2025.pdf` — Fall 2025 linked documents

The semester navigation is written directly into each semester page. When a
new semester is added, preserve the current page as an archive, add reciprocal
semester links, and keep `index.html` as the current offering.

## Local preview

From this directory, run:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

`schedule_generator.py` and its CSV files are retained from the Fall 2025
standalone repository for provenance. They are not the source of the current
Fall 2026 landing page.
