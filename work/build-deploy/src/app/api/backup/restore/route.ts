import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST — importa dados de um arquivo JSON de backup para a empresa ativa
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tabela: tabelaNome, empresaId, dados } = body;

    if (!tabelaNome) {
      return NextResponse.json({ error: 'Tabela não especificada' }, { status: 400 });
    }
    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }
    if (!Array.isArray(dados)) {
      return NextResponse.json({ error: 'dados deve ser um array' }, { status: 400 });
    }

    console.log(`[RESTORE] Importando ${dados.length} registros da tabela ${tabelaNome} para empresaId=${empresaId}`);

    let importados = 0;
    let pulados = 0;
    let erros = 0;

    if (tabelaNome === 'tipos_maquina') {
      // Importar tipos de máquina
      for (const item of dados) {
        try {
          // Verificar se já existe um tipo com a mesma descrição nesta empresa
          const existente = await db.tipoMaquina.findFirst({
            where: { descricao: item.descricao, empresaId },
          });

          if (existente) {
            pulados++;
            continue;
          }

          // Criar novo tipo vinculado à empresa ativa (NOVO empresaId)
          await db.tipoMaquina.create({
            data: {
              descricao: item.descricao,
              nomeEntrada: item.nomeEntrada || 'E',
              nomeSaida: item.nomeSaida || 'S',
              ativo: item.ativo !== false,
              classe: item.classe ?? 0,
              empresaId, // empresa ativa (não a original do backup)
            },
          });
          importados++;
        } catch (err) {
          console.warn(`[RESTORE] Erro ao importar tipo "${item.descricao}":`, err);
          erros++;
        }
      }
    } else if (tabelaNome === 'clientes') {
      for (const item of dados) {
        try {
          const existente = await db.cliente.findFirst({
            where: { nome: item.nome, empresaId },
          });
          if (existente) { pulados++; continue; }

          await db.cliente.create({
            data: {
              nome: item.nome,
              cpfCnpj: item.cpfCnpj || null,
              email: item.email || null,
              telefone: item.telefone || null,
              telefone2: item.telefone2 || null,
              endereco: item.endereco || null,
              cidade: item.cidade || null,
              estado: item.estado || null,
              cep: item.cep || null,
              observacoes: item.observacoes || null,
              whatsapp: item.whatsapp || null,
              acertoPercentual: item.acertoPercentual ?? 50,
              formaCobranca: item.formaCobranca || 'LEITURA',
              ativo: item.ativo !== false,
              bloqueado: false,
              empresaId,
            },
          });
          importados++;
        } catch (err) {
          console.warn(`[RESTORE] Erro ao importar cliente "${item.nome}":`, err);
          erros++;
        }
      }
    } else if (tabelaNome === 'usuarios') {
      for (const item of dados) {
        try {
          const existente = await db.usuario.findFirst({
            where: { email: item.email, empresaId },
          });
          if (existente) { pulados++; continue; }

          await db.usuario.create({
            data: {
              nome: item.nome,
              email: item.email,
              senha: item.senha,
              telefone: item.telefone || null,
              foto: item.foto || null,
              ativo: item.ativo !== false,
              nivelAcesso: item.nivelAcesso || 'OPERADOR',
              empresaId,
            },
          });
          importados++;
        } catch (err) {
          console.warn(`[RESTORE] Erro ao importar usuário "${item.email}":`, err);
          erros++;
        }
      }
    } else {
      return NextResponse.json(
        { error: `Importação não suportada para a tabela: ${tabelaNome}` },
        { status: 400 }
      );
    }

    console.log(`[RESTORE] Concluído: ${importados} importados, ${pulados} pulados (já existiam), ${erros} erros`);

    return NextResponse.json({
      success: true,
      tabela: tabelaNome,
      totalRecebidos: dados.length,
      importados,
      pulados,
      erros,
      importadoEm: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RESTORE] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro ao importar: ${errorMessage}` }, { status: 500 });
  }
}
