/**
 * Tecverde · Registro de Erros — backup automático no Google Planilhas
 *
 * COMO USAR (uma vez):
 * 1. Crie uma planilha nova no Google Planilhas.
 * 2. Extensões → Apps Script → apague o conteúdo e cole este arquivo.
 * 3. Troque o valor de TOKEN abaixo por uma senha longa qualquer
 *    (ex.: gere uma em https://www.uuidgenerator.net/).
 * 4. Implantar → Nova implantação → tipo "App da Web":
 *      - Executar como: Eu
 *      - Quem pode acessar: Qualquer pessoa
 *    → Implantar → copie a URL do app da web.
 * 5. No Supabase: Database → Webhooks → Create webhook:
 *      - Tabela: ocorrencias | Eventos: INSERT e UPDATE
 *      - Tipo: HTTP Request | Método: POST
 *      - URL: <URL do app da web>?token=<SEU_TOKEN>
 * A aba OCORRENCIAS é criada automaticamente no primeiro envio.
 */

var TOKEN = 'TROQUE_ESTE_TOKEN_POR_UMA_SENHA_LONGA';
var NOME_ABA = 'OCORRENCIAS';
var CABECALHO = [
  'id', 'data', 'projeto', 'parede', 'casa', 'setor', 'tipo_erro',
  'ocorrencia', 'criticidade', 'status', 'observacao',
  'registrado_em', 'atualizado_em'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!e || !e.parameter || e.parameter.token !== TOKEN) {
      return resposta_({ ok: false, erro: 'token inválido' });
    }

    var corpo = JSON.parse(e.postData.contents);
    var registro = corpo.record;
    if (!registro || !registro.id) {
      return resposta_({ ok: false, erro: 'payload sem record.id' });
    }

    var aba = obterAba_();
    var linhaDados = [
      registro.id,
      registro.data || '',
      registro.projeto || '',
      registro.parede || '',
      registro.casa || '',
      registro.setor || '',
      registro.tipo_erro || '',
      registro.ocorrencia || '',
      registro.criticidade || '',
      registro.status || '',
      registro.observacao || '',
      registro.created_at || '',
      registro.updated_at || ''
    ];

    var linha = acharLinhaPorId_(aba, registro.id);
    if (corpo.type === 'UPDATE' && linha > 0) {
      aba.getRange(linha, 1, 1, linhaDados.length).setValues([linhaDados]);
    } else if (linha > 0) {
      // INSERT repetido (reenvio do webhook): atualiza em vez de duplicar
      aba.getRange(linha, 1, 1, linhaDados.length).setValues([linhaDados]);
    } else {
      aba.appendRow(linhaDados);
    }

    return resposta_({ ok: true });
  } catch (erro) {
    return resposta_({ ok: false, erro: String(erro) });
  } finally {
    lock.releaseLock();
  }
}

function obterAba_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA);
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
  }
  return aba;
}

function acharLinhaPorId_(aba, id) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return -1;
  var ids = aba.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function resposta_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
