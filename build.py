# -*- coding: utf-8 -*-
"""Сборка перед выкладкой.
1) Ставит метку версии (хэш содержимого) на ссылки в index.html и на имя кэша в sw.js —
   чтобы браузер и установленное приложение сразу брали новые файлы, а не старые из кэша.
2) Собирает один самодостаточный файл для публикации на claude.ai: artifact/ritm.html."""
import hashlib, io, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
read = lambda p: io.open(os.path.join(ROOT, p), encoding='utf-8').read()
def write(p, s):
    io.open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='\n').write(s)

CSS = ['css/tokens.css', 'css/app.css']
JS = ['js/config.js', 'js/core.js', 'js/calc.js', 'js/data.js', 'js/ai.js', 'js/screens-main.js', 'js/screens-food.js',
      'js/screens-health.js', 'js/sync.js', 'js/main.js']

ver = hashlib.sha1(''.join(read(p) for p in CSS + JS).encode('utf-8')).hexdigest()[:8]

idx = re.sub(r'((?:href|src)="(?:css|js)/[\w\-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', r'\g<1>?v=' + ver + '"', read('index.html'))
write('index.html', idx)
write('sw.js', re.sub(r"const CACHE = 'ritm-shell-[^']*';", "const CACHE = 'ritm-shell-" + ver + "';", read('sw.js')))

js = '\n'.join(read(p) for p in JS)
assert '</script' not in js.lower(), 'в коде не должно быть закрывающего тега script'
html = (
    '<title>Ритм</title>\n'
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">\n'
    '<style>\n' + '\n'.join(read(p) for p in CSS) + '\n</style>\n'
    '<div id="app"></div>\n'
    '<script>\n' + js + '\n</script>\n'
)
os.makedirs(os.path.join(ROOT, 'artifact'), exist_ok=True)
write('artifact/ritm.html', html)
print('version', ver, '| artifact/ritm.html', round(len(html.encode('utf-8')) / 1024), 'KB')   # латиницей: консоль Windows не всегда печатает кириллицу
