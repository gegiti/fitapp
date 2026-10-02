---
name: embed-images-not-file-links
description: "User views this session over Remote Control from the Windows desktop app; file-path links to images fail to load, so always embed images with Read"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6c99d0da-4c32-5c39-88ae-4749e047a68e
  modified: 2026-09-04T18:37:07.274Z
---

When the user needs to see an image (mock, screenshot, figure), open it with the Read tool so it is embedded in the conversation. Do not rely on them clicking a file path.

**Why:** The user works from the Claude desktop app on Windows over a Remote Control session. Clicking a file path in that viewer produced "Couldn't load this file" even though the PNGs were valid and inside the working directory. Images embedded via Read displayed fine.

**How to apply:** After rendering any visual artifact, Read the PNG so it shows inline. If a file is re-rendered while the user might be viewing it, save copies under new version names (e.g. `docs/mocks/review/v5-*.png`) rather than overwriting.
