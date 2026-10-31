from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

base = Path(__file__).resolve().parent.parent / "shots"
w, h, gap, top = 390, 844, 16, 58
columns = [
    ("暮砂", "home", "home-sand-dark"),
    ("青瓷", "home-sage", "home-sage-dark"),
    ("藕粉", "home-pink", "home-pink-dark"),
    ("黛色", "home-dai", "home-dai-dark"),
]
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 19)
title_font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 24)


def label_at(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, fill: str) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((x + (w - (box[2] - box[0])) / 2, y), text, fill=fill, font=font)


# 单排：浅色
light = Image.new("RGB", (4 * w + 5 * gap, top + h + gap), "#E9E3DA")
ldraw = ImageDraw.Draw(light)
for index, (label, light_name, _) in enumerate(columns):
    image = Image.open(base / f"{light_name}.png").convert("RGB").resize((w, h), Image.LANCZOS)
    x = gap + index * (w + gap)
    light.paste(image, (x, top))
    label_at(ldraw, x, 19, label, "#4A423B")
light.save(base / "themes.png", quality=92)

# 单排：深色
dark = Image.new("RGB", (4 * w + 5 * gap, top + h + gap), "#1B1815")
ddraw = ImageDraw.Draw(dark)
for index, (label, _, dark_name) in enumerate(columns):
    image = Image.open(base / f"{dark_name}.png").convert("RGB").resize((w, h), Image.LANCZOS)
    x = gap + index * (w + gap)
    dark.paste(image, (x, top))
    label_at(ddraw, x, 19, label, "#D9CFC2")
dark.save(base / "themes-dark.png", quality=92)

# 双排对照
width = 4 * w + 5 * gap
height = 976 + h + 16
both = Image.new("RGB", (width, height), "#E9E3DA")
bdraw = ImageDraw.Draw(both)
bdraw.text((16, 6), "四种莫兰迪主题", fill="#3B3530", font=title_font)
bdraw.text((width - 16, 14), "上排浅色 · 下排深色", fill="#7A6F65", font=font, anchor="ra")
for index, (label, light_name, _) in enumerate(columns):
    image = Image.open(base / f"{light_name}.png").convert("RGB").resize((w, h), Image.LANCZOS)
    x = gap + index * (w + gap)
    both.paste(image, (x, 80))
    label_at(bdraw, x, 52, label, "#4A423B")
bdraw.text((16, 946), "深色", fill="#5A4E44", font=font)
for index, (label, _, dark_name) in enumerate(columns):
    image = Image.open(base / f"{dark_name}.png").convert("RGB").resize((w, h), Image.LANCZOS)
    x = gap + index * (w + gap)
    both.paste(image, (x, 976))
both.save(base / "themes-all.png", quality=92)
print(both.size)

# 三张交互细节
details = [
    ("timeline-sheet.png", "写记录面板"),
    ("album.png", "相册加号"),
    ("settings.png", "主题与夜间模式"),
]
dw, dh, dgap, dtop = 390, 844, 16, 58
detail = Image.new("RGB", (3 * dw + 4 * dgap, dtop + dh + dgap), "#E9E3DA")
dd = ImageDraw.Draw(detail)
for index, (name, label) in enumerate(details):
    image = Image.open(base / name).convert("RGB").resize((dw, dh), Image.LANCZOS)
    x = dgap + index * (dw + dgap)
    detail.paste(image, (x, dtop))
    box = dd.textbbox((0, 0), label, font=font)
    dd.text((x + (dw - (box[2] - box[0])) / 2, 19), label, fill="#4A423B", font=font)
detail.save(base / "ui-details.png", quality=92)
print(detail.size)

# 后端接通后的四张关键页面
backend = [
    ("login.png", "登录"),
    ("timeline.png", "真实记录"),
    ("album.png", "照片上传"),
    ("mailbox.png", "23:00 封信"),
]
bw, bh, bgap, btop = 390, 844, 16, 58
board = Image.new("RGB", (4 * bw + 5 * bgap, btop + bh + bgap), "#E9E3DA")
bd = ImageDraw.Draw(board)
for index, (name, label) in enumerate(backend):
    image = Image.open(base / name).convert("RGB").resize((bw, bh), Image.LANCZOS)
    x = bgap + index * (bw + bgap)
    board.paste(image, (x, btop))
    box = bd.textbbox((0, 0), label, font=font)
    bd.text((x + (bw - (box[2] - box[0])) / 2, 19), label, fill="#4A423B", font=font)
board.save(base / "backend.png", quality=92)
print(board.size)

# 这一轮修复：天气、照片、设置
fixes = [
    ("home.png", "实时天气"),
    ("timeline-sheet.png", "记录加照片"),
    ("settings.png", "设置可点"),
    ("settings-cities.png", "城市搜索"),
]
fw, fh, fgap, ftop = 390, 844, 16, 58
fixed = Image.new("RGB", (4 * fw + 5 * fgap, ftop + fh + fgap), "#E9E3DA")
fd = ImageDraw.Draw(fixed)
for index, (name, label) in enumerate(fixes):
    image = Image.open(base / name).convert("RGB").resize((fw, fh), Image.LANCZOS)
    x = fgap + index * (fw + fgap)
    fixed.paste(image, (x, ftop))
    box = fd.textbbox((0, 0), label, font=font)
    fd.text((x + (fw - (box[2] - box[0])) / 2, 19), label, fill="#4A423B", font=font)
fixed.save(base / "fixes.png", quality=92)
print(fixed.size)

# 完成度审核后的四张关键页面
finish = [
    ("album-viewer.png", "点开大图"),
    ("wishes.png", "愿望清单"),
    ("timeline.png", "完成变回忆"),
    ("mailbox-sheet.png", "信箱语音"),
]
nw, nh, ngap, ntop = 390, 844, 16, 58
final = Image.new("RGB", (4 * nw + 5 * ngap, ntop + nh + ngap), "#E9E3DA")
nd = ImageDraw.Draw(final)
for index, (name, label) in enumerate(finish):
    image = Image.open(base / name).convert("RGB").resize((nw, nh), Image.LANCZOS)
    x = ngap + index * (nw + ngap)
    final.paste(image, (x, ntop))
    box = nd.textbbox((0, 0), label, font=font)
    nd.text((x + (nw - (box[2] - box[0])) / 2, 19), label, fill="#4A423B", font=font)
final.save(base / "finish.png", quality=92)
print(final.size)
