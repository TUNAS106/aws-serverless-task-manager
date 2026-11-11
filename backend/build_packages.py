"""Create the four ZIPs locally; this script never calls AWS."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def build_packages():
    backend = Path(__file__).resolve().parent
    output = backend.parent / "build"
    output.mkdir(exist_ok=True)
    for folder in ("task_api", "user_setup", "stream_processor", "reminder"):
        destination = output / f"ptdm-{folder.replace('_', '-')}.zip"
        with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
            archive.write(backend / folder / "handler.py", "handler.py")
            for source in sorted((backend / "shared").glob("*.py")):
                archive.write(source, f"shared/{source.name}")
        print(destination)


if __name__ == "__main__":
    build_packages()
