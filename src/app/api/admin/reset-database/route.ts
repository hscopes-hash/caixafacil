import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SUPER_ADMIN_EMAIL = 'hscopes@gmail.com';

// Resetar todo o banco de dados (apenas super admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminEmail } = body;

    if (adminEmail !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    // Deletar todos os registros em ordem (respeitando foreign keys)
    // Ordem inversa de criação das dependências
    await db.logAcesso.deleteMany({});
    await db.leitura.deleteMany({});
    await db.faturamento.deleteMany({});
    await db.pagamento.deleteMany({});
    await db.assinatura.deleteMany({});
    await db.maquina.deleteMany({});
    await db.tipoMaquina.deleteMany({});
    await db.usuario.deleteMany({});
    await db.cliente.deleteMany({});
    await db.empresa.deleteMany({});

    return NextResponse.json({
      message: 'Banco de dados resetado com sucesso!',
      deleted: {
        empresas: true,
        usuarios: true,
        clientes: true,
        tiposMaquina: true,
        maquinas: true,
        assinaturas: true,
        pagamentos: true,
        leituras: true,
        faturamentos: true,
        logsAcesso: true,
      },
    });
  } catch (error) {
    console.error('Erro ao resetar banco:', error);
    return NextResponse.json(
      { error: 'Erro ao resetar banco de dados' },
      { status: 500 }
    );
  }
}
