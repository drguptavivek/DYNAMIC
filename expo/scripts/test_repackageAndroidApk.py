import tempfile
import unittest
from pathlib import Path
import zipfile

from repackageAndroidApk import BUNDLE_ENTRY, BUILT_INS_SERVICE, repackage


class RepackageTest(unittest.TestCase):
    def test_preserves_native_metadata_and_rejects_corrupt_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, bundle, output = root / "source.apk", root / "bundle.js", root / "output.apk"
            bundle.write_bytes(b"new bundle")
            entries = {
                BUILT_INS_SERVICE: b"kotlin.reflect.jvm.internal.impl.serialization.deserialization.builtins.BuiltInsLoaderImpl\n",
                "META-INF/expo-image-picker.kotlin_module": b"Kotlin metadata",
                "META-INF/services/example.Service": b"example.Implementation",
                "META-INF/nested/KEEP.SF": b"not a signature",
                "META-INF/MANIFEST.MF": b"old manifest",
                "META-INF/CERT.SF": b"old signature",
                "META-INF/CERT.RSA": b"old certificate",
                "META-INF/CERT.DSA": b"old certificate",
                "META-INF/CERT.EC": b"old certificate",
                "META-INF/SIG-CUSTOM": b"old signature",
                BUNDLE_ENTRY: b"old bundle",
                "lib/arm64-v8a/libnative.so": b"native code",
            }
            with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as archive:
                for name, data in entries.items():
                    archive.writestr(name, data)
            repackage(source, bundle, output)
            with zipfile.ZipFile(output) as archive:
                expected = {name: data for name, data in entries.items() if name not in {
                    "META-INF/MANIFEST.MF", "META-INF/CERT.SF", "META-INF/CERT.RSA",
                    "META-INF/CERT.DSA", "META-INF/CERT.EC", "META-INF/SIG-CUSTOM",
                }}
                expected[BUNDLE_ENTRY] = b"new bundle"
                self.assertEqual({name: archive.read(name) for name in archive.namelist()}, expected)
            previous_output = output.read_bytes()
            with zipfile.ZipFile(source, "w") as archive:
                archive.writestr(BUNDLE_ENTRY, b"old bundle")
            with self.assertRaisesRegex(ValueError, "BuiltInsLoader"):
                repackage(source, bundle, output)
            self.assertEqual(output.read_bytes(), previous_output)
            absent_output = root / "absent.apk"
            with self.assertRaisesRegex(ValueError, "BuiltInsLoader"):
                repackage(source, bundle, absent_output)
            self.assertFalse(absent_output.exists())
            self.assertEqual(list(root.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
