"""Vozes dos personagens em pt-BR, com cache em disco.

Motor padrão: Kokoro (modelo aberto, Apache-2.0) rodando localmente via kokoro-onnx.
  pip install kokoro-onnx soundfile
  Modelos (baixados por `python3 tools/vozes.py --baixar`):
    tools/modelos/kokoro-v1.0.onnx e voices-v1.0.bin
Motor opcional: Google Cloud TTS (VOZES_MOTOR=google), com a chave injetada pelo
proxy do ambiente (header X-Goog-Api-Key) — exige faturamento ativo no Google Cloud.

Os áudios ficam em assets/vozes/<personagem>_<hash>.wav e são reaproveitados.
"""
import base64, hashlib, json, os, re, subprocess, sys, urllib.request, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'assets', 'vozes')
MODELOS = os.path.join(ROOT, 'tools', 'modelos')
SR = 44100
MOTOR = os.environ.get('VOZES_MOTOR', 'kokoro')

# personagem -> mistura de vozes Kokoro {voz: peso}, velocidade, tom (semitons), efeito
ELENCO = {
    'TOKYO':   ({'pf_dora': 0.75, 'af_heart': 0.25}, 1.08, -0.6, None),
    'LUNA':    ({'pf_dora': 0.65, 'af_bella': 0.35}, 1.12, +1.8, None),
    'NERO':    ({'pm_alex': 1.0}, 1.06, +0.8, None),
    'ZÉ BYTE': ({'pm_santa': 0.8, 'am_onyx': 0.2}, 0.94, -2.0, None),
    'HEITOR':  ({'pm_alex': 0.7, 'pm_santa': 0.3}, 0.98, -1.0, None),
    'ÉDEN':    ({'pf_dora': 1.0}, 0.92, -1.5, 'robo'),
}
GOOGLE = {'TOKYO': 'pt-BR-Chirp3-HD-Leda', 'LUNA': 'pt-BR-Chirp3-HD-Aoede', 'NERO': 'pt-BR-Chirp3-HD-Puck',
          'ZÉ BYTE': 'pt-BR-Chirp3-HD-Charon', 'HEITOR': 'pt-BR-Chirp3-HD-Orus', 'ÉDEN': 'pt-BR-Chirp3-HD-Kore'}

def personagem(who):
    for k in ELENCO:
        if who.upper().startswith(k): return k
    return 'TOKYO'

def limpa(txt):
    return re.sub(r'[*"“”]', '', txt).strip()

_kokoro = None
def _kokoro_wav(text, mix, speed, path):
    global _kokoro
    import soundfile as sf
    from kokoro_onnx import Kokoro
    if _kokoro is None:
        _kokoro = Kokoro(os.path.join(MODELOS, 'kokoro-v1.0.onnx'), os.path.join(MODELOS, 'voices-v1.0.bin'))
    style = sum(_kokoro.get_voice_style(v) * w for v, w in mix.items())
    audio, sr = _kokoro.create(text, voice=style, speed=speed, lang='pt-br')
    sf.write(path, audio, sr)

def _google_wav(text, voice, speed, path):
    body = {'input': {'text': text}, 'voice': {'languageCode': 'pt-BR', 'name': voice},
            'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR, 'speakingRate': speed}}
    req = urllib.request.Request('https://texttospeech.googleapis.com/v1/text:synthesize', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': 'injetada-pelo-proxy'})
    with urllib.request.urlopen(req, timeout=60) as r:
        open(path, 'wb').write(base64.b64decode(json.load(r)['audioContent']))

def _filtros(pitch, fx):
    f = []
    if pitch:
        r = 2 ** (pitch / 12)
        f += [f'asetrate=24000*{r:.5f}', 'aresample=24000', f'atempo={1 / r:.5f}']
    if fx == 'robo':
        f += ['aecho=0.8:0.6:12|24:0.35|0.2', 'highpass=f=180', 'lowpass=f=6500', 'vibrato=f=7:d=0.08']
    f += ['silenceremove=start_periods=1:start_threshold=-45dB', 'areverse',
          'silenceremove=start_periods=1:start_threshold=-45dB', 'areverse', 'loudnorm=I=-16:TP=-1.5']
    return ','.join(f)

def fala(who, txt):
    """Retorna (caminho_wav, duração_s) da fala, sintetizando se necessário."""
    p = personagem(who)
    mix, speed, pitch, fx = ELENCO[p]
    text = limpa(txt)
    chave = f'{MOTOR}|{GOOGLE[p] if MOTOR == "google" else sorted(mix.items())}|{speed}|{pitch}|{fx}|{text}'
    h = hashlib.sha1(chave.encode()).hexdigest()[:16]
    path = os.path.join(CACHE, f'{p.split()[0].lower()}_{h}.wav')
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        tmp = path + '.bruto.wav'
        if MOTOR == 'google': _google_wav(text, GOOGLE[p], speed, tmp)
        else: _kokoro_wav(text, mix, speed, tmp)
        # Google já sai em 44.1k; Kokoro em 24k — o filtro de tom assume 24k, então reamostra antes
        pre = 'aresample=24000,' if MOTOR == 'google' else ''
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', pre + _filtros(pitch, fx),
                        '-ar', str(SR), '-ac', '1', path], check=True)
        os.remove(tmp)
    with wave.open(path) as w:
        return path, w.getnframes() / w.getframerate()

def baixar_modelos():
    os.makedirs(MODELOS, exist_ok=True)
    base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
    for f in ('kokoro-v1.0.onnx', 'voices-v1.0.bin'):
        dst = os.path.join(MODELOS, f)
        if not os.path.exists(dst):
            print('baixando', f); urllib.request.urlretrieve(base + f, dst)

if __name__ == '__main__':
    if '--baixar' in sys.argv: baixar_modelos()
