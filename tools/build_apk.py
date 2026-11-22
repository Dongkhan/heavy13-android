from pathlib import Path
import subprocess
import zipfile
import shutil
import hashlib
import json
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / "android"
MAIN = ANDROID / "app/src/main"
OUT = ROOT / "build-manual"
OUT.mkdir(exist_ok=True)
SDK = Path("D:/tools/android-sdk")
BT = SDK / "build-tools/34.0.0"
JDK = Path("C:/Program Files/Microsoft/jdk-17.0.20.8-hotspot/bin")
JAR = SDK / "platforms/android-34/android.jar"
KEY = Path("C:/Users/user/.android/debug.keystore")
APK = ROOT / "heavy13-0.1.apk"
LOG = []
PACKAGE = "kr.dongkhan.heavy13"


def run(args):
    args = [str(x) for x in args]
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    LOG.append({"tool": Path(args[0]).name, "exit_code": result.returncode, "output": result.stdout + result.stderr})
    print(Path(args[0]).name, result.returncode, result.stdout, result.stderr, flush=True)
    result.check_returncode()
    return result.stdout + result.stderr


for p in [BT / "aapt2.exe", BT / "lib/d8.jar", BT / "lib/apksigner.jar", JDK / "javac.exe", JAR, KEY]:
    if not p.is_file():
        raise FileNotFoundError(p)

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
classes = OUT / "classes"
classes.mkdir()
dex = OUT / "dex"
dex.mkdir()
www = MAIN / "assets/www"
if www.exists():
    shutil.rmtree(www)
shutil.copytree(ROOT / "play", www)

run([BT / "aapt2.exe", "compile", "--dir", MAIN / "res", "-o", OUT / "resources.zip"])
manifest = OUT / "AndroidManifest.xml"
manifest.write_text(
    (MAIN / "AndroidManifest.xml")
    .read_text(encoding="utf-8")
    .replace("<manifest xmlns:android=", f'<manifest package="{PACKAGE}" xmlns:android=', 1),
    encoding="utf-8",
)
run(
    [
        BT / "aapt2.exe",
        "link",
        "-o",
        OUT / "resources.apk",
        "-I",
        JAR,
        "--manifest",
        manifest,
        "--min-sdk-version",
        "24",
        "--target-sdk-version",
        "34",
        "--version-code",
        "1",
        "--version-name",
        "0.1",
        "--debug-mode",
        "--auto-add-overlay",
        "-R",
        OUT / "resources.zip",
    ]
)
run(
    [
        JDK / "javac.exe",
        "-source",
        "8",
        "-target",
        "8",
        "-bootclasspath",
        JAR,
        "-d",
        classes,
        MAIN / "java/kr/dongkhan/heavy13/MainActivity.java",
    ]
)
run(
    [
        JDK / "java.exe",
        "-cp",
        BT / "lib/d8.jar",
        "com.android.tools.r8.D8",
        "--lib",
        JAR,
        "--min-api",
        "24",
        "--output",
        dex,
        *sorted(classes.rglob("*.class")),
    ]
)
with zipfile.ZipFile(OUT / "resources.apk") as source, zipfile.ZipFile(OUT / "unsigned.apk", "w") as target:
    for item in source.infolist():
        target.writestr(item, source.read(item.filename))
    for p in sorted(dex.glob("*.dex")):
        target.write(p, p.name, compress_type=zipfile.ZIP_STORED)
    for p in sorted((ROOT / "play").rglob("*")):
        if p.is_file():
            target.write(p, "assets/www/" + p.relative_to(ROOT / "play").as_posix(), compress_type=zipfile.ZIP_DEFLATED)

run([BT / "zipalign.exe", "-p", "-f", "4", OUT / "unsigned.apk", OUT / "aligned.apk"])
run(
    [
        JDK / "java.exe",
        "-jar",
        BT / "lib/apksigner.jar",
        "sign",
        "--ks",
        KEY,
        "--ks-pass",
        "pass:android",
        "--out",
        APK,
        OUT / "aligned.apk",
    ]
)
verification = run([JDK / "java.exe", "-jar", BT / "lib/apksigner.jar", "verify", "--verbose", "--print-certs", APK])
badging = run([BT / "aapt.exe", "dump", "badging", APK])
assert f"name='{PACKAGE}'" in badging
assert "versionCode='1'" in badging and "versionName='0.1'" in badging
assets = []
with zipfile.ZipFile(APK) as package:
    assert package.testzip() is None
    for p in sorted((ROOT / "play").rglob("*")):
        if p.is_file():
            rel = p.relative_to(ROOT / "play").as_posix()
            assert package.read("assets/www/" + rel) == p.read_bytes(), rel
            assets.append(rel)

report = {
    "built_at": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
    "method": "Android SDK aapt2 + javac + D8 + zipalign + apksigner",
    "apk": str(APK),
    "bytes": APK.stat().st_size,
    "sha256": hashlib.sha256(APK.read_bytes()).hexdigest(),
    "application_id": PACKAGE,
    "version_code": 1,
    "version_name": "0.1",
    "packaged_assets_match_source": assets,
    "device_runtime_test": "not performed: no connected device or AVD required for this build",
    "steps": LOG,
}
(ROOT / "qa/apk-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in report.items() if k != "steps"}, ensure_ascii=False, indent=2))
