#!/usr/bin/env python3
"""TOKYO: RIO 2077 — Ep.1 abertura (cold open + vinheta + início da cena 2).

Gera vídeo 1920x1080 a partir dos assets do repositório:
Ken Burns, letterbox cinematográfico, chuva, grão, glitch, HUD, legendas
com retrato do personagem e trilha sintetizada (synthwave + batida de funk).

Uso: python3 tools/render_abertura.py [saida.mp4] [--preview SEG]
"""
import math, os, random, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vozes
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, 'assets', *p)
FONT = lambda n: os.path.join(ROOT, 'tools', 'fonts', n)
W, H, FPS = 1920, 1080, 24
BAR = 131  # letterbox 2.35:1
random.seed(7); np.random.seed(7)

def font(name, size):
    f = ImageFont.truetype(FONT(name), size)
    if name.startswith('Orbitron'):
        try: f.set_variation_by_axes([800])
        except Exception: pass
    return f

F_SUB = font('Rajdhani-SemiBold.ttf', 46)
F_NAME = font('Rajdhani-Bold.ttf', 30)
F_HUD = font('ShareTechMono.ttf', 30)
F_HUD_S = font('ShareTechMono.ttf', 22)
F_HUD_L = font('ShareTechMono.ttf', 54)
F_LOGO = font('Orbitron.ttf', 150)
F_LOGO_S = font('Orbitron.ttf', 64)
F_TITLE = font('Rajdhani-Bold.ttf', 64)
F_LOC = font('Rajdhani-Bold.ttf', 40)

COR = {'TOKYO': (186, 85, 255), 'LUNA': (46, 230, 214), 'NERO': (255, 59, 92),
       'ZÉ': (159, 179, 200), 'ZÉ BYTE': (159, 179, 200), 'HEITOR': (232, 194, 106), 'ÉDEN': (79, 195, 255),
       'DONA': (255, 170, 90), 'AKIRA': (235, 235, 245)}

# ---------------------------------------------------------------- assets
_cache = {}
def bg(name, scale=1.25):
    """Cenário ampliado (LANCZOS + nitidez) para permitir movimento de câmera."""
    key = (name, scale)
    if key not in _cache:
        im = Image.open(A('cenarios', name)).convert('RGB')
        tw = int(W * scale); th = int(tw * im.height / im.width)
        if th < H * scale: th = int(H * scale); tw = int(th * im.width / im.height)
        im = im.resize((tw, th), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 80, 2))
        _cache[key] = im
    return _cache[key]

def portrait(name):
    if name not in _cache:
        im = Image.open(A('retratos', name)).convert('RGB')
        _cache[name] = im.resize((250, int(250 * im.height / im.width)), Image.LANCZOS).filter(
            ImageFilter.UnsharpMask(1.5, 60, 2))
    return _cache[name]

def ease(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)

def kenburns(img, t, z0, z1, c0, c1):
    """Recorte com zoom z (1=mostra a largura W*scale/zoom) e centro relativo c."""
    k = ease(t)
    z = z0 + (z1 - z0) * k
    cx = c0[0] + (c1[0] - c0[0]) * k; cy = c0[1] + (c1[1] - c0[1]) * k
    cw = img.width / z; ch = cw * H / W
    if ch > img.height: ch = img.height; cw = ch * W / H
    x = min(max(cx * img.width - cw / 2, 0), img.width - cw)
    y = min(max(cy * img.height - ch / 2, 0), img.height - ch)
    return img.transform((W, H), Image.EXTENT, (x, y, x + cw, y + ch), Image.BICUBIC)

# ---------------------------------------------------------------- efeitos
_vig = None
def vignette():
    global _vig
    if _vig is None:
        y, x = np.ogrid[:H, :W]
        d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
        _vig = np.clip(1.15 - 0.45 * d ** 2, 0.35, 1)[..., None].astype(np.float32)
    return _vig

GRAIN = [np.random.normal(0, 4, (H // 2, W // 2, 1)).astype(np.float32) for _ in range(6)]

def finish(im, fi, flicker=0.0):
    a = np.asarray(im, dtype=np.float32)
    a *= vignette()
    if flicker: a *= 1 + flicker * (math.sin(fi * 1.7) * 0.5 + random.random() * 0.5 - 0.25)
    g = GRAIN[fi % len(GRAIN)].repeat(2, 0).repeat(2, 1)
    a += g
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def grade(im, sat=1.0, bright=1.0, tint=None):
    if sat != 1: im = ImageEnhance.Color(im).enhance(sat)
    if bright != 1: im = ImageEnhance.Brightness(im).enhance(bright)
    if tint: im = Image.blend(im, Image.new('RGB', im.size, tuple(tint[:3])), tint[3] if len(tint) > 3 else 0.12)
    return im

_rain = None
def rain_layers():
    global _rain
    if _rain is None:
        _rain = []
        for depth, n, ln, alpha in ((0, 900, 28, 70), (1, 450, 46, 110)):
            L = Image.new('L', (W, H * 2))
            d = ImageDraw.Draw(L)
            for _ in range(n):
                x = random.randint(0, W); y = random.randint(0, H * 2)
                d.line((x, y, x - ln * 0.18, y + ln), fill=alpha, width=1 + depth)
            _rain.append(L.filter(ImageFilter.GaussianBlur(0.6)))
    return _rain

def rain(im, fi, strength=1.0):
    out = im
    for i, L in enumerate(rain_layers()):
        speed = (55, 95)[i]
        off = (fi * speed) % H
        crop = L.crop((0, H - off, W, 2 * H - off))
        if strength != 1: crop = crop.point(lambda v: int(v * strength))
        out = Image.composite(Image.new('RGB', (W, H), (200, 210, 255)), out, crop)
    return out

def glitch(im, amount, fi):
    if amount <= 0: return im
    a = np.asarray(im).copy()
    r = int(14 * amount)
    a[..., 0] = np.roll(a[..., 0], r, 1); a[..., 2] = np.roll(a[..., 2], -r, 1)
    rnd = random.Random(fi)
    for _ in range(int(10 * amount)):
        y = rnd.randint(0, H - 40); h = rnd.randint(4, 40)
        a[y:y + h] = np.roll(a[y:y + h], rnd.randint(-120, 120), 1)
    return Image.fromarray(a)

def light_sweep(im, t, color=(80, 160, 255)):
    """Feixe do drone atravessando a cena (t de 0 a 1)."""
    L = Image.new('L', (W // 4, H // 4))
    d = ImageDraw.Draw(L)
    cx = (-0.2 + 1.4 * t) * W / 4
    d.polygon([(cx - 20, 0), (cx + 20, 0), (cx + 90, H / 4), (cx - 90, H / 4)], fill=150)
    L = L.filter(ImageFilter.GaussianBlur(14)).resize((W, H), Image.BILINEAR)
    return Image.composite(Image.new('RGB', (W, H), color), im, L).point(lambda v: v) if True else im

def letterbox(im):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, BAR), fill=(0, 0, 0)); d.rectangle((0, H - BAR, W, H), fill=(0, 0, 0))
    while PENDING: _subtitle(im, *PENDING.pop(0))
    return im

# ---------------------------------------------------------------- texto / UI
def text_glow(im, xy, txt, f, color, glow=10, anchor='la', alpha=1.0):
    if not txt or alpha <= 0: return
    bb = ImageDraw.Draw(im).textbbox(xy, txt, font=f, anchor=anchor)
    pad = glow * 3 + 4
    x0, y0 = int(bb[0]) - pad, int(bb[1]) - pad
    layer = Image.new('RGBA', (int(bb[2] - bb[0]) + 2 * pad, int(bb[3] - bb[1]) + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((xy[0] - x0, xy[1] - y0), txt, font=f, fill=color + (int(255 * alpha),), anchor=anchor)
    if glow:
        g = layer.filter(ImageFilter.GaussianBlur(glow))
        im.paste(g, (x0, y0), g); im.paste(g, (x0, y0), g)
    im.paste(layer, (x0, y0), layer)

def wrap(txt, f, maxw):
    words, lines, cur = txt.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if f.getlength(t) > maxw and cur: lines.append(cur); cur = w_
        else: cur = t
    lines.append(cur); return lines

PENDING = []
def subtitle(im, who, txt, k=1.0, pic=None):
    PENDING.append((who, txt, k, pic))

def _subtitle(im, who, txt, k=1.0, pic=None):
    """Legenda na barra inferior + retrato neon no canto."""
    d = ImageDraw.Draw(im, 'RGBA')
    col = COR.get(who.split(' ')[0], (255, 255, 255))
    a = ease(min(1, k * 4))
    lines = wrap(txt, F_SUB, 1600)[:2]
    two = len(lines) > 1
    ny = H - BAR + (24 if two else 38)
    d.text((W / 2, ny), who, font=F_NAME, fill=col + (int(255 * a),), anchor='ms')
    for i, ln in enumerate(lines):
        y = ny + 40 + i * 44
        d.text((W / 2 + 2, y + 2), ln, font=F_SUB, fill=(0, 0, 0, int(220 * a)), anchor='ms')
        d.text((W / 2, y), ln, font=F_SUB, fill=(255, 255, 255, int(255 * a)), anchor='ms')
    if pic:
        p = portrait(pic)
        x = 70; y = H - BAR - p.height - 40 - int((1 - a) * 30)
        frame = Image.new('RGBA', (p.width + 12, p.height + 12), col + (0,))
        fd = ImageDraw.Draw(frame)
        fd.rectangle((0, 0, frame.width - 1, frame.height - 1), outline=col + (int(255 * a),), width=3)
        glowf = frame.filter(ImageFilter.GaussianBlur(8))
        im.paste(glowf, (x - 6, y - 6), glowf)
        pm = Image.new('L', p.size, int(255 * a))
        im.paste(p, (x, y), pm)
        im.paste(frame, (x - 6, y - 6), frame)
        d = ImageDraw.Draw(im, 'RGBA')
        d.rectangle((x - 6, y + p.height + 6, x + p.width + 6, y + p.height + 40), fill=col + (int(230 * a),))
        d.text((x + 10, y + p.height + 23), who.split(' ')[0], font=F_NAME, fill=(10, 10, 20, int(255 * a)), anchor='lm')

def typed(txt, k):
    n = int(len(txt) * max(0, min(1, k)))
    return txt[:n]

def location_tag(im, l1, l2, k):
    if k <= 0: return
    a = 1 if k < 0.85 else max(0, (1 - k) / 0.15)
    d = ImageDraw.Draw(im, 'RGBA')
    x, y = 80, BAR + 50
    d.rectangle((x, y, x + 6, y + 92), fill=(186, 85, 255, int(255 * a)))
    text_glow(im, (x + 24, y), typed(l1, k * 3), F_LOC, (255, 255, 255), glow=6, alpha=a)
    text_glow(im, (x + 24, y + 50), typed(l2, k * 3 - 0.5), F_HUD_S, (79, 195, 255), glow=4, alpha=a)

def hud_box(im, x, y, w, h, color=(79, 195, 255), alpha=1.0, fill=150):
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle((x, y, x + w, y + h), fill=(5, 15, 30, int(fill * alpha)), outline=color + (int(255 * alpha),), width=2)
    c = 22
    for (px, py, sx, sy) in ((x, y, 1, 1), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)):
        d.line((px, py, px + sx * c, py), fill=color + (int(255 * alpha),), width=5)
        d.line((px, py, px, py + sy * c), fill=color + (int(255 * alpha),), width=5)

# ---------------------------------------------------------------- planos
SHOTS = []
VOX = []  # (tempo_global, wav, duração)
def now(): return sum(d for d, _ in SHOTS)
def lay(lines, t0, gap=0.4):
    """Encadeia falas pela duração real da voz. lines: (quem, texto, retrato)."""
    out, t = [], t0
    base = now()
    for who, txt, pic, *tts in lines:
        path, d = vozes.fala(who, tts[0] if tts else txt)
        out.append((t, t + d + 0.15, who, txt, pic))
        VOX.append((base + t, path, d))
        t += d + gap
    return out, t - gap
def shot(dur):
    def deco(fn): SHOTS.append((dur, fn)); return fn
    return deco

COLD, _e = lay([
    ('LUNA', 'Só confirmar a transferência, doutor Heitor. A Lista Âmbar não espera.', 'luna_sorriso.jpg'),
    ('HEITOR VALADARES', 'Um milhão pra entrar numa praia.', None),
    ('LUNA', 'Um milhão pra entrar *nesta* praia.', 'luna_confiante.jpg'),
], 3.0, 0.45)
SCAN = _e + 0.4
BEACH_D = SCAN + 4.9
def subs_at(lst, t, im):
    for i, (s, e, who, txt, pic) in enumerate(lst):
        if s <= t < e:
            j = i  # mesma pessoa falando em sequência: não refaz o fade do retrato
            while j > 0 and lst[j - 1][2] == who and s - lst[j - 1][1] < 1.0: j -= 1
            subtitle(im, who, txt.replace('*', ''), (t - lst[j][0]), pic)

@shot(BEACH_D)
def s_beach(t, fi):
    im = kenburns(bg('11_ordecon_beach_club.jpg', 1.4), t / BEACH_D, 1.05, 1.55, (0.45, 0.5), (0.26, 0.42))
    im = grade(im, 1.1, 0.92)
    if t < 2.5: im = Image.blend(Image.new('RGB', (W, H)), im, ease(t / 2.5))
    location_tag(im, 'ORDECON BEACH CLUB', 'DISTRITO IMPERIAL // PORTÃO VIP // 23:47', (t - 0.6) / 5)
    subs_at(COLD, t, im)
    if SCAN <= t < BEACH_D:
        k = (t - SCAN)
        x, y, w, h = W - 640, BAR + 120, 560, 300
        hud_box(im, x, y, w, h, alpha=ease(k * 3))
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x + 30, y + 30), 'LEITOR BIOMÉTRICO // LISTA ÂMBAR', font=F_HUD_S, fill=(79, 195, 255))
        if k < 2.4:
            # varredura da digital
            yy = y + 90 + int((k * 1.3 % 1) * 160)
            d.ellipse((x + 40, y + 80, x + 200, y + 260), outline=(79, 195, 255, 200), width=2)
            for r in range(10, 80, 12):
                d.arc((x + 120 - r, y + 170 - r, x + 120 + r, y + 170 + r), 200, 340, fill=(79, 195, 255, 160), width=2)
            d.line((x + 30, yy, x + 210, yy), fill=(255, 255, 255, 230), width=3)
            d.text((x + 240, y + 120), 'LENDO DIGITAL' + '.' * (int(k * 4) % 4), font=F_HUD, fill=(255, 255, 255))
            d.rectangle((x + 240, y + 175, x + 240 + int(280 * min(1, k / 2.2)), y + 190), fill=(79, 195, 255))
        else:
            green = (80, 255, 160)
            d.text((x + 30, y + 95), 'TRANSFERÊNCIA AUTORIZADA', font=F_HUD, fill=green)
            text_glow(im, (x + 30, y + 150), 'CR$ 1.000.000', F_HUD_L, green, glow=12)
            ImageDraw.Draw(im).text((x + 30, y + 240), 'DESTINO: LISTA ÂMBAR // HLX-ÂMB-0071', font=F_HUD_S, fill=(140, 200, 220))
    return finish(letterbox(im), fi, 0.02)

FREEZE, _e = lay([('TOKYO (V.O.)', 'No Rio de 2077, tudo tem preço. Saúde, transporte, ar-condicionado, nome limpo.', 'tokyo_neutro.jpg')], 0.7)
FREEZE_D = _e + 0.9
_frozen = {}
@shot(FREEZE_D)
def s_freeze(t, fi):
    if 'f' not in _frozen:
        base = kenburns(bg('11_ordecon_beach_club.jpg', 1.4), 1, 1.05, 1.55, (0.45, 0.5), (0.26, 0.42))
        _frozen['f'] = base
    base = _frozen['f']
    z = 1 + 0.06 * ease(min(1, t / 0.25)) + 0.01 * t
    cw, ch = W / z, H / z
    im = base.transform((W, H), Image.EXTENT, ((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2), Image.BICUBIC)
    im = grade(im, 0.15, 0.85, (60, 20, 90, 0.18))
    im = glitch(im, max(0, 1 - t * 2.5), fi)
    if t < 0.12: im = Image.blend(im, Image.new('RGB', (W, H), (255, 255, 255)), 0.7)
    subs_at(FREEZE, t, im)
    return finish(letterbox(im), fi)

VO2, _e = lay([('TOKYO (V.O.)', 'Até a verdade.', 'tokyo_neutro.jpg'),
       ('TOKYO (V.O.)', 'Mas essa ninguém vende. Essa tu tem que roubar.', 'tokyo_neutro.jpg')], 0.7, 0.6)
T3 = _e + 0.5
MORRO_D = T3 + 3.2
@shot(MORRO_D)
def s_morro(t, fi):
    im = kenburns(bg('15_favela_vertical_cristo.jpg', 1.5), t / MORRO_D, 1.25, 1.05, (0.5, 0.78), (0.55, 0.35))
    im = grade(im, 1.05, 0.95)
    im = rain(im, fi, 0.8)
    if t < 0.8: im = Image.blend(Image.new('RGB', (W, H), (255, 255, 255)), im, ease(t / 0.8))
    subs_at(VO2, t, im)
    if t > T3:
        a = ease((t - T3) / 0.6) * (1 - ease((t - T3 - 2.5) / 0.7))
        ov = Image.new('RGB', (W, H)); im = Image.blend(im, ov, 0.55 * a)
        text_glow(im, (W / 2, H / 2), typed('TRÊS DIAS ANTES.', (t - T3) * 1.6), F_TITLE, (255, 255, 255), glow=12, anchor='mm', alpha=a)
    return finish(letterbox(im), fi, 0.03)

@shot(8.0)
def s_logo(t, fi):
    im = kenburns(bg('01_favela_vertical_panorama.jpg', 1.3), t / 8, 1.0, 1.12, (0.5, 0.5), (0.6, 0.45))
    im = grade(im, 0.9, 0.45, (40, 0, 70, 0.25))
    im = rain(im, fi, 0.6)
    k = ease(t / 0.6)
    gl = 1.0 if t < 0.5 else (0.6 if 3.0 < t < 3.15 or 6.0 < t < 6.1 else 0)
    layer = Image.new('RGB', (W, H))
    text_glow(layer, (W / 2, H / 2 - 40), 'TOKYO', F_LOGO, (255, 255, 255), glow=22, anchor='mm', alpha=k)
    text_glow(layer, (W / 2, H / 2 + 90), 'R I O   2 0 7 7', F_LOGO_S, (186, 85, 255), glow=18, anchor='mm', alpha=k)
    d = ImageDraw.Draw(layer)
    w_ = int(560 * ease((t - 0.5) / 1.2))
    d.line((W / 2 - w_, H / 2 + 30, W / 2 + w_, H / 2 + 30), fill=(255, 59, 92), width=4)
    if t > 1.2:
        text_glow(layer, (W / 2, H / 2 + 175), typed('"EM UMA CIDADE ONDE TUDO TEM PREÇO, ATÉ A VERDADE PRECISA SER ROUBADA."', (t - 1.2) / 2.5),
                  F_HUD_S, (79, 195, 255), glow=4, anchor='mm')
    layer = glitch(layer, gl, fi)
    im = ImageChops.add(im, layer)
    if t > 7.3: im = Image.blend(im, Image.new('RGB', (W, H)), ease((t - 7.3) / 0.7))
    return finish(letterbox(im), fi)

MONTAGE = [
    ('08_distrito_imperial.jpg', 'DISTRITO IMPERIAL', 'ONDE O DINHEIRO MORA', (0.3, 0.4), (0.4, 0.45)),
    ('05_centro_industrial.jpg', 'CENTRO CINZA', 'ONDE O DINHEIRO É FEITO', (0.5, 0.6), (0.5, 0.45)),
    ('07_fabrica_ordecon.jpg', 'FÁBRICA 04 // ORDECON', 'PRODUÇÃO 100% // HUMANOS 0%', (0.4, 0.5), (0.6, 0.5)),
    ('06_estacao_maglev.jpg', 'ESTAÇÃO MAGLEV', 'IDENTIFICAÇÃO FACIAL OBRIGATÓRIA', (0.3, 0.5), (0.6, 0.5)),
    ('03_mercado_negro_implantes.jpg', 'MERCADO NEGRO', 'IMPLANTES // PEÇAS // DESMANCHE', (0.5, 0.6), (0.5, 0.45)),
    ('13_tunel_metro_abandonado.jpg', 'METRÔ RJ — LINHA MORTA', 'FORA ORDECON', (0.5, 0.5), (0.5, 0.5)),
    ('14_zona_norte_abandonada.jpg', 'ZONA NORTE', 'REGIÃO ECONOMICAMENTE INVIÁVEL', (0.4, 0.5), (0.6, 0.5)),
    ('16_beco_nova_esperanca.jpg', 'NOVA ESPERANÇA', 'ONDE A GENTE MORA', (0.5, 0.6), (0.5, 0.4)),
]
MD = 2.0
def make_montage(i, entry):
    name, l1, l2, c0, c1 = entry
    @shot(MD)
    def s(t, fi):
        im = kenburns(bg(name, 1.35), t / MD, 1.08, 1.22, c0, c1)
        im = grade(im, 1.15, 1.0)
        if name.startswith(('16', '13', '03')): im = rain(im, fi, 0.5)
        im = glitch(im, max(0, 0.8 - t * 5), fi + i)
        d = ImageDraw.Draw(im, 'RGBA')
        x, y = 80, H - BAR - 150
        d.rectangle((x, y, x + 6, y + 90), fill=(255, 59, 92))
        text_glow(im, (x + 24, y), typed(l1, t * 2.2), F_LOC, (255, 255, 255), glow=6)
        text_glow(im, (x + 24, y + 52), typed(l2, t * 2.2 - 0.3), F_HUD_S, (79, 195, 255), glow=4)
        return finish(letterbox(im), fi, 0.03)
for i, e in enumerate(MONTAGE): make_montage(i, e)

CARDS = [
    ('TOKYO', '19 // GOLPISTA', '"Eu já sou ninguém."', 'tokyo_neutro.jpg', '12_laje_favela_noite.jpg'),
    ('LUNA', '20 // MENSAGEIRA', '"Tu nasceu aqui. Igual a mim."', 'luna_sorriso.jpg', '16_beco_nova_esperanca.jpg'),
    ('NERO', '21 // HACKER', '"Noventa segundos. Não noventa e um."', 'nero_sorriso.jpg', '04_oficina_interior.jpg'),
    ('ZÉ BYTE', '48 // MECÂNICO', '"Gente que mexe com a Ordecon é apagada."', 'ze_olho_ativo.jpg', '02_favela_rua_comercio.jpg'),
]
CD = 2.6
def make_card(i, entry):
    nome, sub, fala, pic, back = entry
    col = COR[nome]
    (_, _, _, _, _), = lay([(nome, fala, pic)], 0.6)[0]
    fd = VOX[-1][2]
    CD = max(2.6, 0.6 + fd + 0.7)
    @shot(CD)
    def s(t, fi):
        im = kenburns(bg(back, 1.3), t / CD, 1.15, 1.05, (0.5, 0.5), (0.45 + 0.1 * (i % 2), 0.5))
        im = grade(im, 0.6, 0.4, col + (0.18,))
        im = im.filter(ImageFilter.GaussianBlur(3))
        p = Image.open(A('retratos', pic)).convert('RGB')
        ph = 520; p = p.resize((int(ph * p.width / p.height), ph), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 70, 2))
        k = ease(t / 0.45)
        x = int(260 - (1 - k) * 200); y = (H - ph) // 2
        fr = Image.new('RGBA', (p.width + 20, ph + 20), (0, 0, 0, 0))
        ImageDraw.Draw(fr).rectangle((0, 0, fr.width - 1, fr.height - 1), outline=col + (255,), width=4)
        g = fr.filter(ImageFilter.GaussianBlur(12)); im.paste(g, (x - 10, y - 10), g); im.paste(g, (x - 10, y - 10), g)
        im.paste(p, (x, y), Image.new('L', p.size, int(255 * k)))
        im.paste(fr, (x - 10, y - 10), fr)
        tx = x + p.width + 90
        text_glow(im, (tx, H / 2 - 110), nome, F_LOGO_S if len(nome) < 6 else F_LOGO_S, col, glow=18, alpha=k)
        text_glow(im, (tx + 4, H / 2 - 10), typed(sub, (t - 0.3) * 2), F_HUD, (255, 255, 255), glow=4)
        text_glow(im, (tx + 4, H / 2 + 60), typed(fala, (t - 0.6) / fd), F_SUB, (220, 220, 235), glow=0)
        im = glitch(im, max(0, 0.7 - t * 4), fi)
        return finish(letterbox(im), fi)
for i, e in enumerate(CARDS): make_card(i, e)

@shot(3.4)
def s_ep(t, fi):
    im = Image.new('RGB', (W, H))
    a = ease(t / 0.5) * (1 - ease((t - 2.8) / 0.6))
    text_glow(im, (W / 2, H / 2 - 40), 'EPISÓDIO 1', F_HUD, (186, 85, 255), glow=8, anchor='mm', alpha=a)
    text_glow(im, (W / 2, H / 2 + 30), 'O GOLPE DE UM MILHÃO', F_TITLE, (255, 255, 255), glow=10, anchor='mm', alpha=a)
    return finish(im, fi)

LAJE, _e = lay([
    ('TOKYO', '"Acorda às quatro, toma banho gelado, e o universo te paga."', 'tokyo_neutro.jpg'),
    ('TOKYO', 'Tá certo, Heitor. O universo vai te cobrar.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Pastel de carne. A Dona Cida mandou dizer que tu tá devendo três.', 'luna_neutra.jpg'),
    ('TOKYO', 'Quatro. Mas ela não conta o de queijo porque tem pena de mim.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Esse aí? O cara do "mentalidade vencedora"? Coé, Tokyo, a empresa dele É segurança.', 'luna_neutra.jpg'),
    ('TOKYO', 'Por isso mesmo. Ele passou a vida vendendo medo pros outros.', 'tokyo_neutro.jpg'),
    ('TOKYO', 'Nunca parou pra pensar do que ele tem medo.', 'tokyo_neutro.jpg'),
    ('LUNA', 'E do que ele tem medo?', 'luna_neutra.jpg'),
    ('TOKYO', 'De ficar do lado de fora.', 'tokyo_neutro.jpg'),
], 1.5, 0.45)
LD = _e + 1.2
TAB_END = LAJE[1][1] + 0.4
FOTO_T = LAJE[-1][0] - 0.2
@shot(LD)
def s_laje(t, fi):
    im = kenburns(bg('12_laje_favela_noite.jpg', 1.45), t / LD, 1.3, 1.08, (0.3, 0.62), (0.55, 0.45))
    im = grade(im, 1.05, 0.95)
    im = rain(im, fi, 1.0)
    if t < 1.0: im = Image.blend(Image.new('RGB', (W, H)), im, ease(t))
    location_tag(im, 'NOVA ESPERANÇA', 'LAJE DA TOKYO // 3 DIAS ANTES // 01:12', (t - 0.3) / 5)
    # tela do tablet com o feed do alvo
    if 1.2 < t < TAB_END:
        k = ease((t - 1.2) / 0.5) * (1 - ease((t - TAB_END + 0.6) / 0.6))
        x, y, w, h = W - 700, BAR + 70, 620, 380
        hud_box(im, x, y, w, h, (186, 85, 255), k, 190)
        d = ImageDraw.Draw(im, 'RGBA')
        a = int(255 * k)
        d.text((x + 30, y + 26), '@heitor.valadares', font=F_HUD, fill=(232, 194, 106, a))
        d.text((x + 30, y + 70), '4,2M seguidores // CEO Valadares Segurança', font=F_HUD_S, fill=(200, 200, 220, a))
        posts = ['04:00 // banho gelado. mentalidade vencedora.', 'iate // "quem tem medo não enriquece"',
                 'podcast // "segurança é um estado mental"']
        for i, p_ in enumerate(posts):
            yy = y + 120 + i * 70
            d.rectangle((x + 30, yy, x + w - 30, yy + 56), fill=(40, 20, 70, int(170 * k)))
            d.text((x + 46, yy + 16), p_, font=F_HUD_S, fill=(255, 255, 255, a))
        if t > LAJE[0][1]:
            d.text((x + 30, y + h - 46), '> ALVO: perfil emocional = VAIDADE // MEDO DE EXCLUSÃO', font=F_HUD_S, fill=(255, 59, 92, a))
    # foto do Heitor barrado
    if FOTO_T < t < LD:
        k = ease((t - FOTO_T) / 0.4)
        x, y, w, h = W - 640, BAR + 80, 560, 320
        hud_box(im, x, y, w, h, (255, 59, 92), k, 200)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x + 30, y + 26), 'FOFOCA.RIO // EXCLUSIVO', font=F_HUD_S, fill=(255, 59, 92, int(255 * k)))
        d.text((x + 30, y + 80), 'VALADARES BARRADO', font=F_LOC, fill=(255, 255, 255, int(255 * k)))
        d.text((x + 30, y + 130), 'NO ORDECON BEACH CLUB', font=F_LOC, fill=(255, 255, 255, int(255 * k)))
        d.text((x + 30, y + 200), '"não estava na Lista Âmbar"', font=F_HUD, fill=(232, 194, 106, int(255 * k)))
    subs_at(LAJE, t, im)
    return finish(letterbox(im), fi, 0.03)

DRONE, _e = lay([
    ('LUNA', 'Tu já sabe o ângulo de cabeça de cada drone, né?', 'luna_sorriso.jpg'),
    ('TOKYO', 'Modelo V-6: quinze graus. O V-8 é mais esperto. Esse eu só evito.', 'tokyo_neutro.jpg'),
], 3.3, 0.45)
DD = _e + 2.6
CONTINUA = True  # ep01.py desliga para emendar com o resto do episódio
@shot(DD)
def s_drone(t, fi):
    im = kenburns(bg('12_laje_favela_noite.jpg', 1.45), t / DD, 1.1, 1.18, (0.58, 0.44), (0.62, 0.4))
    im = grade(im, 1.0, 0.85)
    if t < 3.0:
        im = light_sweep(im, t / 3.0)
        k = ease(t / 0.3) * (1 - ease((t - 2.6) / 0.4))
        x, y = W - 600, BAR + 60
        hud_box(im, x, y, 520, 150, (255, 59, 92), k, 170)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x + 24, y + 22), 'DRONE ORDECON // MODELO V-6', font=F_HUD, fill=(255, 59, 92, int(255 * k)))
        d.text((x + 24, y + 70), 'VARREDURA FACIAL ATIVA' + ('  [REC]' if fi % 12 < 6 else ''), font=F_HUD_S, fill=(255, 255, 255, int(255 * k)))
        d.text((x + 24, y + 104), 'ROSTOS DETECTADOS: 1 // IDENTIFICADOS: 0', font=F_HUD_S, fill=(200, 200, 220, int(255 * k)))
    im = rain(im, fi, 1.0)
    subs_at(DRONE, t, im)
    if CONTINUA and t > DD - 2.2:
        a = ease((t - (DD - 2.2)) / 1.2)
        im = Image.blend(im, Image.new('RGB', (W, H)), a)
        text_glow(im, (W - 120, H - BAR - 60), 'CONTINUA…', F_LOC, (186, 85, 255), glow=10, anchor='rs', alpha=a)
    return finish(letterbox(im), fi, 0.03)

# ---------------------------------------------------------------- áudio
SR = 44100
def render_audio(total, cues, path):
    n = int(total * SR); out = np.zeros(n, np.float32)
    t_all = np.arange(n) / SR
    def add(sig, at, gain=1.0):
        i = int(at * SR); j = min(n, i + len(sig))
        if i < n: out[i:j] += sig[:j - i] * gain
    def env(L, a=0.005, r=None):
        e = np.ones(L, np.float32); ai = max(1, int(a * SR)); e[:ai] = np.linspace(0, 1, ai)
        if r: e *= np.exp(-np.arange(L) / (r * SR))
        return e
    def saw(f, L): t = np.arange(L) / SR; return (2 * ((t * f) % 1) - 1).astype(np.float32)
    def lp(x, a):  # filtro passa-baixa de 1 polo
        y = np.empty_like(x); acc = 0.0
        # vetorizado por scipy indisponível: implementação em blocos via lfilter manual
        b = 1 - a
        for i in range(0, len(x), 4096):
            seg = x[i:i + 4096]
            k = np.arange(len(seg))
            # resposta exata do IIR de 1 polo por convolução truncada
            ker = b * a ** np.arange(256)
            ys = np.convolve(seg, ker)[:len(seg)]
            ys[:256] += acc * a ** (k[:256] + 1)
            y[i:i + len(seg)] = ys; acc = ys[-1]
        return y
    def kick():
        L = int(0.35 * SR); t = np.arange(L) / SR
        f = 50 + 120 * np.exp(-t * 30)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)).astype(np.float32)
    def snare():
        L = int(0.2 * SR); t = np.arange(L) / SR
        return ((np.random.randn(L) * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.5) * np.exp(-t * 22)).astype(np.float32)
    def hat():
        L = int(0.05 * SR); x = np.random.randn(L).astype(np.float32)
        x = x - lp(x, 0.6); return x * np.exp(-np.arange(L) / SR * 80)
    def tom(f=140):
        L = int(0.25 * SR); t = np.arange(L) / SR
        return (np.sin(2 * np.pi * f * t * (1 - 0.3 * t)) * np.exp(-t * 14)).astype(np.float32)
    def note(f, dur, cut=0.92, g=1.0):
        L = int(dur * SR)
        x = saw(f, L) + saw(f * 1.006, L) * 0.7
        return lp(x, cut) * env(L, 0.004, dur * 0.5) * g
    def pad(freqs, dur):
        L = int(dur * SR); x = np.zeros(L, np.float32)
        for f in freqs:
            for dt in (0.997, 1.0, 1.004): x += saw(f * dt, L)
        x = lp(x / (len(freqs) * 3), 0.985)
        e = np.minimum(1, np.minimum(np.arange(L) / (1.5 * SR), (L - np.arange(L)) / (1.5 * SR)))
        return x * e.astype(np.float32)
    def noise_bed(dur, a=0.97):
        L = int(dur * SR); return lp(np.random.randn(L).astype(np.float32), a)
    def boom():
        L = int(2.5 * SR); t = np.arange(L) / SR
        return (np.sin(2 * np.pi * (35 + 60 * np.exp(-t * 6)) * t) * np.exp(-t * 1.6) + np.random.randn(L) * np.exp(-t * 8) * 0.3).astype(np.float32)
    def beep(f, d=0.12):
        L = int(d * SR); t = np.arange(L) / SR
        return (np.sign(np.sin(2 * np.pi * f * t)) * 0.3 * env(L, 0.002, d / 2)).astype(np.float32)
    def riser(d):
        L = int(d * SR); t = np.arange(L) / SR
        return (lp(np.random.randn(L).astype(np.float32), 0.9) * (t / d) ** 2 + np.sin(2 * np.pi * (200 + 600 * (t / d) ** 2) * t) * 0.15 * (t / d)).astype(np.float32)

    Am, F, C, G = 110.0, 87.31, 130.81, 98.0
    chords = [(Am, [220, 261.6, 329.6]), (F, [174.6, 220, 261.6]), (C, [196, 261.6, 329.6]), (G, [196, 246.9, 293.7])]
    # cues: dict de tempos-chave
    c = cues
    # 1) cold open: drone grave + pulso de baixo
    add(pad([55, 110, 164.8], c['freeze'] + 1), 0, 0.22)
    beat = 60 / 100
    tt = 2.0
    while tt < c['freeze']:
        add(note(55, beat / 2 * 0.9, 0.9), tt, 0.25); tt += beat / 2
    for k in range(int(c['freeze'] / (beat * 2))):
        add(hat(), 4 + k * beat * 2, 0.08)
    add(beep(1200), c['scan'], 0.5); add(beep(1600), c['scan'] + 0.15, 0.5)
    add(beep(880, 0.3), c['auth'], 0.6); add(beep(1320, 0.4), c['auth'] + 0.18, 0.6)
    # 2) freeze: impacto
    add(boom(), c['freeze'], 0.9)
    add(noise_bed(0.35, 0.5) * np.exp(-np.arange(int(0.35 * SR)) / SR * 10), c['freeze'], 0.6)
    add(pad([110, 130.8, 164.8], c['logo'] - c['freeze'] + 1), c['freeze'] + 0.3, 0.2)
    add(noise_bed(c['logo'] - c['morro'], 0.94), c['morro'], 0.06)  # chuva
    add(riser(2.5), c['logo'] - 2.5, 0.35)
    # 3) logo + montagem: synthwave + tamborzão (120 bpm)
    bpm = 120; b = 60 / bpm; s16 = b / 4
    add(boom(), c['logo'], 1.0)
    start = c['logo']; end = c['ep']
    kick_s, snare_s, tom_s = [0, 3, 6, 10, 12], [4, 12], [7, 14, 15]
    bar = 0
    while start + bar * 16 * s16 < end - 0.1:
        t0 = start + bar * 16 * s16
        root, tri = chords[bar % 4]
        full = t0 >= c['logo'] + 4 * 16 * s16 * 0  # batida desde o início do logo, mais leve no logo
        light = t0 < c['montage']
        add(pad(tri, 16 * s16 + 0.4), t0, 0.16)
        for st in range(16):
            tt = t0 + st * s16
            if tt >= end: break
            if st in kick_s and not (light and st not in (0, 10)): add(kick(), tt, 0.7)
            if not light:
                if st in snare_s: add(snare(), tt, 0.35)
                if st in tom_s: add(tom(150 if st == 7 else 120), tt, 0.3)
                add(hat(), tt, 0.12 if st % 2 else 0.06)
                add(note(root if st % 4 else root / 2, s16 * 0.9, 0.85), tt, 0.22)
                arp = tri[st % 3] * (2 if st % 8 > 3 else 1)
                add(note(arp, s16 * 0.8, 0.8, 1.0), tt, 0.07)
        bar += 1
    for tcut in c['cuts']:
        add(noise_bed(0.25, 0.3) * np.linspace(1, 0, int(0.25 * SR)), tcut, 0.12)
    # 4) laje: chuva + pad lo-fi + batida baixa
    rain_d = total - c['laje']
    add(noise_bed(rain_d, 0.9) * 0.9 + noise_bed(rain_d, 0.99) * 2.5, c['laje'], 0.07)
    bar = 0; b2 = 60 / 84; s2 = b2 / 4
    while c['laje'] + bar * 16 * s2 < total - 3:
        t0 = c['laje'] + bar * 16 * s2
        root, tri = chords[(bar // 2) % 4]
        add(pad([x / 2 for x in tri], 16 * s2 + 0.5), t0, 0.15)
        for st in (0, 6, 10):
            add(kick(), t0 + st * s2, 0.28)
        for st in (4, 12):
            add(snare(), t0 + st * s2, 0.10)
        for st in range(0, 16, 2): add(hat(), t0 + st * s2, 0.04)
        bar += 1
    # drone: zumbido com efeito doppler
    L = int(3.2 * SR); tt_ = np.arange(L) / SR
    whine = np.sin(2 * np.pi * np.cumsum(420 + 80 * np.sin(tt_ * 2)) / SR) * np.sin(np.pi * tt_ / 3.2) ** 2
    add(whine.astype(np.float32), c['drone'], 0.12)
    # ducking da música + vozes
    duck = np.ones(n, np.float32)
    for at, vp, d in VOX:
        i = max(0, int((at - 0.15) * SR)); j = min(n, int((at + d + 0.25) * SR)); duck[i:j] = 0.32
    k = int(0.2 * SR); duck = np.convolve(duck, np.ones(k, np.float32) / k, 'same')
    out *= duck
    for at, vp, d in VOX:
        with wave.open(vp) as w:
            v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        add(v, at, 0.95)
    # master
    fade = int(2.5 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    out = np.tanh(out * 1.2) * 0.85
    pcm = (out * 32767).astype(np.int16)
    st = np.stack([pcm, pcm], 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())

# ---------------------------------------------------------------- main
def main():
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(ROOT, 'renders', 'ep01_abertura.mp4')
    preview = None
    if '--preview' in sys.argv: preview = True
    os.makedirs(os.path.dirname(out), exist_ok=True)
    starts = []; acc = 0
    for d, fn in SHOTS: starts.append(acc); acc += d
    total = acc
    names = [fn.__name__ for _, fn in SHOTS]
    idx = lambda n: starts[names.index(n)]
    cues = {'scan': SCAN, 'auth': SCAN + 2.4, 'freeze': idx('s_freeze'), 'morro': idx('s_morro'), 'logo': idx('s_logo'),
            'montage': idx('s_logo') + 8.0, 'ep': idx('s_ep'), 'laje': idx('s_laje'), 'drone': idx('s_drone'),
            'cuts': [starts[i] for i, n in enumerate(names) if n == 's']}
    wav = out.replace('.mp4', '.wav')
    print(f'duração total: {total:.1f}s, planos: {len(SHOTS)}', flush=True)
    if preview is None: render_audio(total, cues, wav)
    if preview is not None:
        # exporta quadros PNG no tempo pedido
        for t in [float(x) for x in sys.argv[sys.argv.index('--preview') + 1].split(',')]:
          for (d, fn), s in zip(SHOTS, starts):
            if s <= t < s + d:
                fn(t - s, int(t * FPS)).save(out.replace('.mp4', f'_{t:05.1f}.png'))
        return
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-i', wav, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    fi = 0
    for (d, fn), s in zip(SHOTS, starts):
        nf = int(round((s + d) * FPS)) - int(round(s * FPS))
        for k in range(nf):
            im = fn(k / FPS, fi)
            p.stdin.write(im.tobytes()); fi += 1
        print(f'  {fn.__name__:10s} ok ({fi / FPS:.1f}s)', flush=True)
    p.stdin.close(); p.wait()
    os.remove(wav)
    print('pronto:', out)

if __name__ == '__main__':
    main()
