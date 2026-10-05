// Modelo simplificado do ciclo de retrabalho (ilustrativo, NÃO é o modelo da Pugh-Roberts).
// Integração de Euler, unidade de tempo = mês. Exporta simulate(cenario) para o gerador do deck.
// Uso direto: node simulacao.js  -> imprime um resumo dos dois cenários.

const P = {
  escopo: 1000,          // tarefas do projeto
  prazo: 36,             // prazo contratual (meses)
  p0: 1.0,               // tarefas / pessoa-mês (trabalhador experiente)
  q0: 0.80,              // fração de trabalho feito corretamente (qualidade base)
  tDesc: 9,              // tempo médio para descobrir retrabalho (meses)
  tContr: 3,             // tempo para ajustar a força de trabalho (meses)
  tAssim: 8,             // tempo para um novato virar experiente (meses)
  capEstaleiro: 45,      // pessoas antes de haver congestionamento
  tFadiga: 3,            // atraso para a fadiga acompanhar as horas extras (meses)
  taxaMud: 0.02,         // fração do trabalho pronto tornada obsoleta por mês pelas mudanças
  mudIni: 4, mudFim: 30, // janela das mudanças de projeto (meses)
  dt: 0.125,
};

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function simulate({ mudancas = false } = {}) {
  let aFazer = P.escopo, naoDesc = 0, feito = 0;
  let exp = P.escopo / (P.prazo * P.p0 * P.q0), nov = 0, fadiga = 0;  // equipe planejada
  let custo = 0, custoDireto = 0;
  const serie = [];
  let t = 0, fim = null;
  while (t <= 96) {
    const L = exp + nov;
    const progPercAtual = (feito + naoDesc) / P.escopo;
    const fracNov = L > 0 ? nov / L : 0;
    // Gestão: enxerga "feito" = feito + retrabalho não descoberto (síndrome dos 90%)
    const tempoRest = Math.max(P.prazo - t, 6);
    const Ldes = aFazer / (tempoRest * P.p0 * P.q0);   // planeja com qualidade nominal, ignora efeitos colaterais
    const pressao = L > 0 ? Ldes / L : 1;
    const horaExtra = clamp(0.5 * (pressao - 1), 0, 0.3);
    const foraSeq = clamp(0.4 * (pressao - 1), 0, 0.3);
    // Efeitos colaterais
    const fCong = L > P.capEstaleiro ? Math.pow(P.capEstaleiro / L, 0.7) : 1;
    const fExpProd = 1 - 0.5 * fracNov - 0.15 * fracNov;      // novatos rendem menos e consomem treinamento
    const fFadProd = 1 - 0.4 * fadiga;
    const prod = P.p0 * fExpProd * fCong * fFadProd;
    const qual = P.q0 * (1 - 0.35 * fracNov) * (1 - 0.5 * fadiga) * (1 - foraSeq);
    const execucao = Math.min(L * (1 + horaExtra) * prod, aFazer / P.dt);
    // Testes e provas de mar aceleram a descoberta quando o projeto "parece" quase pronto
    const tDescEf = clamp(P.tDesc * (1 - progPercAtual) / 0.15, 1.5, P.tDesc);
    const descoberta = naoDesc / tDescEf;
    // Mudanças da Marinha: tornam obsoleta uma fração do trabalho pronto a cada mês da janela
    const obsol = mudancas && t >= P.mudIni && t < P.mudFim ? P.taxaMud * feito : 0;
    // Força de trabalho
    const ajuste = (Ldes - L) / P.tContr;
    const contrat = Math.max(ajuste, 0);
    const demissNov = Math.min(Math.max(-ajuste, 0), nov / P.dt);
    const demissExp = Math.min(Math.max(-ajuste, 0) - demissNov, exp / P.dt);
    const assim = nov / P.tAssim;

    const progReal = feito / P.escopo;
    const progPerc = (feito + naoDesc) / P.escopo;
    if (Math.abs(t - Math.round(t)) < 1e-9) {
      serie.push({ t: Math.round(t), progReal, progPerc, L, custo, pressao, qual });
    }
    if (fim === null && progReal >= 0.99) fim = t;
    if (fim !== null && t >= fim) break;

    aFazer += (descoberta + obsol - execucao) * P.dt;
    naoDesc += (execucao * (1 - qual) - descoberta) * P.dt;
    feito += (execucao * qual - obsol) * P.dt;
    nov += (contrat - assim - demissNov) * P.dt;
    exp += (assim - demissExp) * P.dt;
    fadiga += ((horaExtra / 0.3) * 0.6 - fadiga) / P.tFadiga * P.dt;
    custo += L * (1 + horaExtra) * P.dt;
    custoDireto += (obsol / P.p0) * P.dt;  // refazer a mudança em si, com produtividade normal
    t += P.dt;
  }
  return { serie, fim, custo, custoDireto };
}

module.exports = { simulate, P };

if (require.main === module) {
  const base = simulate({ mudancas: false });
  const mud = simulate({ mudancas: true });
  const extra = mud.custo - base.custo;
  console.log(`Sem mudanças: conclusão no mês ${base.fim.toFixed(1)}, custo ${base.custo.toFixed(0)} pessoa-mês`);
  console.log(`Com mudanças: conclusão no mês ${mud.fim.toFixed(1)}, custo ${mud.custo.toFixed(0)} pessoa-mês`);
  console.log(`Custo direto das mudanças: ${mud.custoDireto.toFixed(0)} pm | custo extra total: ${extra.toFixed(0)} pm | efeito-cascata: ${(extra - mud.custoDireto).toFixed(0)} pm (${(extra / mud.custoDireto).toFixed(1)}x o direto)`);
  const at = mud.serie.find(s => s.progPerc >= 0.9);
  console.log(`Quando o progresso percebido chega a 90% (mês ${at.t}), o real é ${(at.progReal * 100).toFixed(0)}%`);
  console.log('pico de força de trabalho:', Math.max(...mud.serie.map(s => s.L)).toFixed(0), 'vs base', Math.max(...base.serie.map(s => s.L)).toFixed(0));
}
