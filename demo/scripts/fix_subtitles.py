import re
import os
import subprocess
import shutil

FFMPEG = r"C:\tmp\interactive-kp-demo-tools\node_modules\ffmpeg-static\ffmpeg.exe"
SRT_DIR = "demo/subtitles"
MP4_DIR = "public/demos"
CWD = os.getcwd()

FILES = [
    ("01-login", "01-login.srt", "01-login.mp4"),
    ("02-dashboard", "02-dashboard.srt", "02-dashboard.mp4"),
    ("03-new-client", "03-new-client.srt", "03-new-client.mp4"),
    ("04-client-card", "04-client-card.srt", "04-client-card.mp4"),
    ("05-new-kp", "05-new-kp.srt", "05-new-kp.mp4"),
    ("06-add-item", "06-add-item.srt", "06-add-item.mp4"),
    ("07-photos-sketch", "07-photos-sketch.srt", "07-photos-sketch.mp4"),
    ("08-variants", "08-variants.srt", "08-variants.mp4"),
    ("09-options", "09-options.srt", "09-options.mp4"),
    ("10-settings", "10-publish.srt", "10-settings.mp4"),
    ("11-client-view-mobile", "11-client-mobile.srt", "11-client-view-mobile.mp4"),
    ("12-confirm-pdf", "12-confirm-pdf.srt", "12-confirm-pdf.mp4"),
    ("13-unlock-settings", "13-unlock-settings.srt", "13-unlock-settings.mp4"),
]


def count_srt_cues(srt_path):
    with open(srt_path, "rb") as f:
        text = f.read().decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return text.count("-->")


def main():
    for vid, srt_name, mp4_name in FILES:
        srt_src = os.path.join(CWD, SRT_DIR, srt_name)
        mp4_src = os.path.join(CWD, MP4_DIR, mp4_name)
        tmp_mp4 = os.path.join(CWD, MP4_DIR, f"{vid}-sub.mp4")

        # Copy SRT to CWD root (relative path avoids Windows colon issue)
        srt_local = os.path.join(CWD, f"_sub_{vid}.srt")

        if not os.path.exists(srt_src):
            print(f"SKIP: SRT not found: {srt_name}")
            continue
        if not os.path.exists(mp4_src):
            print(f"SKIP: MP4 not found: {mp4_name}")
            continue

        shutil.copy2(srt_src, srt_local)
        n = count_srt_cues(srt_src)
        print(f"Processing: {vid} ({n} cues)...", end=" ", flush=True)

        # Use subtitles filter with relative path (no colon in path)
        srt_filter_path = f"_sub_{vid}.srt"
        vf = f"subtitles={srt_filter_path}"

        cmd = [
            FFMPEG, "-y",
            "-i", mp4_src,
            "-vf", vf,
            "-c:v", "libx264", "-crf", "20", "-preset", "medium",
            "-c:a", "copy",
            tmp_mp4,
        ]

        result = subprocess.run(cmd, capture_output=True, timeout=300)

        if result.returncode == 0 and os.path.exists(tmp_mp4):
            os.remove(mp4_src)
            os.rename(tmp_mp4, mp4_src)
            sz = os.path.getsize(mp4_src) / 1024 / 1024
            print(f"OK ({sz:.1f} MB)")
        else:
            print(f"FAIL")
            err = result.stderr.decode("utf-8", errors="replace")
            for line in err.split("\n"):
                line = line.strip()
                if line and ("Error" in line or "error" in line):
                    print(f"  {line}")
            if os.path.exists(tmp_mp4):
                os.remove(tmp_mp4)

        # Clean up temp SRT
        if os.path.exists(srt_local):
            os.remove(srt_local)

    print("\nDone!")


if __name__ == "__main__":
    main()
