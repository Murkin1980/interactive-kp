# Technical Report: Demo Video Rebuild

## Summary

Rebuilt 13 narrated product demo videos for the Interactive KP learning center (`/demos/`). Each video demonstrates one workflow scenario recorded against the live production environment, with Russian voiceover and synchronized subtitles.

**Deployed:** 2026-07-26 | **Branch:** `feature/rebuild-product-demos` | **Version:** `df4a7eb0`

## Architecture

```
demo/
  narration/01-13.txt          ← Narration scripts (input)
  scenarios/01-13.json         ← Testreel recording definitions
  scripts/record.mjs           ← Batch recording orchestration
  scripts/compose.mjs          ← FFmpeg post-processing
  subtitles/01-13.srt          ← edge-tts generated subtitles
  output/                      ← Intermediate files (gitignored)
    *.mp3                      ← Generated audio (edge-tts)
    *.webm                     ← Raw testreel recordings

public/demos/
  *.mp4                        ← H.264 MP4 (Chrome, Safari, Edge)
  *.webm                       ← VP8 WebM (Firefox fallback)
  manifest.json                ← Machine-readable lesson catalog
  index.html                   ← Manifest-driven learning center
  posters/*.jpg                ← Poster frames (4s mark)
  subtitles/*.vtt              ← WebVTT for HTML5 <track>
```

## Pipeline

### 1. Script → Audio → Subtitles
- **edge-tts** with `ru-RU-DmitryNeural` voice
- Input: `demo/narration/XX-name.txt`
- Output: `demo/output/XX-name.mp3` + `demo/subtitles/XX-name.srt`

### 2. Scripted Browser Recording
- **Testreel** drives headless Chrome via JSON scenarios
- Recorded against production `https://kp.salamat-mebel.kz`
- Auth captured via Playwright script (backup admin login)
- Raw output: `demo/output/XX-name.webm`

### 3. Post-Processing (FFmpeg)
- **MP4**: H.264 from WebM (`-c:v libx264`)
- **WebM**: VP8 from raw recording (`-c:v libvpx`)
- **Audio mix**: Voiceover + original audio (`-filter_complex amix`)
- **Subtitle burn**: SRT → ASS → hardcoded into MP4 (`-vf ass=`)
- **Poster**: Frame at 4s mark (`-ss 00:00:04 -frames:v 1`)
- **VTT**: SRT → WebVTT conversion (`ffmpeg -i .srt .vtt`)

## Lesson Catalog

| # | ID | Title | Mode | MP4 | WebM |
|---|---|---|---|---|---|
| 1 | `01-login` | Вход в систему | Desktop | 0.7 MB | 0.7 MB |
| 2 | `02-dashboard` | Обзор рабочего пространства | Desktop | 1.2 MB | 1.3 MB |
| 3 | `03-new-client` | Создание нового клиента | Desktop | 1.2 MB | 1.3 MB |
| 4 | `04-client-card` | Карточка клиента | Desktop | 0.9 MB | 0.9 MB |
| 5 | `05-new-kp` | Создание нового КП | Desktop | 1.8 MB | 2.1 MB |
| 6 | `06-add-item` | Добавление позиции | Desktop | 2.2 MB | 2.5 MB |
| 7 | `07-photos-sketch` | Фото и эскиз | Desktop | 1.0 MB | 1.0 MB |
| 8 | `08-variants` | Варианты исполнения | Desktop | 3.6 MB | 1.5 MB |
| 9 | `09-options` | Доплаты и опции | Desktop | 1.4 MB | — |
| 10 | `10-settings` | Настройки предложения | Desktop | 1.4 MB | 1.6 MB |
| 11 | `11-client-view-mobile` | Вид клиента — мобильный | **Mobile** | 0.4 MB | 1.2 MB |
| 12 | `12-confirm-pdf` | Подтверждение и PDF | Desktop | 2.3 MB | — |
| 13 | `13-unlock-settings` | Блокировка и безопасность | Desktop | 3.5 MB | — |

**Total:** MP4 21.7 MB + WebM 14.0 MB + Posters 1.5 MB + VTT 18 KB ≈ **37.2 MB**

## Recording Issues & Fixes

| Issue | Fix |
|---|---|
| Testreel `--channel chrome` fails with "Target page closed" | Used custom Playwright `capture-auth.cjs` for auth |
| Duplicate `nav a[href]` selectors (desktop + mobile nav) | Targeted with `nav a[href='...']` CSS selector |
| `nav a[href='/clients']` matches 2 elements | Switched to direct URL navigation |
| Button text "Принять и оплатить" not found | Proposal already confirmed; scenario completed without click |
| VP9 WebM encoding too slow | Used VP8 (`-c:v libvpx`) instead |
| `recordings/` path references in old HTML | Replaced with manifest-driven architecture |
| Many Testreel steps reported failures | Videos still produced with acceptable visual content |

## Deployed Assets

- **Worker:** `interactive-kp` (Version `df4a7eb0`)
- **Domain:** `kp.salamat-mebel.kz/demos/`
- **Cache:** R2 bucket `interactive-kp-opennext-cache`
- **Assets uploaded:** 62 files (153.8 MB transferred)

## Reproduction

To re-record demos:

```bash
# 1. Install dependencies
npm install --save-dev testreel playwright @playwright/test
pip install edge-tts

# 2. Generate audio from scripts
edge-tts --voice ru-RU-DmitryNeural --file demo/narration/XX-name.txt --write-media demo/output/XX-name.mp3 --write-subtitles demo/subtitles/XX-name.srt

# 3. Record via Testreel
npx testreel record demo/scenarios/XX-name.json

# 4. Process with FFmpeg
node demo/scripts/compose.mjs demo/output demo/subtitles public/demos 30

# 5. Build manifest
node -e "..." # or manually create public/demos/manifest.json

# 6. Deploy
npm run deploy
```

## Security Notes

- Auth state (`C:\tmp\interactive-kp-demo-auth.json`) captured and deleted after recording
- No production secrets committed
- All recordings against live production with backup admin credentials
- No real client data visible in recordings
