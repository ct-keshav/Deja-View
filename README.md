# Deja View

Visual regression testing made simple. Capture, compare, and spot pixel differences — no CI required.

Deja View is a Chrome extension that lets you capture a reference screenshot of any web page, then compare it against the current state to instantly spot visual changes. All processing happens locally in your browser.

## Features

- **Two capture modes** — capture a reference directly from a tab, or upload/paste an image
- **Full-page capture** — automatically scrolls and stitches screenshots for pages up to 15,000px tall
- **Four visualization modes:**
  - **Overlay** — semi-transparent reference layered over the current page (adjustable opacity)
  - **Diff** — red/green pixel map highlighting exact changes
  - **Heatmap** — color gradient showing difference intensity
  - **Side by Side** — split-screen comparison with labels
- **Match score** — pixel-level accuracy percentage with configurable threshold
- **Density control** — adjust diff/heatmap sensitivity
- **One-click export** — copy a 4-panel composite (original, current, diff, heatmap) to clipboard
- **Fixed element handling** — optionally hide fixed/sticky headers and navbars during capture
- **Configurable delay** — add a delay before capture to let animations settle
- **Draggable toolbar** — reposition the comparison toolbar anywhere on the page

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/ct-keshav/Deja-View.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the cloned `Deja-View` folder
5. The extension icon will appear in your toolbar

## Usage

### Capture from Tab

1. Navigate to the page you want to test
2. Click the Deja View icon and select **Capture from Tab**
3. Click **Capture Reference** to save the current state
4. Make changes to the page (or navigate to a different version)
5. Click **Compare** to see the differences

### Upload / Paste

1. Click the Deja View icon and select **Upload / Paste**
2. Drag and drop an image, use the file picker, or paste from clipboard
3. Click **Compare** to compare the uploaded reference against the current tab

### Comparison Toolbar

Once a comparison starts, a toolbar appears on the page with controls to:

- Switch between Overlay, Diff, Heatmap, and Side by Side modes
- Adjust opacity (overlay mode) or density (diff/heatmap modes)
- View the match percentage score
- Copy all four panels to clipboard
- Close the comparison or reset the reference

## Project Structure

```
Deja-View/
├── manifest.json          # Chrome extension manifest (MV3)
├── background/
│   └── background.js      # Service worker: capture, stitching, storage
├── content/
│   ├── content.js         # Page overlay: comparison rendering, UI orchestration
│   └── content.css        # Overlay container styles
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup interaction logic
│   └── popup.css          # Popup styles
├── lib/
│   ├── diff.js            # Pixel diff and heatmap computation
│   ├── overlay.js         # Canvas rendering for all visualization modes
│   ├── toolbar.js         # Draggable Shadow DOM toolbar
│   ├── theme.js           # Theme constants for toolbar (JS)
│   ├── theme.css          # Theme CSS custom properties
│   └── utils.js           # Image loading and normalization utilities
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Author

**Keshav Agarwal** — [GitHub](https://github.com/ct-keshav)

## License

[MIT](LICENSE)
