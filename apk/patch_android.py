# -*- coding: utf-8 -*-
"""Запускается в облачной сборке после `npx cap add android`:
добавляет разрешение камеры, фиксирует портретный режим, ставит наши значки, заставку и оформление, номер версии."""
import io, os, re, shutil, sys

proj = sys.argv[1]                                    # build-apk/android
here = os.path.dirname(os.path.abspath(__file__))     # apk/
main = os.path.join(proj, 'app', 'src', 'main')
res = os.path.join(main, 'res')
build = os.environ.get('RITM_BUILD', '1')

def read(p): return io.open(p, encoding='utf-8').read()
def write(p, s): io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# 1. Манифест: камера (сканер штрихкодов и съёмка фото) и портретная ориентация
p = os.path.join(main, 'AndroidManifest.xml'); s = read(p)
if 'android.permission.CAMERA' not in s:
    s = s.replace('</manifest>',
        '    <uses-permission android:name="android.permission.CAMERA" />\n'
        '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n'
        '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />\n'
        '</manifest>')
if 'android:screenOrientation' not in s:
    assert 'android:name=".MainActivity"' in s, 'в манифесте не найдена MainActivity'
    s = s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"', 1)
write(p, s)

# 2. Ресурсы: убираем заставку шаблона, кладём свои значки, цвета, стили
removed = 0
for root, dirs, files in os.walk(res):
    for f in files:
        if f == 'splash.png':
            os.remove(os.path.join(root, f)); removed += 1
shutil.copytree(os.path.join(here, 'res'), res, dirs_exist_ok=True)

# 3. Health Connect требует Android 8.0+ (minSdk 26)
vp = os.path.join(proj, 'variables.gradle')
if os.path.exists(vp):
    v = read(vp); v = re.sub(r'minSdkVersion\s*=\s*\d+', 'minSdkVersion = 26', v); write(vp, v)

# 4. Номер версии = номер сборки
p = os.path.join(proj, 'app', 'build.gradle'); g = read(p)
g, n1 = re.subn(r'versionCode\s+\d+', 'versionCode ' + build, g, count=1)
g, n2 = re.subn(r'versionName\s+"[^"]*"', 'versionName "0.1.' + build + '"', g, count=1)
write(p, g)

print('manifest ok | splash.png removed:', removed, '| version patched:', n1, n2)
print('--- AndroidManifest.xml ---'); print(read(os.path.join(main, 'AndroidManifest.xml')))
print('--- res tree ---')
for root, dirs, files in sorted(os.walk(res)):
    print(os.path.relpath(root, res), sorted(files))
