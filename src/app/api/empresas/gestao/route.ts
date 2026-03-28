import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Listar todas as empresas (apenas para admin master)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminEmail = searchParams.get('adminEmail');

    // Verificar se é o admin master
    if (adminEmail !== 'hscopes@gmail.com') {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    const empresas = await db.empresa.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            usuarios: true,
            clientes: true,
            tiposMaquina: true,
          }
        }
      }
    });

    // Calcular dias restantes para cada empresa
    const empresasComDias = empresas.map(empresa => {
      let diasRestantes = null;
      let status = 'ativo';

      if (empresa.dataVencimento) {
        const hoje = new Date();
        const vencimento = new Date(empresa.dataVencimento);
        const diffTime = vencimento.getTime() - hoje.getTime();
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0) {
          status = 'expirado';
        } else if (diasRestantes <= 7) {
          status = 'expirando';
        } else if (empresa.isDemo) {
          status = 'demo';
        }
      } else if (empresa.isDemo) {
        // Demo sem data de vencimento - calcular baseado na data de criação
        const hoje = new Date();
        const criacao = new Date(empresa.createdAt);
        const diffTime = hoje.getTime() - criacao.getTime();
        const diasUsados = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        diasRestantes = empresa.diasDemo - diasUsados;
        
        if (diasRestantes < 0) {
          status = 'expirado';
        } else if (diasRestantes <= 2) {
          status = 'expirando';
        } else {
          status = 'demo';
        }
      }

      return {
        ...empresa,
        diasRestantes,
        status,
      };
    });

    return NextResponse.json(empresasComDias);
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    return NextResponse.json(
      { error: 'Erro ao listar empresas' },
      { status: 500 }
    );
  }
}

// Criar nova empresa
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      adminEmail,
      nome, 
      cnpj, 
      email, 
      telefone, 
      endereco, 
      cidade, 
      estado,
      plano,
      isDemo,
      diasDemo,
      dataVencimento,
    } = body;

    // Verificar se é o admin master
    if (adminEmail !== 'hscopes@gmail.com') {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    if (!nome) {
      return NextResponse.json(
        { error: 'Nome da empresa é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se CNPJ já existe
    if (cnpj) {
      const existente = await db.empresa.findUnique({
        where: { cnpj }
      });
      if (existente) {
        return NextResponse.json(
          { error: 'Já existe uma empresa com este CNPJ' },
          { status: 400 }
        );
      }
    }

    const empresa = await db.empresa.create({
      data: {
        nome,
        cnpj: cnpj || null,
        email: email || null,
        telefone: telefone || null,
        endereco: endereco || null,
        cidade: cidade || null,
        estado: estado || null,
        plano: plano || 'BASICO',
        isDemo: isDemo || false,
        diasDemo: diasDemo || 7,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
        ativa: true,
      }
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error('Erro ao criar empresa:', error);
    return NextResponse.json(
      { error: 'Erro ao criar empresa' },
      { status: 500 }
    );
  }
}
