# -*- coding: utf-8 -*-
"""Собирает один самодостаточный файл для публикации на claude.ai: artifact/ritm.html.
Автономная PWA (index.html + css + js) сборки не требует."""
import io, os
ROOT = os.path.dirname(os.path.abspath(__file__))
read = lambda p: io.open(os.path.join(ROOT, p), encoding='utf-8').read()
CSS = ['css/tokens.css', 'css/app.css']
JS = ['js/core.js', 'js/calc.js', 'js/data.js', 'js/ai.js', 'js/screens-main.js', 'js/screens-food.js', 'js/screens-health.js', 'js/sync.js', 'js/main.js']
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
out = os.path.join(ROOT, 'artifact', 'ritm.html')
io.open(out, 'w', encoding='utf-8', newline='\n').write(html)
print('artifact/ritm.html', round(len(html.encode('utf-8')) / 1024), 'KB')
