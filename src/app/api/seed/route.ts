import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Função para hash de senha
async function hashSenha(senha: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha + 'machines-gestao-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Seed para criar dados iniciais
export async function POST(request: NextRequest) {
  try {
    // Verificar se já existe empresa
    const empresaExistente = await db.empresa.findFirst();

    if (empresaExistente) {
      return NextResponse.json({
        message: 'Dados já existem',
        empresa: empresaExistente,
      });
    }

    // Criar empresa padrão
    const empresa = await db.empresa.create({
      data: {
        nome: 'Máquinas Gestão Demo',
        cnpj: '00.000.000/0001-00',
        email: 'contato@maquinasgestao.com',
        telefone: '(11) 99999-9999',
        cidade: 'São Paulo',
        estado: 'SP',
        plano: 'PROFISSIONAL',
        ativa: true,
      },
    });

    // Criar usuário Super Admin (hscopes@gmail.com)
    const senhaSuperAdmin = await hashSenha('Omega93');
    const superAdmin = await db.usuario.create({
      data: {
        nome: 'Super Administrador',
        email: 'hscopes@gmail.com',
        senha: senhaSuperAdmin,
        telefone: '(11) 99999-0000',
        nivelAcesso: 'ADMINISTRADOR',
        empresaId: empresa.id,
      },
    });

    // Criar usuário admin
    const senhaHash = await hashSenha('admin123');
    const admin = await db.usuario.create({
      data: {
        nome: 'Administrador',
        email: 'admin@demo.com',
        senha: senhaHash,
        telefone: '(11) 99999-9999',
        nivelAcesso: 'ADMINISTRADOR',
        empresaId: empresa.id,
      },
    });

    // Criar usuário supervisor
    const senhaSupervisor = await hashSenha('supervisor123');
    const supervisor = await db.usuario.create({
      data: {
        nome: 'Supervisor Demo',
        email: 'supervisor@demo.com',
        senha: senhaSupervisor,
        telefone: '(11) 88888-8888',
        nivelAcesso: 'SUPERVISOR',
        empresaId: empresa.id,
      },
    });

    // Criar usuário operador
    const senhaOperador = await hashSenha('operador123');
    const operador = await db.usuario.create({
      data: {
        nome: 'Operador Demo',
        email: 'operador@demo.com',
        senha: senhaOperador,
        telefone: '(11) 77777-7777',
        nivelAcesso: 'OPERADOR',
        empresaId: empresa.id,
      },
    });

    // Criar clientes de exemplo
    const cliente1 = await db.cliente.create({
      data: {
        nome: 'João Silva',
        cpfCnpj: '123.456.789-00',
        email: 'joao@email.com',
        telefone: '(11) 91234-5678',
        cidade: 'São Paulo',
        estado: 'SP',
        empresaId: empresa.id,
      },
    });

    const cliente2 = await db.cliente.create({
      data: {
        nome: 'Maria Santos',
        cpfCnpj: '987.654.321-00',
        email: 'maria@email.com',
        telefone: '(11) 99876-5432',
        cidade: 'São Paulo',
        estado: 'SP',
        empresaId: empresa.id,
      },
    });

    const cliente3 = await db.cliente.create({
      data: {
        nome: 'Bar do Zé',
        cpfCnpj: '12.345.678/0001-99',
        email: 'bardoze@email.com',
        telefone: '(11) 95555-4444',
        cidade: 'São Paulo',
        estado: 'SP',
        empresaId: empresa.id,
      },
    });

    // Criar tipos de máquina
    const tipoMusica = await db.tipoMaquina.create({
      data: {
        descricao: 'Música',
        nomeEntrada: 'E',
        nomeSaida: 'S',
        empresaId: empresa.id,
      },
    });

    const tipoSinuca = await db.tipoMaquina.create({
      data: {
        descricao: 'Sinuca',
        nomeEntrada: 'E',
        nomeSaida: 'S',
        empresaId: empresa.id,
      },
    });

    const tipoUrso = await db.tipoMaquina.create({
      data: {
        descricao: 'Urso',
        nomeEntrada: 'E',
        nomeSaida: 'S',
        empresaId: empresa.id,
      },
    });

    const tipoJogo = await db.tipoMaquina.create({
      data: {
        descricao: 'Jogo',
        nomeEntrada: 'E',
        nomeSaida: 'S',
        empresaId: empresa.id,
      },
    });

    // Criar máquinas de exemplo
    await db.maquina.createMany({
      data: [
        {
          codigo: 'MUS-001',
          tipoId: tipoMusica.id,
          marca: 'Grandstand',
          modelo: 'GS-500',
          clienteId: cliente1.id,
          valorMensal: 500,
          status: 'ATIVA',
          moeda: 'M010',
          entradaAtual: 1505,
          saidaAtual: 452,
        },
        {
          codigo: 'MUS-002',
          tipoId: tipoMusica.id,
          marca: 'Grandstand',
          modelo: 'GS-300',
          clienteId: cliente1.id,
          valorMensal: 400,
          status: 'ATIVA',
          moeda: 'M025',
          entradaAtual: 1123,
          saidaAtual: 480,
        },
        {
          codigo: 'SIN-001',
          tipoId: tipoSinuca.id,
          marca: 'Nacional',
          modelo: 'Profissional',
          clienteId: cliente2.id,
          valorMensal: 600,
          status: 'ATIVA',
          moeda: 'M010',
          entradaAtual: 950,
          saidaAtual: 300,
        },
        {
          codigo: 'URS-001',
          tipoId: tipoUrso.id,
          marca: 'Generic',
          modelo: 'UR-100',
          clienteId: cliente2.id,
          valorMensal: 350,
          status: 'MANUTENCAO',
          moeda: 'M005',
          entradaAtual: 0,
          saidaAtual: 0,
        },
        {
          codigo: 'JOG-001',
          tipoId: tipoJogo.id,
          marca: 'Capcom',
          modelo: 'Arcade',
          clienteId: cliente3.id,
          valorMensal: 800,
          status: 'ATIVA',
          moeda: 'M010',
          entradaAtual: 3200,
          saidaAtual: 855,
        },
        {
          codigo: 'JOG-002',
          tipoId: tipoJogo.id,
          marca: 'Namco',
          modelo: 'Classic',
          clienteId: cliente3.id,
          valorMensal: 700,
          status: 'ATIVA',
          moeda: 'M025',
          entradaAtual: 1801,
          saidaAtual: 800,
        },
      ],
    });

    // Criar assinaturas
    await db.assinatura.createMany({
      data: [
        {
          plano: 'Básico',
          descricao: 'Plano básico de locação',
          valorMensal: 500,
          diaVencimento: 10,
          dataInicio: new Date('2024-01-01'),
          clienteId: cliente1.id,
          status: 'ATIVA',
        },
        {
          plano: 'Profissional',
          descricao: 'Plano profissional de locação',
          valorMensal: 950,
          diaVencimento: 15,
          dataInicio: new Date('2024-01-01'),
          clienteId: cliente2.id,
          status: 'ATIVA',
        },
        {
          plano: 'Premium',
          descricao: 'Plano premium de locação',
          valorMensal: 1500,
          diaVencimento: 20,
          dataInicio: new Date('2024-01-01'),
          clienteId: cliente3.id,
          status: 'ATIVA',
        },
      ],
    });

    // Criar pagamentos de exemplo
    const hoje = new Date();
    await db.pagamento.createMany({
      data: [
        {
          valor: 500,
          dataVencimento: new Date(hoje.getFullYear(), hoje.getMonth(), 10),
          dataPagamento: new Date(hoje.getFullYear(), hoje.getMonth(), 8),
          status: 'PAGO',
          formaPagamento: 'PIX',
          clienteId: cliente1.id,
        },
        {
          valor: 500,
          dataVencimento: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10),
          status: 'PENDENTE',
          clienteId: cliente1.id,
        },
        {
          valor: 950,
          dataVencimento: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 15),
          status: 'ATRASADO',
          clienteId: cliente2.id,
        },
        {
          valor: 1500,
          dataVencimento: new Date(hoje.getFullYear(), hoje.getMonth(), 20),
          dataPagamento: new Date(hoje.getFullYear(), hoje.getMonth(), 19),
          status: 'PAGO',
          formaPagamento: 'BOLETO',
          clienteId: cliente3.id,
        },
      ],
    });

    return NextResponse.json({
      message: 'Dados de demonstração criados com sucesso!',
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
      },
      usuarios: [
        { email: 'hscopes@gmail.com', senha: 'Omega93', nivel: 'SUPER ADMIN' },
        { email: 'admin@demo.com', senha: 'admin123', nivel: 'ADMINISTRADOR' },
        { email: 'supervisor@demo.com', senha: 'supervisor123', nivel: 'SUPERVISOR' },
        { email: 'operador@demo.com', senha: 'operador123', nivel: 'OPERADOR' },
      ],
    });
  } catch (error) {
    console.error('Erro ao criar seed:', error);
    return NextResponse.json(
      { error: 'Erro ao criar dados iniciais' },
      { status: 500 }
    );
  }
}
