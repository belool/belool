#!/usr/bin/env python3
"""TOKYO: RIO 2077 — Episódio 1 completo: "O golpe de um milhão".

Reaproveita a abertura (render_abertura.py) e acrescenta as cenas 3 a 11 do
roteiro (docs/ep01_roteiro.md), com vozes (tools/vozes.py), trilha por clima
de cena e renderização em paralelo.

Uso:
  python3 tools/ep01.py                      # renderiza renders/ep01_completo.mp4
  python3 tools/ep01.py --preview 130,200    # exporta quadros PNG nesses segundos
  python3 tools/ep01.py --partes 3           # nº de processos em paralelo (padrão 3)
"""
import math, os, random, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_abertura as A
from render_abertura import W, H, BAR, FPS, ease, text_glow, hud_box, typed, F_HUD, F_HUD_S, F_HUD_L, F_LOC, F_TITLE, F_SUB, F_LOGO_S

A.CONTINUA = False
OPEN_END = A.now()          # fim da abertura (s)
MOODS = []                  # (início, fim, clima)
SFX = []                    # (tempo, tipo)

# ---------------------------------------------------------------- fábrica de cenas
def cena(bgname, lines, *, t0=1.0, gap=0.45, tail=1.2, kb=(1.12, 1.25, (0.5, 0.5), (0.5, 0.5)), scale=1.35,
         chuva=0.0, sat=1.05, bright=0.95, tint=None, loc=None, extras=(), fade_in=0.5, fade_out=0.0,
         flicker=0.03, min_dur=0.0, mood='silencio', blur=0):
    L, end = A.lay(lines, t0, gap) if lines else ([], t0)
    dur = max(min_dur, end + tail)
    start = A.now()
    MOODS.append((start, start + dur, mood))
    ctx = {'L': L, 'dur': dur, 'start': start}

    @A.shot(dur)
    def s(t, fi):
        im = A.kenburns(A.bg(bgname, scale), t / dur, *kb)
        im = A.grade(im, sat, bright, tint)
        if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
        if chuva: im = A.rain(im, fi, chuva)
        for e in extras:
            r = e(im, t, fi, ctx)
            if r is not None: im = r
        if loc: A.location_tag(im, loc[0], loc[1], (t - 0.3) / 5)
        A.subs_at(L, t, im)
        if fade_in and t < fade_in: im = Image.blend(Image.new('RGB', (W, H)), im, ease(t / fade_in))
        if fade_out and t > dur - fade_out: im = Image.blend(im, Image.new('RGB', (W, H)), ease((t - dur + fade_out) / fade_out))
        return A.finish(A.letterbox(im), fi, flicker)
    return ctx

def linha(ctx, i):
    """(início, fim) da i-ésima fala da cena."""
    s, e, *_ = ctx['L'][i]; return s, e

def sfx_em(ctx, t, tipo): SFX.append((ctx['start'] + t, tipo))

# ---------------------------------------------------------------- extras (HUDs e efeitos)
def hud_lista(itens, x=None, y=None, cor=(255, 59, 92), titulo='LISTA DE COMPRAS // GOLPE'):
    def e(im, t, fi, ctx):
        k = ease(t / 0.4)
        x0 = W - 760 if x is None else x; y0 = BAR + 90 if y is None else y
        hud_box(im, x0, y0, 680, 90 + 66 * len(itens), cor, k, 190)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x0 + 28, y0 + 24), titulo, font=F_HUD_S, fill=cor + (int(255 * k),))
        for i, (txt, quando, ok) in enumerate(itens):
            if t < quando: continue
            a = int(255 * ease((t - quando) / 0.3))
            yy = y0 + 70 + i * 66
            mark = '[X]' if ok else '[ ]'
            d.text((x0 + 28, yy), f'{mark} {typed(txt, (t - quando) * 2)}', font=F_HUD_S,
                   fill=((80, 255, 160) if ok else (255, 120, 120)) + (a,))
    return e

def flash_vermelho(quando, dur=0.5):
    def e(im, t, fi, ctx):
        q = quando(ctx) if callable(quando) else quando
        if q <= t < q + dur:
            k = 1 - (t - q) / dur
            im = A.glitch(im, k, fi)
            return Image.blend(im, Image.new('RGB', (W, H), (255, 30, 60)), 0.35 * k)
    return e

def hud_leitor(quando):
    def e(im, t, fi, ctx):
        q = quando(ctx)
        if t < q: return
        k = ease((t - q) / 0.4)
        x, y = 120, BAR + 90
        hud_box(im, x, y, 560, 230, (159, 179, 200), k, 190)
        d = ImageDraw.Draw(im, 'RGBA'); a = int(255 * k)
        d.text((x + 28, y + 24), 'ITEM // OFICINA DO ZÉ', font=F_HUD_S, fill=(159, 179, 200, a))
        d.text((x + 28, y + 70), 'LEITOR BIOMÉTRICO MOD. 2061', font=F_HUD, fill=(255, 255, 255, a))
        d.text((x + 28, y + 120), 'CARCAÇA: ORIGINAL', font=F_HUD_S, fill=(80, 255, 160, a))
        d.text((x + 28, y + 160), 'FIRMWARE: MENTIRA (CUSTOMIZADO)', font=F_HUD_S, fill=(255, 59, 92, a))
    return e

def catracas(t_luna, t_tokyo):
    def e(im, t, fi, ctx):
        d = ImageDraw.Draw(im, 'RGBA')
        if t >= t_luna:
            k = ease((t - t_luna) / 0.3)
            x, y = 110, BAR + 110
            hud_box(im, x, y, 640, 170, (80, 255, 160), k, 200)
            d.text((x + 28, y + 24), 'CATRACA 07 // IDENTIFICAÇÃO FACIAL', font=F_HUD_S, fill=(80, 255, 160, int(255 * k)))
            d.text((x + 28, y + 66), 'IDENTIFICADA — LUNA M. SILVA', font=F_HUD, fill=(255, 255, 255, int(255 * k)))
            d.text((x + 28, y + 114), 'CRÉDITO SOCIAL: 412 // ACESSO LIBERADO', font=F_HUD_S, fill=(80, 255, 160, int(255 * k)))
        if t >= t_tokyo:
            k = ease((t - t_tokyo) / 0.3); el = t - t_tokyo
            x, y = W - 770, BAR + 330
            erro = el > 3.6
            cor = (255, 190, 60) if erro else (79, 195, 255)
            hud_box(im, x, y, 680, 170, cor, k, 200)
            d.text((x + 28, y + 24), 'CATRACA 08 // IDENTIFICAÇÃO FACIAL', font=F_HUD_S, fill=cor + (int(255 * k),))
            if not erro:
                d.text((x + 28, y + 66), 'AGUARDANDO IDENTIFICAÇÃO' + '.' * (int(el * 3) % 4), font=F_HUD, fill=(255, 255, 255, 255))
                d.text((x + 28, y + 114), f'PADRÃO FACIAL: {int(min(99, el * 19))}% // INCONSISTENTE', font=F_HUD_S, fill=(255, 120, 120, 255))
            else:
                d.text((x + 28, y + 66), 'ERRO DE LEITURA', font=F_HUD, fill=(255, 190, 60, 255))
                d.text((x + 28, y + 114), 'ACESSO TEMPORÁRIO CONCEDIDO', font=F_HUD_S, fill=(255, 255, 255, 255))
        if t >= t_tokyo + 5.6:
            # câmera que segue a Tokyo um pouco demais
            k = ease((t - t_tokyo - 5.6) / 0.3)
            cx = int(W * 0.35 + (t - t_tokyo - 5.6) * 60); cy = int(H * 0.5)
            r = 90
            col = (255, 40, 60, int(220 * k))
            for a0 in (0, 90, 180, 270):
                d.arc((cx - r, cy - r, cx + r, cy + r), a0 + 15, a0 + 75, fill=col, width=4)
            d.line((cx - 20, cy, cx + 20, cy), fill=col, width=2); d.line((cx, cy - 20, cx, cy + 20), fill=col, width=2)
            if fi % 12 < 7: d.text((cx + r + 16, cy - 14), 'RASTREIO: ATIVO', font=F_HUD_S, fill=col)
    return e

def timer_holo(inicio, v0, v1):
    """Cronômetro da projeção do Nero, de v0 a v1 segundos ao longo da cena (tempo comprimido)."""
    def e(im, t, fi, ctx):
        if t < inicio: return
        el = min(89, v0 + (t - inicio) / max(0.1, ctx['dur'] - inicio) * (v1 - v0))
        x, y = W - 470, BAR + 40
        cor = (255, 59, 92) if el > 75 else (79, 195, 255)
        hud_box(im, x, y, 390, 120, cor, 1, 180)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x + 24, y + 18), 'PROJEÇÃO HOLO // NERO', font=F_HUD_S, fill=cor)
        text_glow(im, (x + 24, y + 52), f'{int(el):02d}s / 90s', F_HUD_L, cor, glow=8)
    return e

def painel_lista_ambar(inicio):
    def e(im, t, fi, ctx):
        if t < inicio: return
        k = ease((t - inicio) / 0.5)
        x, y = 120, BAR + 70
        hud_box(im, x, y, 600, 160, (232, 194, 106), k, 170)
        d = ImageDraw.Draw(im, 'RGBA')
        text_glow(im, (x + 30, y + 30), 'LISTA ÂMBAR', F_LOC, (232, 194, 106), glow=10, alpha=k)
        d.text((x + 30, y + 92), 'ATENDIMENTO EXCLUSIVO // CONVITE', font=F_HUD_S, fill=(255, 255, 255, int(255 * k)))
        if fi % 40 < 2: return A.glitch(im, 0.5, fi)
    return e

def transferencia(inicio):
    def e(im, t, fi, ctx):
        if t < inicio: return
        k = ease((t - inicio) / 0.3)
        x, y, w = W - 640, BAR + 200, 560
        hud_box(im, x, y, w, 220, (80, 255, 160), k, 200)
        text_glow(im, (x + 30, y + 30), 'TRANSFERÊNCIA AUTORIZADA', F_HUD, (80, 255, 160), glow=6, alpha=k)
        text_glow(im, (x + 30, y + 90), 'CR$ 1.000.000', F_HUD_L, (80, 255, 160), glow=12, alpha=k)
    return e

def holo_some(quando):
    def e(im, t, fi, ctx):
        q = quando(ctx)
        if q <= t < q + 0.9: return A.glitch(im, 1.2 * (1 - (t - q) / 0.9), fi)
    return e

def trilha_hlx(inicio):
    def e(im, t, fi, ctx):
        if t < inicio: return
        el = t - inicio
        x, y = W - 820, BAR + 60
        hud_box(im, x, y, 740, 360, (255, 59, 92), ease(el / 0.3), 200)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x + 28, y + 24), 'RASTREIO DA TRANSAÇÃO // NERO', font=F_HUD_S, fill=(255, 59, 92))
        passos = ['ORIGEM: @heitor.valadares', '  > CARTEIRA 0x9F…C2 (USO PESSOAL)', '  > CONTA CORPORATIVA BLINDADA',
                  '  > PREFIXO: HLX-ÉDEN/0', 'RASTREADOR EMBUTIDO: QUEBRADO', 'ALERTA ENVIADO PARA: [CONFIDENCIAL]']
        for i, p in enumerate(passos):
            q = i * 1.4
            if el < q: break
            cor = (255, 255, 255) if i < 3 else (255, 59, 92)
            if i == 5 and fi % 12 < 5: continue
            d.text((x + 28, y + 70 + i * 46), typed(p, (el - q) * 2.5), font=F_HUD_S, fill=cor)
    return e

def apagao(inicio, dur=4.0):
    """Luzes do morro apagam de baixo para cima e voltam."""
    def e(im, t, fi, ctx):
        if not (inicio <= t < inicio + dur + 1.2): return
        u = (t - inicio) / dur
        if u <= 1: lim = H * (1 - u)
        else: lim = H * min(1, (u - 1) * dur / 1.2)  # religa de cima para baixo
        lim = int(lim)
        mask = Image.new('L', (W, H), 0)
        ImageDraw.Draw(mask).rectangle((0, lim, W, H) if u <= 1 else (0, 0, W, lim), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(40))
        escuro = A.grade(im, 0.3, 0.28)
        return Image.composite(escuro, im, mask)
    return e

def eden_ui(t_alerta):
    face = Image.open(A.A('retratos', 'tokyo_neutro.jpg')).convert('L').resize((300, 347), Image.LANCZOS).convert('RGB')
    face = A.grade(face, 1, 0.9, (40, 120, 200, 0.35))
    rnd = random.Random(3)
    pts = [(rnd.randint(40, 260), rnd.randint(60, 300)) for _ in range(26)]
    def e(im, t, fi, ctx):
        x, y = 150, BAR + 60
        k = ease(t / 0.6)
        hud_box(im, x - 30, y - 20, 820, 640, (79, 195, 255), k, 210)
        text_glow(im, (x, y), 'PROJETO ÉDEN', F_LOGO_S, (79, 195, 255), glow=14, alpha=k)
        d = ImageDraw.Draw(im, 'RGBA')
        d.text((x, y + 86), 'ANÁLISE COMPORTAMENTAL // CATRACA 08 // CENTRO CINZA', font=F_HUD_S, fill=(140, 200, 230, int(255 * k)))
        fx, fy = x, y + 140
        im.paste(face, (fx, fy), Image.new('L', face.size, int(255 * k)))
        # malha de reconhecimento facial
        n = min(len(pts), int(t * 8))
        for i in range(n):
            px, py = pts[i]
            d.ellipse((fx + px - 3, fy + py - 3, fx + px + 3, fy + py + 3), fill=(79, 195, 255, 230))
            if i: d.line((fx + pts[i - 1][0], fy + pts[i - 1][1], fx + px, fy + py), fill=(79, 195, 255, 120), width=1)
        yy = fy + int((t * 120) % face.height)
        d.line((fx, yy, fx + face.width, yy), fill=(255, 255, 255, 180), width=2)
        tx = fx + 340
        dados = [('INDIVÍDUO', 'NÃO IDENTIFICADO'), ('PADRÃO FACIAL', 'ADULTERADO'), ('ROTA', 'NOVA ESPERANÇA > DISTRITO'),
                 ('VÍNCULO', 'TRANSAÇÃO HLX-ÂMB-0071')]
        for i, (a_, b_) in enumerate(dados):
            if t < 0.8 + i * 0.6: break
            d.text((tx, fy + i * 62), a_, font=F_HUD_S, fill=(140, 200, 230))
            d.text((tx, fy + 26 + i * 62), b_, font=F_HUD_S, fill=(255, 255, 255))
        if t > 3.0:
            prev = max(31, int(99 - (t - 3.0) * 40))
            d.text((tx, fy + 270), 'PREVISIBILIDADE', font=F_HUD_S, fill=(140, 200, 230))
            text_glow(im, (tx, fy + 296), f'{prev}%', F_HUD_L, (255, 59, 92) if prev < 50 else (79, 195, 255), glow=8)
        if t >= t_alerta(ctx):
            a = ease((t - t_alerta(ctx)) / 0.3)
            if fi % 16 < 12:
                d.rectangle((x - 30, y + 560, x + 790, y + 615), fill=(255, 59, 92, int(200 * a)))
                d.text((x, y + 572), 'COMPORTAMENTO FORA DO PADRÃO IDENTIFICADO', font=F_HUD, fill=(255, 255, 255, int(255 * a)))
    return e

def silhueta_akira(im, t, fi, ctx):
    """Homem de terno, de costas, olhando a cidade pela janela."""
    L = Image.new('L', (W, H)); d = ImageDraw.Draw(L)
    cx, base = int(W * 0.78), H - BAR + 10
    d.ellipse((cx - 70, base - 640, cx + 70, base - 470), fill=255)          # cabeça
    d.rectangle((cx - 38, base - 490, cx + 38, base - 430), fill=255)         # pescoço
    d.polygon([(cx - 250, base), (cx - 230, base - 330), (cx - 150, base - 440), (cx - 40, base - 455),
               (cx + 40, base - 455), (cx + 150, base - 440), (cx + 230, base - 330), (cx + 250, base)], fill=255)
    rim = L.filter(ImageFilter.GaussianBlur(10))
    im.paste(Image.new('RGB', (W, H), (120, 80, 220)), (0, 0), rim.point(lambda v: int(v * 0.8)))
    im.paste(Image.new('RGB', (W, H), (6, 6, 12)), (0, 0), L)
    return im

def janela(im, t, fi, ctx):
    d = ImageDraw.Draw(im, 'RGBA')
    for x in (W * 0.33, W * 0.66):
        d.rectangle((x - 6, 0, x + 6, H), fill=(10, 12, 20, 230))
    d.rectangle((0, H * 0.18 - 5, W, H * 0.18 + 5), fill=(10, 12, 20, 230))

def tela_fim(im, t, fi, ctx):
    a = ease((t - 0.3) / 0.8)
    text_glow(im, (W / 2, H / 2 - 120), 'FIM DO EPISÓDIO 1', F_TITLE, (255, 255, 255), glow=10, anchor='mm', alpha=a)
    if t > 1.5:
        b = ease((t - 1.5) / 0.8)
        text_glow(im, (W / 2, H / 2 - 20), 'NO PRÓXIMO EPISÓDIO', F_HUD_S, (186, 85, 255), glow=6, anchor='mm', alpha=b)
        text_glow(im, (W / 2, H / 2 + 30), 'DINHEIRO SUJO', F_LOC, (255, 255, 255), glow=8, anchor='mm', alpha=b)
    if t > 3.5:
        c = ease((t - 3.5) / 0.8)
        d = ImageDraw.Draw(im, 'RGBA')
        for i, ln in enumerate(['TOKYO: RIO 2077', 'Vozes sintéticas: Kokoro (Apache-2.0) // Trilha sintetizada',
                                'Produzido com Claude Code']):
            d.text((W / 2, H / 2 + 140 + i * 40), ln, font=F_HUD_S, fill=(160, 170, 190, int(255 * c)), anchor='mm')

# ---------------------------------------------------------------- CENAS
# Cena 2 (fim) — laje, depois do drone
cena('12_laje_favela_noite.jpg', [
    ('LUNA', 'Tu quer vender pra ele uma vaga num lugar onde nem tu entra.', 'luna_neutra.jpg'),
    ('TOKYO', 'Eu quero vender pra ele a sensação de uma vaga. É mais barato de fabricar.', 'tokyo_neutro.jpg'),
], t0=0.6, kb=(1.18, 1.1, (0.6, 0.42), (0.4, 0.5)), scale=1.45, chuva=1.0, fade_in=0, fade_out=0.8, mood='morro')

# Cena 3 — beco do Botequim 2077
c3 = cena('16_beco_nova_esperanca.jpg', [
    ('DONA CIDA', 'Ô, Tokyo! Quatro pastéis!', None),
    ('TOKYO', 'Três, Dona Cida! O de queijo foi doação!', 'tokyo_neutro.jpg'),
    ('DONA CIDA', 'Doação é o caramba!', None),
], t0=2.2, kb=(1.05, 1.3, (0.5, 0.75), (0.48, 0.45)), scale=1.4, chuva=0.5, tail=1.4,
    loc=('NOVA ESPERANÇA', 'ESCADARIA DO BOTEQUIM 2077 // 01:40'), mood='morro')

# Cena 4 — oficina do Zé Byte (três enquadramentos)
c4a = cena('04_oficina_interior.jpg', [
    ('ZÉ BYTE', 'Não.', 'ze_serio.jpg'),
    ('TOKYO', 'Eu nem falei nada.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'Tu entrou sem bater e com essa cara. É não.', 'ze_serio.jpg'),
    ('TOKYO', 'Preciso de um leitor biométrico que aprove qualquer digital e mande a autorização pra onde eu quiser.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'Isso é um não com agravante.', 'ze_sorriso.jpg'),
], t0=1.6, kb=(1.25, 1.4, (0.35, 0.62), (0.3, 0.6)), loc=('OFICINA CYBER', 'NOVA ESPERANÇA // ZÉ BYTE'), mood='oficina')
c4b = cena('04_oficina_interior.jpg', [
    ('NERO', 'Quanto?', 'nero_neutro.jpg'),
    ('TOKYO', 'Um milhão.', 'tokyo_neutro.jpg'),
    ('NERO', 'Um milhão de créditos? Tu tá de caô.', 'nero_irritado.jpg'),
    ('TOKYO', 'O Valadares paga quinhentos mil por ano só pra ser seguido por robô em rede social. Um milhão pra entrar na Lista Âmbar é desconto.', 'tokyo_neutro.jpg'),
    ('NERO', 'E quando ele chegar na praia e o segurança não deixar entrar?', 'nero_focado.jpg'),
    ('TOKYO', 'Ele não vai contar pra ninguém. Imagina o homem da mentalidade vencedora indo na delegacia dizer que caiu no golpe de uma menina do morro.', 'tokyo_neutro.jpg'),
    ('TOKYO', 'Ele prefere perder o dinheiro.', 'tokyo_neutro.jpg'),
], t0=0.5, kb=(1.45, 1.3, (0.72, 0.42), (0.68, 0.48)), fade_in=0.15, mood='oficina')
c4c = cena('04_oficina_interior.jpg', [
    ('ZÉ BYTE', 'Esse Beach Club é da Ordecon.', 'ze_olho_ativo.jpg'),
    ('TOKYO', 'Tudo é da Ordecon, Zé. O ar que tu respira tem patrocínio.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'Não. Tu não tá entendendo. Gente que mexe com a Ordecon não some. É apagada.', 'ze_serio.jpg'),
    ('ZÉ BYTE', 'Some o nome, o crédito, o registro. Vira ninguém.', 'ze_serio.jpg'),
    ('TOKYO', 'Então eu tenho vantagem. Eu já sou ninguém.', 'tokyo_neutro.jpg'),
], t0=1.4, gap=0.7, kb=(1.0, 1.15, (0.5, 0.5), (0.45, 0.55)), fade_in=0.15, bright=0.85, mood='tensao',
    extras=[flash_vermelho(lambda c: linha(c, 0)[0] - 0.1, 0.6)])
c4d = cena('04_oficina_interior.jpg', [
    ('ZÉ BYTE', 'Modelo de 2061. A carcaça é original. Por dentro é mentira.', 'ze_sorriso.jpg'),
    ('TOKYO', 'Igual a todo mundo do Distrito.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'Quarenta por cento.', 'ze_serio.jpg'),
    ('TOKYO', 'Quinze.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'Trinta, e tu paga os pastéis da Cida.', 'ze_sorriso.jpg'),
    ('TOKYO', 'Fechado.', 'tokyo_neutro.jpg'),
], t0=0.6, gap=0.35, kb=(1.35, 1.5, (0.4, 0.68), (0.36, 0.7)), fade_in=0.15, fade_out=0.6, mood='oficina',
    extras=[hud_leitor(lambda c: linha(c, 0)[0])])
sfx_em(c4c, linha(c4c, 0)[0] - 0.1, 'glitch')

# Cena 5 — mercado negro (montagem + diálogo)
c5a = cena('03_mercado_negro_implantes.jpg', [], min_dur=7.0, kb=(1.0, 1.3, (0.5, 0.6), (0.5, 0.45)), chuva=0.4,
           loc=('MERCADO NEGRO', 'BECO DOS IMPLANTES // DIA SEGUINTE'), mood='montagem',
           extras=[hud_lista([('UNIFORME DOURADO DE CONCIERGE <- 1 BATERIA', 1.0, True),
                              ('CHIP PROJETOR HOLOGRÁFICO <- BANCA "DESMANCHE"', 2.6, True),
                              ('OLHO CIBERNÉTICO "QUASE NOVO"', 4.2, False)])])
for q in (1.0, 2.6, 4.2): sfx_em(c5a, q, 'beep')
cena('03_mercado_negro_implantes.jpg', [
    ('LUNA', 'Por que eu sou a concierge?', 'luna_neutra.jpg'),
    ('TOKYO', 'Porque tu fala com qualquer pessoa como se ela fosse importante. É um dom.', 'tokyo_neutro.jpg'),
    ('TOKYO', 'Eu falo com todo mundo como se a pessoa me devesse dinheiro.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Geralmente devem mesmo.', 'luna_sorriso.jpg'),
], t0=0.5, kb=(1.4, 1.25, (0.25, 0.55), (0.3, 0.5)), chuva=0.4, fade_in=0.15, fade_out=0.6, mood='montagem')

# Cena 6 — estação maglev
cena('06_estacao_maglev.jpg', [
    ('LUNA', 'Isso funciona mesmo?', 'luna_neutra.jpg'),
    ('TOKYO', 'O sistema procura padrão de rosto. Eu quebro o padrão em três pontos.', 'tokyo_neutro.jpg'),
    ('TOKYO', 'Ele não me lê como suspeita. Me lê como erro de câmera.', 'tokyo_neutro.jpg'),
    ('LUNA', 'E se ele ler como suspeita?', 'luna_neutra.jpg'),
    ('TOKYO', 'Aí a gente corre. Mas com estilo.', 'tokyo_neutro.jpg'),
], t0=2.0, kb=(1.05, 1.2, (0.4, 0.5), (0.3, 0.55)), sat=0.8, loc=('ESTAÇÃO MAGLEV', 'CENTRO CINZA // LINHA SUL // 22:58'),
    mood='tensao')
c6b = cena('06_estacao_maglev.jpg', [], min_dur=10.0, kb=(1.3, 1.45, (0.25, 0.65), (0.3, 0.6)), sat=0.8, fade_in=0.15,
           fade_out=0.6, mood='tensao', extras=[catracas(0.6, 2.2)])
for q, k in ((0.6, 'ok'), (2.2, 'beep'), (5.8, 'erro'), (7.8, 'alerta')): sfx_em(c6b, q, k)

# Cena 7 — Distrito Imperial
cena('08_distrito_imperial.jpg', [
    ('LUNA', 'Até o vento aqui é cheiroso.', 'luna_sorriso.jpg'),
    ('TOKYO', 'É perfume na ventilação. Eles cobram por metro cúbico.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Tu tá zoando.', 'luna_neutra.jpg'),
    ('TOKYO', 'Tô. Mas tu acreditou, e isso diz muito sobre esse lugar.', 'tokyo_neutro.jpg'),
    ('NERO (RÁDIO)', 'Tô no painel do portão VIP. Tenho noventa segundos de projeção antes do sistema perceber. Noventa. Não noventa e um.', 'nero_focado.jpg'),
    ('TOKYO', 'Relaxa, Nero. Eu só preciso de sessenta.', 'tokyo_neutro.jpg'),
    ('NERO (RÁDIO)', 'Tu sempre diz isso e sempre usa cento e vinte.', 'nero_sorriso.jpg'),
], t0=2.0, kb=(1.05, 1.3, (0.35, 0.55), (0.5, 0.45)), sat=1.1, bright=1.0,
    loc=('DISTRITO IMPERIAL', 'PASSARELA DE CRISTAL // 23:39'), fade_out=0.6, mood='imperial')

# Cena 8 — o golpe no portão VIP
c8 = cena('11_ordecon_beach_club.jpg', [
    ('TOKYO', 'Não oferece nada. Espera ele pedir.', 'tokyo_neutro.jpg'),
    ('HEITOR VALADARES', 'Boa noite. Meu assistente disse que eu fui… selecionado.', None),
    ('LUNA', 'O sistema selecionou, doutor. Eu só informo.', 'luna_confiante.jpg'),
    ('LUNA', 'Mas a seleção expira em quatro minutos.', 'luna_confiante.jpg'),
    ('HEITOR VALADARES', 'Quatro minutos?', None),
    ('LUNA', 'O senhor estava na lista de espera. Às vezes o sistema abre uma vaga. Às vezes não abre de novo.', 'luna_confiante.jpg'),
    ('TOKYO', 'Agora fala do Fontoura.', 'tokyo_neutro.jpg'),
    ('LUNA', 'O senhor Fontoura, da Fontoura Capital, recusou a vaga ontem. Disse que não valia o preço.', 'luna_sorriso.jpg'),
    ('TOKYO', 'Pegou.', 'tokyo_neutro.jpg'),
    ('HEITOR VALADARES', 'Eu pago.', None),
], t0=1.5, kb=(1.25, 1.6, (0.3, 0.5), (0.24, 0.42)), scale=1.4, loc=('ORDECON BEACH CLUB', 'PORTÃO VIP // 23:47'),
    mood='golpe', extras=[painel_lista_ambar(0.8), timer_holo(0.8, 0, 80)])
D8 = c8['dur']
c8b = cena('11_ordecon_beach_club.jpg', [
    ('NERO (RÁDIO)', 'Oitenta e oito… oitenta e nove…', 'nero_focado.jpg'),
], t0=2.4, tail=1.6, kb=(1.6, 1.7, (0.24, 0.42), (0.22, 0.4)), scale=1.4, fade_in=0, fade_out=0.6, mood='golpe',
    extras=[transferencia(0.3), timer_holo(0, 80, 89.9), holo_some(lambda c: linha(c, 0)[1] + 0.1)])
sfx_em(c8b, 0.3, 'ok'); sfx_em(c8b, linha(c8b, 0)[1] + 0.1, 'glitch')

# Cena 9 — laje, madrugada: comemoração e o prefixo HLX
cena('12_laje_favela_noite.jpg', [
    ('LUNA', 'Um milhão! A gente é milionário!', 'luna_sorriso.jpg'),
    ('NERO', 'A gente é milionário temporariamente. O dinheiro tá passando por onze carteiras-laranja.', 'nero_sorriso.jpg'),
    ('NERO', 'Se cair numa limpa, a gente vira milionário de verdade.', 'nero_neutro.jpg'),
    ('TOKYO', 'Primeira coisa: pagar a Dona Cida.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Que Robin Hood.', 'luna_sorriso.jpg'),
    ('TOKYO', 'Robin Hood nada. Eu quero crédito pra pastel infinito.', 'tokyo_neutro.jpg'),
    ('ZÉ BYTE', 'E a segunda?', 'ze_serio.jpg'),
    ('TOKYO', 'A segunda é sair daqui.', 'tokyo_neutro.jpg'),
], t0=1.5, kb=(1.05, 1.2, (0.4, 0.55), (0.55, 0.45)), scale=1.45, tint=(255, 120, 160, 0.08),
    loc=('NOVA ESPERANÇA', 'LAJE DA TOKYO // 04:12'), mood='festa')
cena('12_laje_favela_noite.jpg', [
    ('LUNA', 'Sair daqui. Tipo… daqui?', 'luna_neutra.jpg'),
    ('TOKYO', 'Lu, eu não nasci pra ficar pendurada num morro esperando drone passar.', 'tokyo_neutro.jpg'),
    ('LUNA', 'Tu nasceu aqui. Igual a mim. Igual à Dona Cida.', 'luna_neutra.jpg'),
    ('TOKYO', 'Por isso mesmo.', 'tokyo_neutro.jpg'),
], t0=1.0, gap=0.8, kb=(1.35, 1.45, (0.7, 0.4), (0.72, 0.38)), scale=1.45, tint=(80, 60, 140, 0.12), fade_in=0.15,
    mood='morro')
c9c = cena('12_laje_favela_noite.jpg', [
    ('NERO', '…Isso não é normal.', 'nero_focado.jpg'),
    ('TOKYO', 'O quê?', 'tokyo_neutro.jpg'),
    ('NERO', 'A conta do Valadares. Ela não é dele. Ele só usa. A origem é uma conta corporativa blindada.', 'nero_focado.jpg'),
    ('NERO', 'Prefixo HLX. Isso não é Ordecon. É acima da Ordecon.', 'nero_irritado.jpg', 'Prefixo agá, éle, xis. Isso não é Ordecon. É acima da Ordecon.'),
    ('ZÉ BYTE', 'Helix.', 'ze_olho_ativo.jpg', 'Hélix.'),
    ('NERO', 'E tem mais. O dinheiro tinha uma etiqueta dentro. Tipo um rastreador. Eu quebrei, mas…', 'nero_focado.jpg'),
    ('TOKYO', 'Mas?', 'tokyo_neutro.jpg'),
    ('NERO', 'Mas quebrar avisa que alguém quebrou.', 'nero_irritado.jpg'),
], t0=1.0, kb=(1.2, 1.35, (0.3, 0.6), (0.28, 0.62)), scale=1.45, bright=0.8, fade_in=0.15, fade_out=0.8, mood='tensao',
    extras=[trilha_hlx(1.6)])
sfx_em(c9c, 0.8, 'alerta')

# Cena 10 — o morro apaga
c10 = cena('15_favela_vertical_cristo.jpg', [
    ('TOKYO (V.O.)', 'Eu sempre achei que o perigo era ser pega.', 'tokyo_neutro.jpg'),
], t0=6.0, tail=1.6, kb=(1.0, 1.15, (0.5, 0.55), (0.5, 0.45)), scale=1.5, chuva=0.7, fade_in=1.0, fade_out=0.8,
    mood='eden', extras=[apagao(1.0, 4.0)])
sfx_em(c10, 1.0, 'apagao')

# Cena 11 — sede da Ordecon, Projeto Éden e Akira
cena('09_ordecon_sede_lobby.jpg', [], min_dur=6.0, kb=(1.0, 1.35, (0.5, 0.5), (0.62, 0.45)), sat=0.7, bright=0.75,
     tint=(40, 90, 160, 0.15), loc=('ORDECON // SEDE GLOBAL', 'DISTRITO IMPERIAL // 04:31'), fade_in=0.8, mood='eden')
c11 = cena('08_distrito_imperial.jpg', [
    ('ÉDEN', 'Indivíduo não identificado. Probabilidade de previsão comportamental: trinta e um por cento.', None),
    ('ÉDEN', 'Comportamento fora do padrão identificado.', None),
    ('AKIRA', 'Olá, variável.', None),
], t0=3.5, gap=0.9, tail=2.0, kb=(1.0, 1.08, (0.5, 0.5), (0.52, 0.48)), scale=1.3, sat=0.6, bright=0.55,
    tint=(30, 60, 140, 0.25), blur=2, fade_in=0.6, fade_out=1.0, mood='eden',
    extras=[janela, eden_ui(lambda c: linha(c, 1)[0]), silhueta_akira])
sfx_em(c11, 0.3, 'boom'); sfx_em(c11, linha(c11, 1)[0], 'alerta'); sfx_em(c11, linha(c11, 2)[0] - 0.2, 'boom')

# Tela preta: a última frase
cena('09_ordecon_sede_lobby.jpg', [
    ('TOKYO (V.O.)', 'O perigo era ser entendida.', 'tokyo_neutro.jpg'),
], t0=1.0, tail=1.6, bright=0.0, sat=0, fade_in=0, flicker=0, mood='silencio')
cena('09_ordecon_sede_lobby.jpg', [], min_dur=8.0, bright=0.0, sat=0, fade_in=0, fade_out=1.2, flicker=0,
     extras=[tela_fim], mood='fim')

# ---------------------------------------------------------------- trilha das cenas novas
SR = A.SR
def _lp(x, a):
    b = 1 - a; ker = b * a ** np.arange(256)
    return np.convolve(x, ker)[:len(x)].astype(np.float32)
def _saw(f, L, ph=0.0): t = np.arange(L) / SR; return (2 * ((t * f + ph) % 1) - 1).astype(np.float32)
def _env(L, a=0.005, r=None):
    e = np.ones(L, np.float32); ai = max(1, int(a * SR)); e[:ai] = np.linspace(0, 1, ai)
    if r: e *= np.exp(-np.arange(L) / (r * SR)).astype(np.float32)
    return e
def kick():
    L = int(0.35 * SR); t = np.arange(L) / SR
    return (np.sin(2 * np.pi * np.cumsum(50 + 120 * np.exp(-t * 30)) / SR) * np.exp(-t * 9)).astype(np.float32)
def snare():
    L = int(0.2 * SR); t = np.arange(L) / SR
    return ((np.random.randn(L) * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.5) * np.exp(-t * 22)).astype(np.float32)
def hat():
    L = int(0.05 * SR); x = np.random.randn(L).astype(np.float32); x = x - _lp(x, 0.6)
    return x * np.exp(-np.arange(L) / SR * 80).astype(np.float32)
def tom(f=140):
    L = int(0.25 * SR); t = np.arange(L) / SR
    return (np.sin(2 * np.pi * f * t * (1 - 0.3 * t)) * np.exp(-t * 14)).astype(np.float32)
def note(f, dur, cut=0.9):
    L = int(dur * SR); return _lp(_saw(f, L) + 0.7 * _saw(f * 1.006, L), cut) * _env(L, 0.004, dur * 0.5)
def bell(f, dur=1.6):
    L = int(dur * SR); t = np.arange(L) / SR
    return ((np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)) * np.exp(-t * 2.2)).astype(np.float32)
def pad(freqs, dur, cut=0.985, sine=False):
    L = int(dur * SR); x = np.zeros(L, np.float32); t = np.arange(L) / SR
    for f in freqs:
        for dt in (0.997, 1.0, 1.004):
            x += np.sin(2 * np.pi * f * dt * t).astype(np.float32) if sine else _saw(f * dt, L)
    x = x / (len(freqs) * 3)
    if not sine: x = _lp(x, cut)
    fade = min(int(1.0 * SR), L // 3)
    e = np.ones(L, np.float32); e[:fade] = np.linspace(0, 1, fade); e[-fade:] = np.linspace(1, 0, fade)
    return x * e
def noise(dur, a=0.95): return _lp(np.random.randn(int(dur * SR)).astype(np.float32), a)

CH = [(110.0, [220, 261.6, 329.6]), (87.31, [174.6, 220, 261.6]), (130.81, [196, 261.6, 329.6]), (98.0, [196, 246.9, 293.7])]
CH_MENOR = [(55.0, [110, 130.8, 164.8]), (43.65, [87.3, 110, 130.8]), (49.0, [98, 116.5, 146.8]), (41.2, [82.4, 103.8, 123.5])]

def musica(mood, dur):
    n = int(dur * SR); out = np.zeros(n + SR * 3, np.float32)
    def add(sig, at, g=1.0):
        i = int(at * SR); j = min(len(out), i + len(sig))
        if 0 <= i < len(out): out[i:j] += sig[:j - i] * g
    if mood in ('morro', 'oficina'):
        b2 = 60 / (84 if mood == 'morro' else 90); s2 = b2 / 4; bar = 0
        while bar * 16 * s2 < dur:
            t0 = bar * 16 * s2; root, tri = CH[(bar // 2) % 4]
            add(pad([x / 2 for x in tri], 16 * s2 + 0.6), t0, 0.15)
            for st in (0, 6, 10): add(kick(), t0 + st * s2, 0.26)
            for st in (4, 12): add(snare(), t0 + st * s2, 0.09)
            for st in range(0, 16, 2): add(hat(), t0 + st * s2, 0.04)
            if mood == 'oficina':
                for st in (0, 3, 8, 11): add(note(root / 2, s2 * 1.5, 0.8), t0 + st * s2, 0.12)
            bar += 1
        if mood == 'morro': add(noise(dur, 0.9) * 0.9 + noise(dur, 0.99) * 2.5, 0, 0.06)
    elif mood in ('montagem', 'festa'):
        bpm = 120 if mood == 'montagem' else 128; s16 = 60 / bpm / 4; bar = 0
        while bar * 16 * s16 < dur:
            t0 = bar * 16 * s16; root, tri = CH[bar % 4]
            add(pad(tri, 16 * s16 + 0.4), t0, 0.14)
            for st in range(16):
                tt = t0 + st * s16
                if st in (0, 3, 6, 10, 12): add(kick(), tt, 0.6)
                if st in (4, 12): add(snare(), tt, 0.3)
                if st in (7, 14, 15): add(tom(150 if st == 7 else 120), tt, 0.28)
                add(hat(), tt, 0.1 if st % 2 else 0.05)
                add(note(root if st % 4 else root / 2, s16 * 0.9, 0.85), tt, 0.18)
                if mood == 'festa': add(note(tri[st % 3] * 2, s16 * 0.7, 0.8), tt, 0.06)
            bar += 1
    elif mood in ('tensao', 'golpe'):
        beat = 60 / (100 if mood == 'tensao' else 108); tt = 0.0; k = 0
        add(pad([55, 82.4, 110], dur + 1, 0.98), 0, 0.2)
        while tt < dur:
            add(note(55 if (k // 8) % 2 == 0 else 51.9, beat / 2 * 0.9, 0.88), tt, 0.22)
            if mood == 'golpe':
                if k % 4 == 0: add(kick(), tt, 0.45)
                add(hat(), tt, 0.07); add(hat(), tt + beat / 4, 0.04)
            elif k % 2 == 0: add(hat(), tt, 0.05)
            tt += beat / 2; k += 1
        if mood == 'golpe':
            for i in range(int(dur)): add(np.sin(2 * np.pi * 2000 * np.arange(int(0.02 * SR)) / SR).astype(np.float32) * 0.5, i + 0.0, 0.08)
    elif mood == 'imperial':
        add(pad([261.6, 329.6, 392, 493.9], dur + 1, sine=True), 0, 0.12)
        notas = [523.3, 659.3, 784, 987.8, 784, 659.3]
        tt, i = 0.4, 0
        while tt < dur: add(bell(notas[i % len(notas)]), tt, 0.10); tt += 0.9; i += 1
    elif mood == 'eden':
        t = np.arange(n) / SR
        dr = (np.sin(2 * np.pi * 41.2 * t) * 0.6 + np.sin(2 * np.pi * 82.4 * t * (1 + 0.002 * np.sin(t * 0.7))) * 0.3).astype(np.float32)
        add(dr * np.minimum(1, t / 2).astype(np.float32), 0, 0.25)
        add(pad([659.3, 987.8, 1318.5], dur + 1, sine=True), 0, 0.05)
        tt = 0.5
        while tt < dur: add(kick() * 0.8, tt, 0.35); add(kick() * 0.5, tt + 0.28, 0.25); tt += 1.6
    elif mood == 'fim':
        add(pad([110, 130.8, 164.8, 220], dur, 0.985), 0, 0.2)
    m = out[:n]
    f = min(int(0.5 * SR), n // 4)
    m[:f] *= np.linspace(0, 1, f); m[-f:] *= np.linspace(1, 0, f)
    return m

def sfx(tipo):
    L = lambda d: int(d * SR)
    t = lambda d: np.arange(L(d)) / SR
    if tipo == 'beep': return (np.sign(np.sin(2 * np.pi * 1400 * t(0.1))) * 0.25 * _env(L(0.1), 0.002, 0.05)).astype(np.float32)
    if tipo == 'ok':
        a = np.sign(np.sin(2 * np.pi * 880 * t(0.15))); b = np.sign(np.sin(2 * np.pi * 1320 * t(0.25)))
        return np.concatenate([a, b]).astype(np.float32) * 0.25
    if tipo == 'erro': return (np.sign(np.sin(2 * np.pi * 220 * t(0.35))) * 0.3 * _env(L(0.35), 0.002, 0.2)).astype(np.float32)
    if tipo == 'alerta':
        x = np.zeros(0, np.float32)
        for _ in range(3): x = np.concatenate([x, (np.sin(2 * np.pi * 980 * t(0.12)) * 0.4).astype(np.float32), np.zeros(L(0.08), np.float32)])
        return x
    if tipo == 'glitch': return (np.random.randn(L(0.35)) * np.exp(-t(0.35) * 6) * (np.sin(2 * np.pi * 60 * t(0.35)) > 0)).astype(np.float32) * 0.5
    if tipo == 'boom':
        tt = t(2.5); return (np.sin(2 * np.pi * (35 + 60 * np.exp(-tt * 6)) * tt) * np.exp(-tt * 1.6)).astype(np.float32)
    if tipo == 'apagao':
        tt = t(4.0); f = 120 * np.exp(-tt * 0.6)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 0.5) * 0.5).astype(np.float32)
    return np.zeros(1, np.float32)

def render_audio_total(total, path):
    # 1) abertura com a trilha original
    starts = []; acc = 0
    for d, fn in A.SHOTS: starts.append(acc); acc += d
    names = [fn.__name__ for _, fn in A.SHOTS]
    idx = lambda nm: starts[names.index(nm)]
    cues = {'scan': A.SCAN, 'auth': A.SCAN + 2.4, 'freeze': idx('s_freeze'), 'morro': idx('s_morro'), 'logo': idx('s_logo'),
            'montage': idx('s_logo') + 8.0, 'ep': idx('s_ep'), 'laje': idx('s_laje'), 'drone': idx('s_drone'),
            'cuts': [s for s, nm in zip(starts, names) if nm == 's' and s < OPEN_END]}
    tmp = path + '.abertura.wav'
    A.render_audio(OPEN_END, cues, tmp)
    with wave.open(tmp) as w:
        ab = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2)[:, 0].astype(np.float32) / 32768
    os.remove(tmp)
    # 2) resto do episódio
    n = int(total * SR); out = np.zeros(n, np.float32)
    def add(sig, at, g=1.0):
        i = int(at * SR); j = min(n, i + len(sig))
        if 0 <= i < n: out[i:j] += sig[:j - i] * g
    segs = []
    for s, e, m in MOODS:
        if segs and segs[-1][2] == m and abs(segs[-1][1] - s) < 0.05: segs[-1][1] = e
        else: segs.append([s, e, m])
    for s, e, m in segs:
        if m != 'silencio': add(musica(m, e - s + 0.6), s, 1.0)
    duck = np.ones(n, np.float32)
    for at, vp, d in A.VOX:
        if at < OPEN_END: continue
        i = max(0, int((at - 0.15) * SR)); j = min(n, int((at + d + 0.25) * SR)); duck[i:j] = 0.32
    k = int(0.2 * SR); duck = np.convolve(duck, np.ones(k, np.float32) / k, 'same')
    out *= duck
    for tt, tipo in SFX: add(sfx(tipo), tt, 0.7)
    for at, vp, d in A.VOX:
        if at < OPEN_END: continue
        with wave.open(vp) as w:
            v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        add(v, at, 0.95)
    out = np.tanh(out * 1.2) * 0.85
    # emenda: abertura (já masterizada) + resto, com crossfade de 0.4 s
    m = min(len(ab), n)
    out[:m] = ab[:m]
    fade = int(1.5 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(np.stack([pcm, pcm], 1).tobytes())

# ---------------------------------------------------------------- render
def frames_por_plano():
    starts = []; acc = 0
    for d, fn in A.SHOTS: starts.append(acc); acc += d
    nfs = [int(round((s + d) * FPS)) - int(round(s * FPS)) for (d, _), s in zip(A.SHOTS, starts)]
    return starts, nfs

def render_parte(i0, i1, fi0, out):
    starts, nfs = frames_por_plano()
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
           '-i', '-', '-vf', 'hqdn3d=0:0:3:3', '-c:v', 'libx264', '-preset', 'medium', '-crf', '26',
           '-pix_fmt', 'yuv420p', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    fi = fi0
    for k in range(i0, i1):
        d, fn = A.SHOTS[k]
        for j in range(nfs[k]):
            p.stdin.write(fn(j / FPS, fi).tobytes()); fi += 1
        print(f'  [parte {out[-6:-4]}] plano {k + 1}/{len(A.SHOTS)} ok', flush=True)
    p.stdin.close(); p.wait()

def main():
    args = sys.argv[1:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, 'renders', 'ep01_completo.mp4')
    starts, nfs = frames_por_plano()
    total = sum(d for d, _ in A.SHOTS)
    if '--parte' in args:  # processo filho
        i = args.index('--parte'); i0, i1, fi0 = map(int, args[i + 1:i + 4]); render_parte(i0, i1, fi0, args[i + 4]); return
    print(f'duração total: {total:.1f}s ({total / 60:.1f} min), planos: {len(A.SHOTS)}, falas: {len(A.VOX)}', flush=True)
    if '--preview' in args:
        ts = [float(x) for x in args[args.index('--preview') + 1].split(',')]
        for t in ts:
            for (d, fn), s in zip(A.SHOTS, starts):
                if s <= t < s + d: fn(t - s, int(t * FPS)).save(out.replace('.mp4', f'_{t:06.1f}.png'))
        return
    N = int(args[args.index('--partes') + 1]) if '--partes' in args else 3
    os.makedirs(os.path.dirname(out), exist_ok=True)
    wav = out.replace('.mp4', '.wav')
    render_audio_total(total, wav)
    # divide os planos em N partes com nº de quadros parecido
    alvo = sum(nfs) / N; cortes = [0]; acc = 0
    for k, nf in enumerate(nfs):
        acc += nf
        if acc >= alvo * len(cortes) and len(cortes) < N: cortes.append(k + 1)
    cortes.append(len(nfs))
    procs, partes = [], []
    for a, b in zip(cortes[:-1], cortes[1:]):
        if a == b: continue
        part = out.replace('.mp4', f'_p{len(partes):02d}.mp4'); partes.append(part)
        procs.append(subprocess.Popen([sys.executable, os.path.abspath(__file__), '--parte', str(a), str(b), str(sum(nfs[:a])), part]))
    for p in procs:
        if p.wait() != 0: sys.exit('falha ao renderizar uma parte')
    lista = out.replace('.mp4', '_partes.txt')
    with open(lista, 'w') as f:
        for p in partes: f.write(f"file '{p}'\n")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-i', wav,
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], check=True)
    for p in partes + [lista, wav]: os.remove(p)
    print('pronto:', out)

if __name__ == '__main__':
    main()
