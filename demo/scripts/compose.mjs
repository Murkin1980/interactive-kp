/**
 * Simplified FFmpeg post-processing for demo videos.
 *
 * For each demo:
 * 1. Convert WebM → MP4 (H.264)
 * 2. Mix with audio narration (trim to shorter)
 * 3. Burn SRT subtitles
 * 4. Extract poster frame
 * 5. Copy SRT → VTT
 * 6. Export WebM (VP9)
 *
 * Usage: node demo/scripts/compose.mjs
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const FF = "C:\\tmp\\interactive-kp-demo-tools\\node_modules\\ffmpeg-static\\ffmpeg.exe";
const OUTPUT_DIR = join(ROOT, "demo", "output");
const SUBS_DIR = join(ROOT, "demo", "subtitles");
const PUBLIC_DIR = join(ROOT, "public", "demos");

const LESSONS = [
  { id: "01-login", num: 1, title: "Вход в систему" },
  { id: "02-dashboard", num: 2, title: "Обзор рабочего пространства" },
  { id: "03-new-client", num: 3, title: "Создание нового клиента" },
  { id: "04-client-card", num: 4, title: "Карточка клиента" },
  { id: "05-new-kp", num: 5, title: "Создание нового КП" },
  { id: "06-add-item", num: 6, title: "Добавление позиции" },
  { id: "07-photos-sketch", num: 7, title: "Фото и эскиз" },
  { id: "08-variants", num: 8, title: "Варианты исполнения" },
  { id: "09-options", num: 9, title: "Доплаты и опции" },
  { id: "10-settings", num: 10, title: "Настройки предложения" },
  { id: "11-client-view-mobile", num: 11, title: "Вид клиента — мобильный" },
  { id: "12-confirm-pdf", num: 12, title: "Подтверждение и PDF" },
  { id: "13-unlock-settings", num: 13, title: "Блокировка и безопасность" },
];

function ff(args) {
  const cmd = `"${FF}" ${args}`;
  try {
    return execSync(cmd, { stdio: "pipe", timeout: 300_000 }).toString();
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    if (stderr.includes("Error") || stderr.includes("Invalid")) {
      console.error(`  ❌ ffmpeg error: ${stderr.substring(0, 200)}`);
    }
    // ffmpeg returns non-zero on some warnings, check if output file exists
    return "";
  }
}

function ffprobe(filePath) {
  try {
    const out = execSync(`"${FF}" -i "${filePath}" 2>&1`, { stdio: "pipe", timeout: 10_000 }).toString();
    const dur = out.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    return dur ? parseFloat(dur[1]) * 3600 + parseFloat(dur[2]) * 60 + parseFloat(dur[3]) : 0;
  } catch { return 0; }
}

function convertSrtToVtt(srtPath, vttPath) {
  if (!existsSync(srtPath)) return;
  const srt = readFileSync(srtPath, "utf-8");
  const vtt = "WEBVTT\n\n" + srt.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, "$1:$2:$3.$4");
  writeFileSync(vttPath, vtt);
}

function clean(...paths) {
  for (const p of paths) {
    if (existsSync(p)) {
      try { execSync(`del "${p}"`, { stdio: "pipe" }); } catch {}
    }
  }
}

async function main() {
  console.log("\n🎬 FFmpeg Post-Processing\n");

  mkdirSync(join(PUBLIC_DIR, "posters"), { recursive: true });
  mkdirSync(join(PUBLIC_DIR, "subtitles"), { recursive: true });

  for (const lesson of LESSONS) {
    console.log(`\n━━━ Lesson ${lesson.num}: ${lesson.id} ━━━`);

    const webmIn = join(OUTPUT_DIR, `${lesson.id}.webm`);
    const mp3In = join(OUTPUT_DIR, `${lesson.id}.mp3`);
    const srtIn = join(SUBS_DIR, `${lesson.id}.srt`);

    if (!existsSync(webmIn)) {
      console.log(`  ⏭️  No WebM, skipping`);
      continue;
    }

    const mp4Raw = join(OUTPUT_DIR, `${lesson.id}-raw.mp4`);
    const mp4Audio = join(OUTPUT_DIR, `${lesson.id}-audio.mp4`);
    const mp4Final = join(OUTPUT_DIR, `${lesson.id}-final.mp4`);
    const outMp4 = join(PUBLIC_DIR, `${lesson.id}.mp4`);
    const outWebm = join(PUBLIC_DIR, `${lesson.id}.webm`);
    const outPoster = join(PUBLIC_DIR, "posters", `${lesson.id}.jpg`);
    const outVtt = join(PUBLIC_DIR, "subtitles", `${lesson.id}.vtt`);

    // 1. WebM → MP4
    console.log(`  1/5 WebM → MP4...`);
    ff(`-y -i "${webmIn}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k "${mp4Raw}"`);

    // 2. Mix audio
    if (existsSync(mp3In)) {
      console.log(`  2/5 Mixing audio narration...`);
      ff(`-y -i "${mp4Raw}" -i "${mp3In}" -c:v copy -c:a aac -b:a 128k -shortest "${mp4Audio}"`);
    } else {
      copyFileSync(mp4Raw, mp4Audio);
      console.log(`  2/5 No audio, skipping`);
    }

    // 3. Burn subtitles
    if (existsSync(srtIn)) {
      console.log(`  3/5 Burning subtitles...`);
      const srtEsc = srtIn.replace(/\\/g, "/").replace(/:/g, "\\:");
      ff(`-y -i "${mp4Audio}" -vf "subtitles='${srtEsc}':force_style='FontSize=20,PrimaryColour=&H0014263D,OutlineColour=&H00FFFFFF,Outline=1'" -c:v libx264 -preset medium -crf 23 -c:a copy "${mp4Final}"`);
    } else {
      copyFileSync(mp4Audio, mp4Final);
      console.log(`  3/5 No subtitles, skipping`);
    }

    // 4. Save final MP4
    console.log(`  4/5 Saving MP4 + WebM...`);
    copyFileSync(mp4Final, outMp4);
    ff(`-y -i "${mp4Final}" -c:v libvpx-vp9 -crf 35 -b:v 0 -c:a libopus -b:a 128k "${outWebm}"`);

    // 5. Poster + VTT
    console.log(`  5/5 Poster + VTT...`);
    const dur = ffprobe(outMp4);
    const posterTime = dur > 4 ? "00:00:04" : "00:00:01";
    ff(`-y -ss ${posterTime} -i "${outMp4}" -vframes 1 -q:v 2 "${outPoster}"`);

    if (existsSync(srtIn)) {
      convertSrtToVtt(srtIn, outVtt);
    }

    // Cleanup
    clean(mp4Raw, mp4Audio, mp4Final);

    console.log(`  ✅ Done (${Math.round(dur)}s)`);
  }

  console.log(`\n${"━".repeat(60)}`);
  console.log(`✅ All videos processed!`);
  console.log(`📁 Output: ${PUBLIC_DIR}/\n`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  process.exit(1);
});
