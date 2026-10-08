"""Replace an embedded JS bundle; preserve native metadata for later signing."""

import argparse
import os
from pathlib import Path
import tempfile
import zipfile


BUILT_INS_SERVICE = "META-INF/services/kotlin.reflect.jvm.internal.impl.builtins.BuiltInsLoader"
BUNDLE_ENTRY = "assets/index.android.bundle"


def is_signature(name):
    parts = name.upper().split("/")
    return len(parts) == 2 and parts[0] == "META-INF" and (
        parts[1] == "MANIFEST.MF"
        or parts[1].startswith("SIG-")
        or parts[1].endswith((".SF", ".RSA", ".DSA", ".EC"))
    )


def repackage(source, bundle, output):
    source, bundle, output = map(Path, (source, bundle, output))
    if output.resolve() in (source.resolve(), bundle.resolve()):
        raise ValueError("Output must differ from the source APK and bundle")
    bundle_bytes = bundle.read_bytes()
    temporary_path = None
    try:
        with zipfile.ZipFile(source) as original:
            if BUILT_INS_SERVICE not in original.namelist() or not original.read(BUILT_INS_SERVICE).strip():
                raise ValueError("Source APK is missing Kotlin BuiltInsLoader service metadata; use an intact native APK")
            if BUNDLE_ENTRY not in original.namelist():
                raise ValueError("Source APK is missing its embedded JS bundle")
            with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".apk.tmp", delete=False) as temporary:
                temporary_path = Path(temporary.name)
            with zipfile.ZipFile(temporary_path, "w") as repacked:
                repacked.comment = original.comment
                for entry in original.infolist():
                    if not is_signature(entry.filename):
                        data = bundle_bytes if entry.filename == BUNDLE_ENTRY else original.read(entry)
                        repacked.writestr(entry, data)
        os.replace(temporary_path, output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_apk", type=Path)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("output_apk", type=Path)
    args = parser.parse_args()
    try:
        repackage(args.source_apk, args.bundle, args.output_apk)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f"APK repackaging failed: {error}\n")
    print(f"Wrote unsigned APK: {args.output_apk}; align and sign before installation")


if __name__ == "__main__":
    main()
