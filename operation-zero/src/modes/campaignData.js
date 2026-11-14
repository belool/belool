// ================================================================
// CAMPANHA "OPERAÇÃO ZERO" — roteiro, personagens e missões.
// A escolha no fim da Missão 2 ramifica a Missão 3 e altera a Missão 4;
// a decisão final sobre o General Krane define o epílogo.
// ================================================================

export const CHARACTERS = {
  vega: { name: 'Cap. Helena "Vega" Duarte', short: 'Vega', voice: 1, bio: 'Comandante da Força Zero. Fria sob pressão, fala pouco e nunca abandona ninguém.' },
  rook: { name: 'Sgt. Marcus "Rook" Almeida', short: 'Rook', voice: 0, bio: 'Veterano de quatro guerras. Rabugento, leal, carrega a Titan como se fosse uma pistola.',
    lines: { kill: ['Mais um pro saco.', 'Fica no chão!', 'Esse não levanta mais.'], hurt: ['Arranhão. Continua!', 'Já levei pior no café da manhã.'], reload: ['Recarregando, me cobre!'] } },
  faisca: { name: 'Kai "Faísca" Moreno', short: 'Faísca', voice: 2, bio: 'Engenheira e hacker. Sarcástica, genial com explosivos, péssima em seguir ordens.',
    lines: { kill: ['Desligado. Literalmente.', 'Bug corrigido.', 'Ctrl+Alt+Abatido.'], hurt: ['Ai! Isso vai pro relatório!', 'Tô sangrando no meu teclado...'], reload: ['Trocando o pente, segura aí!'] } },
  krane: { name: 'General Viktor Krane', short: 'Krane', voice: 0, bio: 'Ex-comandante da aliança, agora senhor da guerra com um exército privado e um arsenal roubado.' },
  lobo: { name: 'Ten. Caio "Lobo" Reis', short: 'Lobo', voice: 0, bio: 'Líder da Equipe Sombra, capturado em território inimigo.' },
  talia: { name: 'Cb. Tália Ferraz', short: 'Tália', voice: 2, bio: 'Atiradora de elite da Equipe Sombra.' },
};

export const MISSIONS = {
  m1: {
    id: 'm1', num: 1, name: 'Ponto Zero', map: 'refinery', time: 23.4, weather: 'rain',
    summary: 'Infiltrar a Refinaria Vulcano e destruir o bloqueador de sinal que cega a aliança.',
    briefing: [
      ['vega', 'Força Zero, aqui é Vega. Há três semanas o General Krane derrubou toda a nossa comunicação no setor.'],
      ['vega', 'A origem é um bloqueador de sinal escondido na Refinaria Vulcano. Sem ele fora do ar, ninguém sai vivo desta guerra.'],
      ['rook', 'Chuva, noite e uma refinaria cheia de combustível. Meu tipo de festa.'],
      ['faisca', 'Eu cuido do C4. Vocês cuidam de não me deixar levar um tiro na cara.'],
      ['vega', 'Entrem pelo sul, sem alarde. Boa caçada.'],
    ],
    start: [-10, -74], allies: ['rook', 'faisca'],
    groups: {
      gate: { count: 3, at: [0, -50], spread: 8, guard: true, obj: 1 },
      west: { count: 4, at: [-52, -35], spread: 9, obj: 2 },
      tunnel: { count: 2, at: [-30, 6], spread: 4, guard: true, obj: 3 },
      jammer: { count: 5, at: [52, 38], spread: 9, guard: true, obj: 4, roles: ['rifleman', 'rifleman', 'smg', 'breacher', 'marksman'] },
    },
    objectives: [
      { type: 'goto', at: [-18, -62], r: 7, text: 'Infiltre o perímetro sul', say: [['vega', 'Perímetro à frente. Mantenham a formação.']] },
      { type: 'eliminate', groups: ['gate'], text: 'Neutralize as sentinelas do escritório sul', say: [['rook', 'Três sentinelas no escritório. Pega a da esquerda que eu pego o resto.']] },
      { type: 'eliminate', groups: ['west'], text: 'Limpe o armazém oeste', say: [['faisca', 'Armazém oeste tem movimento. Cuidado com os barris vermelhos... ou use eles.']] },
      { type: 'goto', at: [-34, 0], r: 6, text: 'Atravesse o túnel de dutos', say: [['vega', 'O túnel de dutos leva direto ao pátio central. Silêncio lá dentro.']] },
      { type: 'destroy', at: [52, 36], text: 'Plante C4 no bloqueador de sinal (armazém leste)', say: [['faisca', 'É ali. Me leva até o bloqueador e aperta [E]. O resto é mágica.']] },
      { type: 'defend', at: [40, 10], r: 14, duration: 45, waves: [{ count: 4, from: [60, 75] }, { count: 4, from: [-60, 75] }, { count: 5, from: [0, 75] }], text: 'Resista ao contra-ataque', say: [['vega', 'Sinal restabelecido! Eles sabem que vocês estão aí. Aguentem até a extração ser liberada!']] },
      { type: 'goto', at: [-68, -68], r: 7, text: 'Chegue ao ponto de extração', say: [['vega', 'Helicóptero a caminho. Ponto de extração no canto sudoeste!']] },
    ],
    outro: [['vega', 'Bom trabalho, Zero. Pela primeira vez em semanas, conseguimos ouvir o inimigo.'], ['rook', 'E o que eles estão dizendo?'], ['vega', 'Que Krane está mudando o quartel-general. E que ele tem prisioneiros.']],
    next: 'm2',
  },
  m2: {
    id: 'm2', num: 2, name: 'Cinzas da Cidade', map: 'district', time: 8.5, weather: 'fog',
    summary: 'Romper o bloqueio no Distrito 9, defender a praça e recuperar a inteligência de Krane.',
    briefing: [
      ['vega', 'As interceptações apontam para um posto avançado no Distrito 9. Krane guarda ali os planos da próxima ofensiva.'],
      ['faisca', 'Neblina, prédios em ruínas, franco-atiradores... adoro um passeio na cidade.'],
      ['rook', 'Fiquem longe das janelas. E das ruas. E de tudo.'],
      ['vega', 'Rompam o bloqueio, segurem a praça até o blindado chegar e tragam os documentos.'],
    ],
    start: [0, -72], allies: ['rook', 'faisca'],
    groups: {
      block: { count: 5, at: [0, -30], spread: 12, obj: 1 },
      snipers: { count: 2, at: [-17, -50], spread: 4, guard: true, obj: 1, roles: ['marksman', 'marksman'] },
      hq: { count: 6, at: [50, 50], spread: 8, guard: true, obj: 3, spawnAt: 3, roles: ['rifleman', 'breacher', 'smg', 'rifleman', 'heavy', 'marksman'] },
    },
    objectives: [
      { type: 'goto', at: [0, -45], r: 8, text: 'Avance pela avenida principal', say: [['rook', 'Movimento nas janelas. Atiradores!']] },
      { type: 'eliminate', groups: ['block', 'snipers'], text: 'Rompa o bloqueio inimigo', say: [['vega', 'Bloqueio confirmado. Abram caminho até a praça.']] },
      { type: 'defend', at: [0, 2], r: 12, duration: 60, waves: [{ count: 4, from: [0, 72] }, { count: 4, from: [-66, 40] }, { count: 4, from: [66, 40] }, { count: 3, from: [0, 72], roles: ['heavy', 'breacher', 'breacher'] }], text: 'Defenda a praça até a chegada do blindado', say: [['vega', 'Blindado a 60 segundos. Segurem a praça!']] },
      { type: 'collect', at: [50, 50], text: 'Recupere a inteligência no prédio nordeste', say: [['faisca', 'Os documentos estão no prédio nordeste. Eu hackeio, vocês atiram.']] },
      {
        type: 'choice', text: 'Decida o próximo passo da Força Zero',
        say: [['vega', 'Os documentos revelam duas coisas: a Equipe Sombra está viva, presa na Floresta Negra... e um comboio de Krane cruza o Posto Oásis com os códigos da fortaleza.'], ['vega', 'Não temos homens para as duas operações. A decisão é sua, Zero.']],
        options: [
          { label: 'Resgatar a Equipe Sombra', desc: 'Salvar Lobo e Tália na Floresta Negra. Eles lutarão ao seu lado no ataque final.', set: { path: 'rescue' }, next: 'm3a' },
          { label: 'Interceptar o comboio', desc: 'Destruir o comboio no Posto Oásis e roubar os códigos. A fortaleza ficará exposta, mas a Sombra ficará para trás.', set: { path: 'convoy' }, next: 'm3b' },
        ],
      },
    ],
    outro: [['rook', 'Seja o que for que você decidiu... espero que consiga dormir com isso.']],
  },
  m3a: {
    id: 'm3a', num: 3, name: 'Floresta Negra', map: 'forest', time: 5.6, weather: 'rain',
    summary: 'Resgatar a Equipe Sombra num acampamento escondido na mata.',
    briefing: [
      ['vega', 'A Equipe Sombra está num acampamento na mata, a noroeste. Lobo e Tália, vivos por enquanto.'],
      ['faisca', 'Recomendo um supressor. Nada assusta mais um guarda do que um amigo caindo em silêncio.'],
      ['rook', 'E nada assusta mais um amigo do que eu atirando com a Titan. Vamos.'],
    ],
    start: [0, -82], allies: ['rook', 'faisca'],
    groups: {
      patrol: { count: 4, at: [-10, -25], spread: 15, obj: 1 },
      camp: { count: 6, at: [-46, 42], spread: 8, guard: true, obj: 2, roles: ['rifleman', 'rifleman', 'smg', 'breacher', 'marksman', 'heavy'] },
      ambush: { count: 7, at: [10, -20], spread: 14, spawnAt: 4, obj: 4 },
    },
    objectives: [
      { type: 'goto', at: [-15, -45], r: 8, text: 'Avance pela mata', say: [['vega', 'Patrulhas na trilha central. Usem as árvores.']] },
      { type: 'eliminate', groups: ['patrol'], text: 'Elimine a patrulha da trilha' },
      { type: 'eliminate', groups: ['camp'], text: 'Tome o acampamento das cabanas', say: [['rook', 'Cabanas de madeira. Bala atravessa fácil — pros dois lados.']] },
      { type: 'rescue', at: [-50, 40], hostages: ['lobo', 'talia'], text: 'Liberte a Equipe Sombra' },
      { type: 'goto', at: [0, -80], r: 8, escort: true, text: 'Escolte a Equipe Sombra até a extração', say: [['lobo', 'Achei que tinham esquecido da gente.'], ['vega', 'Nunca. Contato no caminho, tropas de reação rápida!']] },
    ],
    outro: [['lobo', 'Devemos a vida a vocês. Quando forem atrás de Krane, a Sombra vai junto.']],
    next: 'm4',
  },
  m3b: {
    id: 'm3b', num: 3, name: 'Posto Oásis', map: 'desert', time: 13, weather: 'clear',
    summary: 'Destruir o comboio de Krane e roubar os códigos da fortaleza.',
    briefing: [
      ['vega', 'O comboio parou no Posto Oásis para reabastecer. Três caminhões, e o Coronel Saad com os códigos.'],
      ['faisca', 'Três caminhões, três cargas de C4. Matemática simples.'],
      ['rook', 'Sol a pino e areia no olho. Lembra por que eu odeio o deserto.'],
    ],
    start: [0, -80], allies: ['rook', 'faisca'],
    structures: [
      { truck: [-60, 19] }, { truck: [27, 60] }, { truck: [-27, -60] },
    ],
    groups: {
      t1: { count: 3, at: [-58, 24], spread: 6, guard: true, obj: 1 },
      t2: { count: 3, at: [30, 54], spread: 6, guard: true, obj: 1 },
      t3: { count: 3, at: [-30, -54], spread: 6, guard: true, obj: 1 },
      saad: { count: 1, at: [0, 2], spread: 1, guard: true, obj: 2, boss: { name: 'Coronel Saad', health: 350, armor: 60, role: 'breacher' } },
      village: { count: 6, at: [0, 0], spread: 16, guard: false, obj: 2, spawnAt: 1 },
    },
    objectives: [
      { type: 'goto', at: [0, -62], r: 8, text: 'Aproxime-se do Posto Oásis', say: [['vega', 'Comboio dentro e fora da muralha. Escolham a ordem.']] },
      { type: 'destroy', targets: [[-60, 16], [27, 57], [-27, -57]], text: 'Destrua os 3 caminhões do comboio', say: [['faisca', 'Encosta no caminhão e aperta [E]. Depois corre.']] },
      { type: 'eliminate', groups: ['saad', 'village'], text: 'Elimine o Coronel Saad e recupere os códigos', say: [['vega', 'Saad está na casa central. Ele não pode escapar com os códigos!']] },
      { type: 'goto', at: [0, -80], r: 8, text: 'Retorne à extração', say: [['faisca', 'Códigos baixados. A fortaleza de Krane acabou de virar um livro aberto.']] },
    ],
    outro: [['vega', 'Com esses códigos veremos cada sentinela de Krane. Mas a Sombra... não houve outra escolha.']],
    next: 'm4',
  },
  m4: {
    id: 'm4', num: 4, name: 'Fortaleza Krane', map: 'fortress', time: 22, weather: 'storm',
    summary: 'Invadir a fortaleza e confrontar o General Krane.',
    briefing: [
      ['vega', 'É agora. Krane está na fortaleza com o que restou da Legião. Uma tempestade cobre a aproximação.'],
      ['krane', 'Força Zero... vocês me custaram uma refinaria e uma cidade. Venham buscar o resto.'],
      ['rook', 'Ele fala demais. Vamos calar a boca dele.'],
    ],
    start: [0, -84], allies: ['rook', 'faisca'],
    structures: [{ gate: [0, -60] }],
    groups: {
      outer: { count: 5, at: [0, -70], spread: 22, obj: 0 },
      walls: { count: 3, at: [0, -52], spread: 10, guard: true, obj: 2 },
      courtyard: { count: 8, at: [0, -15], spread: 22, obj: 2, roles: ['rifleman', 'rifleman', 'smg', 'heavy', 'breacher', 'marksman', 'rifleman', 'smg'] },
      krane: { count: 1, at: [0, 32], spread: 1, guard: true, obj: 3, spawnAt: 3, boss: { name: 'General Krane', health: 1600, armor: 100, role: 'heavy', krane: true } },
      guard: { count: 4, at: [0, 28], spread: 7, guard: true, obj: 3, spawnAt: 3, roles: ['breacher', 'rifleman', 'smg', 'heavy'] },
    },
    objectives: [
      { type: 'eliminate', groups: ['outer'], text: 'Elimine as patrulhas externas', say: [['vega', 'Patrulhas do lado de fora da muralha. Limpem a área.']] },
      { type: 'destroy', at: [0, -61.6], text: 'Exploda o portão principal', say: [['faisca', 'Portão blindado. Nada que um pouco de C4 não resolva.']] },
      { type: 'eliminate', groups: ['walls', 'courtyard'], text: 'Tome o pátio interno', say: [['rook', 'Portão abaixo! Entrando, entrando!']] },
      { type: 'boss', groups: ['krane', 'guard'], text: 'Confronte o General Krane no QG', say: [['krane', 'Bem-vindos à minha casa. Vocês não vão sair dela.']] },
    ],
    next: null,
  },
};

export const CAMPAIGN_ORDER = ['m1', 'm2', ['m3a', 'm3b'], 'm4'];

export function epilogue(choices) {
  const lines = [];
  lines.push(choices.path === 'rescue'
    ? 'A Equipe Sombra voltou para casa. Lobo e Tália lutaram na fortaleza e hoje treinam a nova geração da Força Zero.'
    : 'Os códigos do comboio expuseram toda a rede de Krane. A guerra acabou mais cedo — mas a Equipe Sombra nunca foi encontrada.');
  lines.push(choices.krane === 'capture'
    ? 'Krane foi levado a julgamento internacional. Seus crimes foram expostos ao mundo, e seus aliados caíram um a um.'
    : choices.krane === 'execute'
      ? 'Krane morreu naquela noite de tempestade. Sem um julgamento, seus segredos morreram com ele — e alguns de seus aliados ainda estão por aí.'
      : 'Krane caiu lutando. A Legião se desfez sem seu general.');
  lines.push('Operação Zero: concluída.');
  return lines;
}
