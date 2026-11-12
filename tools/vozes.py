"""Vozes dos personagens via Google Cloud Text-to-Speech (pt-BR), com cache em disco.

A chave é injetada pelo proxy do ambiente (header X-Goog-Api-Key para
texttospeech.googleapis.com); este código nunca a lê.
Os áudios ficam em assets/vozes/<hash>.wav e são reaproveitados.
"""
import base64, hashlib, json, os, re, subprocess, urllib.request, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'assets', 'vozes')
SR = 44100

# personagem -> (voz, velocidade, tom em semitons [só vozes que aceitam])
ELENCO = {
    'TOKYO':   ('pt-BR-Chirp3-HD-Leda', 1.06, None),
    'LUNA':    ('pt-BR-Chirp3-HD-Aoede', 1.08, None),
    'NERO':    ('pt-BR-Chirp3-HD-Puck', 1.05, None),
    'ZÉ BYTE': ('pt-BR-Chirp3-HD-Charon', 0.95, None),
    'HEITOR':  ('pt-BR-Chirp3-HD-Orus', 0.97, None),
    'ÉDEN':    ('pt-BR-Chirp3-HD-Kore', 0.92, None),
}
FALLBACK = {'F': 'pt-BR-Neural2-A', 'M': 'pt-BR-Neural2-B'}
GENERO = {'TOKYO': 'F', 'LUNA': 'F', 'ÉDEN': 'F', 'NERO': 'M', 'ZÉ BYTE': 'M', 'HEITOR': 'M'}

def personagem(who):
    for k in ELENCO:
        if who.upper().startswith(k): return k
    return 'TOKYO'

def limpa(txt):
    return re.sub(r'[*"“”]', '', txt).strip()

def _call(text, voice, rate, pitch):
    cfg = {'audioEncoding': 'LINEAR16', 'sampleRateHertz': SR, 'speakingRate': rate}
    if pitch is not None: cfg['pitch'] = pitch
    body = {'input': {'text': text}, 'voice': {'languageCode': 'pt-BR', 'name': voice}, 'audioConfig': cfg}
    req = urllib.request.Request('https://texttospeech.googleapis.com/v1/text:synthesize',
                                 data=json.dumps(body).encode(), headers={'Content-Type': 'application/json',
                                                                          'X-Goog-Api-Key': 'injetada-pelo-proxy'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return base64.b64decode(json.load(r)['audioContent'])

def fala(who, txt):
    """Retorna (caminho_wav, duração_s) da fala, sintetizando se necessário."""
    p = personagem(who)
    voice, rate, pitch = ELENCO[p]
    text = limpa(txt)
    h = hashlib.sha1(f'{voice}|{rate}|{pitch}|{text}'.encode()).hexdigest()[:16]
    path = os.path.join(CACHE, f'{p.split()[0].lower()}_{h}.wav')
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        try:
            audio = _call(text, voice, rate, pitch)
        except urllib.error.HTTPError as e:
            if e.code != 400: raise
            audio = _call(text, FALLBACK[GENERO[p]], rate, pitch)
        tmp = path + '.raw.wav'
        open(tmp, 'wb').write(audio)
        # normaliza volume e corta silêncio das pontas
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af',
                        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5',
                        '-ar', str(SR), '-ac', '1', path], check=True)
        os.remove(tmp)
    with wave.open(path) as w:
        return path, w.getnframes() / w.getframerate()
