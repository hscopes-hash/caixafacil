/**
 * Gerador de payload PIX Estático (EMV COB) conforme Banco Central do Brasil.
 * Não requer API externa — gera o payload string diretamente.
 */

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function crc16CCITT(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

interface PixPayloadOptions {
  chave: string;            // Chave PIX
  nome: string;             // Nome do recebedor (max 25)
  cidade: string;           // Cidade do recebedor (max 15)
  valor?: number;           // Valor em reais (ex: 150.50)
  descricao?: string;       // Descrição (max 25, opcional)
  txId?: string;            // Identificador da tx (max 25, opcional)
}

export function gerarPayloadPix(options: PixPayloadOptions): string {
  const { chave, nome, cidade, valor, descricao, txId } = options;

  // Merchant Account Information (tag 26)
  const gui = tlv('00', 'br.gov.bcb.pix'); // GUI
  const pixKey = tlv('01', chave);          // Chave PIX
  const descricaoField = descricao ? tlv('02', descricao.substring(0, 25)) : '';
  const tag26 = tlv('26', gui + pixKey + descricaoField);

  // Merchant Account Information adicionais (vazio, mas requerido)
  const tag27 = tlv('27', ''); //Campo vazio

  let payload = '00'; // ID do payload
  payload = tlv('00', '01');        // Payload Format Indicator
  payload += tag26;                  // Merchant Account Information (PIX)
  payload += tag27;                  // Merchant Account Information adicional
  payload += tlv('52', '0000');      // Merchant Category Code
  payload += tlv('53', '986');       // Transaction Currency (BRL)
  payload += tlv('54', valor ? valor.toFixed(2) : ''); // Transaction Amount
  payload += tlv('58', 'BR');        // Country Code

  // Nome do recebedor — sanitizar
  const nomeSanitizado = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 25);
  payload += tlv('59', nomeSanitizado);

  // Cidade — sanitizar
  const cidadeSanitizada = cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .substring(0, 15);
  payload += tlv('60', cidadeSanitizada);

  // TxId (opcional, obrigatório para PIX dinâmico)
  if (txId) {
    payload += tlv('62', tlv('05', txId.substring(0, 25)));
  }

  // Additional Data Field Template
  payload += tlv('62', tlv('05', '***')); // Reference label (placeholder)

  // CRC16
  payload += '6304';
  payload += crc16CCITT(payload);

  return payload;
}
