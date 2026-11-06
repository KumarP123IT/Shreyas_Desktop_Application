# Installer Assets

These files are bundled into the Windows installer:

| File | Purpose |
|------|---------|
| `icon_pro.ico` | Windows installer + desktop shortcut icon |
| `icon_pro-512.png` | 512×512 PNG (used for documentation / future Electron builds) |
| `icon_pro-1024.png` | 1024×1024 PNG (high-res source) |
| `icon_pro.svg` | Vector source |

To regenerate the `.ico` from the SVG:
```bash
# Using ImageMagick
convert icon_pro-1024.png -define icon:auto-resize=256,128,64,48,32,16 icon_pro.ico
```
