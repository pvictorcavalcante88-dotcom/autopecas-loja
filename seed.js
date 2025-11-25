const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Criando usuário Admin...");

  // Tenta criar o Admin. Se já existir, apenas atualiza.
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@veloz.com' },
    update: {},
    create: {
      email: 'admin@veloz.com',
      senha: '123', // A senha padrão
    },
  });

  console.log("✅ Admin criado com sucesso!");
  console.log("📧 Email: admin@veloz.com");
  console.log("🔑 Senha: 123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });