# Operation Zero

FPS tático em primeira pessoa que roda no navegador (WebGL + Three.js), sem instalação e sem assets externos: geometria, texturas, animações e sons são todos gerados por código.

**Modos:** Campanha (4 missões com escolhas que ramificam a história) · Mata-mata 5v5 e 10v10 · Dominação · Captura de objetivos · Sobrevivência por ondas · Battle Royale com até 100 combatentes · **Online com amigos** (todos os modos, menos a campanha).

## Como jogar

```bash
cd operation-zero
npm start            # servidor estático em http://localhost:8080 (Node, sem dependências)
# ou: python3 -m http.server 8080
```

Abra `http://localhost:8080` no Chrome, Edge ou Firefox e clique na tela para capturar o mouse. `Esc` pausa.

**No celular/tablet** os controles de toque ligam sozinhos: joystick flutuante na metade esquerda (empurre até o fim para frente para correr), arraste na metade direita para mirar, dois botões de tiro (o da direita também mira enquanto você arrasta), mira (alterna), pular, agachar, recarregar, granada, faca, troca de arma, interagir (aparece quando há algo para usar) e uma barra com pausa, mapa, placar, lanterna, modo de disparo, ordem ao esquadrão e loja.

Recursos para celular:
- **Ajuda de mira** (ligada por padrão): desacelera a mira sobre o inimigo e a puxa levemente para ele enquanto você se move ou atira; a mira fica vermelha quando está sobre um alvo.
- **Tiro automático** (opcional): dispara sozinho quando a mira está sobre um inimigo.
- **Giroscópio** (opcional): girar o aparelho move a mira, somado ao arraste.
- **Vibração** em acertos, tiros na cabeça, dano recebido e abates.
- **Resolução dinâmica**: baixa a resolução quando o FPS cai abaixo de ~42 e sobe de volta quando sobra desempenho; na primeira execução o celular já começa com gráficos mais leves.
- **Instalável (PWA)**: "Adicionar à tela inicial" abre em tela cheia na horizontal, e o jogo funciona offline depois do primeiro acesso (o online continua precisando do servidor).
- Menus compactos para tela deitada e empilhados em pé, respeitando o entalhe da tela; pausa automática ao sair do app.

Tudo isso fica em Configurações → Controles (tamanho, opacidade e sensibilidade dos botões e do giroscópio) e → Gráficos (resolução dinâmica). A ajuda de mira, o tiro automático e o layout foram testados em celular emulado; vibração e giroscópio dependem do aparelho e não foram testados em hardware real.

| Ação | Tecla | Ação | Tecla |
|---|---|---|---|
| Mover | W A S D | Granada / trocar tipo | G / X |
| Correr | Shift | Faca | V |
| Agachar (alternar / segurar) | C / Ctrl | Interagir, plantar C4, dirigir | E |
| Pular | Espaço | Ordem ao esquadrão (seguir/manter/atacar) | Q |
| Atirar / mirar | Mouse esq. / dir. | Lanterna | F |
| Recarregar | R | Placar | Tab |
| Trocar arma | 1 / 2 / roda | Mapa grande | M |
| Modo de disparo | B | Loja (Sobrevivência) | I |

## Jogar online com amigos

1. Uma pessoa roda `npm start` (o servidor mostra o endereço local e o da rede, ex.: `http://192.168.0.10:8080`).
2. Todos abrem esse endereço e vão em **Online**. O anfitrião clica em **Criar sala** e passa o código de 5 letras; os outros digitam o código e clicam em **Entrar**.
3. No saguão, o anfitrião escolhe modo, mapa, horário, clima e dificuldade dos bots, e pode trocar jogadores de equipe. **Iniciar partida** leva todos juntos; vagas livres viram bots.

Como funciona: o navegador do anfitrião simula a partida (IA, dano, regras). Cada cliente move e mira localmente, sem atraso, e envia posição, disparos, granadas e ações; o anfitrião confirma acertos e envia o estado do mundo 20 vezes por segundo (10 no Battle Royale grande). Quem cai da partida vira bot; se o anfitrião sai, os clientes voltam ao menu. O servidor (`tools/serve.mjs`, sem dependências) só cria salas e repassa mensagens por WebSocket.

Pela internet é preciso expor a porta 8080 (redirecionamento no roteador, um servidor na nuvem ou um túnel). A versão publicada como página estática não tem o servidor, então ali o modo online não conecta.

Limites: o anfitrião confia na posição enviada pelos clientes (não há antitrapaça), não há entrada no meio da partida (quem chega espera a próxima) e a campanha é só para um jogador.

## Sobre o Unreal Engine 5

A especificação priorizava UE5 + C++/Blueprints. Este protótipo foi feito em JavaScript porque o ambiente de desenvolvimento não tinha Unreal Engine nem GPU — código UE5 entregue aqui não poderia ser compilado nem testado. A arquitetura segue os mesmos conceitos e porta de forma direta:

| Aqui | Equivalente em UE5 |
|---|---|
| `Combatant` + "intenções" (`intent`) | `ACharacter` + `AController` (jogador, IA ou rede preenchem o mesmo input) |
| `AIBrain` (máquina de estados) / `Squad` / `Director` | StateTree ou Behavior Tree / AI Director com EQS |
| `Mode` e subclasses | `AGameMode` / `AGameState` |
| `World` (AABBs + hash espacial) / `NavGrid` (A*) | Colisão Chaos / NavMesh (Recast) |
| `weapons.js` (dados) | Data Tables / Data Assets |
| `Save.js` | `USaveGame` |

## O que foi implementado

**Gráficos e ambiente** — iluminação dinâmica com sombras (PCF soft), céu procedural com sol, lua e estrelas, ciclo dia/noite contínuo, neblina, chuva, tempestade com relâmpagos e trovões, lanterna, postes que acendem à noite. Partículas na GPU (fogo, fumaça, faíscas, poeira, sangue), traçantes, marcas de bala, destroços com física. Seis mapas: refinaria (industrial), Distrito 9 (urbano), Floresta Negra, Posto Oásis (deserto), Fortaleza Krane (base militar) e Ilha Zero (640 × 640 m, Battle Royale).

**Destruição parcial** — paredes em módulos que abrem buracos com explosivos, paredes de madeira e cercas que quebram a tiros, vidros, caixas, barris explosivos em cadeia, portões e caminhões destrutíveis. A navegação da IA é recalculada na região destruída.

**Armas** — 10 armas (2 pistolas, 2 fuzis de assalto, 2 submetralhadoras, escopeta, rifle de precisão, fuzil de atirador, metralhadora pesada) + faca, granadas de fragmentação, fumaça e atordoamento, C4 nas missões. Cada arma tem dano, cadência, alcance, queda de dano, recuo vertical/horizontal com recuperação, dispersão (quadril, mira, movimento, rajada), modos de disparo (auto, rajada, semi, ferrolho, bomba), recarga tática e vazia (escopeta cartucho a cartucho). Acessórios: miras (red dot, 3x, 6x com luneta), supressor, compensador, freio de boca, empunhaduras, laser, carregadores estendido/rápido. Munições FMJ, perfurante (AP) e ponta oca (HP). Sete camuflagens desbloqueadas por desempenho.

**Física e balística** — projéteis simulados com velocidade e gravidade (queda de bala no rifle de precisão), penetração por material e espessura (madeira atravessa, concreto não, AP atravessa tijolo), ricochete em ângulos rasos, dano por região (cabeça, tórax, abdômen, pernas), armadura, dano de queda, atropelamento. Movimento: andar, correr, agachar, pular, subir escadas e degraus, paraquedas.

**IA** — percepção por visão (campo de visão, distância, luz do dia, neblina, fumaça, lanterna e clarão do disparo) e audição (tiros, passos, explosões, impactos). Esquadrões compartilham alvos por rádio e dividem papéis: supressão, flanco pela esquerda/direita e assalto. Procuram cobertura que realmente os esconda da ameaça, espiam para atirar, recuam quando feridos ou em desvantagem, fogem de granadas, lançam granadas em quem está entrincheirado e fumaça ao recuar, investigam ruídos e evitam fogo amigo. O `Director` observa o estilo do jogador (parado, agressivo, atirador de longe) e ajusta as táticas. Aliados seguem o jogador, comunicam decisões ("Flanqueando pela esquerda!", "Granada!") e obedecem ordens (`Q`). Bots distantes no Battle Royale usam simulação simplificada (LOD).

**Campanha** — quatro operações com briefing, diálogos de rádio (com voz sintetizada opcional), personagens com personalidade (Vega, Rook, Faísca, Krane, Equipe Sombra), objetivos variados (infiltrar, eliminar, plantar C4, defender, coletar, resgatar e escoltar), checkpoints salvos e duas escolhas que mudam a história: resgatar a Equipe Sombra (missão na floresta; eles lutam ao seu lado no final) ou interceptar o comboio (missão no deserto; os inimigos da fortaleza aparecem no radar); e prender ou executar o General Krane, chefe com fases e reforços, o que define o epílogo.

**Modos** — mata-mata (5v5/10v10), dominação de A/B/C, captura de maleta, sobrevivência (ondas crescentes, chefe a cada 5, loja com armas, coletes, melhorias e aliados, recordes locais) e Battle Royale (paraquedas, saque de armas/munição/coletes/kits/granadas, zona que encolhe em 6 fases com dano crescente, jipes dirigíveis, placar de colocações).

**Progressão** — XP por abates, tiros na cabeça, objetivos e vitórias; 50 níveis com desbloqueio de armas, acessórios e munições; desafios diários; 10 conquistas; ranking competitivo (MMR, de Recruta a Elite Zero) nas partidas multijogador; estatísticas por arma; personalização do operador com prévia 3D (as cores valem para o seu esquadrão).

**Interface** — menu principal, arsenal (inventário, acessórios, munição, camuflagem, atributos), configurações gráficas (qualidade, escala de renderização, sombras, distância de visão, partículas, FOV, neblina), áudio e controles, HUD completo (vida, armadura, munição, mira dinâmica, marcador de acerto, direção do dano, feed de abates, rádio, bússola, minimapa, mapa grande, placar, barra de chefe, luneta, efeito de atordoamento e supressão), pausa e tela de resultados.

## Limites atuais (honestamente)

- **Online exige o servidor do jogo** (`npm start`); não há antitrapaça nem entrada no meio da partida, e a campanha não é cooperativa.
- Modelos são low-poly procedurais com animação procedural — não há personagens esculpidos, captura de movimento nem animações esqueléticas.
- O terreno é plano (com aterros e túneis cobertos); não há subsolo com múltiplos níveis para a IA. Os bots navegam só no térreo; o jogador pode subir em telhados, segundos andares e torres.
- Veículos apenas no Battle Royale; bots não dirigem.

## Testes e desempenho

```bash
npm test         # 13 testes unitários (balística, armas, navegação A*, progressão)
npm run e2e      # Playwright: menus, todos os modos, campanha nos dois ramos, benchmark e online (2 navegadores)
```

O benchmark também roda no navegador em `index.html?bench`. Medição no Chromium headless (simulação = IA + física + balística, sem renderização):

| Cenário | Bots | Simulação média | p95 | Draw calls (cena) |
|---|---|---|---|---|
| Mata-mata 5x5 | 9 | 0,09–0,3 ms | 0,2–1,2 ms | 216 |
| Mata-mata 10x10 (neblina) | 19 | 0,16–0,22 ms | 0,3–0,5 ms | 475 |
| Dominação 6x6 (chuva) | 11 | 0,17–0,22 ms | 0,3–0,5 ms | 239 |
| Battle Royale | 99 | 0,76–0,82 ms | 1,3–1,7 ms | 348 |

A simulação inteira usa menos de 2 ms dos 16,7 ms de um quadro a 60 FPS. A taxa de quadros real depende da GPU; o renderizador por software do ambiente de testes não serve para medi-la, então ela não foi medida em hardware real.

Otimizações: geometria estática mesclada por material; objetos destrutíveis mesclados por região e reconstruídos só quando algo quebra (o Distrito 10x10 caiu de ~2.450 para ~475 draw calls); soldados com 12 malhas e cores de vértice compartilhadas; árvores instanciadas; hash espacial com travessia DDA para raycasts, fila de pathfinding com orçamento por quadro, IA com LOD, culling de modelos, polifonia limitada no áudio, partículas em buffers fixos.

## Estrutura

```
operation-zero/
├── index.html · css/style.css · vendor/three.module.min.js (r170, MIT)
├── src/
│   ├── main.js                 ponto de entrada
│   ├── core/                   Game (laço e orquestração), Input, Audio, Save, Events, Benchmark
│   ├── world/                  World (colisão, raycast, destruição), MapBuilder, maps, NavGrid, Weather, Textures
│   ├── combat/                 weapons (dados), WeaponInstance, Ballistics, Throwables
│   ├── entities/               Combatant, SoldierModel, Viewmodel, Vehicle
│   ├── ai/                     AIManager, AIBrain, Squad, Director
│   ├── net/                    Net (anfitrião/cliente, snapshots, saguão)
│   ├── modes/                  Mode, Multiplayer (TDM/Dominação/Captura), Survival, BattleRoyale, Campaign, campaignData, ClientMode (online)
│   ├── progression/            Progression (XP, níveis, desafios, conquistas, ranking)
│   └── ui/                     HUD, Menus, TouchControls (celular)
├── tests/unit · tests/e2e
├── manifest.webmanifest · sw.js · icons/   PWA (instalação e modo offline)
└── tools/serve.mjs              servidor estático + salas WebSocket · tools/gen-sw.mjs (atualiza o cache offline)
```

**Para adicionar conteúdo:** uma arma nova é uma entrada em `src/combat/weapons.js`; um mapa novo é uma função em `src/world/maps.js` usando o `MapBuilder`; uma missão nova é um objeto em `src/modes/campaignData.js`; um modo novo é uma subclasse de `Mode` registrada em `src/modes/index.js`.
