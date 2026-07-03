from PyInstaller.utils.hooks import collect_submodules

hiddenimports = collect_submodules("learning_os_generator")

a = Analysis(
    ["src/learning_os_generator/__main__.py"],
    pathex=["src"],
    hiddenimports=hiddenimports,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="learning-os-generator",
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="learning-os-generator",
)
