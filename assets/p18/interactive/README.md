# Information Desk

Open `index.html` through a static HTTP server. For example, run `python -m http.server 8000` from this folder, then visit `http://localhost:8000`. The deployed portfolio runs the same files.

Edit `geometry.mjs` for dimensions and geometry rules, `app.mjs` for controls and rendering, and `styles.css` for appearance. Three.js 0.186.1 is included in `vendor/` with its MIT license. `assets/caster.json` is a triangulated supplier-derived preview mesh in millimetres.

Browser v2 gives every occupied cell its own four-post frame, 12 rails and four supplier-mesh casters, with a 6 mm neighboring seam. Separation from 1.00 to 2.20 translates the complete cell, its contents and sign without scaling. The 3D viewport reports Width, Depth, Height and Counter; separated view reports Spread width and Spread depth. The Module separation slider and Dimensions toggle are available. Plan selection has no red cell border: the selected label is bold and underlined. A/B handles use a quiet blue halo, dark-blue core and 44 px target with hover, focus and drag feedback.

The browser works without Rhino, Grasshopper or a paid CAD service. The earlier native Grasshopper definition is an optional shared-frame v1 download, and its parity reference applies to browser v1 only. All project copy and signage use Information Desk.

This is a digital prototype. Design and system direction by Deying Chen; implementation and verification were AI-assisted.
