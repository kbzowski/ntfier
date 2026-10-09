# Why the taskbar icon is blurry

Research for #5. Versions checked: tauri 2.11.5, tauri-codegen 2.6.3, tao 0.35.3 (from `src-tauri/Cargo.lock`).

## Answer

The taskbar shows our **16x16** icon frame stretched up to 24x24.

Tauri builds the window icon from only the *first* entry in `icon.ico`. Pillow always writes ICO frames smallest-first, so the first entry is the 16px one. Tauri gives Windows that one 16px bitmap as the window's only icon. The Windows 11 taskbar draws app icons at 24px at 100% scaling, so it has to blow the 16px image up by 1.5x. The 16px frame is already muddy, so the result looks soft.

The other sizes in `icon.ico` (24/32/48/256) are never used for the running window. They only go into the .exe resource, which Explorer and the Start menu read.

## Evidence

**Which image becomes `default_window_icon()`**

- On Windows, tauri-codegen picks the first `.ico` in `bundle.icon` (`crates/tauri-codegen/src/context.rs`, around lines 211-232).
- `CachedIcon::new_ico` decodes `icon_dir.entries()[0]` and nothing else (`crates/tauri-codegen/src/image.rs:57`).
- Our `icon.ico` directory, in file order: 16, 24, 32, 48, 64, 256. Entry 0 is 16x16.
- `scripts/gen_icons.py` passes sizes as `[256, 64, ..., 16]`, hoping 256 comes first, but Pillow 12's `IcoImagePlugin._save` loops over `sorted(set(sizes))`, so the file always starts at 16.

**How it reaches the taskbar**

- Tauri applies `default_icon` to every window that doesn't set its own (`crates/tauri/src/manager/window.rs:75`).
- tauri-runtime-wry only calls tao's `with_window_icon` (`crates/tauri-runtime-wry/src/lib.rs:1245-1248`). It never sets a taskbar icon.
- tao sends `WM_SETICON` with `ICON_SMALL` for the window icon, and `ICON_BIG` only for `taskbar_icon`, which Tauri leaves unset (`src/platform_impl/windows/window.rs:882-902`). The window class has `hIcon` and `hIconSm` set to null (same file, around line 1365). The icon is a single `CreateIcon` bitmap built from RGBA data (`src/platform_impl/windows/icon.rs:38`), so Windows can't pick a better size.
- So the taskbar falls back to the 16px small icon.

**What sizes Windows wants** ([Microsoft: Construct your app's icon](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction))

| Scale | 100% | 125% | 150% | 200% |
|---|---|---|---|---|
| Title bar, tray | 16 | 20 | 24 | 32 |
| Taskbar | 24 | 30 | 36 | 48 |

Microsoft also says to ship a 256px icon "so Windows should only ever scale your icon down, never up". Today we only ever scale *up* on the taskbar, at every scale level.

**This machine:** system DPI is 96 (100%), with two monitors at 1920x1080 and 3440x1440. Taskbar icon = 24px, so the stretch is 16 to 24.

**The frames themselves.** `gen_icons.py` makes every size as a plain LANCZOS downscale of `logo.png`, with no per-size cleanup. Blown up 8x:

- 16px: the three sound arcs blur together into a blue smear on each side of the bell. This is the frame on the taskbar right now.
- 24px: the arcs are readable but soft. 32px and 48px look fine.
- 16px stretched to 24px with bilinear filtering looks just like the screenshot.

**Tray.** The tray starts out with `default_window_icon()` (the same 16px frame, `lib.rs:174`). `TrayManager::load_icons` then swaps in `tray.png`, which is 32x32 only (`tray_manager.rs:49`). Windows scales it to 16 (100%), 20 (125%), 24 (150%) or 32 (200%). At 100% that's a clean 2:1 shrink, so the tray is fine on this machine. At 125% and 150% it will be a bit soft. The tray is not what the screenshot shows.

## Recommendation

1. **Put the 256px frame first in `icon.ico`.** This one change fixes the taskbar, and the Rust code stays as it is. Tauri will then hand Windows a 256px bitmap, and Windows only ever scales it down (to 24/30/36/48). Pillow won't write that order, so either write the ICO header ourselves in `gen_icons.py` (frames in descending order) or reverse the directory entries after saving. Check it by reading the ICO directory (6-byte header, then 16-byte entries): entry 0 must be 256 (stored as width byte 0).
2. **If 256 shrunk to 24 still looks soft**, set `ICON_BIG` from the .exe's own multi-size icon resource (`LoadImageW` with `LR_DEFAULTSIZE`, then `WM_SETICON`) in `setup`. Windows then picks the exact 24/32/48 frame. This needs about 10 lines using the `windows` crate. Only do it if step 1 isn't good enough.
3. **Hand-tune the 16px frame, and ideally 24px too.** Drop the outer arc and keep the bell plus one or two thick arcs, snapped to whole pixels. The 16px frame still shows in the title bar, Alt+Tab small view and the tray (at the start). Draw them as separate PNGs instead of downscaling the 512px source.
4. **Tray (low priority).** Add 20px and 24px versions of `tray.png` and `tray-unread.png`, and pick one at load time from the monitor's DPI. Or just keep 32px, which is fine at 100% and 200%.
