# 갈무리 픽셀 폰트를 게임에 쓰인 글자만 남겨 줄인다 (텍스트를 고친 뒤 다시 실행)
# 사용: pip install fonttools brotli && python3 scripts/subset-font.py <galmuri dist 폴더>
import pathlib, subprocess, sys
src = pathlib.Path(sys.argv[1])
chars = set(chr(c) for c in range(0x20, 0x7f))
for f in pathlib.Path('src').rglob('*'):
    if f.suffix in ('.ts', '.css', '.html'):
        chars |= set(f.read_text(encoding='utf8'))
chars |= set(pathlib.Path('index.html').read_text(encoding='utf8'))
text = ''.join(sorted(c for c in chars if ord(c) >= 0x20 and not 0x1F000 <= ord(c) <= 0x1FAFF))
out = pathlib.Path('src/assets/fonts')
for name in ('Galmuri11', 'Galmuri11-Bold'):
    subprocess.run(['pyftsubset', str(src / f'{name}.ttf'), f'--text={text}', '--flavor=woff2',
                    f'--output-file={out / (name + ".woff2")}', '--layout-features=*'], check=True)
    print(name, (out / f'{name}.woff2').stat().st_size)
