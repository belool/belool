# Operation Zero — Unreal Engine 5 (C++)

Porte do protótipo web (`../operation-zero`) para o Unreal Engine 5, em C++. Esta é a **etapa 1**: o mata-mata em equipes 5x5 contra bots, com os sistemas centrais já portados.

> **Importante:** este código foi escrito sem acesso a um Unreal Engine (o ambiente onde ele foi criado não tem a engine). Ele **ainda não foi compilado**. É provável que a primeira compilação aponte alguns erros pequenos de API. Mande o log de erros e eles serão corrigidos.

## Requisitos

- Unreal Engine **5.4 ou mais novo** (o projeto usa as configurações "Latest" de build, então 5.5/5.6 também servem).
- **Windows:** Visual Studio 2022 com "Desenvolvimento de jogos com C++" e o SDK do Windows.
- **Mac:** Xcode. **Linux:** o toolchain clang que vem com a engine.

## Como abrir e jogar

1. Abra a pasta `OperationZeroUE` e dê duplo clique em `OperationZero.uproject` (ou clique com o botão direito → *Generate Visual Studio project files* e compile `OperationZeroEditor` em *Development Editor*).
2. Quando o editor perguntar se quer compilar o módulo `OperationZero`, responda **Sim**. Se a compilação falhar, abra a solução no Visual Studio (ou rode o build pela linha de comando) e mande o erro.
3. O projeto abre no mapa vazio da engine (`/Engine/Maps/Entry`). Clique em **Play** (Alt+P): o `OZGameMode` constrói a Refinaria, o céu, a iluminação e os 9 bots em tempo de execução.

Nenhum asset binário (`.uasset`/`.umap`) é necessário: o mapa, as entradas (Enhanced Input), os soldados, as armas, os efeitos e os sons são gerados em C++ com as formas básicas da engine (`/Engine/BasicShapes`).

### Se o mapa `Entry` não existir na sua versão

Crie um nível vazio (*File → New Level → Empty Level*), salve como `Content/Maps/Refinaria`, e em *World Settings → GameMode Override* escolha `OZGameMode`. Atualize `GameDefaultMap`/`EditorStartupMap` em `Config/DefaultEngine.ini`.

### Navegação dos bots

A malha de navegação é gerada em tempo de execução ao redor dos personagens (navigation invokers, configurados em `DefaultEngine.ini`). Se ela não aparecer, os bots usam direção direta com desvio de obstáculos. Para a melhor navegação, adicione um **Nav Mesh Bounds Volume** cobrindo ±9.000 cm no nível salvo.

## Controles

| Ação | Tecla | Ação | Tecla |
|---|---|---|---|
| Mover | W A S D | Recarregar | R |
| Correr / prender respiração na luneta | Shift | Trocar arma | 1 / 2 / roda |
| Agachar (correndo = deslizar) | C / Ctrl | Modo de disparo | B |
| Pular / escalar obstáculo baixo | Espaço | Granada | G |
| Atirar / mirar | Mouse esq. / dir. | Faca | V |

## O que já foi portado

| Sistema | Arquivos | Equivalente web |
|---|---|---|
| Arsenal orientado a dados (11 armas, mesmos números de dano, cadência, recuo, dispersão, penetração, zoom) | `OZTypes.h`, `OZWeapons.cpp` | `combat/weapons.js` |
| Personagem único para jogador e bots (intenções), correr, agachar, deslizar, escalar, recuo com recuperação, dispersão dinâmica, mira com zoom, respiração na luneta, regiões de dano (cabeça/tórax/abdômen/pernas), armadura, regeneração | `OZCharacter.*` | `entities/Combatant.js` |
| Balística: projéteis com velocidade e queda, penetração por material × espessura, supressão por tiro próximo (o ricochete ainda não foi portado) | `OZBallistics.*` | `combat/Ballistics.js` |
| IA tática: visão (campo e linha de visão), audição, tempo de reação, erro de mira que diminui ao rastrear, cobertura que esconde da ameaça, papéis (assalto, supressão, flanco), recuo, granadas, fuga de granadas, rajadas, sem fogo amigo, comunicação de contatos com a equipe | `OZAIController.*`, `OZGameMode.*` | `ai/*.js` |
| Mata-mata 5x5: equipes, renascimento longe dos inimigos, placar, limite de 50 abates, 10 minutos, feed de abates, rádio da equipe | `OZGameMode.*` | `modes/Multiplayer.js` |
| Mapa Refinaria Vulcano: armazéns, escritórios de 2 andares com escadas, tanques, contêineres, túneis, torres, perímetro; destrutíveis (caixas, vidros, paredes de tijolo que cedem a explosivos, barris explosivos em cadeia) | `OZMapBuilder.*`, `OZBlock.*` | `world/maps.js`, `MapBuilder.js` |
| Iluminação: sol com sombras, céu físico, luz ambiente em tempo real, neblina, nuvens volumétricas, pós-processamento (bloom, vinheta, granulação, saturação); Lumen | `OZMapBuilder::Lighting` | `world/Weather.js`, `fx/PostFX.js` |
| Efeitos: traçantes, clarão do cano com luz, faíscas, poeira, sangue, explosões, destroços, cápsulas, marcas de bala | `OZEffects.*` | `fx/Effects.js` |
| Áudio sintetizado (sem arquivos) com atenuação 3D | `OZSound.*` | `core/Audio.js` |
| HUD: mira dinâmica, marcador de acerto, direção do dano, vida/armadura, munição, placar, tempo, feed, rádio, minimapa, luneta, telas de morte e fim | `OZHUD.*` | `ui/HUD.js` |
| Granada de fragmentação com quique e dano por linha de visão | `OZGrenade.*` | `combat/Throwables.js` |

## O que ainda não foi portado (próximas etapas)

1. **Etapa 2:** menus (UMG), configurações, arsenal com acessórios e munições, progressão (XP, níveis, desafios, ranking) com `USaveGame`; fumaça e atordoamento; recompensas por sequência (radar/artilharia).
2. **Etapa 3:** demais mapas (Distrito 9, Floresta, Deserto, Fortaleza), ciclo dia/noite e clima; dominação, captura, sobrevivência.
3. **Etapa 4:** campanha (missões, diálogos, escolhas, chefe Krane), Battle Royale (100 jogadores, zona, saque, veículos com Chaos Vehicles).
4. **Etapa 5:** multijogador online com a replicação nativa do Unreal (o desenho de "intenções" já separa quem controla de quem simula) e controles de toque para mobile.

Também é natural, no Unreal, trocar as formas básicas por personagens e armas de verdade: os pontos de troca estão concentrados em `OZCharacterVisuals.cpp` (corpo e arma em 1ª pessoa) e `OZMapBuilder.cpp` (cenário). Com um *Skeletal Mesh* e *Animation Blueprint* (por exemplo os do template de primeira pessoa ou da Fab), basta substituir `BuildBody/AnimateBody`.

## Estrutura

```
OperationZeroUE/
├── OperationZero.uproject
├── Config/                     DefaultEngine.ini (mapa, GameMode, Lumen, navegação), DefaultInput.ini, DefaultGame.ini
└── Source/
    ├── OperationZero.Target.cs · OperationZeroEditor.Target.cs
    └── OperationZero/
        ├── OperationZero.Build.cs
        ├── Public/   OZTypes, OZShapes, OZSound, OZEffects, OZBlock, OZBallistics, OZGrenade,
        │             OZCharacter, OZAIController, OZGameMode, OZMapBuilder, OZHUD
        └── Private/  implementações (+ OZCharacterVisuals.cpp, OZCharacterInput.cpp)
```
