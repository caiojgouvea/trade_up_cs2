// Dicionário inglês -> português. Chaves são o texto em inglês usado
// diretamente no JSX (a "fonte da verdade"); qualquer string sem entrada
// aqui simplesmente aparece em inglês quando o idioma é pt.
export const PT = {
  Suggestions: "Sugestões",
  Manipulated: "Manipulados",
  History: "Histórico",
  "Manual comparator": "Comparador manual",
  "Collections & Prices": "Coleções & Preços",
  "Good deal": "Bom contrato",
  Risky: "Arriscado",
  Trap: "Furada",

  // Suggestions.jsx
  "average across wears": "média entre wears",
  "estimated price": "preço estimado",
  never: "nunca",
  "risk-free": "sem risco",
  "Trade-Up Suggestions": "Sugestões de Trade-Up",
  "Computed automatically from already-synced collections: for each collection and rarity, the cheapest available input against the possible outputs of the next rarity. Only single-collection trade-ups for now (mixing collections is elsewhere).":
    "Calculado automaticamente a partir das coleções já sincronizadas: pra cada coleção e raridade, o input mais barato disponível contra as saídas possíveis da raridade seguinte. Por enquanto só considera trade-ups de uma coleção só (misturar coleções está em outra aba).",
  "Syncing collections...": "Sincronizando coleções...",
  "Sync all collections": "Sincronizar todas as coleções",
  collections: "coleções",
  "fetching now": "buscando agora",
  "error(s)": "erro(s)",
  "Conservative mode:": "Modo conservador:",
  "returns are net of the estimated Steam Market fee and only use the direct price of the predicted wear for every output. No estimated prices, no averaging across wears.":
    "o retorno é líquido após a taxa estimada do Mercado Steam e só usa o preço direto do wear previsto para todas as saídas. Sem preço aproximado, sem média entre wears.",
  "Min. liquidity (active listings)": "Liquidez mín. (anúncios ativos)",
  "Normal + StatTrak": "Normal + StatTrak",
  "Normal only": "Só Normal",
  "StatTrak only": "Só StatTrak",
  "Any output rarity": "Qualquer raridade de saída",
  Output: "Saída",
  "Any risk": "Qualquer risco",
  "High risk (45%+)": "Risco alto (45%+)",
  "Exact 50/50": "50/50 exato",
  "Filter by collection or skin...": "Filtrar por coleção ou skin...",
  Cost: "Custo",
  "min.": "mín.",
  "max.": "máx.",
  "Risk %": "Risco %",
  "Calculating...": "Calculando...",
  'No suggestions yet. Sync at least one collection on the "Collections & Prices" tab (or click "Sync all collections" above) — it needs a price at two consecutive rarities in the same collection to compute anything.':
    'Nenhuma sugestão ainda. Sincroniza pelo menos uma coleção na aba "Coleções & Preços" (ou clica em "Sincronizar todas as coleções" acima) — precisa de preço em duas raridades seguidas dentro da mesma coleção pra calcular alguma coisa.',
  "Risk × Return": "Risco × Retorno",
  Risk: "Risco",
  "Loss risk (%)": "Risco de perda (%)",
  Return: "Retorno",
  "Expected return (%)": "Retorno esperado (%)",
  "bubble size = cost": "tamanho da bolha = custo",
  Collection: "Coleção",
  Rarity: "Raridade",
  "Cheapest input": "Entrada mais barata",
  "Best case": "Melhor caso",
  "Net profit if the most expensive possible output comes out": "Lucro líquido se sair a saída mais cara possível",
  Expected: "Esperado",
  "Average weighted by the odds of each output": "Média ponderada pelas chances de cada saída",
  "Worst case": "Pior caso",
  "Net profit if the cheapest possible output comes out": "Lucro líquido se sair a saída mais barata possível",
  "Running this contract 10x, how many hits (an output that covers the cost) you need to not end up at a loss":
    "Rodando esse contrato 10x, quantos acertos (saída que cobre o custo) você precisa pra não sair no prejuízo",
  "Break-even in 10x": "Empate em 10x",
  Verdict: "Veredito",
  "Float for best output": "Float p/ melhor saída",
  "Possible outputs": "Saídas possíveis",
  Favorite: "Favoritar",
  Souvenir: "Lembrança",
  "Open in market — Steam changed the site: StatTrak™/Souvenir and wear are now filters within the same page, not chosen by the link. Set them manually before buying.":
    "Abrir no mercado — a Steam mudou o site: StatTrak™/Lembrança e wear agora são filtros dentro da mesma página, não escolhidos pelo link. Marque manualmente antes de comprar.",
  inputs: "inputs",
  "Hits = outputs whose net value covers the cost. Assumes constant average win and average loss per attempt (approximation).":
    "Acertos = saídas cujo valor líquido cobre o custo. Assume ganho médio e perda média constantes a cada tentativa (aproximação).",
  "no data": "sem dado",
  listings: "anúncios",
  more: "mais",
  "Net expected value": "Valor esperado líquido",
  "Net expected profit": "Lucro líquido esperado",
  "gross value before fee": "valor bruto antes da taxa",
  "possible outputs": "saídas possíveis",
  "odds each": "de chance cada",
  "Return already deducts the estimated Steam Market fee (15% estimate; final rounding may vary a few cents). Only outputs whose predicted wear has a direct price and enough liquidity are included.":
    "Retorno já desconta a taxa do Mercado Steam (estimativa de 15%; o arredondamento final pode variar alguns centavos). Só entram saídas cujo wear previsto tem preço direto e liquidez suficiente.",
  "Running this contract 10x": "Rodando esse contrato 10x",
  "total cost": "custo total",
  "average win": "ganho médio",
  "per hit": "por vez",
  "average loss": "perda média",
  "per miss": "por vez",
  "No output covers the cost — no number of hits makes this worth it.":
    "Nenhuma saída cobre o custo — não tem número de acertos que compense.",
  "No output results in a loss — no risk of losing across all 10x.":
    "Nenhuma saída dá prejuízo — sem risco de perder no total das 10x.",
  "Hitting at least": "Acertando pelo menos",
  "of 10": "de 10",
  "attempts already gets you to break-even or profit": "tentativas, você já sai no positivo ou empatado",
  "expected profit": "lucro esperado",
  "No float data for this input — the output prices here are an average across the possible wears (approximation).":
    "Sem dado de float pra essa entrada — os preços das saídas aqui são uma média entre os wears possíveis (aproximação).",
  "Best reachable output": "Melhor saída alcançável",
  for: "por",
  "needs average input float between": "precisa de float médio de entrada entre",
  and: "e",
  "Close float calculator": "Fechar calculadora de float",
  "Float calculator": "Calculadora de float",
  "Open the output in the market — check the real price and liquidity before deciding. Steam requires you to select StatTrak™ and the right wear on the page itself.":
    "Abrir a saída no mercado — confira o preço e a liquidez real antes de decidir. A Steam pede pra marcar StatTrak™ e o wear certo na própria página.",
  market: "mercado",
  net: "líquido",

  // ManipulatedSuggestions.jsx
  "Manipulated Trade-Ups": "Trade-ups manipulados",
  "Instead of buying 10 copies of the cheapest input, mixes two different units (different wears and/or skins, same rarity and collection) to steer the average input float into a cheaper-to-reach range. The output float is deterministic, so this changes on purpose which wear each possible output will have. Only shows up here when the mix beats the uniform strategy — most collections gain nothing from mixing.":
    "Em vez de comprar 10 cópias do input mais barato, mistura duas unidades diferentes (wears e/ou skins diferentes, mesma raridade e coleção) pra pilotar o float médio de entrada pra uma faixa mais barata de atingir. O float de saída é determinístico, então isso muda de propósito qual wear cada saída possível vai ter. Só aparece aqui quando a mistura bate a estratégia uniforme — a maioria das coleções não ganha nada misturando.",
  "Warning:": "Atenção:",
  "the float used is the worst edge of each wear's range (Steam doesn't expose the exact float of a listing before buying), so the result is an estimate, not a guarantee — the real wear of a specific listing can vary within the range.":
    "o float usado é o pior limite da faixa de cada wear (Steam não expõe o float exato de cada anúncio antes de comprar), então o resultado é uma estimativa, não garantia — o wear real de cada anúncio específico pode variar dentro da faixa.",
  "Careful when buying:": "Cuidado ao comprar:",
  'the mix only works if you buy exactly the wear (and StatTrak™, when marked) shown for each leg — getting it wrong destroys the calculated float. The "open in market" link takes you to the right weapon+skin page, but Steam changed the site:':
    'a mistura só funciona se você comprar exatamente o wear (e StatTrak™, quando marcado) indicado de cada perna — errar isso destrói o float calculado. O link "abrir no mercado" leva pra página certa da arma+skin, mas a Steam mudou o site:',
  "StatTrak™ and each wear are now filters within the same page": "StatTrak™ e cada wear agora são filtros dentro da mesma página",
  'not separate pages — the link does NOT select this by itself. After opening, manually check the StatTrak™ filter (if the leg calls for it) and the exact wear before buying. This caught a user off guard once: they clicked a StatTrak leg\'s link and ended up buying the Normal version by mistake, because the page opens with Normal selected by default.':
    'não páginas separadas — o link NÃO seleciona isso sozinho. Depois de abrir, marque manualmente o filtro StatTrak™ (se a perna pedir) e o wear exato antes de comprar. Isso pegou um usuário de surpresa: ele clicou no link de uma perna StatTrak e acabou comprando a versão Normal por engano, porque a página abre com Normal marcado por padrão.',
  "Recalculates with the optimized pool. The previous result stays available until it finishes.":
    "Recalcula com o pool otimizado. O resultado anterior continua disponível até terminar.",
  "Recalculating...": "Recalculando...",
  Recalculate: "Recalcular",
  "Tests every wildcard item. Can take hours and keeps running on the server.":
    "Testa todos os itens coringa. Pode levar horas e continua rodando no servidor.",
  "Exhaustive search": "Busca exaustiva",
  Calculating: "Calculando",
  "in exhaustive mode": "em modo exaustivo",
  "in optimized mode": "em modo otimizado",
  "with minimum liquidity": "com liquidez mínima",
  "The page stays usable.": "A página continua utilizável.",
  "Cached result:": "Resultado em cache:",
  "minimum liquidity": "liquidez mínima",
  "exhaustive search": "busca exaustiva",
  "No mix is worth it with the data synced right now — most collections gain nothing from manipulating the float, the uniform cheapest input is already optimal.":
    "Nenhuma mistura vale a pena com os dados sincronizados agora — a maioria das coleções não ganha nada manipulando o float, o input mais barato uniforme já é ótimo.",
  "Input mix": "Mistura de entrada",
  "Cost (10x)": "Custo (10x)",
  "Uniform cost": "Custo uniforme",
  "Uses a wildcard from another collection to adjust the float — part of the output odds come from that other collection":
    "Usa coringa de outra coleção pra ajustar o float — parte da chance de saída vem dessa outra coleção",
  "Cross-collection": "Cross-coleção",
  wildcard: "coringa",
  "Open in market — set the StatTrak™ filter and right wear on the page, the link doesn't select it by itself":
    "Abrir no mercado — marque o filtro StatTrak™ e wear certo na página, o link não seleciona sozinho",
  "other collection": "outra coleção",
  "Return already deducts the estimated Steam Market fee (15% estimate). Only outputs with a direct price for the predicted wear are included.":
    "Retorno já desconta a taxa do Mercado Steam (estimativa de 15%). Só entram saídas com preço direto para o wear previsto.",
  Mix: "Mistura",
  "average relative float": "float relativo médio",
  "(a position between 0–1 within each input skin's own range, not the raw float — and it can land on a wear quite different from how it 'looks' on the output, if the output skin has a different float range than the input; based on the worst edge of each chosen wear, not the exact float of a specific listing).":
    "(posição entre 0–1 dentro da faixa própria de cada skin de entrada, não o float bruto — e pode virar um wear bem diferente do que \"parece\" na saída, se a skin de saída tiver faixa de float diferente da de entrada; meio da pior limite de cada wear escolhido, não o float exato de cada anúncio).",
  "Cost of": "Custo de",
  vs: "contra",
  "for the uniform strategy (10x the cheapest input)": "da estratégia uniforme (10x a entrada mais barata)",
  "which yields": "que rende",
  alone: "sozinha",
  "vs.": "contra",
  mixing: "misturando",
  "Cross-collection:": "Cross-coleção:",
  "legs come from": "pernas vêm de",
  "one of the legs is from": "uma das pernas é de",
  "not (only) from": "não (só) de",
  "The game rolls the output proportionally to how many of the 10 items came from each collection — so a real part of the odds (marked \"other collection\" below) come from there. This is expected, not a bug: it's the trade-off that makes the float cheaper to reach — the more collections mixed, the higher the risk, but sometimes the return too.":
    "O jogo sorteia a saída proporcional a quantos dos 10 itens vieram de cada coleção — então parte real da chance (marcada como \"outra coleção\" abaixo) sai de lá. Isso é esperado, não um erro: é a troca que faz o float ficar mais barato de atingir — quanto mais coleções misturadas, maior o risco, mas às vezes o retorno também.",
  "Buy exactly this (the link opens the weapon+skin page — set StatTrak™ and wear on the page before buying, the link doesn't pick it by itself):":
    "Comprar exatamente isso (o link abre a página da arma+skin — marque StatTrak™ e o wear na página antes de comprar, o link não escolhe sozinho):",
  each: "cada",

  // Pagination.jsx
  of: "de",
  page: "pág.",
  "Previous page": "Página anterior",
  "Next page": "Próxima página",

  // Custom/SuggestionsTooltip.jsx
  "Loss risk": "Risco de perda",
  "Expected return": "Retorno esperado",

  // TradeUpComparator.jsx
  "Give the contract a name.": "Dá um nome pro contrato.",
  "Total cost of the 10 inputs must be > 0.": "Custo total dos 10 inputs precisa ser > 0.",
  "Add at least 1 possible outcome with % and price.": "Adiciona pelo menos 1 resultado possível com % e preço.",
  "Trade-Up Comparator": "Comparador de Trade-Ups",
  "Register contracts you calculated yourself (cost of the 10 inputs + possible outcomes with % and market price) and compare risk against return in one place. Return uses the estimated net value after the Steam Market's 15% fee.":
    "Cadastre os contratos que você mesmo calculou (custo dos 10 inputs + resultados possíveis com % e preço de mercado) e compare risco contra retorno num só lugar. O retorno usa o valor líquido estimado após a taxa de 15% do Mercado Steam.",
  "New contract": "Novo contrato",
  "Contract name": "Nome do contrato",
  "e.g. Kilowatt Restricted → AK Inheritance": "ex: Kilowatt Restricted → AK Inheritance",
  "Total cost of the 10 inputs": "Custo total dos 10 inputs",
  "e.g. 180": "ex: 180",
  "Possible outcomes": "Resultados possíveis",
  Skin: "Skin",
  "e.g. AK Inheritance": "ex: AK Inheritance",
  Remove: "Remover",
  "Add outcome": "Adicionar resultado",
  "Save contract": "Salvar contrato",
  "No contracts registered yet. Fill in the form on the side to start comparing.":
    "Nenhum contrato cadastrado ainda. Preenche o formulário ao lado pra começar a comparar.",
  Contract: "Contrato",
  "Running this contract 10x, how many hits you need to not end up at a loss":
    "Rodando esse contrato 10x, quantos acertos você precisa pra não sair no prejuízo",
  "Delete contract": "Excluir contrato",
  "Warning: the probabilities add up to": "Atenção: as probabilidades somam",
  "not 100%. The calculation normalized automatically.": "não 100%. O cálculo normalizou automaticamente.",
  "gross value": "valor bruto",
  "Clear all contracts": "Limpar todos os contratos",

  // SuggestionHistory.jsx
  "Most recent": "Mais recente",
  "Findings history": "Histórico de achados",
  'Every "manipulated" contract (mixing inputs and/or collections) that has ever shown up in a recalculation run — manual or "exhaustive search" — stays logged here forever, even if the price changes later and it disappears from the current list. Trigger runs on the "Manipulated" tab to feed this history.':
    'Todo contrato "manipulado" (misturando entradas e/ou coleções) que já apareceu numa rodada de recálculo — manual ou "busca exaustiva" — fica registrado aqui pra sempre, mesmo que o preço mude depois e ele suma da lista atual. Dispare rodadas na aba "Manipulados" pra alimentar esse histórico.',
  "findings logged across": "achados registrados em",
  "run(s)": "rodada(s)",
  "first at": "primeira em",
  "last at": "última em",
  "Sort by": "Ordenar por",
  "Min. expected %": "Esperado mín. %",
  "Min. best case %": "Melhor caso mín. %",
  "Loading...": "Carregando...",
  'Nothing logged yet. Go to the "Manipulated" tab and click "Recalculate" or "Exhaustive search" at least once — each run feeds this history.':
    'Nada registrado ainda. Vá na aba "Manipulados" e clique em "Recalcular" ou "Busca exaustiva" pelo menos uma vez — cada rodada alimenta esse histórico.',
  Legs: "Pernas",
  "Found at": "Achado em",
  "Mixes more than one collection": "Mistura mais de uma coleção",
  "Open the output in the market — check the real price and liquidity before deciding.":
    "Abrir a saída no mercado — confira o preço e a liquidez real antes de decidir.",

  // FloatCalculator.jsx
  "None of the possible outputs have float data loaded yet.":
    "Nenhuma das saídas possíveis tem dado de float carregado ainda.",
  "Average relative input float": "Float médio relativo de entrada",
  "predicted output float": "float de saída previsto",
  "outside any known range": "fora de qualquer faixa conhecida",
  "matches the chosen target.": "bate com o alvo escolhido.",
  "With the wears already locked in on the legs (the exact float of each item within them doesn't matter), this mix can only reach an output float between":
    "Com os wears já travados nas pernas (não importa o float exato de cada item dentro deles), essa mistura só alcança float de saída entre",
  "is outside that, so changing the target in the selector won't change what you need to type, because no combination closes.":
    "está fora disso, então trocar o alvo no seletor não muda o que você precisa digitar, porque nenhuma combinação fecha.",
  "Output(s) this mix can reach": "Saída(s) que essa mistura consegue alcançar",
  'Pick one of these in "Target wear" to see the real numbers, or change a leg\'s wear to open other ranges.':
    'Escolhe um desses no "Wear alvo" pra ver os números reais, ou troca o wear de alguma perna pra abrir outras faixas.',
  "filled in": "preenchido(s)",
  "relative average accounting for each leg's range": "média relativa considerando a faixa de cada perna",
  "One or more legs have no float data — assuming a 0–1 range for them (may be wrong if this skin doesn't cover the whole range).":
    "Uma ou mais pernas não têm dado de float — assumindo faixa 0–1 pra elas (pode estar errado se essa skin não cobrir a faixa toda).",
  Missing: "Faltam",
  "To close on": "Pra fechar em",
  input: "entrada",
  remaining: "restante(s)",
  "float up to": "float até",
  minimum: "mínimo",
  "The limits above assume the average across the remaining legs stays balanced — you can offset a more worn item on one leg with a newer one on the same or another leg, as long as the overall relative average doesn't exceed the target.":
    "Os limites acima assumem que a média entre as pernas restantes fica equilibrada — dá pra compensar um item mais gasto numa perna com outro mais novo na mesma ou outra perna, contanto que a média relativa geral não passe do alvo.",
  "Target wear": "Wear alvo",
  "About float ranges": "Sobre as faixas de float",
  "Float ranges from 0 to 1 and defines the weapon's visual wear: the lower, the newer (Factory New); the higher, the more worn (Battle-Scarred). Each skin has its own min/max — that's why the ranges below are specific to":
    "O float vai de 0 a 1 e define o desgaste visual da arma: quanto mais baixo, mais nova (Factory New); quanto mais alto, mais gasta (Battle-Scarred). Cada skin tem seu próprio min/max — por isso as faixas abaixo são específicas de",
  "not the game's default ranges. What goes into the average isn't the raw float, it's its relative position within each input skin's own range.":
    "não as faixas padrão do jogo. O que entra na média não é o float bruto, é a posição relativa dele dentro da faixa própria de cada skin de entrada.",
  Wear: "Wear",
  "Float range": "Faixa de float",
  Price: "Preço",
  "no price": "sem preço",
  "raw floats (from the inspect link)": "floats brutos (do inspect link)",
  "this skin's range": "faixa dessa skin",
  "Raw floats (from the inspect link) of the input items": "Floats brutos (do inspect link) dos itens de entrada",
  "leave blank what you don't know": "deixe em branco o que não souber",

  // CollectionsExplorer.jsx
  estimated: "estimado",
  "Prices come from the Steam Community Market. The bulk listing uses an estimated price (USD, converted to the selected currency at the day's rate); the exact BRL price of a specific item can be checked on demand.":
    "Preços vindos do Steam Community Market. A listagem em massa usa preço estimado (USD convertido pra moeda selecionada pela cotação do dia); o preço exato em BRL de um item específico pode ser conferido sob demanda.",
  Collections: "Coleções",
  "Syncing...": "Sincronizando...",
  "Sync list from Steam": "Sincronizar lista do Steam",
  "Filter collections...": "Filtrar coleções...",
  "Re-sync list": "Re-sincronizar lista",
  items: "itens",
  updated: "atualizado",
  "Pick a collection from the list on the side.": "Escolhe uma coleção na lista ao lado.",
  "Rate used": "Cotação usada",
  "Fetching from Steam...": "Buscando no Steam...",
  "Fetch/update prices": "Buscar/atualizar preços",
  'No cached items yet for this collection. Click "Fetch/update prices" (this paginates the Steam Market slowly on purpose to avoid rate limiting — can take a few seconds up to 1 minute for large collections).':
    'Nenhum item em cache ainda pra essa coleção. Clica em "Buscar/atualizar preços" (isso pagina o Steam Market devagar de propósito pra não tomar rate limit — pode levar alguns segundos a até 1 minuto em coleções grandes).',
  "Filter by weapon or skin...": "Filtrar por arma ou skin...",
  Weapon: "Arma",
  Exterior: "Exterior",
  "Est. price": "Preço est.",
  "Exact price": "Preço exato",
  "Active listings": "Anúncios ativos",
  "Trade-up (10x of this item)": "Trade-up (10x deste item)",
  check: "conferir",
  Becomes: "Vira",
  risk: "risco",
  "Best output": "Melhor saída",
  "float between": "float entre",
};
